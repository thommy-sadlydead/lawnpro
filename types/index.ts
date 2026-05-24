export type ServiceFrequency = 'weekly' | 'biweekly' | 'custom' | 'one-time'
export type JobStatus = 'pending' | 'completed' | 'skipped' | 'cancelled' | 'rescheduled'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void'

export interface Customer {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  phone: string | null
  email: string | null
  service_notes: string | null
  gate_code: string | null
  price: number | null
  service_frequency: ServiceFrequency
  is_active: boolean
  general_notes: string | null
  created_at: string
  updated_at: string
}

export interface Employee {
  id: string
  name: string
  phone: string | null
  email: string | null
  is_active: boolean
  default_payout: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Schedule {
  id: string
  customer_id: string
  frequency: 'weekly' | 'biweekly' | 'custom'
  day_of_week: number | null
  assigned_employee_id: string | null
  route_order: number | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  customer?: Customer
  employee?: Employee
}

export interface Job {
  id: string
  customer_id: string
  schedule_id: string | null
  assigned_employee_id: string | null
  scheduled_date: string
  status: JobStatus
  completed_at: string | null
  completed_by_id: string | null
  payout_amount: number | null
  notes: string | null
  employee_notes: string | null
  skip_reason: string | null
  photo_urls: string[]
  is_weather_delayed: boolean
  original_date: string | null
  created_at: string
  updated_at: string
  customer?: Customer
  employee?: Employee
  completed_by?: Employee
}

export interface Invoice {
  id: string
  customer_id: string
  invoice_number: string
  status: InvoiceStatus
  subtotal: number
  tax: number
  total: number
  due_date: string | null
  paid_at: string | null
  sent_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  customer?: Customer
  items?: InvoiceItem[]
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  job_id: string | null
  description: string
  quantity: number
  unit_price: number
  total: number
  service_date: string | null
  created_at: string
  job?: Job
}

export interface DashboardStats {
  jobsToday: number
  jobsCompletedToday: number
  jobsPendingToday: number
  unpaidInvoicesCount: number
  unpaidInvoicesTotal: number
  activeCustomers: number
  weeklyRevenue: number
  monthlyRevenue: number
}
