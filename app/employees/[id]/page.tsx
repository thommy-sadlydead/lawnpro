'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Phone, Mail, DollarSign, Briefcase, CheckCircle2,
  Edit2, TrendingUp, Calendar,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea } from '@/components/ui/Input'
import { formatCurrency, formatPhone, formatDate } from '@/lib/utils'
import type { Employee, Job } from '@/types'
import { toast } from 'sonner'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

export default function EmployeeDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Employee>>({})
  const [saving, setSaving] = useState(false)
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('month')

  useEffect(() => {
    loadData()
  }, [id, period])

  async function loadData() {
    setLoading(true)
    const [empRes] = await Promise.all([
      supabase.from('employees').select('*').eq('id', id).single(),
    ])

    if (empRes.data) {
      setEmployee(empRes.data as Employee)
      setEditForm(empRes.data as Employee)
    }

    let jobsQuery = supabase
      .from('jobs')
      .select('*, customer:customers(id, name)')
      .eq('assigned_employee_id', id)
      .order('scheduled_date', { ascending: false })

    if (period === 'week') {
      const weekAgo = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
      jobsQuery = jobsQuery.gte('scheduled_date', weekAgo)
    } else if (period === 'month') {
      const monthAgo = format(startOfMonth(new Date()), 'yyyy-MM-dd')
      jobsQuery = jobsQuery.gte('scheduled_date', monthAgo)
    }

    const { data: jobData } = await jobsQuery.limit(50)
    setJobs((jobData ?? []) as Job[])
    setLoading(false)
  }

  async function saveEdit() {
    setSaving(true)
    const { error } = await supabase.from('employees').update({
      name: editForm.name,
      phone: editForm.phone,
      email: editForm.email,
      default_payout: editForm.default_payout,
      notes: editForm.notes,
    }).eq('id', id)
    setSaving(false)
    if (error) { toast.error('Failed to save'); return }
    toast.success('Employee updated')
    setEditOpen(false)
    loadData()
  }

  async function toggleActive() {
    if (!employee) return
    const { error } = await supabase.from('employees').update({ is_active: !employee.is_active }).eq('id', id)
    if (!error) {
      toast.success(employee.is_active ? 'Employee deactivated' : 'Reactivated')
      loadData()
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950"><div className="animate-pulse text-gray-400">Loading...</div></div>
  }

  if (!employee) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 gap-4">
        <p className="text-gray-500">Employee not found</p>
        <Link href="/employees"><Button variant="outline">Back</Button></Link>
      </div>
    )
  }

  const completedJobs = jobs.filter((j) => j.status === 'completed')
  const totalEarnings = completedJobs.reduce((sum, j) => sum + (j.payout_amount ?? employee.default_payout ?? 0), 0)
  const skippedJobs = jobs.filter((j) => j.status === 'skipped' || j.status === 'cancelled')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/employees">
              <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <ArrowLeft size={18} />
              </button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                <span className="text-white font-bold">{employee.name[0]}</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{employee.name}</h1>
                <Badge variant={employee.is_active ? 'green' : 'gray'}>
                  {employee.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" icon={<Edit2 size={15} />} onClick={() => setEditOpen(true)}>
            Edit
          </Button>
        </div>
      </div>

      <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-4">
        {/* Contact & Rate */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Contact</h3>
            <div className="space-y-2">
              {employee.phone ? (
                <a href={`tel:${employee.phone}`} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-green-600">
                  <Phone size={14} className="text-gray-400" /> {formatPhone(employee.phone)}
                </a>
              ) : <p className="text-sm text-gray-400">No phone</p>}
              {employee.email && (
                <a href={`mailto:${employee.email}`} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-green-600">
                  <Mail size={14} className="text-gray-400" /> {employee.email}
                </a>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Rate</h3>
            <div className="flex items-center gap-2">
              <DollarSign size={18} className="text-green-600" />
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {employee.default_payout ? formatCurrency(employee.default_payout) : '—'}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">/job</span>
            </div>
            {employee.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{employee.notes}</p>}
          </div>
        </div>

        {/* Period selector + Stats */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="flex border-b border-gray-100 dark:border-gray-800">
            {(['week', 'month', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors capitalize ${
                  period === p
                    ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/10'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800">
            <div className="p-4 text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{completedJobs.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Jobs Done</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalEarnings)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Earnings</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{skippedJobs.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Skipped</p>
            </div>
          </div>
        </div>

        {/* Job History */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <Calendar size={15} className="text-green-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Job History</h3>
            <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">{jobs.length}</span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {jobs.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">No jobs in this period</div>
            ) : (
              jobs.map((job) => {
                const customer = (job as Job & { customer?: { name: string; id: string } }).customer
                return (
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
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{customer?.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(job.scheduled_date)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <StatusBadge status={job.status} />
                      {job.status === 'completed' && job.payout_amount && (
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-0.5">{formatCurrency(job.payout_amount)}</p>
                      )}
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Account</h3>
          <Button variant={employee.is_active ? 'danger' : 'outline'} size="sm" onClick={toggleActive}>
            {employee.is_active ? 'Deactivate Employee' : 'Reactivate Employee'}
          </Button>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit Employee" size="md">
        <div className="p-5 space-y-4">
          <Input label="Full Name *" value={editForm.name ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" value={editForm.phone ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
            <Input label="Email" value={editForm.email ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <Input
            label="Default Payout Per Job ($)"
            type="number"
            step="0.01"
            value={editForm.default_payout?.toString() ?? ''}
            onChange={(e) => setEditForm((f) => ({ ...f, default_payout: parseFloat(e.target.value) }))}
          />
          <Textarea label="Notes" value={editForm.notes ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="flex-1" loading={saving} onClick={saveEdit}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
