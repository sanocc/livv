-- Sparse error/terminal evidence. Existing OTA tables and observations remain unchanged.
CREATE TABLE agent_logs(
 id TEXT NOT NULL,
 device_id TEXT NOT NULL REFERENCES devices(id),
 app_version TEXT,
 task_id TEXT REFERENCES tasks(id),
 attempt_id TEXT REFERENCES attempts(id),
 level TEXT NOT NULL CHECK(level IN('info','warn','error')),
 event TEXT NOT NULL,
 message TEXT NOT NULL,
 error_code TEXT,
 metadata TEXT NOT NULL,
 created_at TEXT NOT NULL,
 received_at TEXT NOT NULL,
 PRIMARY KEY(device_id,id)
);
CREATE INDEX agent_logs_device_time ON agent_logs(device_id,created_at DESC);
