DROP TABLE IF EXISTS rooms_kv;
CREATE TABLE rooms_kv (
  key TEXT PRIMARY KEY,
  data TEXT,
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_expires_at ON rooms_kv(expires_at);
