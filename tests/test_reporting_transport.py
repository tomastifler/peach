"""Sentry 最终 HTTP 回执、测试隔离与有限身份回归。"""
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from peach import remote_reporting as reporting
from peach import reporting_delivery, reporting_identity
from peach.settings_file import PeachConfig

DSN = "https://public@o123.ingest.us.sentry.io/456"


class ReportingTransportTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.config = PeachConfig(Path(folder.name).resolve(), Path(folder.name).resolve() / "config.toml")
        self.enterContext(mock.patch.object(reporting, "_disabled", False))
        self.enterContext(mock.patch("peach.settings_file.active", return_value=self.config))
        self.enterContext(mock.patch.dict(os.environ, {"PEACH_REPORTING_TEST_MODE": "0"}))
        reporting.close()
        self.addCleanup(reporting.close)

    def envelope(self):
        from sentry_sdk.envelope import Envelope
        envelope = Envelope()
        envelope.add_event({"event_id": "a" * 32, "message": "fixture"})
        return envelope

    def client(self, results, *, gate=None):
        client = reporting._new_client(DSN, envelope_gate=gate or (lambda envelope: True),
                                       delivery_callback=results.append)
        self.addCleanup(lambda: client.close(timeout=0))
        return client

    def test_actual_http_status_and_network_uncertainty_have_distinct_receipts(self):
        for status, headers, expected in ((200, {}, "accepted"), (202, {}, "accepted"),
                (200, {"x-sentry-rate-limits": "60:error:organization"}, "unknown"),
                (429, {}, "failed"), (413, {}, "failed"), (500, {}, "failed")):
            with self.subTest(status=status, headers=headers):
                outcomes = []
                client = self.client(outcomes)
                response = SimpleNamespace(status_code=status, headers=headers, close=mock.Mock(), content=b"private")
                with mock.patch('peach.reporting_transport.http_client') as factory:
                    request = factory.return_value.__enter__.return_value.request
                    request.return_value = response
                    client.transport._send_envelope(self.envelope())
                self.assertFalse(factory.call_args.kwargs['follow_redirects'])
                self.assertEqual(request.call_count, 1)
                self.assertEqual(outcomes[-1]["status"], expected)
                self.assertEqual(outcomes[-1]["status_code"], status)
                self.assertNotIn("private", str(outcomes))
        outcomes = []
        with mock.patch('peach.reporting_transport.http_client', side_effect=OSError("private proxy")):
            with self.assertRaises(OSError):
                self.client(outcomes).transport._send_envelope(self.envelope())
        self.assertEqual(outcomes, [{"status": "unknown", "reason": "network"}])

    def test_test_mode_blocks_the_base_http_request_even_with_a_valid_dsn(self):
        outcomes = []
        client = self.client(outcomes)
        with mock.patch.dict(os.environ, {"PEACH_REPORTING_TEST_MODE": "1"}), \
                mock.patch('peach.reporting_transport.http_client') as network:
            with self.assertRaises(OSError):
                client.transport._send_envelope(self.envelope())
            network.assert_not_called()
        self.assertEqual(outcomes[-1]["status"], "unknown")

    def test_consent_and_queue_rejections_do_not_claim_acceptance(self):
        from sentry_sdk.transport import HttpTransport
        outcomes = []
        client = self.client(outcomes, gate=lambda envelope: False)
        with mock.patch.object(HttpTransport, "_send_envelope") as network:
            client.transport._send_envelope(self.envelope())
            network.assert_not_called()
        self.assertEqual(outcomes, [{"status": "blocked", "reason": "consent"}])
        with mock.patch.object(client.transport._worker, "submit", return_value=False):
            client.transport.capture_envelope(self.envelope())
        self.assertEqual(outcomes[-1], {"status": "failed", "reason": "queue_full"})

    def test_local_receipt_is_current_and_never_exposes_internal_permits(self):
        reporting.save({"usage": True, "errors": True}, self.config)
        permit = {"kind": "errors", "revision": reporting.consent(self.config)["revision"],
                  "consent": str(self.config.directory("state") / "remote-reporting.json")}
        reporting_delivery.record(permit, "a" * 32, {"status": "queued"})
        reporting_delivery.record(permit, "b" * 32, {"status": "accepted"})
        self.assertEqual(reporting.snapshot(self.config)["delivery"]["errors"]["status"], "queued")
        reporting_delivery.record(permit, "a" * 32, {"status": "accepted", "status_code": 200})
        receipt = reporting.snapshot(self.config)["delivery"]
        self.assertEqual(receipt["errors"]["status"], "accepted")
        self.assertNotIn("event_id", str(receipt))
        reporting.save({"usage": False, "errors": False}, self.config)
        self.assertEqual(reporting.snapshot(self.config)["delivery"], {})
        reporting_delivery.record(permit, "a" * 32, {"status": "accepted"})
        self.assertEqual(reporting.snapshot(self.config)["delivery"], {})

    def test_identity_uses_only_finite_environment_and_verified_build_commit(self):
        source_root = Path(self.enterContext(tempfile.TemporaryDirectory())).resolve()
        (source_root / ".git").write_text("gitdir: ../shared.git/worktrees/fixture\n", encoding="utf-8")
        with mock.patch("peach.settings_file.PROJECT_ROOT", source_root), \
                mock.patch.object(reporting_identity.sys, "frozen", False, create=True), \
                mock.patch.object(reporting_identity, "_source_commit", return_value="a" * 40), \
                mock.patch.dict(os.environ, {"PEACH_REPORTING_ENVIRONMENT": "private-host"}):
            metadata = reporting_identity.event_metadata("errors")
        self.assertEqual(metadata["environment"], "development")
        self.assertEqual(metadata["dist"], "a" * 40)
        self.assertEqual(metadata["tags"], {"purpose": "technical-diagnostics", "runtime": "source",
                                            "distribution": "source"})
        self.assertNotIn("private", str(metadata))
        with mock.patch.object(reporting_identity.sys, "frozen", True, create=True), \
                mock.patch.object(reporting_identity, "frozen_build", return_value=SimpleNamespace(commit="bad")), \
                mock.patch.dict(os.environ, {"PEACH_REPORTING_ENVIRONMENT": "production"}):
            self.assertNotIn("dist", reporting_identity.event_metadata("research"))

    def test_unwritable_local_receipt_does_not_block_event_submission(self):
        reporting.save({"usage": True, "errors": True}, self.config)
        client = mock.Mock()
        with mock.patch.object(reporting, '_new_client', return_value=client), \
                mock.patch.object(reporting_delivery, 'atomic_write_text', side_effect=PermissionError('read only')), \
                mock.patch.object(reporting, 'dsn', return_value=DSN):
            reporting._submit('usage', {'message': 'Peach started'}, self.config, reporting.consent(self.config), DSN)
        client.capture_event.assert_called_once()
        reporting.close()

    def test_sdk_rate_limit_receipt_is_not_overwritten_with_unknown(self):
        from datetime import datetime, timedelta, timezone
        outcomes = []
        client = self.client(outcomes)
        client.transport._disabled_until[None] = datetime.now(timezone.utc) + timedelta(seconds=60)
        with mock.patch('peach.reporting_transport.http_client') as network:
            client.transport._send_envelope(self.envelope())
            network.assert_not_called()
        self.assertEqual(outcomes, [{'status': 'failed', 'reason': 'rate_limit'}])

    def test_consent_is_rechecked_inside_delivery_file_lock(self):
        reporting.save({"usage": True, "errors": True}, self.config)
        permit = {'kind': 'errors', 'revision': reporting.consent(self.config)['revision'],
                  'consent': str(self.config.directory('state') / 'remote-reporting.json')}
        original = reporting._consent
        count = 0

        def racing_consent(path):
            nonlocal count
            count += 1
            if count == 2:
                reporting.save({'usage': False, 'errors': False}, self.config)
            return original(path)

        with mock.patch.object(reporting, '_consent', side_effect=racing_consent):
            reporting_delivery.record(permit, 'a' * 32, {'status': 'queued'})
        self.assertEqual(reporting_delivery.snapshot(self.config), {})
