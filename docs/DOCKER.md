# Docker deployment

The Peach Docker image is for a single-user VPS or NAS, managed through the browser. The image repository is [longmeidao/peach](https://hub.docker.com/r/longmeidao/peach). `edge` is rebuilt from the `master` branch, and version tags correspond to release commits. The current image targets `linux/amd64`; ARM NAS has not been accepted. On 2026-10-15, in a standalone Docker Engine on WSL, with the official locked dependencies, it passed acceptance for empty-volume initialization, non-root operation, authentication, saving configuration, synthetic video scanning, HTTP Range, configuration reload and restart persistence.

Docker does not use the desktop tray. When adding a media directory in the web configuration, enter only the actual directory inside the container, such as `/media`; Peach saves the required path configuration automatically. The entry points for the Windows installer, macOS source run and Docker are described in the [README](../README.en.md#download-and-use).

## Data and media

`/data` holds the configuration, SQLite database, credentials and image cache. It must be stored on a data volume, and that volume must be kept when the container is recreated. The media directory is mounted separately at `/media`; it is read-only by default, and scanning and playback do not need write access to media. Organizing, moving and deleting require the user to provide a writable mount explicitly.

CloudDrive2 and Peach run separately. If the NAS already has CloudDrive2, reuse it; on a fresh machine, install it and bind your cloud drive following the [official CloudDrive2 Docker guide](https://www.clouddrive2.com/docker.html). For the Peach container to read cloud-drive directories that CloudDrive2 mounts later, the Linux host must support FUSE, and CloudDrive2's mount directory must be configured so that mount changes can be shared; `rslave` in Compose lets those changes propagate into the Peach container. This mechanism does not apply to Docker Desktop; see the [Docker bind propagation documentation](https://docs.docker.com/engine/storage/bind-mounts/#configure-bind-propagation). The Peach container does not need FUSE or privileged mode. Directory permissions must allow reads by the container user, UID 1000.

For cloud download or push discovery, set the CloudDrive2 API address in the Peach configuration to a service name on the same container network or a reachable host address; `127.0.0.1` inside the container points only to Peach itself.

The `compose.yaml` at the repository root uses `PEACH_MEDIA_ROOT` to specify the existing media root on the host; inside the container it is always `/media`. Finish the CloudDrive2 mount first, then start Peach. The named volume `peach-data` holds `/data`; do not run any operation that deletes this volume. To bind an existing data directory, make a full backup first and make sure UID 1000 can write to it; do not let another Peach write to this Peach database at the same time.

## First run and access

After starting with Compose, Peach creates the configuration, database and a random login token for a fresh data volume. Existing configuration keeps its values; if a database exists but the configuration file is missing, the service refuses to start and the configuration file must be restored. The initialization log shows only the location of the token file.

Run `peach token` in the container terminal to get the login token, then log in from the browser and set an access password. The configuration page requires login, and the connection must come from the container itself or a private network; management requests carrying proxy forwarding headers are rejected. After saving through the configuration page, the service reloads the configuration automatically; if scanning is checked, metadata processing starts.

The HTTP port inside the container is fixed at 8900; the access port is set in Compose. By default it is published only to the host's `127.0.0.1`; use a private VPN or an SSH tunnel for remote access. For LAN access, bind the host's LAN address through `PEACH_BIND` and set an access password. The boundaries for public hosting are in the [security notes](../SECURITY.md). The Docker image does not provide multi-user accounts or tenant isolation.

## Configuration file and paths

The configuration file is `/data/config.toml` inside the data volume. In the "Media directories" section of the browser configuration page, add a directory: enter a container directory such as `/media` or `/media/115`, choose the media source and read policy, then save. When an existing directory has moved, change the media directory on that row; Peach manages how it maps to database paths.

Back up the configuration file before editing it by hand, and restart the container afterwards. Updating the image keeps this file, so comments in an existing file also stay as they are. Viewing the configuration notes does not require reinitializing the data volume.

After the container has been updated and restarted, run the following command in the directory containing `compose.yaml` to see the new comments and the current configuration values; the command only prints content and does not rewrite `/data/config.toml`:

```sh
docker compose exec peach python -c "from peach import settings_file as s; print(s.render(s.active()), end='')"
```

The default template contains only initial values, not the media directories and custom settings of an existing deployment. Replacing the whole file with the default template replaces those values too and may make existing videos unreadable. To update only the notes, replace the comments and keep the configuration values; to replace the whole file, back it up first and check the differences item by item.

The following is for reference when editing the configuration by hand or mapping existing media directories between multiple Peach instances. Saving from the web page handles `[media.locations]` and `[media.mounts]`: the former holds the path prefixes in the database, and the latter holds the directories from which files are actually read. The Peach database stores video paths in Windows format on every system; Linux does not need to create the same drive letter or directory.

The following three paths each have a purpose. Suppose the host media directory is `/srv/videos` and Compose mounts it at `/media` in the container:

| Location | Example | Purpose |
| --- | --- | --- |
| Host directory | `/srv/videos` | Set as `PEACH_MEDIA_ROOT` in Compose; the directory must already exist |
| Directory inside the container | `/media` | Set in the media directories of the configuration page or in `[media.mounts]`; Peach actually reads from here |
| Directory prefix in the database | `R:\media` | Example value for `[media.locations]`, matching the start of video paths in the database; normally managed by Peach |

When configuring a fresh local library by hand, you can use the following mapping. The prefix generated automatically by the web page may differ, and you do not need to change it to the example value. Merge the entries of the two tables into the existing configuration; do not add tables with the same name twice:

```toml
[media.locations]
local = 'R:\media'

[media.mounts]
local = '/media'
```

After scanning `/media/a.mp4`, Peach stores `R:\media\a.mp4` in the video's `path` field in the database; at playback it replaces `R:\media` with `/media` and reads `/media/a.mp4` in the container. This Windows path in the database is a string, not a file name that actually exists on Linux.

When videos already exist, `[media.locations]` must keep matching the path prefixes in the database. Changing it to `/media` does not update the existing video records and instead breaks the path mapping. If you only move the actual media directory, keep `[media.locations]` and adjust `[media.mounts]` and the Compose directory mount. When one source has multiple directories, both tables use arrays, with matching count and order one to one.

To reuse the database of another Peach, enter in `[media.locations]` of the configuration file the directory prefixes matching the video paths in that database, and in `[media.mounts]` the directories this container can read, such as `/media/115`; existing deployments keep their own mapping. Compose must already mount these directories. CloudDrive2 is one of the media sources, and local directories can also be mounted directly into Peach.

The service in the container always listens on `0.0.0.0:8900`; the host access address and port use `PEACH_BIND` and `PEACH_PORT` in Compose; `host` and `port` in `[server]` apply when running `peach serve` directly. A standalone Docker deployment keeps `[replication] enabled = false`, and no desktop tray or SMB replication needs to be configured.

## Hardware transcoding (AMD / Intel VAAPI)

On the first re-encode, Linux probes which hardware encoders are actually available; whole-file MP4 and HLS segments share the probe result. AMD / Intel use VAAPI; when an NVIDIA device is present, NVENC is probed. A backend whose probe fails is not tried again within the current service process and is probed again after the service restarts. Container remuxing (stream copy) needs no hardware probe.

The image includes Debian FFmpeg, the Mesa VAAPI driver and `vainfo`. An AMD host must load `amdgpu` and the matching firmware and provide `/dev/dri/renderD*`. Intel requires installing a VAAPI driver suited to the device in a custom image; the Mesa driver does not mean all Intel GPUs are covered. Merge the entries below into `services.peach` in Compose, adjusting the device path for the host:

```yaml
    devices:
      - /dev/dri/renderD128:/dev/dri/renderD128
    group_add:
      - "${PEACH_RENDER_GID}"
    environment:
      PEACH_TRANSCODE_BACKEND: auto
      PEACH_VAAPI_DEVICE: /dev/dri/renderD128
```

Set `PEACH_RENDER_GID` to the numeric GID of the group that owns the host's render node. The container runs as UID 1000 and needs read and write permission on that node; passing the device through without group permission still fails to initialize. On Unraid, add the same device mapping, environment variables and extra group in the container settings; privileged mode is not needed. The default Compose does not mount any device, so machines without a GPU can run it directly.

| Environment variable | Values and purpose |
| --- | --- |
| `PEACH_TRANSCODE_BACKEND` | Defaults to `auto`; can be set to `vaapi`, `nvenc` or `software`. A specified hardware backend is still verified for encoding ability and falls back to software on failure. |
| `PEACH_VAAPI_DEVICE` | Specifies the render node inside the container; when empty, `/dev/dri/renderD*` is probed in name order and the first usable node is used. |

The VAAPI attempt order is hardware decoding with `scale_vaapi` / `h264_vaapi`, then software decoding with `hwupload` / `h264_vaapi`, then `libx264`. Decoding ability is also limited by the GPU model and the source's codec and bit depth; working hardware encoding does not prove that every source can be hardware-decoded. NVIDIA passthrough additionally needs the host driver and the NVIDIA Container Toolkit; Mesa does not provide CUDA / NVENC.

When CPU usage is high, first check the log lines "转码硬件后端" (transcode hardware backend) and "转码硬件探测失败" (transcode hardware probe failed). After the completion log lines "整片转码完成" (whole-file transcode complete) or "HLS 分片完成" (HLS segment complete), `vaapi` means hardware decoding and encoding were used, `vaapi-encode` means software decoding plus hardware encoding, and `libx264` means software transcoding. Then check device permissions and the output of `vainfo --display drm --device /dev/dri/renderD128` in the same container as the same user. `No VA display found` has to be investigated together with the driver and device permissions; the existence of the node alone does not rule out a permission problem.

`ffmpeg -hwaccels` lists the hardware acceleration methods supported by the build, and `ffmpeg -h decoder=h264` and similar commands list the hardware devices supported by the corresponding decoder. VAAPI decoding is enabled through the hardware acceleration interface of the ordinary decoder, so the absence of a decoder named `vaapi` in `ffmpeg -decoders` does not mean VAAPI decoding is unsupported. For the meaning of the parameters see the [official FFmpeg documentation](https://ffmpeg.org/ffmpeg.html#Advanced-Video-options). The actual decoding, GPU usage and playback behavior on the target GPU must be verified on the deployment machine.

## Updates and scope

Keep `/data` when updating the image and recreating the container. When the database has pending migrations, back it up first and follow the migration procedure in [Operation and configuration](OPERATIONS.md); the Docker entrypoint does not migrate an existing database automatically. The health check uses `/healthz?ready=1`.

A Linux container does not read the browsing history on the user's computer and does not include an interactive browser; sources that need a local browser for verification are unavailable in this environment. Real CloudDrive2 account login, cloud-drive traffic and the NAS mount on real hardware must be verified on the target machine.

## Image publishing

The build uses the official Python `3.14.8-slim-trixie` and uv `0.13.1`; dependencies are locked by `uv.lock`, and the application is installed as a non-editable package that includes the web and migration resources. The image runs as UID/GID 1000 and bundles FFmpeg, FFprobe and OpenSSL. The build context allows only code and resources; it does not contain the working tree, media, a real Peach database or credentials.

The `Docker` workflow in GitHub Actions first builds and runs the temporary-volume acceptance, and publishes after it passes. The repository variable `DOCKERHUB_USERNAME` and the secret `DOCKERHUB_TOKEN` are used for publishing to Docker Hub; the secret is stored only in GitHub and never enters project files. When no publishing identity is configured, the build acceptance still runs. An ARM image must pass equivalent runtime acceptance before being added to publishing.
