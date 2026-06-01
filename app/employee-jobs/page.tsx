'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import {
  Users, Calendar, DollarSign, CheckCircle2, Filter,
  ChevronDown, MapPin, Clock, FileText, TrendingUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MobileHeader } from '@/components/nav/MobileNav'
import { formatCurrency } from '@/lib/utils'
import { format, parseISO, subDays, startOfDay } from 'date-fns'
import type { Employee } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CrewEntry {
  id: string
  job_id: string
  employee_id: string
  payout_amount: number | null
  created_at: string
  employee: {
    id: string
    name: string
    default_payout: number | null
  } | null
  job: {
    id: string
    scheduled_date: string
    completed_at: string | null
    status: string
    payout_amount: number | null
    notes: string | null
    employee_notes: string | null
    customer: {
      id: string
      name: string
      address: string | null
      city: string | null
      price: number | null
    } | null
  } | null
}

type PeriodFilter = '7d' | '30d' | '90d' | 'all'
type StatusFilter = 'completed' | 'all'

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

function avatarColor(name: string): string {
  const colors = [
    'bg-green-500',   'bg-blue-500',  'bg-purple-500',
    'bg-orange-500',  'bg-pink-500',  'bg-teal-500',
    'bg-indigo-500',
  ]
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return colors[Math.abs(hash) % colors.length]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'text-green-600 dark:text-green-400',
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-start gap-3">
      <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 flex-shrink-0">
        <Icon size={16} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
        <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function JobCard({
  entry,
  coworkers,
  showEmployee,
}: {
  entry: CrewEntry
  coworkers: Array<{ id: string; name: string }>
  showEmployee: boolean
}) {
  const job = entry.job
  const customer = job?.customer
  if (!job || !customer) return null

  const isCompleted = job.status === 'completed'
  const dateLabel = job.completed_at
    ? format(new Date(job.completed_at), 'MMM d, h:mm a')
    : format(parseISO(job.scheduled_date), 'MMM d, yyyy')

  const hasNotes = job.employee_notes || job.notes

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      {/* Top row: customer + status dot */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isCompleted ? 'bg-green-500' : 'bg-yellow-400'
              }`}
            />
            <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
              {customer.name}
            </p>
          </div>
          {customer.address && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1 ml-4">
              <MapPin size={10} />
              {customer.address}{customer.city ? `, ${customer.city}` : ''}
            </p>
          )}
        </div>

        {/* Payout badge */}
        {entry.payout_amount != null && (
          <span className="flex-shrink-0 text-sm font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2.5 py-1 rounded-lg">
            {formatCurrency(entry.payout_amount)}
          </span>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400">
        {/* Date */}
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {dateLabel}
        </span>

        {/* Job price */}
        {customer.price != null && (
          <span className="flex items-center gap-1">
            <DollarSign size={11} />
            ${customer.price} job price
          </span>
        )}

        {/* Employee (when in "all employees" view) */}
        {showEmployee && entry.employee && (
          <span
            className={`flex items-center gap-1 font-medium px-2 py-0.5 rounded-full text-white text-[10px] ${avatarColor(entry.employee.name)}`}
          >
            {entry.employee.name}
          </span>
        )}
      </div>

      {/* Coworkers */}
      {coworkers.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 dark:text-gray-500">With:</span>
          {coworkers.map((cw) => (
            <span
              key={cw.id}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full"
            >
              <span
                className={`w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${avatarColor(cw.name)}`}
              >
                {initials(cw.name)[0]}
              </span>
              {cw.name}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {hasNotes && (
        <div className="flex items-start gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
          <FileText size={12} className="text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {job.employee_notes || job.notes}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Employee section (grouped view) ──────────────────────────────────────────

function EmployeeSection({
  employee,
  entries,
  crewByJob,
}: {
  employee: Employee
  entries: CrewEntry[]
  crewByJob: Map<string, Array<{ id: string; name: string }>>
}) {
  const [expanded, setExpanded] = useState(true)

  const totalPayout = entries.reduce((s, e) => s + (e.payout_amount ?? 0), 0)
  const completedCount = entries.filter((e) => e.job?.status === 'completed').length

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Employee header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-left"
      >
        {/* Avatar */}
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${avatarColor(employee.name)}`}
        >
          {initials(employee.name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white text-sm">{employee.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {completedCount} job{completedCount !== 1 ? 's' : ''} ·{' '}
            <span className="text-green-600 dark:text-green-400 font-semibold">
              {formatCurrency(totalPayout)}
            </span>
          </p>
        </div>

        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Job list */}
      {expanded && entries.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800/80 px-4 pb-4 pt-1 space-y-3">
          {entries.map((entry) => {
            const allCrew = crewByJob.get(entry.job_id) ?? []
            const coworkers = allCrew.filter((c) => c.id !== entry.employee_id)
            return (
              <div key={entry.id} className="pt-3 first:pt-3">
                <JobCard entry={entry} coworkers={coworkers} showEmployee={false} />
              </div>
            )
          })}
        </div>
      )}

      {expanded && entries.length === 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-6 text-center">
          <p className="text-sm text-gray-400">No jobs in this period</p>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EmployeeJobsPage() {
  const supabase = createClient()

  const [allEntries, setAllEntries] = useState<CrewEntry[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const [filterEmployee, setFilterEmployee] = useState<string>('all')
  const [filterPeriod, setFilterPeriod] = useState<PeriodFilter>('30d')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('completed')

  // ── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => { loadData() }, [filterPeriod, filterEmployee])

  async function loadData() {
    setLoading(true)

    // Build date boundary
    let since: Date | null = null
    if (filterPeriod !== 'all') {
      const days = filterPeriod === '7d' ? 7 : filterPeriod === '30d' ? 30 : 90
      since = startOfDay(subDays(new Date(), days))
    }

    let query = supabase
      .from('job_crew')
      .select(`
        id,
        job_id,
        employee_id,
        payout_amount,
        created_at,
        employee:employees(id, name, default_payout),
        job:jobs(
          id,
          scheduled_date,
          completed_at,
          status,
          payout_amount,
          notes,
          employee_notes,
          customer:customers(id, name, address, city, price)
        )
      `)
      .order('created_at', { ascending: false })

    if (since) {
      query = query.gte('created_at', since.toISOString())
    }

    if (filterEmployee !== 'all') {
      query = query.eq('employee_id', filterEmployee)
    }

    const [entriesRes, empRes] = await Promise.all([
      query,
      supabase.from('employees').select('*').eq('is_active', true).order('name'),
    ])

    setAllEntries((entriesRes.data ?? []) as unknown as CrewEntry[])
    setEmployees((empRes.data ?? []) as unknown as Employee[])
    setLoading(false)
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const filteredEntries = useMemo(() => {
    if (filterStatus === 'all') return allEntries
    return allEntries.filter((e) => e.job?.status === filterStatus)
  }, [allEntries, filterStatus])

  // Map: job_id → all crew members on that job (from visible entries)
  const crewByJob = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string }>>()
    // Use ALL entries (not just filtered) so coworkers are always visible
    for (const e of allEntries) {
      if (!e.employee) continue
      const arr = map.get(e.job_id) ?? []
      if (!arr.find((x) => x.id === e.employee_id)) {
        arr.push({ id: e.employee_id, name: e.employee.name })
      }
      map.set(e.job_id, arr)
    }
    return map
  }, [allEntries])

  // Summary stats
  const stats = useMemo(() => {
    const completedEntries = filteredEntries.filter((e) => e.job?.status === 'completed')
    const totalPayout = completedEntries.reduce((s, e) => s + (e.payout_amount ?? 0), 0)
    // Unique jobs (a job with 2 crew members should count as 1 job)
    const uniqueJobs = new Set(completedEntries.map((e) => e.job_id)).size
    return { completedEntries: completedEntries.length, uniqueJobs, totalPayout }
  }, [filteredEntries])

  // Grouped by employee (for the "all employees" view)
  const groupedByEmployee = useMemo(() => {
    if (filterEmployee !== 'all') return null
    const map = new Map<string, CrewEntry[]>()
    for (const e of filteredEntries) {
      if (!e.employee_id) continue
      const arr = map.get(e.employee_id) ?? []
      arr.push(e)
      map.set(e.employee_id, arr)
    }
    // Sort employees by total payout desc
    return Array.from(map.entries())
      .sort(([, a], [, b]) => {
        const pa = a.reduce((s, e) => s + (e.payout_amount ?? 0), 0)
        const pb = b.reduce((s, e) => s + (e.payout_amount ?? 0), 0)
        return pb - pa
      })
  }, [filteredEntries, filterEmployee])

  // Per-employee stats for the "single employee" filtered view
  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === filterEmployee) ?? null,
    [employees, filterEmployee]
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <MobileHeader title="Employee Jobs" />

      {/* Page header */}
      <div className="hidden lg:block bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-50 dark:bg-green-900/30 rounded-xl">
            <Users size={20} className="text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Employee Jobs</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Track completed work and payouts per crew member
            </p>
          </div>
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-3">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <Filter size={14} className="text-gray-400 flex-shrink-0" />

          {/* Employee filter */}
          <select
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value)}
            className="text-sm bg-gray-100 dark:bg-gray-800 border-0 rounded-lg px-3 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 flex-shrink-0 cursor-pointer"
          >
            <option value="all">All employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>

          {/* Period pills */}
          <div className="flex gap-1 flex-shrink-0">
            {(['7d', '30d', '90d', 'all'] as PeriodFilter[]).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPeriod(p)}
                className={[
                  'text-xs font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap',
                  filterPeriod === p
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
                ].join(' ')}
              >
                {p === 'all' ? 'All time' : `Last ${p}`}
              </button>
            ))}
          </div>

          {/* Status pills */}
          <div className="flex gap-1 flex-shrink-0 ml-auto">
            {(['completed', 'all'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={[
                  'text-xs font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap',
                  filterStatus === s
                    ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
                ].join(' ')}
              >
                {s === 'all' ? 'All statuses' : 'Completed'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-5">

        {/* ── Summary stats ─────────────────────────────────────────────── */}
        {!loading && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard
              icon={CheckCircle2}
              label="Jobs Completed"
              value={stats.uniqueJobs}
              sub={filterPeriod === 'all' ? 'all time' : `last ${filterPeriod}`}
            />
            <StatCard
              icon={DollarSign}
              label="Total Payout"
              value={formatCurrency(stats.totalPayout)}
              sub={`${stats.completedEntries} crew assignment${stats.completedEntries !== 1 ? 's' : ''}`}
            />
            {selectedEmployee ? (
              <StatCard
                icon={TrendingUp}
                label="Avg per Job"
                value={
                  stats.uniqueJobs > 0
                    ? formatCurrency(stats.totalPayout / stats.uniqueJobs)
                    : '$—'
                }
                sub="for this employee"
                color="text-blue-600 dark:text-blue-400"
              />
            ) : (
              <StatCard
                icon={Users}
                label="Crew Members"
                value={new Set(filteredEntries.map((e) => e.employee_id)).size}
                sub="worked in this period"
                color="text-purple-600 dark:text-purple-400"
              />
            )}
          </div>
        )}

        {/* ── Loading skeleton ──────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 animate-pulse space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/4" />
                  </div>
                </div>
                <div className="h-px bg-gray-100 dark:bg-gray-800" />
                {[1, 2].map((j) => (
                  <div key={j} className="h-16 bg-gray-50 dark:bg-gray-800 rounded-lg" />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {!loading && filteredEntries.length === 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
            <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Calendar size={24} className="text-gray-400" />
            </div>
            <p className="text-gray-900 dark:text-white font-semibold mb-1">No jobs found</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filterStatus === 'completed'
                ? 'No completed jobs in this period. Complete a job to see it here.'
                : 'No jobs found for these filters.'}
            </p>
          </div>
        )}

        {/* ── Grouped by employee (default view) ───────────────────────── */}
        {!loading && groupedByEmployee && groupedByEmployee.length > 0 && (
          <div className="space-y-4">
            {groupedByEmployee.map(([employeeId, entries]) => {
              const emp = employees.find((e) => e.id === employeeId)
              if (!emp) return null
              return (
                <EmployeeSection
                  key={employeeId}
                  employee={emp}
                  entries={entries}
                  crewByJob={crewByJob}
                />
              )
            })}
          </div>
        )}

        {/* ── Single employee flat list ────────────────────────────────── */}
        {!loading && filterEmployee !== 'all' && filteredEntries.length > 0 && (
          <div className="space-y-3">
            {/* Employee banner */}
            {selectedEmployee && (
              <div className="flex items-center gap-3 px-1">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white ${avatarColor(selectedEmployee.name)}`}
                >
                  {initials(selectedEmployee.name)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{selectedEmployee.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {stats.uniqueJobs} job{stats.uniqueJobs !== 1 ? 's' : ''} ·{' '}
                    <span className="text-green-600 dark:text-green-400 font-semibold">
                      {formatCurrency(stats.totalPayout)} earned
                    </span>
                  </p>
                </div>
              </div>
            )}

            {filteredEntries.map((entry) => {
              const allCrew = crewByJob.get(entry.job_id) ?? []
              const coworkers = allCrew.filter((c) => c.id !== entry.employee_id)
              return <JobCard key={entry.id} entry={entry} coworkers={coworkers} showEmployee={false} />
            })}
          </div>
        )}
      </div>
    </div>
  )
}
