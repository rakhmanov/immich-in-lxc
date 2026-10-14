# Troubleshooting and recovery

## Collect the failure before rerunning anything

Check both systemd units and their recent logs:

```bash
systemctl --no-pager --full status immich-web immich-ml
journalctl -u immich-web -u immich-ml -b --no-pager -n 300
```

Verify the supporting services:

```bash
systemctl --no-pager --full status postgresql redis-server
```

Test the web API locally:

```bash
curl --verbose http://127.0.0.1:2283/api/server/ping
```

Confirm that systemd can find the stable runtime configuration and deployment root:

```bash
readlink -f /home/immich/.config/immich-in-lxc/runtime.env
dirname "$(readlink -f /home/immich/.config/immich-in-lxc/runtime.env)"
ls -l /usr/local/libexec/immich-in-lxc/service-launch.sh
```

Do not paste `runtime.env` into a public issue: it contains the database password.

## Web works but machine learning fails

Native installs do not have Docker's internal service DNS. In the Immich UI, set:

`Administration > Settings > Machine Learning Settings > URL`

to:

```text
http://localhost:3003
```

Then inspect `journalctl -u immich-ml` while submitting a machine-learning job.

## Installer refuses to run while services are active

This is intentional. Stop both services as root before running `install.sh`:

```bash
systemctl stop immich-web immich-ml
```

Run `install.sh` as the service user, not root.

## Debian `testing` repository recovery

Older versions of `dep-debian.sh` added Debian's moving `testing` alias and left it configured. This is the failure tracked in [issue #10](https://github.com/rakhmanov/immich-in-lxc/issues/10). A Debian 12 Bookworm guest could begin selecting Trixie or Forky packages, Jellyfin repository detection could identify the wrong release, and later APT operations could partially upgrade core packages.

The current installer supports Debian 13 and does not add `testing` or another Debian release. Debian 12 is rejected because even a pinned temporary Trixie source pulled core development packages into Bookworm during testing.

Before upgrading an installation created with an older version, inspect its sources:

```bash
cat /etc/os-release
grep -RHE '^[[:space:]]*deb .*debian.*(testing|trixie|forky)' \
  /etc/apt/sources.list /etc/apt/sources.list.d 2>/dev/null || true
apt-cache policy | sed -n '1,120p'
```

If `/etc/apt/sources.list.d/immich.list` contains `testing`, take an LXC/VM snapshot and remove only the files owned by the old installer:

```bash
rm -f /etc/apt/sources.list.d/immich.list
rm -f /etc/apt/preferences.d/immich
apt-get update
dpkg --audit
```

Do not run `apt full-upgrade` while the unwanted source exists. Do not attempt a bulk downgrade after removing it.

If `/etc/os-release` still identifies Bookworm but core packages such as `libc6` already came from Trixie or Forky, restoring the pre-install snapshot is the safest recovery. Otherwise, complete a deliberate Debian release upgrade using Debian's release notes before running this installer again.

## Older PostgreSQL vector extension migrations

Immich v1.133.0 migrated from pgvecto.rs to VectorChord. If an old installation still has this in `runtime.env`:

```dotenv
DB_VECTOR_EXTENSION=pgvector
```

change it to:

```dotenv
DB_VECTOR_EXTENSION=vectorchord
```

Back up PostgreSQL before making the change. Very old Immich versions may need an intermediate upgrade supported by Immich rather than a direct jump to the current tag; consult the release notes for every skipped breaking release.

## `immich-web` crash-loops with SIGSEGV after upgrading to v3.2.0 or newer

Symptom: after an upgrade the build finishes, but `immich-web` exits immediately with `code=killed, status=11/SEGV` and `systemctl` shows a growing restart counter. `node -e "require('sharp')"` as the `immich` user prints `Segmentation fault`.

Cause (two independent defects, both fixed in the installer):

1. **Sharp 0.35 (Immich v3.2.0+).** Immich v3.0.x and v3.1.x ship Sharp 0.34, which compiled itself against the system libvips during `pnpm install`. Immich v3.2.0 moved to Sharp 0.35, which installs prebuilt `@img/sharp-*` packages bundling their own libvips; that copy conflicts with the system-built libjxl/libheif/libraw and crashes on load. `install.sh` now runs `build_sharp_from_source`, which compiles the addon against `/usr/local` (a locally built addon takes precedence) and fails the install if the result is not linked to the system libvips.
2. **Stale base-images pins.** `pre-install.sh` used to check out `immich-app/base-images` at `main` through a local branch that never advanced after the first clone, so libheif, libvips, libjxl, libraw and ImageMagick stayed at the versions of the original install. Sharp 0.35.5 needs libvips >= 8.18.7, and a stale libheif rejects AVIF encoding with `heif: Invalid parameter value (5.2006)`. `pre-install.sh` now reads `base-server-dev:<tag>` from the Dockerfile of `REPO_TAG` and builds from that exact base-images tag (override with `BASE_IMAGES_REF`).

Recovery on an affected install: `git pull` this repository, set `REPO_TAG` in `.env`, run `./pre-install.sh` as root, then `install.sh` as `immich`. Verify with:

```bash
runuser -u immich -- bash -lc 'cd /home/immich/app && node -p "require(\"sharp\").versions"'
IMMICH_APP_DIR=/home/immich/app node tests/verify-native-media.js
```

## Restore boundary

The database and `UPLOAD_DIR` together form the persistent Immich state. Restore matching database and media backups, verify file ownership, and let the installer rebuild `/home/immich/app`. Do not restore an old application directory over a newly installed version.
