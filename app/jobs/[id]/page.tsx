'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, Clock, X, Cloud, User, MapPin,
  Calendar, DollarSign, MessageSquare, Lock, Users, Trash2,
  Edit2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { CrewPicker, type CrewMember } from '@/components/ui/CrewPicker'
import { CompleteJobModal } from '@/components/jobs/CompleteJobModal'
import { calculatePayroll } from '@/lib/payroll'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Job, Employee } from '@/types'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'

// ── Local type helpers ────────────────────────────────────────────────────────

type JobWithRelations = Omit<Job, 'customer' | 'employee' | 'completed_by' | 'crew'> & {
  customer?: {
    id: string; name: string; address?: string; city?: string
    state?: string; phone?: string; gate_code?: string
    price?: number; employee_pay_per_mow?: number; service_notes?: string
    service_frequency?: string
  }
  employee?: { id: string; name: string; phone?: string }
  completed_by?: { id: string; name: string }
  crew?: Array<{ id: string; employee_id: string; payout_amount: number | null; employee?: { id: string; name: string } }>
}

type EditForm = {
  status: Job['status']
  scheduled_date: string
  completed_at: string        // datetime-local format "yyyy-MM-dd'T'HH:mm"
  assigned_employee_id: string
  payout_amount: string       // used only when crew is empty
  notes: string
  employee_notes: string
  skip_reason: string
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
  const [editOpen, setEditOpen] = useState(false)

  // Pre-computed crew to pass into the shared completion modal on open
  const [initialCrew, setInitialCrew] = useState<CrewMember[]>([])

  // Edit form state
  const [editForm, setEditForm] = useState<EditForm>({
    status: 'pending',
    scheduled_date: '',
    completed_at: '',
    assigned_employee_id: '',
    payout_amount: '',
    notes: '',
    employee_notes: '',
    skip_reason: '',
  })
  const [editCrew, setEditCrew] = useState<CrewMember[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  // Skip next auto-calc run when edit modal opens with existing crew
  const skipNextEditCalc = useRef(false)

  // Skip / reschedule
  const [skipReason, setSkipReason] = useState('')
  const [newDate, setNewDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [id])

  // ── Auto-calculate payouts when crew SELECTION changes in the edit modal ─────
  // Watch sorted IDs only so manual payout edits are preserved.
  const editCrewIdKey = [...editCrew].map((c) => c.employee_id).sort().join(',')

  useEffect(() => {
    if (!editOpen) return
    // Skip the first fire after openEditModal() populates the crew
    if (skipNextEditCalc.current) {
      skipNextEditCalc.current = false
      return
    }
    if (editCrew.length === 0) return

    const result = calculatePayroll({
      jobPrice: job?.customer?.price ?? null,
      employeePayPerMow: job?.customer?.employee_pay_per_mow ?? null,
      crew: editCrew.map((m) => {
        const emp = employees.find((e) => e.id === m.employee_id)
        return { id: m.employee_id, isOwner: emp?.is_owner ?? false, name: emp?.name ?? '' }
      }),
    })

    if (result.payouts.size === 0) return

    setEditCrew((prev) =>
      prev.map((m) => {
        const calculated = result.payouts.get(m.employee_id)
        return calculated !== undefined
          ? { ...m, payout_amount: calculated.toString() }
          : m
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCrewIdKey, editOpen])

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true)
    const [jobRes, empRes] = await Promise.all([
      supabase.from('jobs').select(`
        *,
        customer:customers(id, name, address, city, state, phone, gate_code, price, employee_pay_per_mow, service_notes, service_frequency),
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

      // Pre-populate the initial crew for the completion modal
      if (j.crew && j.crew.length > 0) {
        setInitialCrew(
          j.crew.map((c) => ({
            employee_id: c.employee_id,
            payout_amount: c.payout_amount?.toString() ?? '',
          }))
        )
      } else if (j.employee) {
        const assigned = empList.find((e) => e.id === j.employee?.id)
        setInitialCrew(
          assigned
            ? [{ employee_id: assigned.id, payout_amount: assigned.default_payout?.toString() ?? '' }]
            : []
        )
      } else {
        setInitialCrew([])
      }
    }

    setLoading(false)
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function openEditModal() {
    if (!job) return
    // Flag so the first editCrewIdKey change (from populating existing crew) skips auto-calc
    skipNextEditCalc.current = true

    setEditForm({
      status: job.status,
      scheduled_date: job.scheduled_date,
      completed_at: job.completed_at
        ? format(new Date(job.completed_at), "yyyy-MM-dd'T'HH:mm")
        : '',
      assigned_employee_id: job.assigned_employee_id ?? '',
      payout_amount: job.payout_amount?.toString() ?? '',
      notes: job.notes ?? '',
      employee_notes: job.employee_notes ?? '',
      skip_reason: job.skip_reason ?? '',
    })

    setEditCrew(
      (job.crew ?? []).map((c) => ({
        employee_id: c.employee_id,
        payout_amount: c.payout_amount?.toString() ?? '',
      }))
    )

    setEditOpen(true)
  }

  async function saveEdit() {
    if (!job || !editForm.scheduled_date) {
      toast.error('Scheduled date is required')
      return
    }
    setSavingEdit(true)

    // Crew-based payout takes precedence; fall back to manual field
    const crewTotal =
      editCrew.length > 0
        ? editCrew.reduce((s, m) => s + (parseFloat(m.payout_amount) || 0), 0)
        : null
    const manualPayout = editForm.payout_amount ? parseFloat(editForm.payout_amount) : null
    const finalPayout = crewTotal ?? manualPayout

    // Completed_at: keep existing time if user didn't change date field
    let completedAt: string | null = null
    if (editForm.status === 'completed') {
      if (editForm.completed_at) {
        completedAt = new Date(editForm.completed_at).toISOString()
      } else {
        completedAt = job.completed_at ?? new Date().toISOString()
      }
    }

    const primaryEmployeeId =
      editCrew.length > 0
        ? editCrew[0].employee_id
        : editForm.status === 'completed'
        ? (job.completed_by_id ?? editForm.assigned_employee_id ?? null)
        : null

    const { error: jobError } = await supabase
      .from('jobs')
      .update({
        status: editForm.status,
        scheduled_date: editForm.scheduled_date,
        completed_at: completedAt,
        completed_by_id: primaryEmployeeId || null,
        assigned_employee_id: editForm.assigned_employee_id || null,
        payout_amount: finalPayout,
        notes: editForm.notes || null,
        employee_notes: editForm.employee_notes || null,
        skip_reason: editForm.skip_reason || null,
      })
      .eq('id', id as string)

    if (jobError) {
      toast.error('Failed to save changes')
      setSavingEdit(false)
      return
    }

    // Update crew records for completed jobs
    if (editForm.status === 'completed') {
      await supabase.from('job_crew').delete().eq('job_id', id as string)

      if (editCrew.length > 0) {
        const { error: crewError } = await supabase.from('job_crew').insert(
          editCrew.map((m) => ({
            job_id: id as string,
            employee_id: m.employee_id,
            payout_amount: parseFloat(m.payout_amount) || null,
          }))
        )
        if (crewError) {
          toast.error('Job updated but crew records failed to save')
          setSavingEdit(false)
          loadData()
          return
        }
      }
    }

    setSavingEdit(false)
    toast.success('Job updated successfully')
    setEditOpen(false)
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

  // Computed totals for the edit modal crew display
  const editCrewTotal = editCrew.reduce((s, m) => s + (parseFloat(m.payout_amount) || 0), 0)

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
          <div className="flex items-center gap-2">
            {/* Edit button — available on every job */}
            <button
              onClick={openEditModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Edit2 size={14} />
              <span className="hidden sm:inline">Edit</span>
            </button>
            <StatusBadge status={job.status} />
          </div>
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

        {/* Pending actions */}
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

        {/* Completed banner */}
        {job.status === 'completed' && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-green-800 dark:text-green-300">Job Completed</p>
                  <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
                    Total payout: {formatCurrency(job.payout_amount)}
                    {savedCrew.length > 1 && ` across ${savedCrew.length} crew members`}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={<Edit2 size={13} />}
                onClick={openEditModal}
                className="flex-shrink-0 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40"
              >
                Edit
              </Button>
            </div>
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
      <CompleteJobModal
        isOpen={completeOpen}
        onClose={() => setCompleteOpen(false)}
        jobId={id as string}
        customerId={job.customer_id}
        jobPrice={job.customer?.price ?? null}
        employeePayPerMow={job.customer?.employee_pay_per_mow ?? null}
        serviceFrequency={(job.customer?.service_frequency as import('@/types').ServiceFrequency) ?? null}
        assignedEmployeeId={job.assigned_employee_id}
        scheduleId={job.schedule_id}
        initialCrew={initialCrew}
        employees={employees}
        onCompleted={loadData}
      />

      {/* ── Edit Job Modal ─────────────────────────────────────────────────── */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit Job" size="lg">
        <div className="p-5 space-y-6">

          {/* ── Status & Dates ─────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              Status &amp; Dates
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Status"
                value={editForm.status}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    status: e.target.value as Job['status'],
                    // Auto-fill completed_at when switching to completed
                    completed_at:
                      e.target.value === 'completed' && !f.completed_at
                        ? format(new Date(), "yyyy-MM-dd'T'HH:mm")
                        : f.completed_at,
                  }))
                }
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="skipped">Skipped</option>
                <option value="cancelled">Cancelled</option>
                <option value="rescheduled">Rescheduled</option>
              </Select>
              <Input
                label="Scheduled Date"
                type="date"
                value={editForm.scheduled_date}
                onChange={(e) => setEditForm((f) => ({ ...f, scheduled_date: e.target.value }))}
              />
            </div>
            {editForm.status === 'completed' && (
              <Input
                label="Completion Date &amp; Time"
                type="datetime-local"
                value={editForm.completed_at}
                onChange={(e) => setEditForm((f) => ({ ...f, completed_at: e.target.value }))}
              />
            )}
            {(editForm.status === 'skipped' || editForm.status === 'cancelled') && (
              <Input
                label="Reason"
                placeholder="Why was this job skipped or cancelled?"
                value={editForm.skip_reason}
                onChange={(e) => setEditForm((f) => ({ ...f, skip_reason: e.target.value }))}
              />
            )}
          </section>

          {/* ── Assignment ─────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              Assignment
            </h3>
            <Select
              label="Assigned Employee"
              value={editForm.assigned_employee_id}
              onChange={(e) => setEditForm((f) => ({ ...f, assigned_employee_id: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </Select>
          </section>

          {/* ── Crew & Pay ─────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              Crew &amp; Payroll
            </h3>
            <CrewPicker
              employees={employees}
              value={editCrew}
              onChange={setEditCrew}
              label="Crew members"
            />
            {editCrew.length > 0 ? (
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Total payout (auto-calculated from crew)
                </span>
                <span className="text-sm font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(editCrewTotal)}
                </span>
              </div>
            ) : (
              <Input
                label="Payout Amount ($)"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={editForm.payout_amount}
                onChange={(e) => setEditForm((f) => ({ ...f, payout_amount: e.target.value }))}
                hint="Used when no crew is selected"
              />
            )}
          </section>

          {/* ── Notes ──────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              Notes
            </h3>
            <Textarea
              label="Service Notes"
              placeholder="Instructions, special requests…"
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
            />
            <Textarea
              label="Field Notes"
              placeholder="What happened on the job — long grass, gate issue, customer was home…"
              value={editForm.employee_notes}
              onChange={(e) => setEditForm((f) => ({ ...f, employee_notes: e.target.value }))}
              rows={2}
            />
          </section>

          {/* ── Save / Cancel ───────────────────────────────────────────────── */}
          <div className="flex gap-3 pt-1 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              loading={savingEdit}
              onClick={saveEdit}
              icon={<CheckCircle2 size={15} />}
            >
              Save Changes
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
