'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import {
  Crown, TrendingUp, DollarSign, Users, Briefcase, FileText,
  Lock, BarChart2, UserCheck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { MobileHeader } from '@/components/nav/MobileNav'
import { formatCurrency } from '@/lib/utils'
import { useOwnerAuth, OwnerLockScreen } from '@/contexts/OwnerAuth'
import {
  format, startOfYear, startOfMonth, endOfMonth,
  startOfWeek, subMonths, parseISO,
} from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobRow {
  id: string
  scheduled_date: string
  status: string
  customer: { price: number | null } | null
}

interface MonthJobRow {
  id: string
  crew: {
    employee_id: string
    payout_amount: number | null
    employee: { id: string; name: string } | null
  }[]
}

interface InvoiceRow {
  id: string
  status: string
  total: number
}

interface AllJobRow {
  id: string
  status: string
}

interface EmployeePayout {
  id: string
  name: string
  jobCount: number
  totalPayout: number
}

interface DashData {
  ytdRevenue: number
  monthRevenue: number
  weekRevenue: number
  activeCustomers: number
  totalJobsYTD: number
  completedJobsYTD: number
  avgRevenuePerJob: number
  employeePayouts: EmployeePayout[]
  outstandingCount: number
  outstandingAmount: number
  paidCount: number
  paidAmount: number
  trendMonths: { label: string; revenue: number }[]
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OwnerDashboardPage() {
  const { isUnlocked, lock } = useOwnerAuth()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashData | null>(null)

  useEffect(() => {
    if (isUnlocked) loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked])

  async function loadData() {
    setLoading(true)

    const now = new Date()
    const yearStart  = format(startOfYear(now), 'yyyy-MM-dd')
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
    const monthEnd   = format(endOfMonth(now), 'yyyy-MM-dd')
    const weekStart  = format(startOfWeek(now, { weekStartsOn: 0 }), 'yyyy-MM-dd')

    // For the 6-month revenue trend we need data potentially before yearStart
    const sixMonthsAgoStart = format(startOfMonth(subMonths(now, 5)), 'yyyy-MM-dd')
    // Query from the earlier of the two start dates
    const jobQueryStart = sixMonthsAgoStart < yearStart ? sixMonthsAgoStart : yearStart

    const [trendJobsRes, allYtdJobsRes, monthJobsRes, invoicesRes, customersRes] = await Promise.all([
      // Completed jobs from job query start (covers both YTD and 6-month trend)
      supabase
        .from('jobs')
        .select('id, scheduled_date, status, customer:customers(price)')
        .eq('status', 'completed')
        .gte('scheduled_date', jobQueryStart),

      // ALL jobs YTD (for completion rate — includes pending/skipped/etc.)
      supabase
        .from('jobs')
        .select('id, status')
        .gte('scheduled_date', yearStart),

      // This month's completed jobs with crew payouts
      supabase
        .from('jobs')
        .select('id, crew:job_crew(employee_id, payout_amount, employee:employees(id, name))')
        .eq('status', 'completed')
        .gte('scheduled_date', monthStart)
        .lte('scheduled_date', monthEnd),

      // All non-void invoices (for outstanding/paid stats)
      supabase
        .from('invoices')
        .select('id, status, total')
        .neq('status', 'void'),

      // Active customer count
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
    ])

    const completedJobs  = (trendJobsRes.data  ?? []) as unknown as JobRow[]
    const allYtdJobs     = (allYtdJobsRes.data ?? []) as AllJobRow[]
    const monthJobs      = (monthJobsRes.data  ?? []) as unknown as MonthJobRow[]
    const invoices       = (invoicesRes.data   ?? []) as InvoiceRow[]
    const activeCustomers = customersRes.count ?? 0

    // ── Revenue sums (using customer.price per job) ────────────────────────────
    const ytdCompleted = completedJobs.filter(j => j.scheduled_date >= yearStart)
    const ytdRevenue   = ytdCompleted.reduce((s, j) => s + (j.customer?.price ?? 0), 0)
    const monthRevenue = ytdCompleted
      .filter(j => j.scheduled_date >= monthStart)
      .reduce((s, j) => s + (j.customer?.price ?? 0), 0)
    const weekRevenue = ytdCompleted
      .filter(j => j.scheduled_date >= weekStart)
      .reduce((s, j) => s + (j.customer?.price ?? 0), 0)

    // ── Revenue trend — last 6 months ─────────────────────────────────────────
    const trendMonths = Array.from({ length: 6 }, (_, i) => {
      const d  = subMonths(now, 5 - i)
      const ms = format(startOfMonth(d), 'yyyy-MM-dd')
      const me = format(endOfMonth(d), 'yyyy-MM-dd')
      const rev = completedJobs
        .filter(j => j.scheduled_date >= ms && j.scheduled_date <= me)
        .reduce((s, j) => s + (j.customer?.price ?? 0), 0)
      return { label: format(d, 'MMM'), revenue: rev }
    })

    // ── Employee payouts this month ────────────────────────────────────────────
    const empMap: Record<string, EmployeePayout> = {}
    for (const job of monthJobs) {
      for (const crew of job.crew ?? []) {
        if (!crew.employee) continue
        const eid = crew.employee_id
        if (!empMap[eid]) {
          empMap[eid] = { id: eid, name: crew.employee.name, jobCount: 0, totalPayout: 0 }
        }
        empMap[eid].jobCount++
        empMap[eid].totalPayout += crew.payout_amount ?? 0
      }
    }
    const employeePayouts = Object.values(empMap).sort((a, b) => b.totalPayout - a.totalPayout)

    // ── Invoice stats ─────────────────────────────────────────────────────────
    const outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
    const paid        = invoices.filter(i => i.status === 'paid')

    // ── Business metrics ──────────────────────────────────────────────────────
    const completedJobsYTD = ytdCompleted.length
    const totalJobsYTD     = allYtdJobs.length
    const avgRevenuePerJob = completedJobsYTD > 0 ? ytdRevenue / completedJobsYTD : 0

    setData({
      ytdRevenue,
      monthRevenue,
      weekRevenue,
      activeCustomers,
      totalJobsYTD,
      completedJobsYTD,
      avgRevenuePerJob,
      employeePayouts,
      outstandingCount: outstanding.length,
      outstandingAmount: outstanding.reduce((s, i) => s + i.total, 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((s, i) => s + i.total, 0),
      trendMonths,
    })

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <MobileHeader title="Owner Dashboard" />

      {/* Desktop header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 lg:px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Crown size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Owner Dashboard</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {format(new Date(), 'MMMM yyyy')} · Confidential
              </p>
            </div>
          </div>
          {isUnlocked && (
            <Button variant="outline" size="sm" icon={<Lock size={14} />} onClick={lock}>
              Lock
            </Button>
          )}
        </div>
      </div>

      {/* ── Lock gate ─────────────────────────────────────────────────────────── */}
      {!isUnlocked && <OwnerLockScreen title="Owner Dashboard" />}

      {/* ── Loading skeleton ──────────────────────────────────────────────────── */}
      {isUnlocked && loading && (
        <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 animate-pulse" />
            ))}
          </div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-44 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Dashboard content ─────────────────────────────────────────────────── */}
      {isUnlocked && !loading && data && (
        <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">

          {/* ── Revenue stat cards ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

            {/* YTD Revenue */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">YTD Revenue</p>
                  <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {formatCurrency(data.ytdRevenue)}
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{format(new Date(), 'yyyy')} total</p>
                </div>
                <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 flex-shrink-0 ml-2">
                  <TrendingUp size={16} className="text-green-600 dark:text-green-400" />
                </div>
              </div>
            </div>

            {/* Month Revenue */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">This Month</p>
                  <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {formatCurrency(data.monthRevenue)}
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{format(new Date(), 'MMMM')}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex-shrink-0 ml-2">
                  <DollarSign size={16} className="text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </div>

            {/* Week Revenue */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">This Week</p>
                  <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {formatCurrency(data.weekRevenue)}
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Week to date</p>
                </div>
                <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex-shrink-0 ml-2">
                  <BarChart2 size={16} className="text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </div>

            {/* Active Customers */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Active Clients</p>
                  <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white">{data.activeCustomers}</p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">On recurring service</p>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex-shrink-0 ml-2">
                  <Users size={16} className="text-amber-600 dark:text-amber-400" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Revenue trend + Invoice summary ───────────────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-4">

            {/* Revenue trend bar chart */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <div className="flex items-center gap-2 mb-5">
                <BarChart2 size={15} className="text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Revenue Trend</h2>
                <span className="text-xs text-gray-400 dark:text-gray-500">last 6 months</span>
              </div>
              {(() => {
                const max = Math.max(...data.trendMonths.map(m => m.revenue), 1)
                return (
                  <div className="flex items-end gap-2" style={{ height: '100px' }}>
                    {data.trendMonths.map((m, i) => {
                      const pct = (m.revenue / max) * 100
                      const isCurrent = i === 5
                      return (
                        <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
                          <div className="w-full flex items-end" style={{ height: '80px' }}>
                            <div
                              className={`w-full rounded-t-md ${
                                isCurrent
                                  ? 'bg-green-500 dark:bg-green-400'
                                  : 'bg-gray-200 dark:bg-gray-700'
                              }`}
                              style={{ height: `${Math.max(pct, 3)}%` }}
                              title={formatCurrency(m.revenue)}
                            />
                          </div>
                          <span className={`text-[10px] font-medium ${
                            isCurrent ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'
                          }`}>{m.label}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">6-month avg</span>
                <span className="text-xs font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(data.trendMonths.reduce((s, m) => s + m.revenue, 0) / 6)}
                </span>
              </div>
            </div>

            {/* Invoice summary */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={15} className="text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Invoice Summary</h2>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between py-3.5 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Outstanding</span>
                    <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded-full font-medium">
                      {data.outstandingCount}
                    </span>
                  </div>
                  <span className="text-base font-bold text-yellow-600 dark:text-yellow-400">
                    {formatCurrency(data.outstandingAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Collected</span>
                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full font-medium">
                      {data.paidCount}
                    </span>
                  </div>
                  <span className="text-base font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(data.paidAmount)}
                  </span>
                </div>
              </div>
              <div className="mt-1 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">Collection rate</span>
                <span className="text-xs font-semibold text-gray-900 dark:text-white">
                  {data.paidAmount + data.outstandingAmount > 0
                    ? Math.round((data.paidAmount / (data.paidAmount + data.outstandingAmount)) * 100)
                    : 0}%
                </span>
              </div>
            </div>
          </div>

          {/* ── Employee payouts this month ───────────────────────────────────── */}
          {data.employeePayouts.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <UserCheck size={15} className="text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Employee Payouts</h2>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-0.5">
                  — {format(new Date(), 'MMMM')}
                </span>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {data.employeePayouts.map((emp) => (
                  <div key={emp.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                      <span className="text-green-700 dark:text-green-400 text-xs font-bold">
                        {emp.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{emp.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {emp.jobCount} job{emp.jobCount !== 1 ? 's' : ''} completed
                      </p>
                    </div>
                    <p className="text-base font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(emp.totalPayout)}
                    </p>
                  </div>
                ))}
                {/* Total row */}
                <div className="flex items-center gap-4 px-5 py-3.5 bg-gray-50 dark:bg-gray-800/40 rounded-b-xl">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Total Payroll</p>
                  </div>
                  <p className="text-base font-bold text-gray-900 dark:text-white">
                    {formatCurrency(data.employeePayouts.reduce((s, e) => s + e.totalPayout, 0))}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Business metrics ──────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase size={15} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Business Metrics</h2>
              <span className="text-xs text-gray-400 dark:text-gray-500">year to date</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.completedJobsYTD}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Jobs Completed</p>
              </div>
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(data.avgRevenuePerJob)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Avg per Job</p>
              </div>
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {data.totalJobsYTD > 0
                    ? Math.round((data.completedJobsYTD / data.totalJobsYTD) * 100)
                    : 0}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Completion Rate</p>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
