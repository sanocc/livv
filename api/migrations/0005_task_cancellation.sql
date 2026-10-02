-- Atomic schema extension: retain every task/attempt column, ID and dependent record.
PRAGMA defer_foreign_keys=ON;
DROP TRIGGER snapshots_guard;
CREATE TABLE tasks_next(id TEXT PRIMARY KEY,plan_id TEXT REFERENCES plans(id),schedule_key TEXT UNIQUE,platform TEXT NOT NULL REFERENCES platforms(id),city TEXT NOT NULL,keyword TEXT NOT NULL,checkin TEXT NOT NULL,checkout TEXT NOT NULL,scope TEXT NOT NULL CHECK(scope IN('top30','custom','all')),collection_limit INTEGER,status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','RUNNING','COMPLETED','PARTIAL','FAILED','CANCELLED')),preferred_device_id TEXT REFERENCES devices(id),created_at TEXT NOT NULL,due_at TEXT NOT NULL,window_start TEXT NOT NULL,window_end TEXT NOT NULL,finished_at TEXT,error_code TEXT,error_message TEXT,market_status TEXT,detail_success INTEGER,detail_total INTEGER,capacity_warning INTEGER NOT NULL DEFAULT 0,task_type TEXT NOT NULL DEFAULT 'LEGACY_MARKET_DETAIL' CHECK(task_type IN ('LEGACY_MARKET_DETAIL','MARKET_LIST')),CHECK(window_start<window_end),CHECK(checkin<checkout),CHECK((scope='all' AND collection_limit IS NULL) OR (scope='top30' AND collection_limit=30) OR (scope='custom' AND collection_limit>0)));
CREATE TABLE attempts_next(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),attempt_number INTEGER NOT NULL CHECK(attempt_number BETWEEN 1 AND 5),device_id TEXT NOT NULL REFERENCES devices(id),claimed_at TEXT NOT NULL,started_at TEXT,finished_at TEXT,timeout_at TEXT NOT NULL,lease_until TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('RUNNING','COMPLETED','PARTIAL','FAILED','CANCELLED')),error_code TEXT,error_message TEXT,returned_to_queue_at TEXT,core_hotels TEXT NOT NULL DEFAULT '[]',UNIQUE(task_id,attempt_number));
INSERT INTO tasks_next SELECT * FROM tasks;
INSERT INTO attempts_next SELECT * FROM attempts;
DROP TABLE attempts;
DROP TABLE tasks;
ALTER TABLE tasks_next RENAME TO tasks;
ALTER TABLE attempts_next RENAME TO attempts;
CREATE INDEX tasks_pool ON tasks(status,due_at,window_end);
CREATE INDEX tasks_market ON tasks(platform,city,keyword,checkin,scope,finished_at);
CREATE UNIQUE INDEX one_running_per_device ON attempts(device_id) WHERE status='RUNNING';
CREATE UNIQUE INDEX one_running_per_task ON attempts(task_id) WHERE status='RUNNING';
CREATE INDEX attempts_timeout ON attempts(status,lease_until,timeout_at);
CREATE TRIGGER snapshots_guard BEFORE INSERT ON snapshots BEGIN
 SELECT RAISE(ABORT,'UPLOAD_FENCE_REJECTED') WHERE NOT EXISTS(SELECT 1 FROM attempts a JOIN tasks t ON t.id=a.task_id JOIN devices d ON d.id=a.device_id WHERE a.id=NEW.attempt_id AND t.id=NEW.task_id AND d.id=NEW.device_id AND d.status='approved' AND a.status='RUNNING' AND t.status='RUNNING' AND a.timeout_at>NEW.received_at AND a.lease_until>NEW.received_at AND t.window_end>NEW.received_at AND NEW.observed_at>=a.started_at AND NEW.observed_at<t.window_end AND NEW.observed_at<=NEW.received_at) ;
END;

-- Verify restored foreign keys before clearing the deferred DROP counters.
CREATE TABLE cancellation_migration_check(violations INTEGER NOT NULL CHECK(violations=0));
INSERT INTO cancellation_migration_check SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE cancellation_migration_check;
PRAGMA defer_foreign_keys=OFF;
