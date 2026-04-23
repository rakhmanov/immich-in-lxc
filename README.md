# Immich with CUDA/ROCm Support in LXC (w/o Docker)

A complete guide for installing Immich in LXC, VM, or bare-metal without Docker.

<table>
<tr>
<th width="65%"><h3>Introduction</h3></th>
<th width="35%"><h3>Supports</h3></th>
</tr>
<tr>
<td valign="top">

[Immich](https://github.com/immich-app/immich) is a *high performance self-hosted photo and video management solution*.

This is a fork of [loeeeee/immich-in-lxc](https://github.com/loeeeee/immich-in-lxc), which itself was inspired by [Immich Native](https://github.com/arter97/immich-native) — huge kudos to **loeeeee** and **arter97**.

Compared to Immich Native, this repo adds CUDA/ROCm-accelerated machine learning and out-of-the-box processing of HEIF (modern phone photos), RAW (dedicated-camera photos), and JXL images.

</td>
<td valign="top">

#### ✅ Upgrades
#### ✅ CUDA / ROCm for machine learning
#### ✅ Hardware-accelerated transcoding
#### ✅ HEIF, RAW, and JXL support
#### ✅ Proxy settings for PyPI and NPM

</td>
</tr>
</table>


# Installation

Create a non-privileged LXC/VM normally. For GPU-accelerated machine learning or transcoding, see [Hardware acceleration configuration (optional)](#hardware-acceleration-configuration-optional) below and complete it **before** running `pre-install.sh`.


### Run the bootstrap script

`pre-install.sh` needs root. Open a root shell (`su -`, or `sudo -i` if `sudo` is already set up), then run the commands below. The script will prompt you for:

1. a Linux password for the new Immich service user (default: `immich`), and
2. a PostgreSQL password for the `immich` DB role.

```bash
# As root
apt-get update && apt-get install -y git
git clone https://github.com/Rakhmanov/immich-in-lxc.git
cd immich-in-lxc
./pre-install.sh

# Or, to skip the prompts (e.g. in automation):
# USER_PASSWORD='...' DB_PASSWORD='...' ./pre-install.sh

# To use a different Linux account instead of the default 'immich'
# (it will be created if missing):
# RUN_USER=myname ./pre-install.sh
```

The script is idempotent — re-running it will not recreate the user or the database, it will only refresh passwords and keep everything in sync.

### Pre-install setup is complete

`pre-install.sh` has completed all system-level setup:
- Created the service user (`immich` by default) and groups
- Installed all build and runtime dependencies
- Built optimized libraries (libvips, libheif, libjxl, mimalloc, etc.)
- Set up PostgreSQL database with VectorChord
- Created log directories with proper permissions
- Copied systemd service files (if using systemd)
- Cloned the repo into the service user's home

### Switch to the service user and continue

Now switch to the service user to configure and install Immich:

```bash
su - <run-user>
cd ~/immich-in-lxc
```



<details>
<summary>Database Migration for Existing Users (v1.133.0+)</summary>

**Note:** Starting with Immich v1.133.0, the project has migrated from pgvecto.rs to [VectorChord](https://github.com/tensorchord/VectorChord) for better performance and stability.

If you're upgrading from a version prior to v1.133.0 and have an existing Immich installation, you may need to perform a database migration. The migration from pgvecto.rs to VectorChord is automatic, but you should:

1. **Backup your database** before upgrading
2. Ensure you're upgrading from at least v1.107.2 or later

**Note:** If you have an existing `$INSTALL_DIR/runtime.env` file with `DB_VECTOR_EXTENSION=pgvector`, you should update it to `DB_VECTOR_EXTENSION=vectorchord` for the new VectorChord extension.

For more details on the VectorChord migration, see the [official Immich v1.133.0 release notes](https://github.com/immich-app/immich/releases/tag/v1.133.0).

</details>

### Install Immich Server

The install.sh installs or updates the current Immich instance. The Immich instance itself is stateless, thanks to its design.
Thus, it is safe to delete the `app` folder that will resides inside `INSTALL_DIR` folder that we are about to config. 

Note: **DO NOT DELETE UPLOAD FOLDER SPECIFIED BY `INSTALL_DIR` IN `.env`**. It stores all the user-uploaded content. 

Also note: One should always do a snapshot of the media folder during the updating or installation process, just in case something goes horribly wrong.

#### Configuring the installation

The example configuration lives in `example.env`. As the service user, in `~/immich-in-lxc`:

```bash
cp example.env .env
$EDITOR .env
```

- `REPO_TAG` is the version of the Immich that we are going to install,
- `INSTALL_DIR` is where the `app` and `source` folders will resides in (e.g., it can be a `mnt` point),
- `UPLOAD_DIR` is where the user uploads goes to  (it can be a `mnt` point), 
- `isCUDA` when set to true, will install Immich with CUDA supprt. For other GPU Transcodings, this is likely to remain false. (available flag: true, false, openvino, rocm)
- For user with compromised network accessibility:
    - `PROXY_NPM` sets the mirror URL that npm will use, if empty, it will use the official one,
    - :new:`PROXY_NPM_DIST` sets the dist URL that node-gyp will use, if empty, it will use the official one, and
    - `PROXY_POETRY` sets the mirror URL that poetry will use, if empty, it will use the official one.

Note: The service user should have read and write access to both `INSTALL_DIR` and `UPLOAD_DIR`.

Note: :new: means user might need to create the empty entry to make script run.

#### Run the script

After the `.env` is properly configured, we are now ready to do the actual installation.

```bash
./install.sh
```
Note, `install.sh` should be executed as the service user.

#### Review runtime.env

`install.sh` copies the repo's `runtime.env` into `$INSTALL_DIR/runtime.env` on first run. `pre-install.sh` already wrote the DB password you chose into the repo's `runtime.env`, so the `DB_PASSWORD` line should match what PostgreSQL has. Review the rest (timezone, etc.) and adjust if needed.

**Note:** If your `DB_PASSWORD` contains special characters (such as `$`, `!`, etc.), it must be wrapped in single quotes, e.g., `DB_PASSWORD='your$pec!alP@ss'`. `pre-install.sh` already does this for you, but preserve the quoting if you edit by hand. (See [issue #95](https://github.com/loeeeee/immich-in-lxc/issues/95) for details.)
For Timezones `TZ`, you can consult them in the [TZ Database Wiki](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones#List).

#### Starting Immich

The systemd service files have already been installed by `pre-install.sh`. Depending on your environment, use one of the methods below to start Immich:

##### With systemd (recommended for most systems)

```bash
systemctl daemon-reload && \
systemctl start immich-ml && \
systemctl start immich-web
```

To make the services persistent and auto-start after reboot:

```bash
systemctl enable immich-ml && \
systemctl enable immich-web
```

##### Without systemd (WSL2, some containers)

If your system doesn't have systemd (check with `systemctl list-unit-files` or by checking if `/run/systemd/system` exists), services can be started manually:

```bash
# Start machine-learning backend
/bin/bash "$INSTALL_DIR/app/machine-learning/start.sh" &

# Start web server
/bin/bash "$INSTALL_DIR/app/start.sh" &
```

For auto-start without systemd, add these commands to `/etc/rc.local` or use a process manager like Supervisor or Runit.

The default setting exposes the Immich web server on port `2283` on all available address. For security reason, one should put a reverse proxy, e.g. Nginx, HAProxy, in front of the immich instance and add SSL to it.

##### Optional: Verify service files

If you need to customize the systemd service files (e.g., change paths), they are located at:
- `/etc/systemd/system/immich-ml.service`
- `/etc/systemd/system/immich-web.service`

Edit them with `nano` or your preferred editor, then reload systemd:

```bash
sudo systemctl daemon-reload
```

#### Immich config

Because we are install Immich instance in a none docker environment, some DNS lookup will not work. For instance, we need to change the URL inside `Administration > Settings > Machine Learning Settings > URL` to `http://localhost:3003`, otherwise the web server cannot communicate with the ML backend.

Additionally, for LXC with CUDA or other GPU Transcoding support enabled, one needs to go to `Administration > Settings > Video Transcoding Settings > Hardware Acceleration > Acceleration API` and select your GPU Transcoding (e.g., `NVENC` - for CUDA) to explicitly use the GPU to do the transcoding.

# Hardware acceleration configuration (optional)

This section covers GPU setup for hardware-accelerated machine learning (CUDA, ROCm, OpenVINO) and transcoding. Skip it if you are running CPU-only; otherwise complete the relevant subsection **before** running `pre-install.sh` so the GPU userland is already in place.

<details>
<summary>Nvidia</summary>

Firstly, prepare a LXC with GPU available by following the guide at [another repository](https://github.com/loeeeee/loe-handbook-of-gpu-in-lxc/blob/main/src/gpu-passthrough.md) of mine. This process is referred to as NVIDIA GPU pass-through in LXC.

After finishing all of the steps in that guide, the guest OS should execute command `nvidia-smi` without any error.

The major component that Immch requires is [ONNX runtime](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html#requirementsto), and here we are installing its dependency.

<details>
<summary>Ubuntu 24.04</summary>

For Immich machine learning support in `Ubuntu`, we need to install CuDNN and CUDA Toolkit. The default cuDNN version in apt is version 8, which is no longer supported by ONNX Runtime. Thus, we need to install the latest version 9.

The CuDNN install commands are from [official website of NVIDIA](https://developer.nvidia.com/cudnn-downloads), and should all be run as root. Also, one should check the NVIDIA website for updates.

```bash
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb
dpkg -i cuda-keyring_1.1-1_all.deb
apt-get update

apt-get -y install cudnn-cuda-12
```

In addition to the cuDNN, we also need libcublas12 things.

```bash
apt install -y libcublaslt12 libcublas12 libcurand10
```

<br>
</details>

<details>
<summary>Debian 12</summary>

For Immich machine learning support in `Debian`, we need to install CuDNN and CUDA Toolkit.

We install the entire CUDA Toolkit because install `libcublas` depends on CUDA Toolkit, and when install the toolkit, this right version of this component will be included.

The CuDNN install commands are from [official website of NVIDIA](https://developer.nvidia.com/cudnn-downloads), and should all be run as root. Also, one should check the NVIDIA website for updates.

```bash
# CuDNN part
wget https://developer.download.nvidia.com/compute/cuda/repos/debian12/x86_64/cuda-keyring_1.1-1_all.deb
dpkg -i cuda-keyring_1.1-1_all.deb
add-apt-repository contrib
apt-get update
apt-get -y install cudnn
## Specified by NVIDIA, but does not seem to install anything
apt-get -y install cudnn-cuda-12

# CUDA Toolkit part
apt install -y cuda-toolkit
```

<br>
</details>

<br>
</details>


<details>
<summary>Intel/OpenVINO</summary>

This part is intended for users who would like to utilize Intel's OpenVINO execution provider. ([System requirement](https://docs.openvino.ai/2024/about-openvino/release-notes-openvino/system-requirements.html), [List of supported devices](https://docs.openvino.ai/2024/about-openvino/compatibility-and-support/supported-devices.html)) The document listed the support for not only Intel iGPU and dGPU, but also its NPU, which seems very cool.

Disclaimer: This part is not yet tested by the repo owner, and it is composed based on documentation. However, success have been reported ([Issue #58](https://github.com/loeeeee/immich-in-lxc/issues/58)), even though one could not see the background tasks ([Issue #62](https://github.com/loeeeee/immich-in-lxc/issues/62)).

<details>
<summary>Moe</summary>
Firstly, prepare a LXC with proper hardware available. For iGPU user, one could use `intel_gpu_top` to see its availability.

Then, install the dependency specified by Immich for Intel.

```bash
./dep-intel.sh
```

Finally, after first-time execution of the `install.sh`, which happens at later part of the guide (so safe to skip for now), modify the generated `.env` file.

```env
isCUDA=openvino
```

I know, this is ugly as hell, but whatever, it works.

Now, when installing Immich, it will be using OpenVINO as its ML backend.

<br>
</details>

<br>
</details>


<details>
<summary>Others</summary>

Since Immich depends on ONNX runtime, it is **possible** that other hardware that is not officially supported by Immich can be used to do machine learning tasks. The idea here is that installing the dependency for the hardware following [ONNX's instruction](https://onnxruntime.ai/docs/execution-providers/#summary-of-supported-execution-providers).

Some users have also reported successful results using GPU Transcoding in Immich by following the Proxmox configurations from this video: [iGPU Transcoding In Proxmox with Jellyfin Media Center](https://www.youtube.com/watch?v=XAa_qpNmzZs) - Just avoid all the Jellyfin stuff and do the configurations on the Immich container instead. At the end, you should be able to use your iGPU Transcoding in Immich by going to needs to go to `Administration > Settings > Video Transcoding Settings > Hardware Acceleration > Acceleration API` and select `Quick Sync` to explicitly use the GPU to do the transcoding.

Good luck and have fun!

<br>
</details>

# Components

What gets installed on the host by the scripts in this repo:

| Category | Component | Notes |
| --- | --- | --- |
| **Immich** | Web server | Node.js app served by systemd unit `immich-web` |
| | Machine-learning server | Python app served by systemd unit `immich-ml` |
| **Database** | PostgreSQL 17 | installed from the official PGDG apt repo |
| | VectorChord | required vector extension (v1.133.0+) |
| | Redis | queue / cache |
| **Media stack** | Jellyfin-ffmpeg 7 | hardware-accelerated transcoding |
| | libvips, libheif, libjxl, libraw, ImageMagick | built from source against system codecs |
| | mimalloc | built from source, used by the web server |
| **Runtime** | Node.js (LTS via nvm), pnpm | installed per-user by `install.sh` |
| | Python 3 + uv | machine-learning venv |
| | git | |
| **Optional — Reverse proxy** | Nginx / Caddy / HAProxy | not installed by this repo; put one in front for TLS |
| **Optional — NVIDIA** | NVIDIA driver + CuDNN 9 | see [Hardware acceleration configuration (optional)](#hardware-acceleration-configuration-optional) |
| **Optional — AMD** | ROCm 6.4 | see the same section |
| **Optional — Intel** | OpenVINO runtime | see the same section |

# Update procedure

The Immich server instance is designed to be stateless, meaning that deleting the instance, i.e. the `INSTALL_DIR/app` folder, (NOT DATABASE OR OTHER STATEFUL THINGS) will not break anything. 
Thus, to upgrade the current Immich instance, all one needs to do is essentially install the latest Immich.

- **v1.133.0+ Breaking Changes:** If upgrading to v1.133.0 or later, ensure you're upgrading from at least v1.107.2 or later. If you're on an older version, upgrade to v1.107.2 first and ensure Immich starts successfully before continuing.

First, stop the old instance:

```bash
# If using systemd:
systemctl stop immich-ml immich-web
```

After stopping, update this repo by doing a `git pull` in the folder `immich-in-lxc` (as the `immich` user):

```bash
su - <run-user>
cd ~/immich-in-lxc
git pull
```

Then, modify the `REPO_TAG` value in `.env` file to match the desired version in `example.env`:

```bash
$EDITOR .env
```

Finally, run `install.sh` to update Immich:

```bash
./install.sh
```

Once complete, restart the services:

```bash
# If using systemd:
systemctl restart immich-ml immich-web

# If using manual start, run the start scripts again:
/bin/bash "$INSTALL_DIR/app/machine-learning/start.sh" &
/bin/bash "$INSTALL_DIR/app/start.sh" &
```
