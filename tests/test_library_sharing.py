"""群体研究的同意、只读投影、周期限制和独立传输回归。"""
import gzip
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from peach import library_sharing as sharing
from peach.repository import LedgerDatabase
from peach.settings_file import PeachConfig
from support.ledger import fresh_ledger

DSN = 'https://public@o123.ingest.us.sentry.io/789'


class LibrarySharingTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(mock.patch('peach.remote_reporting._disabled', False))
        holder = tempfile.TemporaryDirectory()
        self.addCleanup(holder.cleanup)
        self.root = Path(holder.name).resolve()
        self.config = PeachConfig(self.root, self.root / 'config.toml')
        self.database = LedgerDatabase(fresh_ledger(self.root))
        self.contract = SimpleNamespace(read_connection=self.database.read_connection,
                                        taste_history_store=self.root / 'taste/history.sqlite')
        self.service = sharing.Service(self.config, self.contract)
        self.addCleanup(self.service.stop)
        patcher = mock.patch.dict(os.environ, {'PEACH_SENTRY_DSN': '', 'PEACH_LIBRARY_SENTRY_DSN': DSN})
        patcher.start()
        self.addCleanup(patcher.stop)

    def enable(self):
        preview = self.service.preview()
        return self.service.save({'enabled': True, 'schema': sharing.SCHEMA,
                                  'consent': True, 'preview_token': preview['token']})

    def add_work(self):
        with self.database.write_transaction() as connection:
            connection.execute("INSERT INTO asset(location,path,name,code) VALUES('local','work','title','EXM-001')")

    def attempt_state(self):
        return sharing.remote_reporting._read(sharing._state_path(self.config))

    def envelope(self, data=None):
        from sentry_sdk.envelope import Envelope
        from sentry_sdk.attachments import Attachment
        envelope = Envelope()
        envelope.add_event({'message': 'Peach research'})
        wire = sharing.compressed(sharing.collect(self.contract)[1]) if data is None else data
        envelope.add_item(Attachment(bytes=wire, filename=sharing.FILENAME).to_envelope_item())
        return envelope

    def test_disabled_and_missing_endpoint_do_not_read_library_or_construct_sdk(self):
        with mock.patch.object(sharing, 'collect') as collect, \
                mock.patch('peach.remote_reporting._new_client') as client:
            self.service.attempt()
            collect.assert_not_called()
            client.assert_not_called()
        self.enable()
        with mock.patch.object(sharing, 'target', return_value=''), mock.patch.object(sharing, 'collect') as collect:
            self.service.attempt()
            collect.assert_not_called()

    def test_enable_requires_preview_explicit_consent_and_current_schema(self):
        for body in ({'enabled': True}, {'enabled': 'true'}, {'enabled': True, 'consent': True, 'schema': sharing.SCHEMA}):
            with self.assertRaises(ValueError):
                self.service.save(body)
        preview = self.service.preview()
        with self.assertRaises(ValueError):
            self.service.save({'enabled': True, 'schema': sharing.SCHEMA, 'preview_token': preview['token']})
        self.assertTrue(self.enable()['enabled'])
        self.assertFalse(self.service.save({'enabled': False})['enabled'])
        with mock.patch.object(sharing, 'SCHEMA', sharing.SCHEMA + 1):
            self.assertFalse(sharing.snapshot(self.config)['enabled'])

    def test_preview_expires_and_cannot_be_reused(self):
        preview = self.service.preview()
        body = {'enabled': True, 'consent': True, 'schema': sharing.SCHEMA, 'preview_token': preview['token']}
        with mock.patch.object(sharing.time, 'monotonic', return_value=10**20), self.assertRaises(ValueError):
            self.service.save(body)
        self.service.save(body)
        with self.assertRaises(ValueError):
            self.service.save(body)

    def test_work_signals_are_deduplicated_and_collection_is_read_only(self):
        with self.database.write_transaction() as connection:
            for code, path in (('EXM-001', 'R:/private-person/movie-a.mp4'), ('EXM-001', 'R:/private-person/movie-b.mp4')):
                connection.execute("INSERT INTO asset(location,path,name,code,medium,rating,play_count,watch_ratio,duration) "
                                   "VALUES('local',?,'private-title',?,'video',80,2,.5,600)", (path, code))
            connection.execute("INSERT INTO asset_tag(asset_id,tag,source) VALUES(1,'手动标签','web-user')")
            connection.execute("INSERT INTO asset_tag(asset_id,tag,source) VALUES(2,'720P','metadata')")
            connection.execute("INSERT INTO asset_tag(asset_id,tag,source) VALUES(1,'已隐藏标签','web-user')")
            connection.execute("INSERT INTO asset_tag_preference(profile_id,asset_id,normalized_tag,hidden,updated_at) "
                               "VALUES('local-default',1,'已隐藏标签',1,'now')")
            connection.execute("INSERT INTO asset_preference(profile_id,asset_id,liked,updated_at) VALUES('local-default',1,1,'2026-10-18')")
        before = self.database.db_path.read_bytes()
        payload, data = sharing.collect(self.contract)
        self.assertEqual(self.database.db_path.read_bytes(), before)
        self.assertFalse((self.contract.taste_history_store.parent / 'preference-cache.json').exists())
        self.assertFalse((self.contract.taste_history_store.parent / 'browser-preference-cache.json').exists())
        self.assertEqual(set(payload), {'schema', 'peach', 'period', 'library', 'preferences', 'coverage'})
        self.assertEqual(len(payload['library']), 1)
        work = payload['library'][0]
        self.assertEqual(work['code'], 'EXM-001')
        self.assertEqual(work['manual_tags'], ['手动标签'])
        self.assertEqual(work['rating'], 80)
        self.assertTrue(work['liked'])
        self.assertEqual(work['play_count'], 4)
        self.assertEqual(work['watch_ratio'], .5)
        self.assertEqual(payload['coverage'], {'active_files': 2, 'coded_files': 2, 'coded_works': 1, 'uncoded_items': 0})
        self.assertEqual(payload['preferences']['tag'][0]['works']['collected'], 1)
        self.assertEqual(payload['preferences']['tag'][0]['works']['ratings'], {'80.0': 1})
        self.assertTrue(sharing.valid_payload(payload))
        for private in ('private-person', 'private-title', 'movie-a', 'movie-b', 'asset_id', 'visited_at', 'last_played',
                        'profile_id', 'fingerprint', 'R:/', '720P', '已隐藏标签', 'duration_seconds', 'entities'):
            self.assertNotIn(private, data.decode())

    def test_entity_distributions_include_uncoded_signals_and_explicit_favorites(self):
        from peach.entities import upsert_asset_entity
        with self.database.write_transaction() as connection:
            for code in ('EXM-001', 'EXM-001', None):
                connection.execute("INSERT INTO asset(location,path,name,code,medium,rating,play_count,duration,release_date) "
                                   "VALUES('local',?,'title',?,'video',60,1,2400,'2021-01-01')", (str(code) + str(connection.total_changes), code))
            for aid in (1, 2, 3):
                for kind in ('performer', 'creator', 'studio', 'series'):
                    upsert_asset_entity(connection, asset_id=aid, kind=kind, role=kind, name='名称-' + kind, source='test', confidence=1)
            eid = connection.execute("SELECT id FROM entity WHERE kind='performer'").fetchone()[0]
            connection.execute("UPDATE profile SET settings_json=? WHERE id='local-default'",
                               (json.dumps({'libraryShortcuts': {'favorites': [{'entity_id': eid}]}}),))
            connection.execute("UPDATE asset SET feedback='dislike',feedback_at=5,rating=100 WHERE id=2")
            connection.execute("UPDATE asset SET disposal='trash' WHERE id=3")
            connection.execute("INSERT INTO asset(location,path,name,medium,rating) VALUES('local','uncoded','title','image',20)")
            upsert_asset_entity(connection, asset_id=4, kind='performer', role='performer', name='名称-performer', source='test', confidence=1)
            connection.execute("INSERT INTO watch_queue(profile_id,asset_id,added_at,source) VALUES('local-default',1,'now','web')")
        payload, _ = sharing.collect(self.contract)
        self.assertEqual(payload['coverage'], {'active_files': 3, 'coded_files': 2, 'coded_works': 1, 'uncoded_items': 1})
        self.assertEqual(payload['library'], [{'code': 'EXM-001', 'rating': 80, 'watch_later': True,
                                              'play_count': 2, 'feedback': 'dislike'}])
        performer = payload['preferences']['performer'][0]
        self.assertEqual(performer, {'name': '名称-performer',
            'works': {'collected': 1, 'liked': 0, 'disliked': 1, 'watched': 1, 'ratings': {'80.0': 1}},
            'uncoded': {'collected': 1, 'liked': 0, 'disliked': 0, 'watched': 0, 'ratings': {'20.0': 1}}, 'favorite': True})
        self.assertEqual(payload['preferences']['era'][0]['name'], '2020')
        self.assertEqual(payload['preferences']['length'][0]['name'], '1')
        self.assertEqual(payload['preferences']['tag'], [])
        self.assertTrue(sharing.valid_payload(payload))

    def test_large_population_projection_uses_lossless_compression(self):
        count = 12000
        with self.database.write_transaction() as connection:
            connection.executemany("INSERT INTO asset(location,path,name,code) VALUES('local',?,'title',?)",
                                   ((str(i), f'EXM-{i:05}') for i in range(count)))
        payload, data = sharing.collect(self.contract)
        wire = sharing.compressed(data)
        self.assertLess(len(wire), sharing.MAX_BYTES)
        self.assertEqual(gzip.decompress(wire), data)
        self.assertEqual(len(json.loads(gzip.decompress(wire))['library']), count)
        self.assertTrue(sharing.valid_payload(payload))
        self.assertEqual(wire[3:8], bytes(5), 'gzip 不含文件名或生成时间')

    def test_research_project_must_be_separate_from_diagnostics(self):
        with mock.patch.dict(os.environ, {'PEACH_SENTRY_DSN': DSN}):
            self.assertEqual(sharing.target(), '')

    def test_schema_three_consent_does_not_authorize_population_projection(self):
        self.enable()
        path = self.config.directory('state') / 'library-sharing.json'
        state = json.loads(path.read_text())
        path.write_text(json.dumps({**state, 'schema': 3}))
        with mock.patch.object(sharing, 'collect') as collect:
            self.service.attempt()
            collect.assert_not_called()
        self.assertFalse(sharing.snapshot(self.config)['enabled'])

    def test_transport_rejects_invalid_signal_and_distribution_values(self):
        from copy import deepcopy
        with self.database.write_transaction() as connection:
            connection.execute("INSERT INTO asset(location,path,name,code,rating) VALUES('local','a','title','EXM-001',80)")
        payload, _ = sharing.collect(self.contract)
        self.assertTrue(sharing.valid_payload(payload))
        for key, invalid in [('rating', float('nan')), ('rating', 101), ('rating', True),
                             ('liked', 'yes'), ('manual_tags', ['R:/private']), ('play_count', -1),
                             ('watch_ratio', 1.1), ('entities', {'performer': ['name']}), ('tags', ['720P'])]:
            altered = deepcopy(payload)
            altered['library'][0][key] = invalid
            self.assertFalse(sharing.valid_payload(altered), (key, invalid))
        altered = deepcopy(payload)
        altered['preferences']['tag'] = [{'name': 'tag', 'works': {'collected': 1, 'liked': 0, 'disliked': 0,
                                         'watched': 0, 'ratings': {'80': 2}}}]
        self.assertFalse(sharing.valid_payload(altered))

    def test_installer_saves_explicit_selection_without_reading_or_sending(self):
        import runpy
        entry = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/build_app_entry.py'))
        with mock.patch('peach.settings_file.active', return_value=self.config), \
                mock.patch.object(sharing, 'collect') as collect, \
                mock.patch('peach.remote_reporting._new_client') as client, \
                mock.patch('peach.remote_reporting._disabled', False):
            for argument in ('1', '0'):
                self.assertEqual(entry['main'](['Peach.exe', '--installer-library-sharing', argument]), 0)
                self.assertEqual(bool(sharing.consent(self.config)), argument == '1')
            self.assertEqual(entry['main'](['Peach.exe', '--installer-library-sharing', 'true']), 2)
            collect.assert_not_called()
            client.assert_not_called()

    def test_real_sdk_sends_only_research_event_and_reviewed_attachment_once_per_week(self):
        from sentry_sdk.transport import HttpTransport
        self.add_work()
        self.enable()
        sent = []
        with mock.patch.object(HttpTransport, '_send_envelope', side_effect=lambda envelope: sent.append(envelope)):
            self.service.attempt()
            sharing.Service(self.config, self.contract).attempt()
        self.assertEqual(len(sent), 1)
        envelope = sent[0]
        self.assertEqual([item.type for item in envelope.items], ['event', 'attachment'])
        event = envelope.items[0].get_event()
        self.assertNotIn('extra', event)
        self.assertNotIn('server_name', event)
        self.assertNotIn('user', event)
        self.assertEqual(event['release'], sharing.remote_reporting.event_metadata('research')['release'])
        self.assertEqual(event['environment'], sharing.remote_reporting.event_metadata('research')['environment'])
        self.assertEqual(event['tags']['runtime'], sharing.remote_reporting.event_metadata('research')['tags']['runtime'])
        self.assertEqual(event['tags']['purpose'], 'population-research')
        attachment = json.loads(gzip.decompress(envelope.items[1].payload.get_bytes()))
        self.assertEqual(attachment['schema'], sharing.SCHEMA)
        self.assertEqual(envelope.items[1].headers['filename'], sharing.FILENAME)
        self.assertIn('library', attachment)
        self.assertIn('preferences', attachment)

    def test_disable_invalidates_queued_attachment(self):
        from sentry_sdk.envelope import Envelope
        from sentry_sdk.attachments import Attachment
        self.add_work()
        self.enable()
        previous = sharing.consent(self.config)['revision']
        envelope = Envelope()
        envelope.headers['trace'] = {'release': 'private-build', 'user_segment': 'private-user'}
        envelope.add_event({'message': 'Peach research', 'tags': {'private': 'name'}})
        envelope.add_item(Attachment(bytes=sharing.compressed(sharing.collect(self.contract)[1]), filename=sharing.FILENAME).to_envelope_item())
        self.assertTrue(self.service._gate(previous, envelope))
        self.assertNotIn('trace', envelope.headers)
        self.assertNotIn('private', envelope.items[0].get_event()['tags'])
        self.service.save({'enabled': False})
        self.assertFalse(self.service._gate(previous, envelope))

    def test_transport_rejects_unreviewed_fields_even_with_correct_filename(self):
        from sentry_sdk.envelope import Envelope
        from sentry_sdk.attachments import Attachment
        self.enable()
        revision = sharing.consent(self.config)['revision']
        payload, _ = sharing.collect(self.contract)
        for invalid in ({**payload, 'library': [{'code': 'EXM-001', 'path': 'R:/private'}]},
                        {**payload, 'user_id': 'private'},
                        {**payload, 'preferences': {'private': []}},
                        {'schema': sharing.SCHEMA, 'summary': []}):
            envelope = Envelope()
            envelope.add_event({'message': 'private'})
            envelope.add_item(Attachment(bytes=gzip.compress(json.dumps(invalid).encode()), filename=sharing.FILENAME).to_envelope_item())
            self.assertFalse(self.service._gate(revision, envelope))

    def test_transport_rejects_corrupt_and_oversized_compressed_data(self):
        from sentry_sdk.envelope import Envelope
        from sentry_sdk.attachments import Attachment
        self.enable()
        revision = sharing.consent(self.config)['revision']
        for raw in (b'not gzip', gzip.compress(b'x' * 4096), gzip.compress(b'{}')[:-3]):
            envelope = Envelope()
            envelope.add_event({'message': 'private'})
            envelope.add_item(Attachment(bytes=raw, filename=sharing.FILENAME).to_envelope_item())
            with mock.patch.object(sharing, 'MAX_RAW_BYTES', 2048):
                self.assertFalse(self.service._gate(revision, envelope))

    def test_oversized_snapshot_is_rejected_without_partial_upload(self):
        with mock.patch.object(sharing, 'MAX_RAW_BYTES', 1), self.assertRaises(ValueError):
            self.service.preview()
        self.assertFalse(sharing.snapshot(self.config)['enabled'])
        self.add_work()
        self.enable()
        with mock.patch.object(sharing, 'MAX_BYTES', 1), mock.patch('peach.remote_reporting._new_client') as client:
            self.service.attempt()
            client.assert_not_called()
        self.assertEqual(self.attempt_state()['status'], 'failed')
        self.assertEqual(self.attempt_state()['reason'], 'compression')
        self.assertFalse(self.attempt_state()['attempted'])

    def test_empty_and_uncoded_without_preferences_wait_for_data(self):
        self.enable()
        with mock.patch('peach.remote_reporting._new_client') as client:
            self.service.attempt()
            with self.database.write_transaction() as connection:
                connection.execute("INSERT INTO asset(location,path,name) VALUES('local','uncoded','title')")
            self.service.attempt()
            client.assert_not_called()
        self.assertEqual(self.attempt_state()['status'], 'waiting-data')
        self.assertFalse(self.attempt_state()['attempted'])
        self.assertFalse(self.service._gate(sharing.consent(self.config)['revision'], self.envelope()))

    def test_uncoded_preference_group_can_be_sent(self):
        with self.database.write_transaction() as connection:
            connection.execute("INSERT INTO asset(location,path,name) VALUES('local','uncoded','title')")
            connection.execute("INSERT INTO asset_tag(asset_id,tag,source) VALUES(1,'手动标签','web-user')")
        self.enable()
        with mock.patch('peach.remote_reporting._new_client') as client:
            self.service.attempt()
            client.assert_called_once()

    def test_collection_failure_does_not_spend_weekly_network_attempt(self):
        self.enable()
        with mock.patch.object(sharing, 'collect', side_effect=OSError('private path')):
            self.service.attempt()
        self.assertEqual(self.attempt_state()['status'], 'failed')
        self.assertEqual(self.attempt_state()['reason'], 'collection')
        self.assertFalse(self.attempt_state()['attempted'])
        self.assertNotIn('private path', json.dumps(self.attempt_state()))
        self.add_work()
        with mock.patch('peach.remote_reporting._new_client') as client:
            self.service.attempt()
            client.assert_called_once()

    def test_disable_during_collection_prevents_queueing(self):
        self.add_work()
        self.enable()
        collect = sharing.collect
        def disable_then_collect(contract):
            sharing.save_choice(self.config, False)
            return collect(contract)
        with mock.patch.object(sharing, 'collect', side_effect=disable_then_collect), \
                mock.patch('peach.remote_reporting._new_client') as client:
            self.service.attempt()
            client.assert_not_called()
        self.assertFalse(sharing.snapshot(self.config)['enabled'])

    def test_queue_failure_does_not_spend_network_attempt(self):
        self.add_work()
        self.enable()
        def make_client(*_args, envelope_gate, delivery_callback):
            def capture(*_args, **_kwargs):
                delivery_callback({'status': 'failed', 'reason': 'queue_full'})
            return SimpleNamespace(capture_event=capture, flush=lambda **_kw: None, close=lambda **_kw: None)
        with mock.patch('peach.remote_reporting._new_client', side_effect=make_client) as client:
            self.service.attempt()
            self.service.attempt()
            self.assertEqual(client.call_count, 2)
        self.assertEqual(self.attempt_state()['status'], 'failed')
        self.assertEqual(self.attempt_state()['reason'], 'queue_full')
        self.assertFalse(self.attempt_state()['attempted'])

    def test_delivery_receipts_record_only_status_and_safe_details(self):
        self.add_work()
        self.enable()
        for result in ({'status': 'accepted', 'status_code': 200},
                       {'status': 'failed', 'status_code': 403, 'reason': 'http_status'},
                       {'status': 'unknown', 'reason': 'network'}):
            sharing._state_path(self.config).unlink(missing_ok=True)
            def make_client(*_args, envelope_gate, delivery_callback, result=result):
                def capture(*_args, **_kwargs):
                    self.assertTrue(envelope_gate(self.envelope()))
                    delivery_callback({**result, 'url': 'private-url', 'detail': 'private-content'})
                return SimpleNamespace(capture_event=capture, flush=lambda **_kw: None, close=lambda **_kw: None)
            with mock.patch('peach.remote_reporting._new_client', side_effect=make_client):
                self.service.attempt()
                self.enable()
                self.service.attempt()
            state = self.attempt_state()
            self.assertEqual(state['status'], result['status'])
            self.assertTrue(state['attempted'])
            if 'reason' in result:
                self.assertEqual(state['reason'], result['reason'])
            self.assertNotIn('private', json.dumps(state))

    def test_missing_receipt_is_unknown_and_does_not_retry_network(self):
        self.add_work()
        self.enable()
        callbacks = []
        def make_client(*_args, envelope_gate, delivery_callback):
            callbacks.append(delivery_callback)
            def capture(*_args, **_kwargs):
                self.assertTrue(envelope_gate(self.envelope()))
                self.assertEqual(self.attempt_state()['status'], 'queued')
            return SimpleNamespace(capture_event=capture, flush=lambda **_kw: None, close=lambda **_kw: None)
        with mock.patch('peach.remote_reporting._new_client', side_effect=make_client) as client:
            self.service.attempt()
            self.assertEqual(self.attempt_state()['status'], 'unknown')
            self.service.attempt()
            client.assert_called_once()
        callbacks[0]({'status': 'accepted', 'status_code': 200})
        self.assertEqual(self.attempt_state()['status'], 'accepted')
        self.assertNotIn('reason', self.attempt_state())

    def test_real_sdk_http_receipt_controls_local_research_status(self):
        self.add_work()
        self.enable()
        for status, headers, expected in ((200, {}, 'accepted'), (413, {}, 'failed'), (429, {}, 'failed'),
                (200, {'x-sentry-rate-limits': '60:error:organization'}, 'unknown'), (None, {}, 'unknown')):
            with self.subTest(status=status, headers=headers):
                sharing._state_path(self.config).unlink(missing_ok=True)
                response = SimpleNamespace(status_code=status, headers=headers, close=mock.Mock(), content=b'private')
                with mock.patch.dict(os.environ, {'PEACH_REPORTING_TEST_MODE': '0'}), \
                        mock.patch('peach.reporting_transport.http_client') as factory:
                    request = factory.return_value.__enter__.return_value.request
                    request.return_value = response
                    request.side_effect = OSError('private proxy') if status is None else None
                    self.service.attempt()
                    self.service.attempt()
                    request.assert_called_once()
                state = self.attempt_state()
                self.assertEqual(state['status'], expected)
                self.assertTrue(state['attempted'])
                if status is not None:
                    self.assertEqual(state['status_code'], status)
                self.assertNotIn('private', json.dumps(state))

    def test_cross_week_receipt_cannot_overwrite_new_attempt(self):
        self.add_work()
        self.enable()
        callbacks = []
        def make_client(*_args, envelope_gate, delivery_callback):
            callbacks.append(delivery_callback)
            return mock.Mock()
        with mock.patch('peach.remote_reporting._new_client', side_effect=make_client):
            self.service.attempt()
            with mock.patch.object(sharing, '_period', return_value='2099-W01'):
                self.service.attempt()
            state = self.attempt_state()
            callbacks[0]({'status': 'accepted', 'status_code': 200})
            self.assertEqual(self.attempt_state(), state)

    def test_legacy_attempt_is_unknown_and_conserves_weekly_budget(self):
        self.enable()
        sharing._state_path(self.config).write_text(json.dumps(
            {'schema': sharing.SCHEMA, 'period': sharing._period(), 'status': 'attempted'}))
        self.assertEqual(sharing.snapshot(self.config)['last_attempt']['status'], 'unknown')
        with mock.patch.object(sharing, 'collect') as collect:
            self.service.attempt()
            collect.assert_not_called()

    def test_settings_snapshot_only_exposes_the_current_week_without_changing_receipts(self):
        self.enable()
        for status in ('failed', 'unknown', 'waiting-data', 'accepted'):
            with self.subTest(status=status):
                state = {'schema': sharing.SCHEMA, 'period': sharing._period(),
                         'status': status, 'attempted': True}
                sharing._state_path(self.config).write_text(json.dumps(state))
                self.assertEqual(sharing.snapshot(self.config)['last_attempt'], state)
                with mock.patch.object(sharing, '_period', return_value='2099-W01'):
                    self.assertEqual(sharing.snapshot(self.config)['last_attempt'], {})
                self.assertEqual(self.attempt_state(), state)

    def test_concurrent_services_allow_only_one_network_reservation(self):
        self.add_work()
        self.enable()
        sent, errors = [], []
        def make_client(*_args, envelope_gate, delivery_callback):
            def capture(*_args, **_kwargs):
                if envelope_gate(self.envelope()):
                    sent.append(True)
                    delivery_callback({'status': 'accepted', 'status_code': 200})
            return SimpleNamespace(capture_event=capture, flush=lambda **_kw: None, close=lambda **_kw: None)
        def run():
            try:
                sharing.Service(self.config, self.contract).attempt()
            except Exception as error:
                errors.append(error)
        with mock.patch('peach.remote_reporting._new_client', side_effect=make_client):
            threads = [threading.Thread(target=run) for _ in range(5)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=10)
            self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertEqual(errors, [])
        self.assertEqual(len(sent), 1)

    def test_obsolete_delivery_cannot_overwrite_current_attempt(self):
        self.add_work()
        self.enable()
        callbacks = []
        def make_client(*_args, envelope_gate, delivery_callback):
            callbacks.append(delivery_callback)
            return mock.Mock()
        with mock.patch('peach.remote_reporting._new_client', side_effect=make_client):
            self.service.attempt()
            first = self.attempt_state()
            self.service.attempt()
            second = self.attempt_state()
            self.assertNotEqual(first['attempt_id'], second['attempt_id'])
            callbacks[0]({'status': 'accepted', 'status_code': 200})
            self.assertEqual(self.attempt_state(), second)
            self.enable()
            callbacks[1]({'status': 'accepted', 'status_code': 200})
            self.assertEqual(self.attempt_state(), second)

    def test_queued_gate_rechecks_consent_and_version(self):
        self.add_work()
        self.enable()
        gates = []
        def make_client(*_args, envelope_gate, delivery_callback):
            gates.append(envelope_gate)
            self.service.save({'enabled': False})
            return mock.Mock()
        with mock.patch('peach.remote_reporting._new_client', side_effect=make_client):
            self.service.attempt()
        self.assertFalse(gates[0](self.envelope()))
        self.assertEqual(self.attempt_state()['status'], 'blocked')
        self.assertFalse(self.attempt_state()['attempted'])

    def test_queued_gate_rejects_expired_schema_and_period(self):
        self.add_work()
        self.enable()
        def make_client(*_args, envelope_gate, delivery_callback):
            def capture(*_args, **_kwargs):
                envelope = self.envelope()
                with mock.patch.object(sharing, 'SCHEMA', sharing.SCHEMA + 1):
                    self.assertFalse(envelope_gate(envelope))
                with mock.patch.object(sharing, '_period', return_value='2099-W01'):
                    self.assertFalse(envelope_gate(envelope))
                delivery_callback({'status': 'blocked', 'reason': 'consent'})
            return SimpleNamespace(capture_event=capture, flush=lambda **_kw: None, close=lambda **_kw: None)
        with mock.patch('peach.remote_reporting._new_client', side_effect=make_client):
            self.service.attempt()
        self.assertEqual(self.attempt_state()['status'], 'blocked')
        self.assertFalse(self.attempt_state()['attempted'])

    def test_preview_and_consent_api_are_local_authenticated_and_same_origin(self):
        import asyncio
        import httpx
        from fastapi import FastAPI
        from peach.routes_configuration import router, require_auth
        app = FastAPI()
        app.include_router(router)
        app.state.library_sharing = self.service
        app.dependency_overrides[require_auth] = lambda: {}

        async def request(method, path, peer='127.0.0.1', origin='http://test', body=None):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=(peer, 1234)),
                                         base_url='http://test') as client:
                return await client.request(method, path, json=body, headers={'Origin': origin})
        endpoint = '/api/configuration/library-sharing'
        response = asyncio.run(request('GET', endpoint + '/preview'))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        token = response.json()['token']
        body = {'enabled': True, 'schema': sharing.SCHEMA, 'consent': True, 'preview_token': token}
        for peer, origin in (('198.51.100.7', 'http://test'), ('127.0.0.1', 'https://external.invalid')):
            self.assertEqual(asyncio.run(request('GET', endpoint + '/preview', peer, origin)).status_code, 403)
            self.assertEqual(asyncio.run(request('POST', endpoint, peer, origin, body)).status_code, 403)
        self.assertFalse(sharing.snapshot(self.config)['enabled'])
        self.assertEqual(asyncio.run(request('POST', endpoint, body=body)).status_code, 200)
