-- M04 current Attempt progress state. This is not an event log.
ALTER TABLE task_attempts ADD COLUMN progress_stage TEXT;
ALTER TABLE task_attempts ADD COLUMN progress_current INTEGER;
ALTER TABLE task_attempts ADD COLUMN progress_target INTEGER;
ALTER TABLE task_attempts ADD COLUMN progress_updated_at TEXT;
