'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, Clock, X, Cloud, User, MapPin,
  Calendar, DollarSign, MessageSquare, Lock, Users, Trash2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { CrewPicker, type CrewMember } from '@/components/ui/CrewPicker'
import { formatCurrency, formatDate } from '@/lib/utils'
import { calculatePayroll, ruleColor } from '@/lib/payroll'
import type { Job, Employee, JobCrew } from '@/types'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'

// ── Local type helpers ────────────────────────────────────────────────────────

type JobWithRelations = Omit<Job, 'customer' | 'employee' | 'completed_by' | 'crew'> & {
  customer?: {
    id: string; name: string; address?: string; city?: string
    state?: string; phone?: string; gate_code?: string
    price?: number; employee_pay_per_mow?: number; service_notes?: string
  }
  employee?: { id: string; name: string; phone?: string }
  completed_by?: { id: string; name: string }
  crew?: Array<{ id: string; employee_id: string; payout_amount: number | null; employee?: { id: string; name: string } }>
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [job, setJob] = useState<JobWithRelations | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  // Modal visibility
  const [completeOpen, setCompleteOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Complete form state
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [crewRequired, setCrewRequired] = useState(false)
  const [employeeNotes, setEmployeeNotes] = useState('')

  // Skip / reschedule
  const [skipReason, setSkipReason] = useState('')
  const [newDate, setNewDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [id])

  // ── Auto-calculate payouts whenever crew SELECTION changes ────────────────
  // We watch the sorted list of IDs (not payout amounts) to avoid overriding
  // manual edits when a user adjusts a payout number.
  const crewIdKey = [...crew].map((c) => c.employee_id).sort().join(',')

  useEffect(() => {
    if (!job || crew.length === 0) return

    const result = calculatePayroll({
      jobPrice: job.customer?.price ?? null,
      employeePayPerMow: job.customer?.employee_pay_per_mow ?? null,
      crew: crew.map((m) => {
        const emp = employees.find((e) => e.id === m.employee_id)
        return { id: m.employee_id, isOwner: emp?.is_owner ?? false, name: emp?.name ?? '' }
      }),
    })

    if (result.payouts.size === 0) return

    setCrew((prev) =>
      prev.map((m) => {
        const calculated = result.payouts.get(m.employee_id)
        return calculated !== undefined
          ? { ...m, payout_amount: calculated.toString() }
          : m
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewIdKey]) // intentionally excludes crew payout values

  // Current payroll calculation result (for the summary banner)
  const payrollResult = useMemo(() => {
    if (!job || crew.length === 0) return null
    return calculatePayroll({
      jobPrice: job.customer?.price ?? null,
      employeePayPerMow: job.customer?.employee_pay_per_mow ?? null,
      crew: crew.map((m) => {
        const emp = employees.find((e) => e.id === m.employee_id)
        return { id: m.employee_id, isOwner: emp?.is_owner ?? false, name: emp?.name ?? '' }
      }),
    })
  }, [crewIdKey, job, employees])

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true)
    const [jobRes, empRes] = await Promise.all([
      supabase.from('jobs').select(`
        *,
        customer:customers(id, name, address, city, state, phone, gate_code, price, employee_pay_per_mow, service_notes),
        employee:employees!assigned_employee_id(id, name, phone),
        completed_by:employees!completed_by_id(id, name)
      `).eq('id', id as string).single(),

      supabase.from('employees')
        .select('id, name, phone, email, is_active, is_owner, default_payout, notes, created_at, updated_at')
        .eq('is_active', true)
        .order('name'),
    ])

    const empList = (empRes.data ?? []) as Employee[]
    setEmployees(empList)

    if (jobRes.data) {
      const j = jobRes.data as JobWithRelations

      // Load crew for this job
      const { data: crewData } = await supabase
        .from('job_crew')
        .select('id, employee_id, payout_amount, employee:employees(id, name)')
        .eq('job_id', id as string)

      j.crew = (crewData ?? []) as unknown as JobWithRelations['crew']
      setJob(j)

      // Pre-populate complete form
      setEmployeeNotes(j.employee_notes ?? '')

      if (j.crew && j.crew.length > 0) {
        // Already has crew saved — pre-populate
        setCrew(
          j.crew.map((c) => ({
            employee_id: c.employee_id,
            payout_amount: c.payout_amount?.toString() ?? '',
          }))
        )
      } else if (j.employee) {
        // Pre-select the assigned employee
        const assigned = empList.find((e) => e.id === j.employee?.id)
        setCrew(
          assigned
            ? [{ employee_id: assigned.id, payout_amount: assigned.default_payout?.toString() ?? '' }]
            : []
        )
      }
    }

    setLoading(false)
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function markComplete() {
    if (crew.length === 0) {
      setCrewRequired(true)
      return
    }
    setCrewRequired(false)
    setSaving(true)

    const totalPayout = crew.reduce((s, m) => s + (parseFloat(m.payout_amount) || 0), 0)
    const primaryEmployeeId = crew[0].employee_id

    // 1. Update the job record
    const { error: jobError } = await supabase.from('jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by_id: primaryEmployeeId,
      employee_notes: employeeNotes || null,
      payout_amount: totalPayout || null,
    }).eq('id', id as string)

    if (jobError) {
      toast.error('Failed to save job')
      setSaving(false)
      return
    }

    // 2. Replace crew entries (delete + re-insert is idempotent)
    await supabase.from('job_crew').delete().eq('job_id', id as string)

    const { error: crewError } = await supabase.from('job_crew').insert(
      crew.map((m) => ({
        job_id: id as string,
        employee_id: m.employee_id,
        payout_amount: parseFloat(m.payout_amount) || null,
      }))
    )

    setSaving(false)

    if (crewError) {
      toast.error('Job completed but crew save failed — please try again')
      return
    }

    toast.success('Job marked as completed!')
    setCompleteOpen(false)
    loadData()
  }

  async function markSkipped() {
    setSaving(true)
    const { error } = await supabase.from('jobs').update({
      status: 'skipped',
      skip_reason: skipReason || 'No reason given',
    }).eq('id', id as string)
    setSaving(false)
    if (error) { toast.error('Failed to update'); return }
    toast.success('Job skipped')
    setSkipOpen(false)
    loadData()
  }

  async function deleteJob() {
    setSaving(true)
    // job_crew rows are deleted automatically via ON DELETE CASCADE
    const { error } = await supabase.from('jobs').delete().eq('id', id as string)
    setSaving(false)
    if (error) { toast.error('Failed to delete job'); return }
    toast.success('Job deleted')
    router.replace('/jobs')
  }

  async function reschedule() {
    if (!newDate) { toast.error('Please select a date'); return }
    setSaving(true)
    const { error } = await supabase.from('jobs').update({
      scheduled_date: newDate,
      original_date: job?.scheduled_date,
      status: 'pending',
      is_weather_delayed: true,
    }).eq('id', id as string)
    setSaving(false)
    if (error) { toast.error('Failed to reschedule'); return }
    toast.success('Job rescheduled!')
    setRescheduleOpen(false)
    loadData()
  }

  // ── Loading / not found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 gap-4">
        <p className="text-gray-500">Job not found</p>
        <Link href="/jobs"><Button variant="outline">Back to Jobs</Button></Link>
      </div>
    )
  }

  const customer = job.customer
  const assignedEmployee = job.employee
  const savedCrew = job.crew ?? []

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                {customer?.name}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {format(parseISO(job.scheduled_date), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          </div>
          <StatusBadge status={job.status} />
        </div>
      </div>

      <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-4">

        {/* Customer info */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Customer
          </h3>
          <div className="space-y-2">
            <Link
              href={`/customers/${job.customer_id}`}
              className="flex items-center gap-2 hover:text-green-600 transition-colors"
            >
              <User size={14} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{customer?.name}</span>
            </Link>
            {customer?.address && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(
                  `${customer.address} ${customer.city ?? ''}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-green-600 transition-colors"
              >
                <MapPin size={14} className="text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {customer.address}{customer.city ? `, ${customer.city}` : ''}
                </span>
              </a>
            )}
            {customer?.gate_code && (
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-amber-500" />
                <span className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400">
                  Gate Code: {customer.gate_code}
                </span>
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
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Job Details
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Calendar size={13} /> Scheduled
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {formatDate(job.scheduled_date)}
              </span>
            </div>
            {job.original_date && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <Cloud size={13} className="text-blue-500" /> Original Date
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400 line-through">
                  {formatDate(job.original_date)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <User size={13} /> Assigned To
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {assignedEmployee?.name ?? 'Unassigned'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <DollarSign size={13} /> Total Payout
              </span>
              <span className="text-sm font-bold text-green-600 dark:text-green-400">
                {formatCurrency(job.payout_amount)}
              </span>
            </div>
            {job.completed_at && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <Clock size={13} /> Completed At
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {format(new Date(job.completed_at), 'MMM d, h:mm a')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Crew — shown on completed jobs */}
        {job.status === 'completed' && savedCrew.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Users size={12} /> Crew
            </h3>
            <div className="space-y-2">
              {savedCrew.map((member) => (
                <div key={member.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {(member.employee?.name ?? '?')
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                  <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">
                    {member.employee?.name ?? 'Unknown'}
                  </span>
                  {member.payout_amount != null && (
                    <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                      {formatCurrency(member.payout_amount)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {(job.notes || job.employee_notes || job.skip_reason) && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            {job.notes && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Notes
                </h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">{job.notes}</p>
              </div>
            )}
            {job.employee_notes && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Field Notes
                </h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">{job.employee_notes}</p>
              </div>
            )}
            {job.skip_reason && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Skip Reason
                </h3>
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
              onClick={() => { setCrewRequired(false); setCompleteOpen(true) }}
            >
              Mark as Completed
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" icon={<Cloud size={15} />} onClick={() => setRescheduleOpen(true)}>
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
            <p className="text-sm text-green-700 dark:text-green-400 mt-1">
              Total payout: {formatCurrency(job.payout_amount)}
              {savedCrew.length > 1 && ` across ${savedCrew.length} crew members`}
            </p>
          </div>
        )}

        {/* Delete */}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 w-full"
            icon={<Trash2 size={14} />}
            onClick={() => setDeleteOpen(true)}
          >
            Delete Job
          </Button>
        </div>
      </div>

      {/* ── Complete Modal ─────────────────────────────────────────────────── */}
      <Modal isOpen={completeOpen} onClose={() => setCompleteOpen(false)} title="Complete Job" size="md">
        <div className="p-5 space-y-5">

          <CrewPicker
            employees={employees}
            value={crew}
            onChange={setCrew}
            required={crewRequired}
          />

          {/* Payroll summary banner */}
          {payrollResult && payrollResult.rule && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${ruleColor(payrollResult.rule)}`}>
                  {payrollResult.ruleLabel}
                </span>
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  Payroll auto-calculated
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {payrollResult.summary}
              </p>
              {customer?.price == null && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠ No job price set on this customer — set it on the customer page for accurate payroll.
                </p>
              )}
              {payrollResult.rule === 3 && customer?.employee_pay_per_mow == null && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠ No Employee Pay Per Mow set for this property — edit the customer to set it.
                </p>
              )}
            </div>
          )}

          <Textarea
            label="Field notes (optional)"
            placeholder="Long grass, extra trimming, gate was unlocked, customer home…"
            value={employeeNotes}
            onChange={(e) => setEmployeeNotes(e.target.value)}
            rows={3}
          />

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setCompleteOpen(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              loading={saving}
              onClick={markComplete}
              icon={<CheckCircle2 size={15} />}
            >
              Mark Complete
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Skip Modal ─────────────────────────────────────────────────────── */}
      <Modal isOpen={skipOpen} onClose={() => setSkipOpen(false)} title="Skip Job" size="sm">
        <div className="p-5 space-y-4">
          <Select
            label="Reason for skipping"
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
          >
            <option value="">Select a reason…</option>
            <option value="Customer cancelled">Customer cancelled</option>
            <option value="Rain / Weather">Rain / Weather</option>
            <option value="Employee unavailable">Employee unavailable</option>
            <option value="Rescheduled">Rescheduled</option>
            <option value="Other">Other</option>
          </Select>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setSkipOpen(false)}>Cancel</Button>
            <Button variant="danger" className="flex-1" loading={saving} onClick={markSkipped}>
              Skip Job
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
      <Modal isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Job" size="sm">
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
            <Trash2 size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">This cannot be undone</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                This job and all crew records for it will be permanently deleted.
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Delete the job for <strong className="text-gray-900 dark:text-white">{customer?.name}</strong> on{' '}
            <strong className="text-gray-900 dark:text-white">{formatDate(job.scheduled_date)}</strong>?
          </p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" loading={saving} onClick={deleteJob} icon={<Trash2 size={14} />}>
              Delete Job
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Reschedule Modal ───────────────────────────────────────────────── */}
      <Modal isOpen={rescheduleOpen} onClose={() => setRescheduleOpen(false)} title="Rain Delay" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Current date: <strong className="text-gray-900 dark:text-white">{formatDate(job.scheduled_date)}</strong>
          </p>
          <Input
            label="New Date"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setRescheduleOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1" loading={saving} onClick={reschedule}>
              Reschedule
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
