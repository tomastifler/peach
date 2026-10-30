"""官方 gRPC 序列化、账号绑定、凭据保留与本机设置路由。"""
import tempfile
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from peach import clouddrive_proxy as proxy, downloads_clouddrive_pb2 as pb
from peach.downloads import CLOUDDRIVE_CREDENTIAL, DownloadSettings
from peach.follow_secrets import CredentialStore
from peach.push_discovery import PushDiscoverySettings
from peach.routes_auth import require_auth
from peach.routes_configuration import router
from peach.settings_file import PeachConfig
from test_downloads_clouddrive import FakeCloudDrive, TOKEN, _Server


class ProxyServer(FakeCloudDrive):
    def __init__(self):
        super().__init__()
        self.permissions = pb.TokenPermissions(allow_get_cloud_apis=True, allow_modify_cloud_apis=True,
                                              allow_get_mounts=True)
        self.configs = {'one': pb.CloudAPIConfig(maxDownloadThreads=7, defaultReadLengthKB=4096,
            apiProxy=pb.ProxyInfo(proxyType=pb.NOPROXY),
            dataProxy=pb.ProxyInfo(proxyType=pb.HTTP, host='localhost', port=7890,
                                   username='sample', password='private-proxy-password')),
            'two': pb.CloudAPIConfig(dataProxy=pb.ProxyInfo(proxyType=pb.NOPROXY))}
        self.configs['one'].MergeFromString(b'\xa0\x06\x07')

    def GetApiTokenInfo(self, request, context):
        self._auth('GetApiTokenInfo', request, context)
        return pb.TokenInfo(permissions=self.permissions)

    def GetAllCloudApis(self, request, context):
        self._auth('GetAllCloudApis', request, context)
        return pb.CloudAPIList(apis=[pb.CloudAPI(name='115open', userName='one', nickName='账号一', path='/drive1'),
                                    pb.CloudAPI(name='115open', userName='two', nickName='账号二', path='/drive2'),
                                    pb.CloudAPI(name='PikPak', userName='unused', nickName='未添加的账号', path='/unused')])

    def GetCloudAPIConfig(self, request, context):
        self._auth('GetCloudAPIConfig', request, context)
        return self.configs[request.userName]

    def SetCloudAPIConfig(self, request, context):
        self._auth('SetCloudAPIConfig', request, context)
        self.configs[request.userName].CopyFrom(request.config)
        from google.protobuf.empty_pb2 import Empty
        return Empty()

    def GetMountPoints(self, request, context):
        self._auth('GetMountPoints', request, context)
        return pb.GetMountPointsResult(mountPoints=[pb.MountPoint(
            mountPoint='B:\\', sourceDir='/drive2', isMounted=True)])


class ProxyTests(_Server):
    def setUp(self):
        self.fake = ProxyServer()
        self.server, self.address = self.serve(self.fake)
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name).resolve()
        self.config = PeachConfig(root, root / 'config.toml', present=True,
            locations={'115': ('A:\\Movies', 'B:\\Movies')})
        DownloadSettings(self.config.directory('state')).save({'clouddrive_address': self.address}, {})
        CredentialStore(self.config.directory('secrets')).save(CLOUDDRIVE_CREDENTIAL, {'token': TOKEN})
        PushDiscoverySettings(self.config.directory('state')).save(
            {'prefixes': [{'prefix': '/drive1', 'root': 'A:\\Movies'}]}, self.config.locations)

    def test_local_libraries_need_no_clouddrive_connection(self):
        config = replace(self.config, locations={'local': ('C:\\Movies',)})
        with patch.object(proxy, 'client_for') as create_client:
            self.assertEqual(proxy.read(config), {'accounts': [], 'unlinked': []})
            create_client.assert_not_called()

    def test_cloud_libraries_without_clouddrive_address_read_as_not_configured(self):
        DownloadSettings(self.config.directory('state')).save({'clouddrive_address': ''}, {})
        with patch.object(proxy, 'client_for') as create_client:
            self.assertEqual(proxy.read(self.config), {'accounts': [], 'unlinked': [], 'configured': False})
            create_client.assert_not_called()
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[require_auth] = lambda: {}
        with patch('peach.routes_configuration.settings_file.load_config', return_value=self.config), TestClient(
                app, base_url='http://127.0.0.1', client=('127.0.0.1', 8000)) as client:
            response = client.get('/api/configuration/cloud-proxies')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIs(response.json()['configured'], False)

    def test_reads_are_fresh_and_passwords_are_not_exposed(self):
        state = proxy.read(self.config)
        self.assertEqual(len(state['accounts']), 2)
        self.assertEqual(state['unlinked'], [])
        account = state['accounts'][0]
        self.assertTrue(account['data']['password_set'])
        self.assertNotIn('private-proxy-password', str(account))
        self.fake.configs['one'].dataProxy.proxyType = pb.SOCKS5
        updated = proxy.read(self.config)['accounts'][0]
        self.assertEqual(updated['data']['mode'], 'socks5')
        self.assertNotEqual(account['revision'], updated['revision'])
        self.assertNotIn('SetCloudAPIConfig', self.methods())

    def test_libraries_share_an_account_and_unlinked_libraries_are_visible(self):
        config = replace(self.config, locations={'115': ('A:\\Movies', 'A:\\Movies\\Extra', 'Z:\\Missing')},
                         library_names={'A:\\Movies': '收藏', 'A:\\Movies\\Extra': '精选'})
        result = proxy.read(config)
        self.assertEqual(len(result['accounts']), 1)
        self.assertEqual([row['name'] for row in result['accounts'][0]['libraries']], ['收藏', '精选'])
        self.assertEqual(result['unlinked'][0]['root'], 'Z:\\Missing')

    def test_save_preserves_other_fields_unknown_fields_and_password(self):
        before = self.fake.configs['one'].SerializeToString()
        account = proxy.read(self.config)['accounts'][0]
        result = proxy.save(self.config, dict(id=account['id'], revision=account['revision'],
            data={**account['data'], 'port': 7891}))
        expected = pb.CloudAPIConfig.FromString(before)
        expected.dataProxy.port = 7891
        self.assertEqual(self.fake.configs['one'], expected)
        self.assertEqual(result['data']['port'], 7891)
        self.assertNotIn('private-proxy-password', str(result))
        self.assertEqual(self.fake.configs['two'].dataProxy.proxyType, pb.NOPROXY)
        self.assertEqual(self.methods().count('SetCloudAPIConfig'), 1)

    def test_conflict_and_missing_permission_do_not_write(self):
        account = proxy.read(self.config)['accounts'][0]
        self.fake.configs['one'].maxDownloadThreads = 8
        with self.assertRaises(proxy.ProxyConflict):
            proxy.save(self.config, {**account, 'data': account['data']})
        self.fake.permissions.allow_modify_cloud_apis = False
        with self.assertRaisesRegex(ValueError, '修改云盘'):
            proxy.save(self.config, {**account, 'data': account['data']})
        self.assertNotIn('SetCloudAPIConfig', self.methods())

    def test_api_and_data_credentials_can_be_changed_and_cleared_independently(self):
        account = proxy.read(self.config)['accounts'][0]
        result = proxy.save(self.config, dict(id=account['id'], revision=account['revision'],
            api={'mode': 'socks5', 'host': 'localhost', 'port': 1080, 'password': 'new-secret'},
            data={**account['data'], 'clear_password': True}))
        self.assertEqual(self.fake.configs['one'].apiProxy.password, 'new-secret')
        self.assertFalse(result['data']['password_set'])

    def test_proxy_host_and_port_validation_prevents_writes(self):
        account = proxy.read(self.config)['accounts'][0]
        for data in ({'mode': 'http', 'host': 'http://localhost', 'port': 7890},
                     {'mode': 'socks5', 'host': 'localhost', 'port': 0}, {'mode': 'anything'}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                proxy.save(self.config, dict(id=account['id'], revision=account['revision'], data=data))
        self.assertNotIn('SetCloudAPIConfig', self.methods())

    def test_exact_paths_bind_accounts_for_separate_traffic_totals(self):
        self.assertEqual(proxy.connections(self.config), {'a:\\movies': 'proxy', 'b:\\movies': 'direct'})
        self.fake.configs['two'].dataProxy.proxyType = pb.SYSTEM
        self.assertEqual(proxy.connections(self.config)['b:\\movies'], 'system')
        self.fake.permissions.allow_get_mounts = False
        self.assertEqual(proxy.connections(self.config), {'a:\\movies': 'proxy'})

    def test_settings_routes_roundtrip_and_reject_stale_revision(self):
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[require_auth] = lambda: {}
        with patch('peach.routes_configuration.settings_file.load_config', return_value=self.config), TestClient(
                app, base_url='http://127.0.0.1', client=('127.0.0.1', 8000)) as client:
            response = client.get('/api/configuration/cloud-proxies')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['cache-control'], 'no-store')
            account = response.json()['accounts'][0]
            body = dict(id=account['id'], revision=account['revision'], data={'mode': 'direct'})
            saved = client.post('/api/configuration/cloud-proxies', json=body)
            self.assertEqual(saved.status_code, 200, saved.text)
            self.assertEqual(saved.json()['data']['mode'], 'direct')
            self.assertEqual(client.post('/api/configuration/cloud-proxies', json=body).status_code, 409)
            self.assertNotIn('private-proxy-password', saved.text)
