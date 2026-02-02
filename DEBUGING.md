# Debugging

Use the commands below to investigate common failures for Immich services and the web app.

- Check systemd service status:
	- `systemctl status immich-web.service immich-ml.service`

- Follow the web service log in real time:
	- `tail -f /var/log/immich/web.log`

- Trace file-related system calls for the app start script:
	- `strace -e trace=file -f /home/immich/app/start.sh`

- Narrow down whether the `sharp` module is causing failures:
	- `node -p "require('sharp').versions"`

The version of VIPS should match your local installation
vips --version

