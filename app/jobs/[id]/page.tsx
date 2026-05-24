'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, Clock, X, Cloud, User, MapPin,
  Calendar, DollarSign, MessageSquare, Camera, Lock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { formatCurrency, formatDate, formatPhone } from '@/lib/utils'
import type { Job, Employee } from '@/types'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'

export default function JobDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const [job, setJob] = useState<Job | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [completeForm, setCompleteForm] = useState({
    completed_by_id: '',
    employee_notes: '',
    payout_amount: '',
  })
  const [skipReason, setSkipReason] = useState('')
  const [newDate, setNewDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    setLoading(true)
    const [jobRes, empRes] = await Promise.all([
      supabase.from('jobs').select(`
        *,
        customer:customers(id, name, address, city, state, phone, email, gate_code, price, service_notes),
        employee:employees!assigned_employee_id(id, name, phone),
        completed_by:employees!completed_by_id(id, name)
      `).eq('id', id).single(),
      supabase.from('employees').select('id, name, default_payout').eq('is_active', true).order('name'),
    ])
    if (jobRes.data) {
      const j = jobRes.data as Job
      setJob(j)
      setCompleteForm({
        completed_by_id: (j as Job & { employee?: { id: string } }).employee?.id ?? '',
        employee_notes: j.employee_notes ?? '',
        payout_amount: j.payout_amount?.toString() ?? '',
      })
    }
    setEmployees((empRes.data ?? []) as Employee[])
    setLoading(false)
  }

  async function markComplete() {
    setSaving(true)
    const { error } = await supabase.from('jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by_id: completeForm.completed_by_id || null,
      employee_notes: completeForm.employee_notes || null,
      payout_amount: completeForm.payout_amount ? parseFloat(completeForm.payout_amount) : job?.payout_amount,
    }).eq('id', id)
    setSaving(false)
    if (error) { toast.error('Failed to update'); return }
    toast.success('Job marked as completed!')
    setCompleteOpen(false)
    loadData()
  }

  async function markSkipped() {
    setSaving(true)
    const { error } = await supabase.from('jobs').update({
      status: 'skipped',
      skip_reason: skipReason || 'No reason given',
    }).eq('id', id)
    setSaving(false)
    if (error) { toast.error('Failed to update'); return }
    toast.success('Job skipped')
    setSkipOpen(false)
    loadData()
  }

  async function reschedule() {
    if (!newDate) { toast.error('Please select a date'); return }
    setSaving(true)
    const { error } = await supabase.from('jobs').update({
      scheduled_date: newDate,
      original_date: job?.scheduled_date,
      status: 'pending',
      is_weather_delayed: true,
    }).eq('id', id)
    setSaving(false)
    if (error) { toast.error('Failed to reschedule'); return }
    toast.success('Job rescheduled!')
    setRescheduleOpen(false)
    loadData()
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950"><div className="animate-pulse text-gray-400">Loading...</div></div>
  }

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 gap-4">
        <p className="text-gray-500">Job not found</p>
        <Link href="/jobs"><Button variant="outline">Back to Jobs</Button></Link>
      </div>
    )
  }

  const customer = (job as Job & { customer?: { name: string; address?: string; city?: string; state?: string; phone?: string; email?: string; gate_code?: string; price?: number; service_notes?: string } }).customer
  const assignedEmployee = (job as Job & { employee?: { name: string; phone?: string; id: string } }).employee
  const completedByEmployee = (job as Job & { completed_by?: { name: string } }).completed_by

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">{customer?.name}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{format(parseISO(job.scheduled_date), 'EEEE, MMMM d, yyyy')}</p>
            </div>
          </div>
          <StatusBadge status={job.status} />
        </div>
      </div>

      <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-4">
        {/* Customer info */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Customer</h3>
          <div className="space-y-2">
            <Link href={`/customers/${job.customer_id}`} className="flex items-center gap-2 hover:text-green-600 transition-colors">
              <User size={14} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{customer?.name}</span>
            </Link>
            {customer?.address && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(`${customer.address} ${customer.city ?? ''} ${customer.state ?? ''}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-green-600 transition-colors"
              >
                <MapPin size={14} className="text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{customer.address}{customer.city ? `, ${customer.city}` : ''}</span>
              </a>
            )}
            {customer?.gate_code && (
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-amber-500" />
                <span className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400">Gate Code: {customer.gate_code}</span>
              </div>
            )}
            {customer?.service_notes && (
              <div className="flex items-start gap-2 mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <MessageSquare size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">{customer.service_notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Job details */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Job Details</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Calendar size={13} /> Scheduled</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(job.scheduled_date)}</span>
            </div>
            {job.original_date && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Cloud size={13} className="text-blue-500" /> Original Date</span>
                <span className="text-sm text-gray-600 dark:text-gray-400 line-through">{formatDate(job.original_date)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><User size={13} /> Assigned To</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{assignedEmployee?.name ?? 'Unassigned'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><DollarSign size={13} /> Payout</span>
              <span className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(job.payout_amount)}</span>
            </div>
            {job.status === 'completed' && completedByEmployee && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Completed By</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{completedByEmployee.name}</span>
              </div>
            )}
            {job.completed_at && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Completed At</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">{format(new Date(job.completed_at), 'MMM d, h:mm a')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {(job.notes || job.employee_notes || job.skip_reason) && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            {job.notes && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notes</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">{job.notes}</p>
              </div>
            )}
            {job.employee_notes && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Employee Notes</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">{job.employee_notes}</p>
              </div>
            )}
            {job.skip_reason && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Skip Reason</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">{job.skip_reason}</p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {job.status === 'pending' && (
          <div className="space-y-2">
            <Button
              className="w-full"
              size="lg"
              icon={<CheckCircle2 size={18} />}
              onClick={() => setCompleteOpen(true)}
            >
              Mark as Completed
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                icon={<Cloud size={15} />}
                onClick={() => setRescheduleOpen(true)}
              >
                Rain Delay
              </Button>
              <Button
                variant="ghost"
                className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                icon={<X size={15} />}
                onClick={() => setSkipOpen(true)}
              >
                Skip Job
              </Button>
            </div>
          </div>
        )}

        {job.status === 'completed' && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
            <p className="font-semibold text-green-800 dark:text-green-300">Job Completed</p>
            <p className="text-sm text-green-700 dark:text-green-400 mt-1">Payout: {formatCurrency(job.payout_amount)}</p>
          </div>
        )}
      </div>

      {/* Complete Modal */}
      <Modal isOpen={completeOpen} onClose={() => setCompleteOpen(false)} title="Complete Job" size="md">
        <div className="p-5 space-y-4">
          <Select
            label="Completed By"
            value={completeForm.completed_by_id}
            onChange={(e) => {
              const emp = employees.find((em) => em.id === e.target.value)
              setCompleteForm((f) => ({
                ...f,
                completed_by_id: e.target.value,
                payout_amount: f.payout_amount || emp?.default_payout?.toString() || '',
              }))
            }}
          >
            <option value="">Not specified</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
          <Input
            label="Payout Amount ($)"
            type="number"
            step="0.01"
            value={completeForm.payout_amount}
            onChange={(e) => setCompleteForm((f) => ({ ...f, payout_amount: e.target.value }))}
            placeholder={job.payout_amount?.toString() ?? '0.00'}
          />
          <Textarea
            label="Employee Notes (optional)"
            placeholder="Any notes from the job..."
            value={completeForm.employee_notes}
            onChange={(e) => setCompleteForm((f) => ({ ...f, employee_notes: e.target.value }))}
            rows={3}
          />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setCompleteOpen(false)}>Cancel</Button>
            <Button className="flex-1" loading={saving} onClick={markComplete} icon={<CheckCircle2 size={15} />}>
              Mark Complete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Skip Modal */}
      <Modal isOpen={skipOpen} onClose={() => setSkipOpen(false)} title="Skip Job" size="sm">
        <div className="p-5 space-y-4">
          <Select
            label="Reason for Skipping"
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
          >
            <option value="">Select a reason...</option>
            <option value="Customer cancelled">Customer cancelled</option>
            <option value="Rain / Weather">Rain / Weather</option>
            <option value="Employee unavailable">Employee unavailable</option>
            <option value="Rescheduled">Rescheduled</option>
            <option value="Other">Other</option>
          </Select>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setSkipOpen(false)}>Cancel</Button>
            <Button variant="danger" className="flex-1" loading={saving} onClick={markSkipped}>Skip Job</Button>
          </div>
        </div>
      </Modal>

      {/* Reschedule Modal */}
      <Modal isOpen={rescheduleOpen} onClose={() => setRescheduleOpen(false)} title="Reschedule Job" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Current date: <strong>{formatDate(job.scheduled_date)}</strong>
          </p>
          <Input
            label="New Date"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
            <Button className="flex-1" loading={saving} onClick={reschedule}>Reschedule</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
