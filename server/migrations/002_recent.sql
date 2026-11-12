-- Additive migration: keep legacy favorite fields for older clients and rollback.
CREATE TABLE resource_usage (
  module TEXT NOT NULL CHECK (module IN ('files', 'notes', 'secrets')),
  resource_id TEXT NOT NULL,
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  use_count BIGINT NOT NULL DEFAULT 1 CHECK (use_count > 0),
  PRIMARY KEY (module, resource_id)
);
CREATE INDEX resource_usage_opened_idx ON resource_usage (last_opened_at DESC);
