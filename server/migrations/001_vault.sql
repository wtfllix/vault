CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS secrets (
  id BIGSERIAL PRIMARY KEY, secret_type TEXT NOT NULL, name TEXT NOT NULL,
  encrypted_data TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE secrets ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE secrets ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT '';
ALTER TABLE secrets ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE secrets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE secrets ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_secrets_live ON secrets(updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_secrets_tags ON secrets USING gin(tags);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL, last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_limits (
  key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at TIMESTAMPTZ NOT NULL,
  blocked_until TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY, parent_id UUID REFERENCES files(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 255 AND name NOT IN ('.','..') AND name !~ '[/\\\x01-\x1f\x7f]'),
  storage_key UUID UNIQUE, mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size BIGINT NOT NULL DEFAULT 0 CHECK (size >= 0), sha256 CHAR(64), is_folder BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('uploading','ready')),
  favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ,
  CHECK ((is_folder AND storage_key IS NULL AND size = 0) OR (NOT is_folder AND storage_key IS NOT NULL)),
  CHECK (parent_id IS DISTINCT FROM id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_name_live ON files(COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY, title TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'markdown', encrypted_data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notes_live ON notes(updated_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS note_drafts (
  session_hash CHAR(64) NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE, encrypted_data TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(session_hash, note_id)
);
CREATE OR REPLACE FUNCTION vault_check_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE depth INTEGER; subtree_depth INTEGER;
BEGIN
  IF NEW.parent_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id OR (NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL)) THEN
    IF NOT EXISTS (SELECT 1 FROM files WHERE id = NEW.parent_id AND is_folder AND deleted_at IS NULL AND status = 'ready') THEN
      RAISE EXCEPTION 'invalid folder' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (WITH RECURSIVE chain AS (
      SELECT id, parent_id FROM files WHERE id = NEW.parent_id
      UNION SELECT f.id, f.parent_id FROM files f JOIN chain c ON f.id = c.parent_id
    ) SELECT 1 FROM chain WHERE id = NEW.id) THEN
      RAISE EXCEPTION 'folder cycle' USING ERRCODE = '23514';
    END IF;
    WITH RECURSIVE chain AS (
      SELECT id, parent_id FROM files WHERE id = NEW.parent_id
      UNION SELECT f.id, f.parent_id FROM files f JOIN chain c ON f.id = c.parent_id
    ) SELECT COUNT(*) INTO depth FROM chain;
    WITH RECURSIVE subtree AS (
      SELECT id,0 AS level FROM files WHERE id=NEW.id
      UNION ALL SELECT f.id,s.level+1 FROM files f JOIN subtree s ON f.parent_id=s.id
    ) SELECT COALESCE(MAX(level),0) INTO subtree_depth FROM subtree;
    IF depth + subtree_depth >= 32 THEN RAISE EXCEPTION 'folder depth' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS vault_files_parent ON files;
CREATE TRIGGER vault_files_parent BEFORE INSERT OR UPDATE ON files FOR EACH ROW EXECUTE FUNCTION vault_check_parent();
