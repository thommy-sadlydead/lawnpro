-- ============================================================
-- Migration 003: Payroll fields
-- ============================================================

-- 1. Per-property employee pay rate on the customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS employee_pay_per_mow DECIMAL(10, 2);

-- 2. Owner flag on employees — the business owner (Christian) is treated
--    differently in every payroll rule, so we mark them explicitly.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;

-- 3. Mark Christian Brower as the business owner
UPDATE employees
SET is_owner = true
WHERE name = 'Christian Brower';
