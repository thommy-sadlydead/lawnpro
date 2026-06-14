'use client'

import { useState, useEffect, useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { addDays, addMonths, format, parseISO } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { CrewPicker, type CrewMember } from '@/components/ui/CrewPicker'
import { calculatePayroll, ruleColor } from '@/lib/payroll'
import type { Employee, ServiceFrequency } from '@/types'
import { toast } from 'sonner'

interface CompleteJobModalProps {
  isOpen: boolean
  onClose: () => void
  jobId: string
  /** Customer data needed for payroll + auto-scheduling */
  customerId: string
  jobPrice: number | null
  employeePayPerMow: number | null
  serviceFrequency: ServiceFrequency | null
  /** Carry-over for the next job */
  assignedEmployeeId: string | null
  scheduleId?: string | null
  /** Pre-selected crew members (e.g. the assigned employee) */
  initialCrew?: CrewMember[]
  employees: Employee[]
  /** Called after the job + crew records are successfully saved */
  onCompleted: () => void
}

export function CompleteJobModal({
  isOpen,
  onClose,
  jobId,
  customerId,
  jobPrice,
  employeePayPerMow,
  serviceFrequency,
  assignedEmployeeId,
  scheduleId,
  initialCrew,
  employees,
  onCompleted,
}: CompleteJobModalProps) {
  const supabase = createClient()
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [crewRequired, setCrewRequired] = useState(false)
  const [employeeNotes, setEmployeeNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset internal state every time the modal opens
  useEffect(() => {
    if (isOpen) {
      setCrew(initialCrew ?? [])
      setEmployeeNotes('')
      setCrewRequired(false)
    }
  }, [isOpen]) // intentionally excludes initialCrew — value is captured on open

  // Watch sorted crew IDs only so manual payout edits aren't overridden
  const crewIdKey = [...crew].map((c) => c.employee_id).sort().join(',')

  useEffect(() => {
    if (crew.length === 0) return

    const result = calculatePayroll({
      jobPrice,
      employeePayPerMow,
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
  }, [crewIdKey])

  const payrollResult = useMemo(() => {
    if (crew.length === 0) return null
    return calculatePayroll({
      jobPrice,
      employeePayPerMow,
      crew: crew.map((m) => {
        const emp = employees.find((e) => e.id === m.employee_id)
        return { id: m.employee_id, isOwner: emp?.is_owner ?? false, name: emp?.name ?? '' }
      }),
    })
  }, [crewIdKey, jobPrice, employeePayPerMow, employees])

  // ── Auto-scheduling ──────────────────────────────────────────────────────────
  //
  // After completing a recurring job, silently create the next pending job so
  // the crew never has to schedule it manually.
  //
  // Rules:
  //   weekly   → completion date + 7 days
  //   biweekly → completion date + 14 days
  //   monthly  → completion date + 1 calendar month (same day-of-month)
  //   custom / one-time → no auto-schedule
  //
  // Guard: if a pending or rescheduled job for this customer already exists in
  // the future, we skip creation to prevent duplicates.

  async function autoScheduleNext(completedAt: string) {
    if (
      !serviceFrequency ||
      serviceFrequency === 'custom' ||
      serviceFrequency === 'one-time'
    ) {
      return
    }

    const completionDate = parseISO(completedAt.split('T')[0]) // date-only, no TZ shift
    let nextDate: Date

    switch (serviceFrequency) {
      case 'weekly':
        nextDate = addDays(completionDate, 7)
        break
      case 'biweekly':
        nextDate = addDays(completionDate, 14)
        break
      case 'monthly':
        nextDate = addMonths(completionDate, 1)
        break
      default:
        return
    }

    const nextDateStr = format(nextDate, 'yyyy-MM-dd')
    const todayStr = format(new Date(), 'yyyy-MM-dd')

    // Check for an existing future pending/rescheduled job for this customer
    const { data: existing } = await supabase
      .from('jobs')
      .select('id')
      .eq('customer_id', customerId)
      .in('status', ['pending', 'rescheduled'])
      .gte('scheduled_date', todayStr)
      .limit(1)

    if (existing && existing.length > 0) {
      // A future job already exists — skip silently
      return
    }

    const { error } = await supabase.from('jobs').insert({
      customer_id: customerId,
      assigned_employee_id: assignedEmployeeId ?? null,
      schedule_id: scheduleId ?? null,
      scheduled_date: nextDateStr,
      status: 'pending',
      payout_amount: jobPrice ?? null,
    })

    if (!error) {
      const freqLabel =
        serviceFrequency === 'weekly'
          ? 'weekly'
          : serviceFrequency === 'biweekly'
          ? 'bi-weekly'
          : 'monthly'
      toast.success(
        `Next ${freqLabel} job scheduled for ${format(nextDate, 'EEE, MMM d')}`,
        { duration: 4000 }
      )
    }
  }

  // ── Completion save ──────────────────────────────────────────────────────────

  async function markComplete() {
    if (crew.length === 0) {
      setCrewRequired(true)
      return
    }
    setCrewRequired(false)
    setSaving(true)

    const completedAt = new Date().toISOString()
    const totalPayout = crew.reduce((s, m) => s + (parseFloat(m.payout_amount) || 0), 0)
    const primaryEmployeeId = crew[0].employee_id

    // 1. Update the job record
    const { error: jobError } = await supabase
      .from('jobs')
      .update({
        status: 'completed',
        completed_at: completedAt,
        completed_by_id: primaryEmployeeId,
        employee_notes: employeeNotes || null,
        payout_amount: totalPayout || null,
      })
      .eq('id', jobId)

    if (jobError) {
      toast.error('Failed to save job')
      setSaving(false)
      return
    }

    // 2. Replace crew entries (delete + re-insert is idempotent)
    await supabase.from('job_crew').delete().eq('job_id', jobId)

    const { error: crewError } = await supabase.from('job_crew').insert(
      crew.map((m) => ({
        job_id: jobId,
        employee_id: m.employee_id,
        payout_amount: parseFloat(m.payout_amount) || null,
      }))
    )

    if (crewError) {
      setSaving(false)
      toast.error('Job completed but crew save failed — please try again')
      return
    }

    // 3. Auto-schedule the next recurring job (fires async, non-blocking for UX)
    await autoScheduleNext(completedAt)

    setSaving(false)
    toast.success('Job marked as completed!')
    onClose()
    onCompleted()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Complete Job" size="md">
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
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${ruleColor(payrollResult.rule)}`}
              >
                {payrollResult.ruleLabel}
              </span>
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Payroll auto-calculated
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              {payrollResult.summary}
            </p>
            {jobPrice == null && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠ No job price set on this customer — set it on the customer page for accurate payroll.
              </p>
            )}
            {payrollResult.rule === 3 && employeePayPerMow == null && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠ No Employee Pay Per Mow set for this property — edit the customer to set it.
              </p>
            )}
          </div>
        )}

        {/* Auto-schedule hint */}
        {serviceFrequency && serviceFrequency !== 'custom' && serviceFrequency !== 'one-time' && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/40 rounded-lg px-3 py-2">
            <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
            <span>
              Next{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {serviceFrequency === 'weekly'
                  ? 'weekly'
                  : serviceFrequency === 'biweekly'
                  ? 'bi-weekly'
                  : 'monthly'}
              </span>{' '}
              job will be auto-scheduled after completion.
            </span>
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
          <Button variant="outline" className="flex-1" onClick={onClose}>
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
  )
}
