'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, CheckCircle2, Clock, Cloud, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from '@/components/ui/Badge'
import { MobileHeader } from '@/components/nav/MobileNav'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Job } from '@/types'
import { format, subDays } from 'date-fns'
import { toast } from 'sonner'
import { LockedValue } from '@/contexts/OwnerAuth'

type StatusFilter = 'all' | 'pending' | 'completed' | 'skipped' | 'cancelled'
type DateFilter = 'today' | 'week' | 'month' | 'all'

export default function JobsPage() {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('week')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    loadJobs()
  }, [statusFilter, dateFilter])

  async function loadJobs() {
    setLoading(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    let query = supabase
      .from('jobs')
      .select('*, customer:customers(id, name, address, city), employee:employees!assigned_employee_id(id, name)')
      .order('scheduled_date', { ascending: false })

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)

    if (dateFilter === 'today') {
      query = query.eq('scheduled_date', today)
    } else if (dateFilter === 'week') {
      query = query.gte('scheduled_date', format(subDays(new Date(), 7), 'yyyy-MM-dd'))
    } else if (dateFilter === 'month') {
      query = query.gte('scheduled_date', format(subDays(new Date(), 30), 'yyyy-MM-dd'))
    }

    const { data } = await query.limit(100)
    setJobs((data ?? []) as Job[])
    setLoading(false)
  }

  async function deleteJob(jobId: string) {
    setDeletingId(jobId)
    const { error } = await createClient().from('jobs').delete().eq('id', jobId)
    setDeletingId(null)
    setConfirmDeleteId(null)
    if (error) { toast.error('Failed to delete job'); return }
    toast.success('Job deleted')
    setJobs((prev) => prev.filter((j) => j.id !== jobId))
  }

  const filtered = jobs.filter((j) => {
    const customer = (j as Job & { customer?: { name: string; address?: string } }).customer
    return !search ||
      customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
      customer?.address?.toLowerCase().includes(search.toLowerCase())
  })

  const stats = {
    total: filtered.length,
    completed: filtered.filter((j) => j.status === 'completed').length,
    pending: filtered.filter((j) => j.status === 'pending').length,
    totalPayout: filtered.filter((j) => j.status === 'completed').reduce((s, j) => s + (j.payout_amount ?? 0), 0),
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <MobileHeader title="Jobs" />

      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 lg:px-6 py-4">
          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Jobs</h1>
          </div>
          <div className="relative flex-1 lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search jobs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-1 px-4 lg:px-6 pb-0 overflow-x-auto">
          {(['today', 'week', 'month', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors capitalize ${
                dateFilter === f
                  ? 'border-green-600 text-green-600 dark:text-green-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              {f === 'week' ? 'Last 7 days' : f === 'month' ? 'Last 30 days' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 divide-x divide-gray-100 dark:divide-gray-800">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-900 dark:text-white' },
          { label: 'Done', value: stats.completed, color: 'text-green-600 dark:text-green-400' },
          { label: 'Pending', value: stats.pending, color: 'text-yellow-600 dark:text-yellow-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="py-2.5 px-3 text-center">
            <p className={`text-base font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        ))}
        <div className="py-2.5 px-3 text-center">
          <p className="text-base font-bold text-green-600 dark:text-green-400">
            <LockedValue>{formatCurrency(stats.totalPayout)}</LockedValue>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Revenue</p>
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex gap-2 px-4 lg:px-6 py-3 overflow-x-auto">
        {(['all', 'pending', 'completed', 'skipped', 'cancelled'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors capitalize ${
              statusFilter === s
                ? 'bg-green-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-green-400'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Job list */}
      <div className="px-4 lg:px-6 pb-6 max-w-4xl mx-auto space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Clock className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">No jobs found</p>
          </div>
        ) : (
          filtered.map((job) => {
            const customer = (job as Job & { customer?: { name: string; address?: string; city?: string } }).customer
            const employee = (job as Job & { employee?: { name: string } }).employee
            const isConfirming = confirmDeleteId === job.id
            const isDeleting = deletingId === job.id

            return (
              <div key={job.id} className="relative">
                {/* Inline delete confirmation overlay */}
                {isConfirming && (
                  <div className="absolute inset-0 z-10 flex items-center justify-between gap-3 px-4 bg-red-50 dark:bg-red-900/30 border-2 border-red-400 dark:border-red-600 rounded-xl">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300 min-w-0 truncate">
                      Delete {customer?.name} — {formatDate(job.scheduled_date)}?
                    </p>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteJob(job.id)}
                        disabled={isDeleting}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {isDeleting ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}

                <div className={`flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 transition-all ${isConfirming ? 'opacity-0' : 'hover:border-green-400 dark:hover:border-green-600 hover:shadow-sm'}`}>
                  {/* Status dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${
                    job.status === 'completed' ? 'bg-green-500' :
                    job.status === 'pending' ? 'bg-yellow-500' :
                    job.status === 'cancelled' ? 'bg-red-500' : 'bg-gray-400'
                  }`} />

                  {/* Clickable area → job detail */}
                  <Link href={`/jobs/${job.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">{customer?.name}</p>
                        {job.is_weather_delayed && <Cloud size={12} className="text-blue-500 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {formatDate(job.scheduled_date)} · {employee?.name ?? 'Unassigned'}
                      </p>
                      {customer?.address && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{customer.address}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <StatusBadge status={job.status} />
                      {job.payout_amount && (
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-1">
                          <LockedValue>{formatCurrency(job.payout_amount)}</LockedValue>
                        </p>
                      )}
                    </div>
                  </Link>

                  {/* Delete icon */}
                  <button
                    onClick={(e) => { e.preventDefault(); setConfirmDeleteId(job.id) }}
                    className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    aria-label="Delete job"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
