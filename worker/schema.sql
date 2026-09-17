CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_email_created ON leads(email_hash, created);
CREATE INDEX IF NOT EXISTS leads_ip_created ON leads(ip_hash, created);
CREATE TABLE IF NOT EXISTS mail_jobs (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  provider_id TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS mail_jobs_due ON mail_jobs(status, next_attempt);
