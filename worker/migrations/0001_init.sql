-- Strength Ledger sync database (applied to D1 "strength-ledger" on 27 Oct 2026).
CREATE TABLE IF NOT EXISTS records (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  tbl TEXT NOT NULL,
  id TEXT NOT NULL,
  hlc TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  written_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (tbl, id)
);
CREATE TABLE IF NOT EXISTS history (
  tbl TEXT NOT NULL,
  id TEXT NOT NULL,
  hlc TEXT NOT NULL,
  data TEXT NOT NULL,
  replaced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS history_replaced ON history (replaced_at);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
