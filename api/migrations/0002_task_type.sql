-- Preserve the contract of every existing task; only new tasks opt into list-only.
ALTER TABLE tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'LEGACY_MARKET_DETAIL' CHECK(task_type IN ('LEGACY_MARKET_DETAIL','MARKET_LIST'));
