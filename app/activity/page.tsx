'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, SkipForward, CloudRain, XCircle, Calendar,
  DollarSign, MessageSquare, ChevronDown, Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MobileHeader } from '@/components/nav/MobileNav'
import { formatCurrency } from '@/lib/utils'
import { format, isToday, isYesterday, parseISO, subDays } from 'date-fns'
import type { Job, Employee } from '@/types'
import { useOwnerAuth, LockedValue } from '@/contexts/OwnerAuth'

type FilterPeriod = '7d' | '30d' | '90d' | 'all'
type FilterStatus = 'all' | 'completed' | 'skipped' | 'cancelled'
type FilterEmployee = string // employee id or 'all'

type CrewEntry = {
  id: string
  employee_id: string
  payout_amount: number | null
  employee?: { id: string; name: string }
}

// Lightweight join shape returned by Supabase select
type ActivityJob = Omit<Job, 'customer' | 'employee' | 'completed_by' | 'crew'> & {
  customer?: { id: string; name: string; address?: string }
  employee?: { id: string; name: string }
  completed_by?: { id: string; name: string }
  crew?: CrewEntry[]
}

// Group jobs by date label
function groupByDate(jobs: ActivityJob[]): { label: string; date: string; jobs: ActivityJob[] }[] {
  const groups: Record<string, ActivityJob[]> = {}
  for (const job of jobs) {
    const d = job.completed_at ? job.completed_at.split('T')[0] : job.scheduled_date
    if (!groups[d]) groups[d] = []
    groups[d].push(job)
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, jobs]) => {
      const parsed = parseISO(date)
      const label = isToday(parsed)
        ? 'Today'
        : isYesterday(parsed)
        ? 'Yesterday'
        : format(parsed, 'EEEE, MMMM d')
      return { label, date, jobs }
    })
}

const STATUS_CONFIG = {
  completed: {
    icon: CheckCircle2,
    iconClass: 'text-green-500',
    bgClass: 'bg-green-50 dark:bg-green-900/20',
    borderClass: 'border-green-200 dark:border-green-800',
    label: 'Completed',
  },
  skipped: {
    icon: SkipForward,
    iconClass: 'text-gray-400',
    bgClass: 'bg-gray-50 dark:bg-gray-800/60',
    borderClass: 'border-gray-200 dark:border-gray-700',
    label: 'Skipped',
  },
  cancelled: {
    icon: XCircle,
    iconClass: 'text-red-400',
    bgClass: 'bg-red-50 dark:bg-red-900/10',
    borderClass: 'border-red-200 dark:border-red-900',
    label: 'Cancelled',
  },
  rescheduled: {
    icon: CloudRain,
    iconClass: 'text-blue-400',
    bgClass: 'bg-blue-50 dark:bg-blue-900/10',
    borderClass: 'border-blue-200 dark:border-blue-900',
    label: 'Rescheduled',
  },
  pending: {
    icon: Calendar,
    iconClass: 'text-yellow-500',
    bgClass: 'bg-yellow-50 dark:bg-yellow-900/10',
    borderClass: 'border-yellow-200 dark:border-yellow-900',
    label: 'Pending',
  },
}

function CrewAvatars({ crew, limit = 4 }: { crew: CrewEntry[]; limit?: number }) {
  const shown = crew.slice(0, limit)
  const extra = crew.length - limit
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {shown.map((member) => {
        const name = member.employee?.name ?? '?'
        const initials = name.split(' ').map((n) => n[0]).slice(0, 2).join('')
        return (
          <div key={member.id} className="flex items-center gap-1">
            <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
              <span className="text-green-700 dark:text-green-400 text-[9px] font-bold">{initials}</span>
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{name.split(' ')[0]}</span>
            {member.payout_amount != null && (
              <LockedValue className="text-xs">
                <span className="text-xs text-green-600 dark:text-green-400 font-semibold">
                  {formatCurrency(member.payout_amount)}
                </span>
              </LockedValue>
            )}
          </div>
        )
      })}
      {extra > 0 && (
        <span className="text-xs text-gray-400 dark:text-gray-500">+{extra} more</span>
      )}
    </div>
  )
}

export default function ActivityPage() {
  const supabase = createClient()
  const { isUnlocked } = useOwnerAuth()
  const [jobs, setJobs] = useState<ActivityJob[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<FilterPeriod>('7d')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [employeeFilter, setEmployeeFilter] = useState<FilterEmployee>('all')

  useEffect(() => {
    loadData()
  }, [period])

  async function loadData() {
    setLoading(true)
    const cutoffs: Record<FilterPeriod, string | null> = {
      '7d': format(subDays(new Date(), 7), 'yyyy-MM-dd'),
      '30d': format(subDays(new Date(), 30), 'yyyy-MM-dd'),
      '90d': format(subDays(new Date(), 90), 'yyyy-MM-dd'),
      'all': null,
    }
    const cutoff = cutoffs[period]

    let query = supabase
      .from('jobs')
      .select(`
        *,
        customer:customers(id, name, address),
        employee:employees!assigned_employee_id(id, name),
        completed_by:employees!completed_by_id(id, name),
        crew:job_crew(id, employee_id, payout_amount, employee:employees(id, name))
      `)
      .not('status', 'eq', 'pending')
      .order('scheduled_date', { ascending: false })
      .order('completed_at', { ascending: false })
      .limit(200)

    if (cutoff) query = query.gte('scheduled_date', cutoff)

    const [jobsRes, empRes] = await Promise.all([
      query,
      supabase.from('employees').select('id, name, is_active, is_owner, default_payout, phone, email, notes, created_at, updated_at').eq('is_active', true).order('name'),
    ])

    setJobs((jobsRes.data ?? []) as unknown as ActivityJob[])
    setEmployees((empRes.data ?? []) as Employee[])
    setLoading(false)
  }

  // Client-side filtering
  const filtered = jobs.filter((job) => {
    if (statusFilter !== 'all' && job.status !== statusFilter) return false
    if (employeeFilter !== 'all') {
      // Check if the employee is in the crew
      const inCrew = (job.crew ?? []).some((c) => c.employee_id === employeeFilter)
      // Fall back to assigned/completed_by for jobs without crew data
      const isAssigned =
        job.completed_by_id === employeeFilter ||
        job.assigned_employee_id === employeeFilter
      if (!inCrew && !isAssigned) return false
    }
    return true
  })

  const groups = groupByDate(filtered)

  // Summary stats
  const completedJobs = filtered.filter((j) => j.status === 'completed')
  const totalPayout = completedJobs.reduce((s, j) => s + (j.payout_amount ?? 0), 0)
  const skippedCount = filtered.filter((j) => j.status === 'skipped' || j.status === 'cancelled').length

  // Per-employee breakdown using crew data
  const empBreakdown = employees.map((emp) => {
    const crewEntries = completedJobs.flatMap((j) =>
      (j.crew ?? []).filter((c) => c.employee_id === emp.id)
    )
    // Fall back to assigned/completed_by for jobs without crew records
    const fallbackJobs =
      crewEntries.length === 0
        ? completedJobs.filter(
            (j) =>
              (j.crew ?? []).length === 0 &&
              (j.completed_by_id === emp.id || j.assigned_employee_id === emp.id)
          )
        : []

    const count =
      completedJobs.filter(
        (j) =>
          (j.crew ?? []).some((c) => c.employee_id === emp.id) ||
          ((j.crew ?? []).length === 0 &&
            (j.completed_by_id === emp.id || j.assigned_employee_id === emp.id))
      ).length

    const payout =
      crewEntries.reduce((s, c) => s + (c.payout_amount ?? 0), 0) +
      fallbackJobs.reduce((s, j) => s + (j.payout_amount ?? 0), 0)

    return { ...emp, count, payout }
  }).filter((e) => e.count > 0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <MobileHeader title="Activity" />

      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 lg:px-6 py-4">
          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity Log</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Every job event, in order</p>
          </div>
          {/* Period tabs */}
          <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {(['7d', '30d', '90d', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${
                  period === p
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {p === '7d' ? '7 days' : p === '30d' ? '30 days' : p === '90d' ? '90 days' : 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Employee + Status filter row */}
        <div className="flex items-center gap-2 px-4 lg:px-6 pb-3 overflow-x-auto">
          {/* Employee filter */}
          <div className="relative flex-shrink-0">
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="pl-3 pr-7 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 appearance-none cursor-pointer"
            >
              <option value="all">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Status pills */}
          <div className="flex gap-1.5">
            {(['all', 'completed', 'skipped', 'cancelled'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors capitalize ${
                  statusFilter === s
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary strip */}
      {!loading && filtered.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-3">
          <div className="flex items-center gap-6 overflow-x-auto">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <CheckCircle2 size={14} className="text-green-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{completedJobs.length}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">completed</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <DollarSign size={14} className="text-green-600" />
              <LockedValue>
                <span className="text-sm font-semibold text-green-600 dark:text-green-400">{formatCurrency(totalPayout)}</span>
              </LockedValue>
              <span className="text-xs text-gray-500 dark:text-gray-400">paid out</span>
            </div>
            {skippedCount > 0 && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <SkipForward size={14} className="text-gray-400" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{skippedCount}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">skipped/cancelled</span>
              </div>
            )}

            {/* Per-employee chips */}
            {empBreakdown.length > 0 && (
              <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                {empBreakdown.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => setEmployeeFilter(employeeFilter === emp.id ? 'all' : emp.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      employeeFilter === emp.id
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-current opacity-20 flex-shrink-0" />
                    {emp.name.split(' ')[0]}
                    <span className="font-bold">{emp.count}</span>
                    {isUnlocked && <span className="opacity-70">{formatCurrency(emp.payout)}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="p-4 lg:p-6 max-w-3xl mx-auto">
        {loading ? (
          <div className="space-y-6">
            {[...Array(3)].map((_, g) => (
              <div key={g}>
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded mb-3 animate-pulse" />
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-20 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <Calendar className="h-8 w-8 text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 font-medium">No activity found</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Try changing the filters or time period
            </p>
          </div>
        ) : (
          <div className="space-y-7">
            {groups.map(({ label, date, jobs: dayJobs }) => (
              <div key={date}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest whitespace-nowrap">
                    {label}
                  </p>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                  <p className="text-xs text-gray-400 dark:text-gray-600 whitespace-nowrap">
                    {dayJobs.filter((j) => j.status === 'completed').length} done
                    {isUnlocked && dayJobs.filter((j) => j.status === 'completed').length > 0 && (
                      <span className="text-green-600 dark:text-green-500 font-semibold ml-1">
                        · {formatCurrency(dayJobs.filter((j) => j.status === 'completed').reduce((s, j) => s + (j.payout_amount ?? 0), 0))}
                      </span>
                    )}
                  </p>
                </div>

                {/* Cards for this day */}
                <div className="space-y-2">
                  {dayJobs.map((job) => {
                    const cfg = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending
                    const Icon = cfg.icon
                    const timeStr = job.completed_at
                      ? format(parseISO(job.completed_at), 'h:mm a')
                      : null
                    const crew = job.crew ?? []
                    // Fallback to single doer for jobs before crew tracking
                    const fallbackDoer = job.completed_by ?? job.employee

                    return (
                      <Link
                        key={job.id}
                        href={`/jobs/${job.id}`}
                        className={`flex items-start gap-3 p-4 rounded-xl border ${cfg.borderClass} ${cfg.bgClass} hover:shadow-sm transition-all group`}
                      >
                        {/* Status icon */}
                        <div className="flex-shrink-0 mt-0.5">
                          <Icon size={18} className={cfg.iconClass} />
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-white truncate">
                                {job.customer?.name ?? '—'}
                              </p>
                              {job.customer?.address && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                  {job.customer.address}
                                </p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              {job.status === 'completed' && job.payout_amount && isUnlocked ? (
                                <p className="text-sm font-bold text-green-600 dark:text-green-400">
                                  {formatCurrency(job.payout_amount)}
                                </p>
                              ) : (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  job.status === 'skipped' ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' :
                                  job.status === 'cancelled' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                                  job.status === 'rescheduled' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                                  'bg-gray-100 text-gray-500'
                                }`}>
                                  {cfg.label}
                                </span>
                              )}
                              {timeStr && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{timeStr}</p>
                              )}
                            </div>
                          </div>

                          {/* Crew row */}
                          <div className="mt-2">
                            {crew.length > 0 ? (
                              <div className="flex items-start gap-1.5">
                                <Users size={12} className="text-gray-400 flex-shrink-0 mt-0.5" />
                                <CrewAvatars crew={crew} />
                              </div>
                            ) : fallbackDoer ? (
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                                  <span className="text-green-700 dark:text-green-400 text-[9px] font-bold">
                                    {fallbackDoer.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                                  </span>
                                </div>
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                  {fallbackDoer.name}
                                </span>
                              </div>
                            ) : job.status === 'completed' ? (
                              <span className="text-xs text-gray-400 dark:text-gray-500 italic">No crew recorded</span>
                            ) : null}
                          </div>

                          {/* Skip reason */}
                          {job.skip_reason && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 italic mt-1 block">
                              "{job.skip_reason}"
                            </span>
                          )}

                          {/* Employee notes */}
                          {job.employee_notes && (
                            <div className="flex items-start gap-1.5 mt-2">
                              <MessageSquare size={11} className="text-gray-400 flex-shrink-0 mt-0.5" />
                              <p className="text-xs text-gray-600 dark:text-gray-400 italic line-clamp-2">
                                {job.employee_notes}
                              </p>
                            </div>
                          )}

                          {/* Rain delay flag */}
                          {job.is_weather_delayed && (
                            <div className="flex items-center gap-1 mt-1.5">
                              <CloudRain size={11} className="text-blue-400" />
                              <span className="text-xs text-blue-500 dark:text-blue-400">
                                Rain delay
                                {job.original_date && ` — originally ${format(parseISO(job.original_date), 'MMM d')}`}
                              </span>
                            </div>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
