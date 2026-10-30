-- 补修水位与账本事务共同提交，随数据库备份和恢复。
CREATE TABLE ledger_upgrade_repair(
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  result_json TEXT NOT NULL
);

INSERT INTO ledger_revision(tbl) VALUES('ledger_upgrade_repair');
CREATE TRIGGER rev_ledger_upgrade_repair_insert AFTER INSERT ON ledger_upgrade_repair BEGIN
    UPDATE ledger_revision SET n=n+1 WHERE tbl='ledger_upgrade_repair';
END;
CREATE TRIGGER rev_ledger_upgrade_repair_update AFTER UPDATE ON ledger_upgrade_repair BEGIN
    UPDATE ledger_revision SET n=n+1 WHERE tbl='ledger_upgrade_repair';
END;
CREATE TRIGGER rev_ledger_upgrade_repair_delete AFTER DELETE ON ledger_upgrade_repair BEGIN
    UPDATE ledger_revision SET n=n+1 WHERE tbl='ledger_upgrade_repair';
END;
