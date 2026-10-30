-- 任务历史保留有效的父任务与根任务关联；已清退历史的引用为空。
UPDATE task_run
SET parent_run_id = CASE WHEN parent_run_id IN (SELECT id FROM task_run)
                        THEN parent_run_id ELSE NULL END,
    root_run_id = CASE WHEN root_run_id IN (SELECT id FROM task_run)
                      THEN root_run_id ELSE NULL END
WHERE (parent_run_id IS NOT NULL AND NOT EXISTS
       (SELECT 1 FROM task_run parent WHERE parent.id = task_run.parent_run_id))
   OR (root_run_id IS NOT NULL AND NOT EXISTS
       (SELECT 1 FROM task_run root WHERE root.id = task_run.root_run_id));

-- 运行时连接不依赖 PRAGMA foreign_keys，删除时由触发器维护 SET NULL 语义。
-- 两个引用在同一条 UPDATE 中处理，外键开启时也能通过即时检查。
CREATE TRIGGER task_run_clear_deleted_references
BEFORE DELETE ON task_run
BEGIN
  UPDATE task_run
  SET parent_run_id = CASE WHEN parent_run_id = OLD.id THEN NULL ELSE parent_run_id END,
      root_run_id = CASE WHEN root_run_id = OLD.id THEN NULL ELSE root_run_id END
  WHERE parent_run_id = OLD.id OR root_run_id = OLD.id;
END;
