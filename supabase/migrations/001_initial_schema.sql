-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  email TEXT,
  service_notes TEXT,
  gate_code TEXT,
  price DECIMAL(10,2),
  service_frequency TEXT DEFAULT 'biweekly' CHECK (service_frequency IN ('weekly', 'biweekly', 'custom', 'one-time')),
  is_active BOOLEAN DEFAULT true,
  general_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EMPLOYEES
-- ============================================================
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  default_payout DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RECURRING SCHEDULES
-- ============================================================
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  frequency TEXT DEFAULT 'biweekly' CHECK (frequency IN ('weekly', 'biweekly', 'custom')),
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  assigned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  route_order INTEGER,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- JOBS (individual job instances)
-- ============================================================
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  assigned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped', 'cancelled', 'rescheduled')),
  completed_at TIMESTAMPTZ,
  completed_by_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  payout_amount DECIMAL(10,2),
  notes TEXT,
  employee_notes TEXT,
  skip_reason TEXT,
  photo_urls TEXT[] DEFAULT '{}',
  is_weather_delayed BOOLEAN DEFAULT false,
  original_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'void')),
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVOICE LINE ITEMS
-- ============================================================
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  service_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVOICE SEQUENCE (for auto-numbering)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1001;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_jobs_scheduled_date ON jobs(scheduled_date);
CREATE INDEX idx_jobs_customer_id ON jobs(customer_id);
CREATE INDEX idx_jobs_assigned_employee_id ON jobs(assigned_employee_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_schedules_customer_id ON schedules(customer_id);
CREATE INDEX idx_customers_is_active ON customers(is_active);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SEED DATA (sample data for development)
-- ============================================================
INSERT INTO employees (name, phone, email, default_payout, is_active) VALUES
  ('Carlos Rivera', '555-0101', 'carlos@example.com', 35.00, true),
  ('Marcus Johnson', '555-0102', 'marcus@example.com', 35.00, true),
  ('Tyler Smith', '555-0103', 'tyler@example.com', 30.00, true);

INSERT INTO customers (name, address, city, state, zip, phone, email, price, service_frequency, is_active, service_notes, gate_code) VALUES
  ('John Anderson', '123 Oak Street', 'Springfield', 'TX', '75001', '555-1001', 'john.anderson@email.com', 55.00, 'biweekly', true, 'Large backyard, be careful near flower beds', '4821'),
  ('Sarah Mitchell', '456 Maple Ave', 'Springfield', 'TX', '75001', '555-1002', 'sarah.m@email.com', 45.00, 'weekly', true, 'Has a dog, make sure gate is closed', NULL),
  ('Bob Chen', '789 Pine Road', 'Springfield', 'TX', '75002', '555-1003', 'bobchen@email.com', 65.00, 'biweekly', true, 'Large corner lot, edging along fence required', '1234'),
  ('Linda Garcia', '321 Elm Drive', 'Springfield', 'TX', '75001', '555-1004', 'lgarcia@email.com', 50.00, 'weekly', true, NULL, NULL),
  ('Tom Williams', '654 Cedar Lane', 'Springfield', 'TX', '75003', '555-1005', 'twilliams@email.com', 40.00, 'biweekly', true, 'Trim around mailbox carefully', NULL),
  ('Nancy Brown', '987 Birch Court', 'Springfield', 'TX', '75002', '555-1006', 'nbrown@email.com', 70.00, 'biweekly', true, 'Pool area needs extra attention', '9988'),
  ('James Davis', '147 Spruce Way', 'Springfield', 'TX', '75001', '555-1007', 'jdavis@email.com', 45.00, 'weekly', true, NULL, NULL),
  ('Patricia Wilson', '258 Walnut Blvd', 'Springfield', 'TX', '75003', '555-1008', 'pwilson@email.com', 55.00, 'biweekly', true, 'Prefer early morning service', '5566'),
  ('Michael Taylor', '369 Hickory St', 'Springfield', 'TX', '75002', '555-1009', 'mtaylor@email.com', 60.00, 'weekly', true, NULL, NULL),
  ('Sandra Martinez', '741 Pecan Ave', 'Springfield', 'TX', '75001', '555-1010', 'smartinez@email.com', 48.00, 'biweekly', true, NULL, NULL);
