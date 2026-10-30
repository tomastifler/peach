"""升级补修以临时账本验证归属、原子标记、重试及无写入端边界。"""
import json
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from peach import r18_legacy_repair, upgrade_repairs
from peach.entities import upsert_asset_entity
from peach.repository import LedgerDatabase
from peach.task_runs import TaskRunStore
from support.ledger import fresh_ledger


class UpgradeRepairTests(unittest.TestCase):
    def test_javdb_upgrade_requeues_legacy_evidence_and_keeps_manual_values(self):
        from peach import artifact_rules, upgrade_rules
        self.asset(1, code='EXM-001', duration=1)
        self.asset(2, code='EXM-002', duration=1)
        with self.database.write_transaction() as connection:
            connection.execute('UPDATE asset SET catalog_title=?,field_owners=? WHERE id=1',
                               ('人工题名', json.dumps({'catalog_title':'user:manual'})))
        with patch.object(upgrade_repairs, 'REVISION', f'{upgrade_repairs.CATALOG_REVISION}:text-2'):
            self.service.prepare()
            previous=upgrade_repairs._read(self.service.receipt)
            previous.update(queued={'previous-task':99}, deferred=[42], dispatch_complete=True)
            self.service._save_receipt(previous)
        directory=self.root/'sources/library-metadata'
        directory.mkdir(parents=True,exist_ok=True)
        legacy=directory/'EXM-001-javdb.json'
        current=directory/'EXM-002-javdb.json'
        other=directory/'EXM-001-dmm.json'
        payloads=((legacy,{'id':'EXM-001','title':'来源显示题名'}),
                  (current,{'id':'EXM-002','title':'Original title * Limited','javdb_rule':2,
                            'source_id':'CurrentMovie'}),
                  (other,{'id':'EXM-001','title':'其他来源题名'}))
        for path,payload in payloads:
            path.write_text(json.dumps(payload,ensure_ascii=False),encoding='utf-8')
            artifact_rules.remember(path,str(upgrade_rules.PROVIDER_EVIDENCE))
        original={path:path.read_bytes() for path,_ in payloads}
        self.service.prepare()
        self.assertFalse(artifact_rules.current(legacy,str(upgrade_rules.PROVIDER_EVIDENCE)))
        self.assertTrue(artifact_rules.current(current,str(upgrade_rules.PROVIDER_EVIDENCE)))
        self.assertTrue(artifact_rules.current(other,str(upgrade_rules.PROVIDER_EVIDENCE)))
        for path,content in original.items():
            self.assertEqual(path.read_bytes(),content)
        receipt=upgrade_repairs._read(self.service.receipt)
        self.assertEqual(receipt['text_media_ids'],[1])
        self.assertEqual(receipt['queued'],{'previous-task':99})
        self.assertEqual(receipt['deferred'],[42])
        self.assertFalse(receipt['dispatch_complete'])
        self.assertEqual(receipt['local']['changed']['text_snapshots_invalidated'],1)
        with self.database.read_connection() as connection:
            self.assertEqual(connection.execute('SELECT catalog_title FROM asset WHERE id=1').fetchone()[0],
                             '人工题名')
        self.service.prepare()
        self.assertEqual(len(list(self.root.glob('ledger.pre-upgrade-*.db'))),2)

    def test_legacy_javdb_title_is_excluded_from_machine_text_repair(self):
        from peach import metadata_text_repair
        self.damaged_asset(owner='auto:javdb')
        directory=self.root/'sources/library-metadata'
        directory.mkdir(parents=True,exist_ok=True)
        (directory/'EXM-001-javdb.json').write_text(
            json.dumps({'id':'EXM-001','title':'旧绑定显示题名'}),encoding='utf-8')
        with self.database.read_connection() as connection:
            plan=metadata_text_repair.collect(connection,directory)
        row=next(row for row in plan['rows'] if row['field']=='title')
        self.assertEqual(row['group']['candidates'],[])
        self.assertEqual(row['action'],'review')

    def test_current_javdb_original_is_accepted_for_empty_machine_text(self):
        from peach import metadata_auto_apply, metadata_text_repair
        self.asset(1,code='EXM-001',duration=1)
        with self.database.write_transaction() as connection:
            connection.execute('UPDATE asset SET name=? WHERE id=1',('EXM-001.mp4',))
        directory=self.root/'sources/library-metadata'
        directory.mkdir(parents=True,exist_ok=True)
        (directory/'EXM-001-javdb.json').write_text(json.dumps({
            'id':'EXM-001','title':'元の題名','origin_title':'元の題名',
            'javdb_rule':2,'source_id':'AbC123','source_url':'https://javdb.com/v/AbC123'}),encoding='utf-8')
        with self.database.read_connection() as connection:
            candidate=metadata_auto_apply.metadata_auto_apply_candidate(connection,{
                'asset_id':1,'code':'EXM-001','field':'title','current_value':'',
                'candidates':metadata_text_repair._candidates(directory,'EXM-001','title')})
        self.assertIsNotNone(candidate)
        self.assertEqual(candidate['value'],'元の題名')
        self.assertEqual(candidate['source_id'],'AbC123')

    def test_encoding_upgrade_invalidates_damaged_snapshots_after_a_text_one_receipt(self):
        from peach import artifact_rules, upgrade_rules
        self.asset(1, code='EXM-001', duration=1)
        with self.database.write_transaction() as connection:
            connection.execute('UPDATE asset SET catalog_title=?,field_owners=? WHERE id=1',
                               ('人工题名', json.dumps({'catalog_title': 'user:manual'})))
        with patch.object(upgrade_repairs, 'REVISION', f'{upgrade_repairs.CATALOG_REVISION}:text-1'):
            self.service.prepare()
            receipt = upgrade_repairs._read(self.service.receipt)
            receipt.update(queued={'old-work': 99}, deferred=[42], dispatch_complete=True)
            self.service._save_receipt(receipt)
        directory = self.root / 'sources/library-metadata'
        directory.mkdir(parents=True, exist_ok=True)
        bad, good = directory / 'EXM-001-makers.json', directory / 'EXM-001-dmm.json'
        for path, title in ((bad, '壊\ufffdれた題名'), (good, '元の題名')):
            path.write_text(json.dumps({'id': 'EXM-001', 'title': title}), encoding='utf-8')
            artifact_rules.remember(path, str(upgrade_rules.PROVIDER_EVIDENCE))
        original = bad.read_bytes()
        self.service.prepare()
        self.assertFalse(artifact_rules.current(bad, str(upgrade_rules.PROVIDER_EVIDENCE)))
        self.assertTrue(artifact_rules.current(good, str(upgrade_rules.PROVIDER_EVIDENCE)))
        self.assertEqual(bad.read_bytes(), original)
        receipt = upgrade_repairs._read(self.service.receipt)
        self.assertEqual(receipt['text_media_ids'], [1])
        self.assertEqual(receipt['local']['changed']['text_snapshots_invalidated'], 1)
        self.assertEqual(receipt['queued'], {'old-work': 99})
        self.assertEqual(receipt['deferred'], [42])
        self.assertFalse(receipt['dispatch_complete'])
        with self.database.read_connection() as connection:
            self.assertEqual(connection.execute('SELECT catalog_title FROM asset WHERE id=1').fetchone()[0],
                             '人工题名')
        self.service.prepare()
        self.assertEqual(len(list(self.root.glob('ledger.pre-upgrade-*.db'))), 2)

    def damaged_asset(self, key=1, *, owner='auto:makers'):
        self.asset(key, code='EXM-001', duration=1)
        with self.database.write_transaction() as connection:
            connection.execute('UPDATE asset SET name=?,catalog_title=?,field_owners=? WHERE id=?',
                ('EXM-001.mp4', '壊\ufffdれた題名', json.dumps({'code':'scan:filename',
                                                            'catalog_title':owner}), key))

    def clean_snapshot(self):
        snapshots = self.root/'sources/library-metadata'
        snapshots.mkdir(parents=True,exist_ok=True)
        (snapshots/'EXM-001-dmm.json').write_text(json.dumps({'id':'EXM-001','title':'元の題名'}),
                                                encoding='utf-8')

    def test_readable_source_repairs_machine_title_after_an_older_upgrade_receipt(self):
        self.damaged_asset()
        self.clean_snapshot()
        with patch.object(upgrade_repairs, 'REVISION', upgrade_repairs.CATALOG_REVISION), patch(
                'peach.metadata_text_repair.collect', return_value={'rows':[], 'asset_ids':[]}):
            self.service.prepare()
        with patch('peach.r18_legacy_repair.apply_rows',side_effect=AssertionError('不能重放已完成补修')):
            self.service.prepare()
        self.service.prepare()
        with self.database.read_connection() as connection:
            row=connection.execute('SELECT catalog_title,field_owners FROM asset WHERE id=1').fetchone()
            self.assertEqual(row[0], '元の題名')
            self.assertEqual(json.loads(row[1])['catalog_title'], 'auto:dmm')
            self.assertEqual(connection.execute('SELECT count(*) FROM ledger_upgrade_repair').fetchone()[0], 2)
            self.assertEqual(connection.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertEqual(len(list(self.root.glob('ledger.pre-upgrade-*.db'))), 2)
        self.assertEqual(upgrade_repairs._read(self.service.receipt)['text_media_ids'], [1])

    def test_damaged_manual_titles_and_entity_identities_are_not_renamed(self):
        self.damaged_asset(owner='user:manual')
        self.clean_snapshot()
        with self.database.write_transaction() as connection:
            entity=upsert_asset_entity(connection,kind='performer',name='名前\ufffd',asset_id=1,
                role='performer',source='javinizer:makers:performer',confidence=.75,now='now')
        self.service.prepare()
        with self.database.read_connection() as connection:
            self.assertEqual(connection.execute('SELECT catalog_title FROM asset WHERE id=1').fetchone()[0],
                             '壊\ufffdれた題名')
            self.assertEqual(connection.execute('SELECT canonical_name FROM entity WHERE id=?', (entity,)).fetchone()[0],
                             '名前\ufffd')
        receipt=upgrade_repairs._read(self.service.receipt)
        self.assertGreater(receipt['local']['review_count'],0)
        self.assertEqual(receipt['text_media_ids'],[1])

    def test_missing_alternative_keeps_the_original_and_records_review(self):
        self.damaged_asset()
        self.service.prepare()
        with self.database.read_connection() as connection:
            self.assertEqual(connection.execute('SELECT catalog_title FROM asset WHERE id=1').fetchone()[0],
                             '壊\ufffdれた題名')
        receipt=upgrade_repairs._read(self.service.receipt)
        self.assertEqual(receipt['local']['changed']['text_fields'],0)
        self.assertEqual(receipt['local']['changed']['text_review'],1)

    def test_damaged_text_reprocessing_has_an_independent_rule_identity(self):
        from peach.settings_file import load_config
        self.service.config=load_config(environ={'PEACH_DATA_ROOT':str(self.root)})
        self.damaged_asset()
        receipt={'queued':{'upgrade-library:processing-v2:1':99},
                 'media_ids':[1],'text_media_ids':[1]}
        with patch('peach.library_processing._people_allowed',return_value=False), patch(
                'peach.seed_followup.plan',return_value=[]), patch('peach.media_sources.cost_for',return_value='free'):
            planned=self.service._plan(receipt)
        self.assertEqual([row.key for row in planned],['upgrade-library:processing-v2:text-3:1'])
        # 任务中心那一行写的是哪部片，不是一句笼统的「更新影片资料」。
        with self.service.contract.database.read_connection() as connection:
            code, name = connection.execute('SELECT code,name FROM asset WHERE id=1').fetchone()
        self.assertEqual(planned[0].label, code or name)

    def test_text_only_dispatch_does_not_plan_unrelated_people(self):
        from peach.settings_file import load_config
        self.service.config=load_config(environ={'PEACH_DATA_ROOT':str(self.root)})
        self.damaged_asset()
        receipt={'queued':{},'media_ids':[1],'text_media_ids':[1],'text_only':True}
        with patch('peach.library_processing._people_allowed',return_value=True), patch(
                'peach.seed_followup.plan',return_value=[]), patch('peach.media_sources.cost_for',return_value='free'), patch(
                'peach.performer_alias_followup.stock',side_effect=AssertionError('不能重放人物补修')):
            planned=self.service._plan(receipt)
        self.assertEqual([row.key for row in planned],['upgrade-library:processing-v2:text-3:1'])

    def test_completed_catalog_dispatch_preserves_deferred_work_across_text_revision(self):
        with patch.object(upgrade_repairs,'REVISION',upgrade_repairs.CATALOG_REVISION):
            self.service.prepare()
            receipt=upgrade_repairs._read(self.service.receipt)
            receipt.update(queued={'old-work':99},media_ids=[42],deferred=[42],dispatch_complete=True)
            self.service._save_receipt(receipt)
        self.service.prepare()
        receipt=upgrade_repairs._read(self.service.receipt)
        self.assertTrue(receipt['text_only'])
        self.assertTrue(receipt['dispatch_complete'])
        self.assertEqual(receipt['queued'],{'old-work':99})
        self.assertEqual(receipt['media_ids'],[42])
        self.assertEqual(receipt['deferred'],[42])

    def test_text_rule_preserves_inherited_running_or_cancelled_media_work(self):
        from peach.settings_file import load_config
        self.service.config=load_config(environ={'PEACH_DATA_ROOT':str(self.root)})
        self.damaged_asset()
        parent=self.store.start('old-upgrade',trigger='manual')
        key='upgrade-library:processing-v2:1'
        child=self.store.enqueue_followups(parent.id,[(key,upgrade_repairs.MEDIA_TASK,'处理')])['queued'][0]
        self.store.finish(parent.id,'succeeded')
        receipt={'queued':{key:child},'media_ids':[1],'text_media_ids':[1]}
        for status in ('pending','cancelled'):
            if status=='cancelled':
                self.store.finish(child,'cancelled')
            with self.subTest(status=status), patch('peach.library_processing._people_allowed',return_value=False), patch(
                    'peach.seed_followup.plan',return_value=[]), patch('peach.media_sources.cost_for',return_value='free'):
                self.assertEqual(self.service._plan(receipt),[])

    def test_a_snapshot_for_another_work_cannot_repair_machine_text(self):
        self.damaged_asset()
        self.clean_snapshot()
        path=self.root/'sources/library-metadata/EXM-001-dmm.json'
        path.write_text(json.dumps({'id':'OTHER-999','title':'別の作品'}),encoding='utf-8')
        self.service.prepare()
        with self.database.read_connection() as connection:
            self.assertEqual(connection.execute('SELECT catalog_title FROM asset WHERE id=1').fetchone()[0],
                             '壊\ufffdれた題名')

    def test_manual_change_after_planning_prevents_the_machine_repair(self):
        from peach import metadata_text_repair
        self.damaged_asset()
        self.clean_snapshot()
        with self.database.read_connection() as connection:
            plan=metadata_text_repair.collect(connection,self.root/'sources/library-metadata')
        with self.database.write_transaction() as connection:
            connection.execute('UPDATE asset SET catalog_title=?,field_owners=? WHERE id=1',
                               ('人工题名',json.dumps({'catalog_title':'user:manual'})))
            result=metadata_text_repair.apply(connection,plan)
            self.assertEqual(result['text_fields'],0)
            self.assertEqual(connection.execute('SELECT catalog_title FROM asset WHERE id=1').fetchone()[0],
                             '人工题名')

    def setUp(self):
        holder = tempfile.TemporaryDirectory()
        self.addCleanup(holder.cleanup)
        self.root = Path(holder.name).resolve()
        self.db = fresh_ledger(self.root)
        self.database = LedgerDatabase(self.db)
        self.store = TaskRunStore(self.database, host='upgrade-test')
        self.contract = SimpleNamespace(database=self.database, db_path=self.db, task_runs=self.store,
            follow_state_root=self.root / 'state', follow_sources_root=self.root / 'sources',
            candidate_root=self.root / 'generated', cover_root=self.root / 'covers',
            logo_root=self.root / 'logos', avatar_root=self.root / 'avatars', snapshot_root=self.root / 'snapshots',
            followups=SimpleNamespace(wake=Mock()))
        self.service = upgrade_repairs.UpgradeRepairs(self.contract, available=True)

    def asset(self, key, *, code='BAD-001', owner='scan:filename', duration=0):
        with self.database.write_transaction() as connection:
            connection.execute('INSERT INTO asset(id,location,path,name,medium,code,field_owners,duration) '
                               "VALUES(?,'local',?,?,'video',?,?,?)",
                               (key, f'{key}.mp4', 'SSIS-123.mp4', code, json.dumps({'code': owner}), duration))

    def test_local_repairs_are_atomic_idempotent_and_preserve_manual_codes(self):
        self.asset(1)
        self.asset(2, owner='user:manual')
        self.service.prepare()
        self.service.prepare()
        with self.database.read_connection() as connection:
            rows = connection.execute('SELECT id,code,duration FROM asset ORDER BY id').fetchall()
            self.assertEqual([tuple(row) for row in rows], [(1, 'SSIS-123', None), (2, 'BAD-001', None)])
            self.assertEqual(connection.execute('SELECT count(*) FROM ledger_upgrade_repair').fetchone()[0], 1)
        self.assertEqual(len(list(self.root.glob('ledger.pre-upgrade-*.db'))), 1)
        receipt = upgrade_repairs._read(self.service.receipt)
        self.assertEqual(receipt['local']['before'], receipt['local']['after'])
        self.service.receipt.unlink()
        self.service.prepare()
        self.assertEqual(upgrade_repairs._read(self.service.receipt), receipt)

    def test_failure_rolls_back_repairs_and_marker_together(self):
        self.asset(1)
        original = upgrade_repairs._catalog_apply
        def fail(connection, plan):
            original(connection, plan)
            raise RuntimeError('stop')
        with patch.object(upgrade_repairs, '_catalog_apply', side_effect=fail):
            with self.assertRaisesRegex(RuntimeError, 'stop'):
                self.service.prepare()
        with self.database.read_connection() as connection:
            self.assertEqual(connection.execute('SELECT code FROM asset').fetchone()[0], 'BAD-001')
            self.assertEqual(connection.execute('SELECT count(*) FROM ledger_upgrade_repair').fetchone()[0], 0)
        self.assertFalse(self.service.receipt.exists())

    def test_stale_receipt_cannot_hide_a_restored_database(self):
        self.asset(1)
        self.service.root.mkdir(parents=True)
        self.service.receipt.write_text(json.dumps({'revision': upgrade_repairs.REVISION,
            'local': {'state': 'succeeded'}, 'dispatch_complete': True}), encoding='utf-8')
        self.service.prepare()
        with self.database.read_connection() as connection:
            self.assertEqual(connection.execute('SELECT code FROM asset').fetchone()[0], 'SSIS-123')

    def test_corrupt_receipt_is_preserved_and_restored_from_the_ledger(self):
        self.service.prepare()
        receipt = upgrade_repairs._read(self.service.receipt)
        receipt.update(queued={'upgrade-library:processing-v2:1':71}, dispatch_complete=True)
        self.service._save_receipt(receipt)
        self.service.receipt.write_text('{', encoding='utf-8')
        self.assertEqual(self.service.snapshot()['state'], 'failed')
        self.service.prepare()
        self.assertEqual(upgrade_repairs._read(self.service.receipt), receipt)
        copies = list(self.service.root.glob('receipt.corrupt-*.json'))
        self.assertEqual(len(copies), 1)
        self.assertEqual(copies[0].read_text(encoding='utf-8'), '{')

    def test_identical_dispatch_receipt_keeps_the_ledger_revision(self):
        self.service.prepare()
        receipt = upgrade_repairs._read(self.service.receipt)
        with self.database.read_connection() as connection:
            before = connection.execute("SELECT n FROM ledger_revision WHERE tbl='ledger_upgrade_repair'").fetchone()[0]
        self.service._save_receipt(receipt)
        with self.database.read_connection() as connection:
            after = connection.execute("SELECT n FROM ledger_revision WHERE tbl='ledger_upgrade_repair'").fetchone()[0]
        self.assertEqual(before, after)

    def test_source_evidence_requires_the_current_rule_without_removing_legacy_files(self):
        from peach import artifact_rules, library_processing, upgrade_rules
        from peach.settings_file import load_config
        config = load_config(environ={'PEACH_DATA_ROOT': str(self.root)})
        remote = library_processing._RemoteSession(config, Mock(),
            library_processing._MissCache(self.root / 'misses.json'), retrying=False)
        path = remote._evidence_path('EXM-001', 'r18dev')
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps({'title':'样本'}), encoding='utf-8')
        self.assertEqual(remote._cached_evidence(('r18dev',), 'EXM-001'), [])
        self.assertTrue(path.exists())
        artifact_rules.remember(path, str(upgrade_rules.PROVIDER_EVIDENCE))
        self.assertEqual(remote._cached_evidence(('r18dev',), 'EXM-001')[0][0], 'r18dev')

    def test_interrupted_dispatch_parent_cannot_block_the_next_attempt(self):
        from peach.followups import Followup
        self.service.prepare()
        planned = [Followup('upgrade-library:processing-v2:1', 'upgrade-library', '处理')]
        with patch.object(self.service, '_plan', return_value=planned):
            with patch.object(self.store, 'enqueue_followups', side_effect=OSError('locked')), patch.object(
                    self.store, 'finish', side_effect=OSError('locked')), self.assertLogs('peach.upgrade_repairs', level='ERROR'):
                self.service.tick()
            self.assertIsNotNone(self.store.blocking(upgrade_repairs.TASK_KEY))
            self.service.tick()
        self.assertIsNone(self.store.blocking(upgrade_repairs.TASK_KEY))
        self.assertEqual(len(upgrade_repairs._read(self.service.receipt)['queued']), 1)
        self.assertEqual(self.service.error, '')

    def test_shutdown_waits_for_media_work_and_preserves_it_for_resume(self):
        from peach.followups import FollowupRunner
        from peach.settings_file import load_config
        self.contract.upgrade_repairs = self.service
        self.contract.upgrade_config = load_config(environ={'PEACH_DATA_ROOT': str(self.root)})
        runner = FollowupRunner(self.contract)
        self.contract.followups = runner
        parent = self.store.start('test-parent', trigger='manual')
        child = self.store.enqueue_followups(parent.id, [('upgrade-library:processing-v2:1', 'upgrade-library', '处理')])['queued'][0]
        self.store.finish(parent.id, 'succeeded')
        entered, ended = threading.Event(), threading.Event()
        def process(*_args, **kwargs):
            self.assertTrue(kwargs['active']())
            entered.set()
            self.assertTrue(self.service.stopping.wait(5))
            self.assertFalse(kwargs['active']())
            ended.set()
            raise InterruptedError('stopping')
        with patch('peach.library_processing.process_library', side_effect=process):
            runner.wake()
            self.assertTrue(entered.wait(5))
            self.service.stop()
        self.assertTrue(ended.is_set())
        self.assertEqual(self.store.get(child).status, 'pending')

    def test_reader_does_not_create_state_or_modify_ledger(self):
        service = upgrade_repairs.UpgradeRepairs(self.contract, available=False)
        service.prepare()
        service.tick()
        self.assertEqual(service.snapshot()['state'], 'unavailable')
        self.assertFalse(service.root.exists())

    def test_custom_code_patterns_are_used_during_planning(self):
        self.asset(1, code='CUSTOM-001')
        with self.database.read_connection() as connection, patch('peach.profiles.read_settings',
                return_value={'codePatterns': [r'CUSTOM-\d+']}), patch(
                'peach.catalog_rules.release_code_from_filename', return_value='CUSTOM-001') as identify:
            self.assertEqual(upgrade_repairs._catalog_plan(connection, self.root)['codes'], [])
        self.assertEqual(identify.call_args.kwargs['patterns'][0].pattern, r'CUSTOM-\d+')

    def test_series_projection_only_updates_linked_unprotected_fields(self):
        for key in (1, 2, 3):
            self.asset(key, duration=12)
        with self.database.write_transaction() as connection:
            for key in (1, 2):
                entity = upsert_asset_entity(connection, kind='series', name='Series', asset_id=key,
                                            role='series', source='javinizer:r18dev:series')
            connection.execute("UPDATE asset SET series='Series'")
            connection.execute('UPDATE asset SET field_owners=? WHERE id=2', (json.dumps({'series':'review:r18dev'}),))
            r18_legacy_repair.apply_entity_rows(connection, [{'action':'rename', 'entity_id':entity,
                'kind':'series', 'current':'Series', 'target':'シリーズ'}], 'now')
            rows = connection.execute('SELECT series,mutation_revision FROM asset ORDER BY id').fetchall()
        self.assertEqual([tuple(row) for row in rows], [('シリーズ',1), ('Series',0), ('Series',0)])

    def test_queue_batches_and_retry_keep_cancelled_items(self):
        from peach.followups import Followup
        self.asset(1, duration=12)
        self.service.prepare()
        planned = [Followup('upgrade-library:processing-v2:1', 'upgrade-library', '补全')]
        with patch.object(self.service, '_plan', side_effect=[planned, []]):
            self.service.tick()
            self.service.tick()
        receipt = upgrade_repairs._read(self.service.receipt)
        child = next(iter(receipt['queued'].values()))
        self.store.finish(child, 'cancelled')
        with patch.object(self.service, '_plan', return_value=[]):
            self.service.retry()
        self.assertEqual(upgrade_repairs._read(self.service.receipt)['queued'], receipt['queued'])
        self.assertEqual(self.service.snapshot()['state'], 'complete')

    def test_seed_content_change_reopens_completed_dispatch(self):
        from peach.followups import Followup
        self.service.prepare()
        receipt = upgrade_repairs._read(self.service.receipt)
        receipt['dispatch_complete'] = True
        self.service.receipt.write_text(json.dumps(receipt), encoding='utf-8')
        row = Followup('seed-import:new:digest', 'seed-import', '资料')
        with patch('peach.seed_followup.plan', return_value=[row]), patch.object(self.service, '_plan', return_value=[row]):
            self.service.tick()
        self.assertIn(row.key, upgrade_repairs._read(self.service.receipt)['queued'])

    def test_runtime_identity_detects_rebuilt_assets_in_the_running_process(self):
        from peach import client_updates
        dist = self.root / 'web/dist'
        dist.mkdir(parents=True)
        asset = dist / 'peach-app.js'
        asset.write_text('first', encoding='utf-8')
        with patch.object(client_updates, 'PROJECT_ROOT', self.root):
            first = client_updates.runtime_identity()
            self.assertEqual(client_updates.runtime_identity(), first)
            asset.write_text('second build', encoding='utf-8')
            second = client_updates.runtime_identity()
        self.assertNotEqual(first['build_id'], second['build_id'])
        self.assertEqual(first['version'], second['version'])

    def test_pending_schema_on_configured_writer_is_migrated_before_services(self):
        from peach import api, config
        with self.database.write_transaction() as connection:
            connection.execute('DROP TABLE ledger_upgrade_repair')
            connection.execute("DELETE FROM ledger_revision WHERE tbl='ledger_upgrade_repair'")
            connection.execute("DELETE FROM schema_migration WHERE version='0048'")
        self.contract.upgrade_repairs = self.service
        settings = SimpleNamespace(db_path=self.db)
        service = Mock()
        with patch.object(api, '_restore_task_center'), patch('peach.web_job_recovery.restore'), patch.object(
                config, 'MIGRATIONS_DIR', Path(__file__).resolve().parents[1] / 'migrations'):
            self.assertTrue(api._start_ledger_services(settings, self.contract, [service]))
        service.start.assert_called_once()
        self.assertEqual(len(list(self.root.glob('ledger.pre-schema-*.db'))), 1)

    def test_media_dispatch_is_bounded_and_rechecks_deferred_cost(self):
        from peach.settings_file import load_config
        self.service.config = load_config(environ={'PEACH_DATA_ROOT': str(self.root)})
        for key in range(1, 71):
            self.asset(key, duration=10)
        receipt = {'queued': {}, 'media_ids': list(range(1, 71)), 'deferred': [1]}
        with patch('peach.library_processing._people_allowed', return_value=False), patch(
                'peach.seed_followup.plan', return_value=[]), patch('peach.media_sources.cost_for', return_value='free'):
            batch = self.service._plan(receipt)
            self.assertEqual(len(batch), 64)
            self.assertEqual(receipt['deferred'], [])
            receipt['queued'] = {row.key: index for index, row in enumerate(batch)}
            self.assertEqual(len(self.service._plan(receipt)), 6)

    def test_media_handler_resumes_its_own_checkpoint(self):
        from peach.settings_file import load_config
        self.contract.upgrade_config = load_config(environ={'PEACH_DATA_ROOT': str(self.root)})
        self.service.root.mkdir(parents=True)
        (self.service.root / '1.json').write_text(json.dumps({'completed_previews':['asset:1'], 'issue_count':3}), encoding='utf-8')
        with patch('peach.library_processing.process_library', return_value={'status':'complete'}) as process:
            upgrade_repairs._media_run(self.contract, 'upgrade-library:processing-v2:1', Mock())
        self.assertEqual(process.call_args.kwargs['resume_state']['completed_previews'], ['asset:1'])
        self.assertEqual(process.call_args.kwargs['resume_state']['issue_count'], 0)
        self.assertEqual(process.call_args.kwargs['asset_ids'], [1])
        self.assertTrue(process.call_args.kwargs['recheck_existing'])

    def test_a_new_text_rule_does_not_resume_completed_metadata_from_the_old_rule(self):
        from peach.settings_file import load_config
        self.contract.upgrade_config = load_config(environ={'PEACH_DATA_ROOT': str(self.root)})
        self.service.root.mkdir(parents=True)
        previous = {'job_id': 'upgrade-library-processing-v2-text-1-1',
                    'processing_rule': 'processing-v2', 'completed_metadata': ['asset:1']}
        (self.service.root / '1.json').write_text(json.dumps(previous), encoding='utf-8')
        with patch('peach.library_processing.process_library', return_value={'status': 'complete'}) as process:
            upgrade_repairs._media_run(self.contract, 'upgrade-library:processing-v2:text-2:1', Mock())
        self.assertIsNone(process.call_args.kwargs['resume_state'])

    def test_unsigned_sidecar_posters_are_scheduled_without_a_failed_probe_or_snapshot(self):
        self.asset(1, duration=20)
        posters = self.contract.candidate_root / 'posters'
        posters.mkdir(parents=True)
        poster = posters / '1_4.jpg'
        poster.write_bytes(b'legacy derived poster')
        with patch('peach.library_processing._people_allowed', return_value=False), patch(
                'peach.seed_followup.plan', return_value=[]), patch('peach.media_sources.cost_for', return_value='free'):
            batch = self.service._plan({'queued':{}})
        self.assertEqual([item.key for item in batch], ['upgrade-library:processing-v2:1'])
        self.assertEqual(poster.read_bytes(), b'legacy derived poster')

    def test_processing_rule_change_rechecks_completed_work_and_local_evidence(self):
        from peach import library_processing, upgrade_rules
        previous = {'processing_rule':'legacy', 'completed_previews':['asset:1'],
                    'completed_metadata':['asset:1'], 'local_metadata':{'asset:1':{'old':True}}}
        state = {'local_metadata':previous['local_metadata']}
        checkpoints = library_processing._LibraryCheckpoints(state, previous, self.database, self.database.db_path)
        self.assertEqual(checkpoints.completed, {'completed_previews':set(), 'completed_metadata':set()})
        self.assertEqual(state['local_metadata'], {})
        self.assertEqual(state['processing_rule'], upgrade_rules.PROCESSING)
        previous['processing_rule'] = upgrade_rules.PROCESSING
        checkpoints = library_processing._LibraryCheckpoints({}, previous, self.database, self.database.db_path)
        self.assertEqual(checkpoints.completed['completed_metadata'], {'asset:1'})


class LedgerActivationTests(unittest.IsolatedAsyncioTestCase):
    async def test_configured_reader_has_no_repair_service_even_without_sync_object(self):
        from peach import api, settings_file
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            config = settings_file.load_config(environ={'PEACH_DATA_ROOT':str(root)})
            settings_file.write(config)
            config = settings_file.load_config(environ={'PEACH_DATA_ROOT':str(root)})
            database = config.directory('database') / 'ledger.db'
            contract = SimpleNamespace(follow_state_root=root / 'state', db_path=database)
            with patch.object(settings_file, 'active', return_value=config), patch(
                    'peach.runtime_prepare.configured_ledger_writer', return_value=(False, '读取端')):
                service = api._configure_upgrade_repairs(SimpleNamespace(configured=True, db_path=database), contract, None)
            self.assertFalse(service.available)
            self.assertFalse(service.root.exists())

    async def test_successful_retry_restarts_workers_once_after_prepare_failure(self):
        from peach.api import _LedgerActivation
        app = SimpleNamespace(state=SimpleNamespace())
        settings = SimpleNamespace(configured=True, db_path=Path('unused.db'))
        contract = SimpleNamespace(upgrade_repairs=SimpleNamespace(error=''))
        automatic, sharing = Mock(), Mock()
        activation = _LedgerActivation(app, settings, contract, (), automatic, sharing)
        with patch('peach.api._installation_in_progress', return_value=False), patch(
                'peach.api._start_ledger_services', side_effect=[False, True]) as start:
            self.assertFalse(await activation.start())
            self.assertTrue(await activation.resume())
            self.assertTrue(await activation.resume())
        self.assertEqual(start.call_count, 2)
        self.assertTrue(app.state.ledger_background_ready)
        automatic.start.assert_called_once()
        sharing.start.assert_called_once()
        await activation.stop()
