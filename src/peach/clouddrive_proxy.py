"""CloudDrive cloud drive proxy read and write-back; account configuration is stored by CloudDrive."""
from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
from pathlib import PurePosixPath, PureWindowsPath

from google.protobuf.empty_pb2 import Empty

from . import downloads_clouddrive_pb2 as pb
from .downloads import CLOUDDRIVE_CREDENTIAL, DownloadError, DownloadSettings
from .downloads_clouddrive import CloudDriveClient
from .follow_secrets import CredentialError, CredentialStore
from .push_discovery import PushDiscoverySettings

_KEY = secrets.token_bytes(32)
_WRITE_LOCK = threading.Lock()
MODES = {'system': pb.SYSTEM, 'direct': pb.NOPROXY, 'http': pb.HTTP, 'socks5': pb.SOCKS5}


class ProxyConflict(ValueError):
    """After the form was read, CloudDrive account configuration has changed."""


def client_for(config):
    address = DownloadSettings(config.directory('state')).load().clouddrive_address
    if not address:
        raise ValueError('Please first enter the CloudDrive2 address and API token in the download settings')
    try:
        credential = CredentialStore(config.directory('secrets')).load(CLOUDDRIVE_CREDENTIAL)
        token = credential.require('token')[0] if credential else ''
    except CredentialError:
        raise ValueError('CloudDrive2 API token cannot be read; please re-enter it in the download settings') from None
    return CloudDriveClient(address, token, timeout=3)


def _digest(value):
    return hmac.new(_KEY, value, hashlib.sha256).hexdigest()


def _identity(api):
    return _digest((api.name + '\0' + api.userName).encode())


def _revision(client, api, config):
    return _digest(client.address.encode() + b'\0' + client.token.encode() + b'\0' + _identity(api).encode()
                   + config.SerializeToString(deterministic=True))


def _get(client, api):
    return client.call('GetCloudAPIConfig', pb.GetCloudAPIConfigRequest(
        cloudName=api.name, userName=api.userName), 'read cloud drive proxy')


def _proxy(config, field):
    value = getattr(config, field)
    return dict(mode=next((key for key, mode in MODES.items() if value.proxyType == mode), 'unknown'),
                host=value.host, port=value.port, username=value.username,
                password_set=bool(value.password))


def _account(client, api, config, writable, libraries=()):
    return dict(id=_identity(api), name=api.nickName or api.userName or api.name, cloud=api.name,
                path=api.path, revision=_revision(client, api, config), writable=writable,
                libraries=list(libraries),
                api=_proxy(config, 'apiProxy'), data=_proxy(config, 'dataProxy'))


def _accounts(client):
    info = client.token_info()
    if not info.permissions.allow_get_cloud_apis:
        raise ValueError('CloudDrive2 API token needs the"View cloud drive"permission')
    apis = client.call('GetAllCloudApis', Empty(), 'read cloud drive accounts').apis
    return info.permissions, apis


def read(config):
    """A missing CloudDrive2 address is normal for a fresh deployment; return an empty result marked `configured=False`, and do not treat it as an error."""
    from .media_sources import CLOUD_LOCATIONS
    if not any(config.locations.get(key) for key in CLOUD_LOCATIONS):
        return dict(accounts=[], unlinked=[])
    if not DownloadSettings(config.directory('state')).load().clouddrive_address:
        return dict(accounts=[], unlinked=[], configured=False)
    with client_for(config) as client:
        permissions, apis = _accounts(client)
        bindings = _bindings(config, client, permissions, apis)
        linked = {row['account'] for row in bindings if row['account']}
        return dict(accounts=[_account(client, api, _get(client, api),
            permissions.allow_modify_cloud_apis, [row for row in bindings if row['account'] == _identity(api)])
            for api in apis if _identity(api) in linked], unlinked=[row for row in bindings if not row['account']])


def _apply(target, value):
    if not isinstance(value, dict) or value.get('mode') not in MODES:
        raise ValueError('Choose direct connection, follow system, HTTP or SOCKS5')
    mode = value['mode']
    host, port, username = value.get('host', ''), value.get('port', 0), value.get('username', '')
    if not isinstance(host, str) or not isinstance(username, str):
        raise ValueError('Proxy address and username must be text')
    host = host.strip()
    if mode in ('http', 'socks5'):
        if not host or len(host) > 253 or any(c in host for c in '/@?#') or any(c.isspace() for c in host):
            raise ValueError('Proxy address: enter only a hostname or IP')
        if type(port) is not int or not 1 <= port <= 65535:
            raise ValueError('Proxy port must be in the range 1–65535 ')
    password = value.get('password', '')
    if not isinstance(password, str) or len(password) > 1024 or len(username) > 256:
        raise ValueError('Invalid proxy credential format')
    if value.get('clear_password') not in (None, False, True):
        raise ValueError('Clear-password flag must be a boolean')
    target.proxyType = MODES[mode]
    if mode in ('http', 'socks5'):
        target.host, target.port, target.username = host, port, username
        if password:
            target.password = password
        elif value.get('clear_password'):
            target.ClearField('password')


def save(config, body):
    if not isinstance(body, dict) or not any(key in body for key in ('api', 'data')):
        raise ValueError('Please choose the proxy settings to save')
    with _WRITE_LOCK, client_for(config) as client:
        permissions, apis = _accounts(client)
        if not permissions.allow_modify_cloud_apis:
            raise ValueError('CloudDrive2 API token needs the"Modify cloud drive"permission')
        api = next((api for api in apis if _identity(api) == body.get('id')), None)
        if api is None:
            raise ProxyConflict('Cloud drive account changed; please re-read')
        libraries = [row for row in _bindings(config, client, permissions, apis) if row['account'] == _identity(api)]
        if not libraries:
            raise ProxyConflict('Media library changed; please re-read')
        current = _get(client, api)
        if not hmac.compare_digest(str(body.get('revision', '')), _revision(client, api, current)):
            raise ProxyConflict('CloudDrive2 configuration changed; please re-read before saving')
        for key, field in (('api', 'apiProxy'), ('data', 'dataProxy')):
            if key in body:
                _apply(getattr(current, field), body[key])
        client.call('SetCloudAPIConfig', pb.SetCloudAPIConfigRequest(
            cloudName=api.name, userName=api.userName, config=current), 'save cloud drive proxy')
        # The write request is sent only once; re-reading is the only way to confirm the value CloudDrive actually saved.
        return _account(client, api, _get(client, api), True, libraries)


def _relative(path, root):
    kind = PureWindowsPath if '\\' in str(root) or ':' in str(root) else PurePosixPath
    try:
        return kind(path).relative_to(kind(root)).parts
    except ValueError:
        return None


def media_remote_path(root, mount, prefixes, mounts):
    """Get the cloud path of a library path by push prefix or by mounted CloudDrive2 directory."""
    candidates = []
    for prefix in prefixes:
        tail = _relative(root, prefix.root)
        if tail is not None:
            candidates.append((len(prefix.root), str(PurePosixPath(prefix.prefix, *tail))))
    if candidates:
        return max(candidates)[1]
    for point in mounts:
        tail = _relative(mount, point.mountPoint)
        if tail is not None and not point.localMount and point.isMounted:
            candidates.append((len(point.mountPoint), str(PurePosixPath(point.sourceDir or '/', *tail))))
    return max(candidates)[1] if candidates else ''


def _bindings(config, client, permissions, apis):
    from .media_sources import CLOUD_LOCATIONS
    prefixes = PushDiscoverySettings(config.directory('state')).load(config.locations).prefixes
    mounts = []
    if permissions.allow_get_mounts:
        try:
            mounts = client.call('GetMountPoints', Empty(), 'read mount points').mountPoints
        except DownloadError:
            pass
    result = []
    for location in config.locations:
        if location not in CLOUD_LOCATIONS:
            continue
        for index, root in enumerate(config.locations.get(location, ())):
            mapped = config.mounts.get(location, ())
            remote = media_remote_path(root, mapped[index] if index < len(mapped) else root, prefixes, mounts)
            matches = [api for api in apis if api.path and
                       (remote == api.path.rstrip('/') or remote.startswith(api.path.rstrip('/') + '/'))]
            api = max(matches, key=lambda item: len(item.path)) if matches else None
            if api and sum(item.path == api.path for item in matches) != 1:
                api = None
            result.append(dict(root=root, location=location, name=config.library_names.get(root) or root,
                               account=_identity(api) if api else ''))
    return result


def connections(config):
    """Bind accounts by exact mount/push path; sources that cannot be determined are not assigned to direct or proxy."""
    from .media_sources import CLOUD_LOCATIONS
    result = {}
    if not any(config.locations.get(key) for key in CLOUD_LOCATIONS):
        return result
    try:
        with client_for(config) as client:
            permissions, apis = _accounts(client)
            bindings = _bindings(config, client, permissions, apis)
            needed = {row['account'] for row in bindings if row['account']}
            modes = {_identity(api): _proxy(_get(client, api), 'dataProxy')['mode']
                     for api in apis if _identity(api) in needed}
            for row in bindings:
                if row['account'] in modes:
                    mode = modes[row['account']]
                    result[str(PureWindowsPath(row['root'])).rstrip('\\').casefold()] = (
                        'proxy' if mode in ('http', 'socks5') else mode)
    except (DownloadError, ValueError, OSError):
        return {}
    return result
