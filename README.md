# Immich in LXC without Docker

Install and update [Immich](https://github.com/immich-app/immich) directly in an LXC container, VM, or bare-metal host. The installer provides PostgreSQL, Redis, native media libraries, the Immich web server, machine learning, and systemd services without using Docker for the deployed instance.

This project is a fork of [loeeeee/immich-in-lxc](https://github.com/loeeeee/immich-in-lxc), inspired by [Immich Native](https://github.com/arter97/immich-native).

## How this differs from the official Docker install

Immich's [supported install](https://immich.app/docs/install/docker-compose) runs prebuilt containers with Docker Compose. This installer builds the same Immich release from source and runs it as ordinary systemd services, with no Docker in the guest.

| | Official Docker Compose | This installer |
| --- | --- | --- |
| How it runs | Containers for the server, ML, Postgres and Redis | `immich-web` and `immich-ml` systemd services; Postgres 17 and Redis from the OS |
| Install and update | `docker compose pull`, a few minutes | Compiles the media libraries and Immich: from about 15 minutes to an hour, depending on CPU |
| Media libraries | Bundled in the image | Built from the same pinned [base-images](https://github.com/immich-app/base-images) set as the matching Immich release |
| New releases | Same day | As soon as you set the new tag, but a release that changes the build can need an installer fix first |
| In a Proxmox LXC | Needs Docker inside the container, which Proxmox advises against (it recommends a VM for Docker) | Runs directly in an unprivileged container |
| Support | Supported by the Immich team | Community project; report problems here, not to Immich |

**Who it's for:** people who run Immich in a Proxmox (or other) LXC container and don't want Docker inside it, and people who prefer plain systemd services, OS-managed Postgres, and logs in `journalctl` over containers.

**Who should use Docker instead:** anyone who wants the fastest updates, the Immich team's support, or the least maintenance. If Docker already runs well on your host, the official install is the simpler choice.

## Supported systems

- Ubuntu 24.04
- Debian 13
- systemd
- CPU machine learning by default
- Optional NVIDIA CUDA, AMD ROCm, and Intel OpenVINO machine learning

Debian 12 is not supported. Older releases of this installer could accidentally mix Debian releases; read [Debian recovery](docs/troubleshooting-and-recovery.md#debian-testing-repository-recovery) before changing an existing Debian 12 installation.

## Before you begin

Use a fresh container or VM and take a snapshot before installing. The commands below assume:

| Purpose | Path |
| --- | --- |
| Installer checkout | `/home/immich/immich-in-lxc` |
| Installed application | `/home/immich/app` |
| Immich source used for builds | `/home/immich/source` |
| Photos and Immich-generated media | `/mnt/photos` |
| Web interface | `http://<container-ip>:2283` |

Mount the media disk at `/mnt/photos` before installing. If you deliberately want everything on the container disk, leave out `UPLOAD_DIR` below and media goes to `/home/immich/upload`.

The installation downloads and compiles large dependencies. Allow plenty of disk space and time.

## Install

Run everything below from a **root** shell. Pick the Immich release to install from [Immich releases](https://github.com/immich-app/immich/releases); the examples use `v3.4.2`.

```bash
apt-get update && apt-get install -y git
git clone https://github.com/Rakhmanov/immich-in-lxc.git /opt/immich-in-lxc-bootstrap
cd /opt/immich-in-lxc-bootstrap

# 1. System dependencies, Postgres, Redis, media libraries, service user and units
REPO_TAG=v3.4.2 UPLOAD_DIR=/mnt/photos ./pre-install.sh

# 2. The service user must be able to write the media directory
runuser -u immich -- test -w /mnt/photos && echo "media OK"

# 3. Build and deploy Immich as the service user (answer Y to the prompt)
su - immich -c 'cd ~/immich-in-lxc && ./install.sh'

# 4. Start and check
systemctl daemon-reload
systemctl enable --now immich-ml immich-web
curl --fail http://127.0.0.1:2283/api/server/ping
```

Then open `http://<container-ip>:2283` and create the first admin account.

What each step does:

- **`pre-install.sh`** asks for a password for the new `immich` Linux user and one for the Immich PostgreSQL role (set `USER_PASSWORD` and `DB_PASSWORD` to skip the prompts). It installs and builds the system dependencies, configures PostgreSQL 17, VectorChord and Redis, installs the systemd units, and creates the working checkout at `/home/immich/immich-in-lxc` with its `.env`. `REPO_TAG` selects the media-library versions that match that release and is written to `.env`. `UPLOAD_DIR` is only used when `.env` is first created. Use `RUN_USER=name` only if you want a service user other than `immich`.
- **If the media check fails**, stop and fix the mount or the LXC UID/GID mapping. Don't work around it by running `install.sh` as root. See [Storage and filesystem layout](docs/storage-and-layout.md).
- **`install.sh`** builds Immich at `REPO_TAG` into `/home/immich/app` and links `/home/immich/app/upload` to `UPLOAD_DIR`; don't create or replace that link yourself. Other settings, such as the ML accelerator (`isCUDA`) and package mirrors, are in `/home/immich/immich-in-lxc/.env`; edit it before this step if you need them.
- **Runtime settings** are in `/home/immich/runtime.env` (mode `0600`): check `TZ` there. The web service already points at the local ML service (`IMMICH_MACHINE_LEARNING_URL=http://127.0.0.1:3003`), so there's no ML URL to set in the admin settings.

Put a TLS reverse proxy in front of port `2283` before exposing it outside a trusted network.

## Update

This refreshes both the host dependencies and the deployed Immich. Read the Immich release notes for every version in between first. As **root**:

```bash
# 1. Back up the database and stop Immich
install -d -o postgres -g postgres -m 0700 /var/backups/immich
backup="/var/backups/immich/immich-$(date +%Y%m%d-%H%M%S).dump"
runuser -u postgres -- pg_dump --format=custom --file="$backup" immich
test -s "$backup" && echo "Database backup: $backup"
systemctl stop immich-web immich-ml

# 2. Update the installer, then rebuild dependencies and Immich for the new release
su - immich -c 'cd ~/immich-in-lxc && git pull --ff-only'
cd /home/immich/immich-in-lxc
REPO_TAG=v3.4.2 ./pre-install.sh
su - immich -c 'cd ~/immich-in-lxc && ./install.sh'

# 3. Restart and check
systemctl daemon-reload
systemctl restart immich-ml immich-web
curl --fail http://127.0.0.1:2283/api/server/ping
```

- **Before step 2**, copy the database dump off the guest and take a container or VM snapshot. If `/mnt/photos` is a separate mount, make sure it has its own backup; a guest snapshot may not include it.
- `pre-install.sh` is safe to rerun. It keeps existing passwords, and the rest of your `.env` (`INSTALL_DIR`, `UPLOAD_DIR`, accelerator, mirrors) is left as it is; only `REPO_TAG` is updated.
- `install.sh` replaces `/home/immich/app`. It doesn't touch `UPLOAD_DIR`, but keep the backup and snapshot anyway.
- If a service fails, don't keep rerunning the installer. Capture the logs and follow [Troubleshooting and recovery](docs/troubleshooting-and-recovery.md).

## Optional configurations

- [Storage and filesystem layout](docs/storage-and-layout.md) — mounted disks, local SSD thumbnails, permissions, and what must be backed up
- [Hardware acceleration](docs/hardware-acceleration.md) — NVIDIA CUDA, AMD ROCm, Intel OpenVINO, and transcoding
- [Nginx reverse proxy](docs/nginx-reverse-proxy.md) — HTTPS termination and forwarding to port `2283`
- [Backup: originals-only to Backblaze B2 via restic](docs/backup-restic-backblaze.md) — skip regenerable thumbnails/transcodes, back up only originals and the DB dumps
- [Native installer in a persistent systemd container](docs/native-systemd-container.md) — supported guest userspace on an otherwise unsupported host, persistence, worker-safe staging, and migration boundaries
- [Troubleshooting and recovery](docs/troubleshooting-and-recovery.md) — logs, health checks, Debian repository recovery, and older database migrations
- [Testing](docs/testing.md) — fast, full, systemd, Debian 13, and real CUDA Docker tests

## Important boundaries

- Run `pre-install.sh` as root.
- Run `install.sh` as the service user, never as root.
- The installer checkout can be replaced; the deployed app and media paths are separate.
- Never delete `UPLOAD_DIR` during an update.
- Do not expose port `2283` directly to the public internet.
- This is an unofficial community installer. Review Immich release notes before every version upgrade.
