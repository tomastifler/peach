-- 恢复待处理前保留原来的忽略或稍后处理决定；已批准资料不由恢复入口撤回。
CREATE TABLE review_decision_history(
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,
  item_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('rejected','skipped')),
  reviewer TEXT NOT NULL,
  note TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  restored_at TEXT NOT NULL
);

CREATE INDEX idx_review_decision_history_item
ON review_decision_history(category,item_key,restored_at DESC);

INSERT INTO ledger_revision(tbl) VALUES('review_decision_history');
CREATE TRIGGER rev_review_decision_history_insert AFTER INSERT ON review_decision_history BEGIN
    UPDATE ledger_revision SET n=n+1 WHERE tbl='review_decision_history';
END;
CREATE TRIGGER rev_review_decision_history_update AFTER UPDATE ON review_decision_history BEGIN
    UPDATE ledger_revision SET n=n+1 WHERE tbl='review_decision_history';
END;
CREATE TRIGGER rev_review_decision_history_delete AFTER DELETE ON review_decision_history BEGIN
    UPDATE ledger_revision SET n=n+1 WHERE tbl='review_decision_history';
END;
