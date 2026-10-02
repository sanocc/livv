-- Additive metadata only. Existing identities, approvals and business history are untouched.
ALTER TABLE devices ADD COLUMN environment TEXT CHECK(environment IS NULL OR json_valid(environment));
ALTER TABLE devices ADD COLUMN runtime TEXT CHECK(runtime IS NULL OR json_valid(runtime));
ALTER TABLE devices ADD COLUMN version_changed_at TEXT;
