-- ============================================================
-- Migration 002: Job Crew (multi-employee job completion)
-- ============================================================

-- ── 1. Replace seed employees with real team ─────────────────
-- Soft-delete the placeholder seed employees
UPDATE employees
SET is_active = false
WHERE name IN ('Carlos Rivera', 'Marcus Johnson', 'Tyler Smith');

-- Insert the real team
INSERT INTO employees (name, phone, email, is_active, default_payout, notes)
VALUES
  ('Christian Brower',  NULL, NULL, true, 35.00, NULL),
  ('Reece Broderick',   NULL, NULL, true, 35.00, NULL),
  ('John Mark Brower',  NULL, NULL, true, 35.00, NULL),
  ('Caleb Chinlund',    NULL, NULL, true, 35.00, NULL),
  ('Lydia Brower',      NULL, NULL, true, 30.00, NULL),
  ('Juliana Brower',    NULL, NULL, true, 30.00, NULL),
  ('Big Nick',          NULL, NULL, true, 40.00, NULL);

-- ── 2. Create job_crew junction table ────────────────────────
-- Records which employees worked each job, with per-person payout.
-- A job can have one or many crew members.
-- The jobs.completed_by_id column still tracks the "primary" employee
-- for backward compatibility with existing queries.
CREATE TABLE IF NOT EXISTS job_crew (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id         UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employee_id    UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payout_amount  DECIMAL(10,2),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, employee_id)
);

-- Indexes for the common query patterns
CREATE INDEX IF NOT EXISTS idx_job_crew_job_id      ON job_crew(job_id);
CREATE INDEX IF NOT EXISTS idx_job_crew_employee_id ON job_crew(employee_id);
CREATE INDEX IF NOT EXISTS idx_job_crew_created_at  ON job_crew(created_at DESC);
