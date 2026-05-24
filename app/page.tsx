'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Calendar,
  CheckCircle2,
  DollarSign,
  Users,
  Briefcase,
  FileText,
  ArrowRight,
  Clock,
  AlertCircle,
  TrendingUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StatCard } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Job, Invoice } from '@/types'
import { MobileHeader } from '@/components/nav/MobileNav'
import { format } from 'date-fns'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [todaysJobs, setTodaysJobs] = useState<Job[]>([])
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([])
  const [stats, setStats] = useState({
    jobsToday: 0,
    completedToday: 0,
    unpaidCount: 0,
    unpaidTotal: 0,
    activeCustomers: 0,
    weekRevenue: 0,
  })

  const supabase = createClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    try {
      const [jobsRes, invoicesRes, customersRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('*, customer:customers(id, name, address, city), employee:employees!assigned_employee_id(id, name)')
          .eq('scheduled_date', today)
          .order('scheduled_date'),
        supabase
          .from('invoices')
          .select('*, customer:customers(id, name)')
          .in('status', ['sent', 'overdue'])
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('customers')
          .select('id')
          .eq('is_active', true),
      ])

      const jobs = (jobsRes.data ?? []) as Job[]
      const invoices = (invoicesRes.data ?? []) as Invoice[]
      const activeCustomers = customersRes.data?.length ?? 0

      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      const weekStartStr = format(weekStart, 'yyyy-MM-dd')
      const weekRes = await supabase
        .from('jobs')
        .select('payout_amount')
        .eq('status', 'completed')
        .gte('scheduled_date', weekStartStr)

      const weekRevenue = (weekRes.data ?? []).reduce((sum, j) => sum + (j.payout_amount ?? 0), 0)
      const unpaidTotal = invoices.reduce((sum, inv) => sum + (inv.total ?? 0), 0)

      setTodaysJobs(jobs)
      setRecentInvoices(invoices)
      setStats({
        jobsToday: jobs.length,
        completedToday: jobs.filter((j) => j.status === 'completed').length,
        unpaidCount: invoices.length,
        unpaidTotal,
        activeCustomers,
        weekRevenue,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <MobileHeader title="Dashboard" />

      {/* Desktop Header */}
      <div className="hidden lg:flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/schedule">
            <Button variant="outline" size="sm" icon={<Calendar size={16} />}>Schedule Job</Button>
          </Link>
          <Link href="/invoices/new">
            <Button size="sm" icon={<FileText size={16} />}>New Invoice</Button>
          </Link>
        </div>
      </div>

      <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <StatCard
            label="Jobs Today"
            value={loading ? '—' : stats.jobsToday}
            icon={<Briefcase size={18} />}
            trend={`${stats.completedToday} completed`}
            color="blue"
          />
          <StatCard
            label="Completed"
            value={loading ? '—' : stats.completedToday}
            icon={<CheckCircle2 size={18} />}
            trend={`${stats.jobsToday - stats.completedToday} remaining`}
            color="green"
          />
          <StatCard
            label="Unpaid Invoices"
            value={loading ? '—' : stats.unpaidCount}
            icon={<AlertCircle size={18} />}
            trend={formatCurrency(stats.unpaidTotal)}
            color="yellow"
          />
          <StatCard
            label="Week Revenue"
            value={loading ? '—' : formatCurrency(stats.weekRevenue)}
            icon={<TrendingUp size={18} />}
            trend={`${stats.activeCustomers} active customers`}
            color="green"
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-4 lg:gap-6">
          {/* Today's Jobs */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-green-600" />
                <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Today&apos;s Jobs</h2>
                {!loading && (
                  <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">
                    {todaysJobs.length}
                  </span>
                )}
              </div>
              <Link href="/schedule" className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1 hover:underline">
                View all <ArrowRight size={12} />
              </Link>
            </div>

            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
            ) : todaysJobs.length === 0 ? (
              <div className="p-8 text-center">
                <Calendar className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No jobs scheduled for today</p>
                <Link href="/schedule">
                  <Button variant="outline" size="sm" className="mt-3">Schedule a Job</Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {todaysJobs.slice(0, 6).map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      job.status === 'completed' ? 'bg-green-500' :
                      job.status === 'pending' ? 'bg-yellow-500' : 'bg-gray-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {(job as Job & { customer?: { name: string; address?: string } }).customer?.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {(job as Job & { customer?: { address?: string } }).customer?.address}
                        {(job as Job & { employee?: { name: string } }).employee && ` · ${(job as Job & { employee?: { name: string } }).employee?.name}`}
                      </p>
                    </div>
                    <StatusBadge status={job.status} />
                  </Link>
                ))}
                {todaysJobs.length > 6 && (
                  <div className="px-4 py-2.5 text-center">
                    <Link href="/schedule" className="text-xs text-green-600 dark:text-green-400 hover:underline">
                      +{todaysJobs.length - 6} more jobs
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Unpaid Invoices */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <DollarSign size={16} className="text-yellow-600" />
                <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Unpaid Invoices</h2>
                {!loading && stats.unpaidCount > 0 && (
                  <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full">
                    {formatCurrency(stats.unpaidTotal)}
                  </span>
                )}
              </div>
              <Link href="/invoices" className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1 hover:underline">
                View all <ArrowRight size={12} />
              </Link>
            </div>

            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
            ) : recentInvoices.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">All invoices paid!</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {recentInvoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {(inv as Invoice & { customer?: { name: string } }).customer?.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {inv.invoice_number}
                        {inv.due_date && ` · Due ${formatDate(inv.due_date)}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(inv.total)}</p>
                      <StatusBadge status={inv.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/customers/new', icon: Users, label: 'Add Customer', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
            { href: '/schedule', icon: Calendar, label: 'Schedule Job', color: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
            { href: '/jobs', icon: Clock, label: 'View Jobs', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' },
            { href: '/invoices/new', icon: FileText, label: 'New Invoice', color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20' },
          ].map(({ href, icon: Icon, label, color }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-2.5 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-green-400 dark:hover:border-green-600 hover:shadow-sm transition-all"
            >
              <div className={`p-2.5 rounded-xl ${color}`}>
                <Icon size={20} />
              </div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
