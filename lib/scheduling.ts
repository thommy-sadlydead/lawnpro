import { addDays, addMonths, format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceFrequency } from '@/types'

interface ScheduleNextOptions {
  supabase: SupabaseClient
  completedAt: string          // UTC ISO timestamp
  customerId: string
  serviceFrequency: ServiceFrequency | null
  assignedEmployeeId: string | null
  scheduleId: string | null | undefined
  jobPrice: number | null
}

/**
 * Creates the next pending job for a recurring customer after a completion.
 *
 * Guarantees:
 * - Uses the LOCAL calendar date of completion (not the UTC date).
 * - Only creates a job if none already exists within the next recurrence window.
 * - Surfaces insert failures as an error toast instead of silently swallowing them.
 */
export async function scheduleNextRecurring({
  supabase,
  completedAt,
  customerId,
  serviceFrequency,
  assignedEmployeeId,
  scheduleId,
  jobPrice,
}: ScheduleNextOptions): Promise<void> {
  if (
    !serviceFrequency ||
    serviceFrequency === 'custom' ||
    serviceFrequency === 'one-time'
  ) {
    return
  }

  // Convert the UTC timestamp to the local calendar date.
  // completedAt.split('T')[0] would give the UTC date, which is wrong for
  // completions after local midnight-offset (e.g. 7 pm CDT = 0 am UTC next day).
  const localCompletionStr = format(new Date(completedAt), 'yyyy-MM-dd')
  const completionDate = parseISO(localCompletionStr)

  let nextDate: Date
  let intervalDays: number

  switch (serviceFrequency) {
    case 'weekly':
      nextDate    = addDays(completionDate, 7)
      intervalDays = 7
      break
    case 'biweekly':
      nextDate    = addDays(completionDate, 14)
      intervalDays = 14
      break
    case 'monthly':
      nextDate    = addMonths(completionDate, 1)
      intervalDays = 31
      break
    default:
      return
  }

  const nextDateStr  = format(nextDate, 'yyyy-MM-dd')
  // Window: [nextDate, nextDate + interval). Only block if a pending/rescheduled
  // job already exists inside this window — avoids blocking on unrelated future
  // jobs (one-time extras, manually pre-scheduled jobs outside the window, etc.).
  const windowEndStr = format(addDays(nextDate, intervalDays), 'yyyy-MM-dd')

  const { data: existing } = await supabase
    .from('jobs')
    .select('id')
    .eq('customer_id', customerId)
    .in('status', ['pending', 'rescheduled'])
    .gte('scheduled_date', nextDateStr)
    .lt('scheduled_date', windowEndStr)
    .limit(1)

  if (existing && existing.length > 0) {
    // A job for the next recurrence already exists — no duplicate needed.
    return
  }

  const { error } = await supabase.from('jobs').insert({
    customer_id:          customerId,
    assigned_employee_id: assignedEmployeeId ?? null,
    schedule_id:          scheduleId ?? null,
    scheduled_date:       nextDateStr,
    status:               'pending',
    payout_amount:        jobPrice ?? null,
  })

  if (error) {
    console.error('[scheduleNextRecurring] insert failed:', error)
    toast.error(
      'Job completed but the next recurring job could not be scheduled — please add it manually.',
      { duration: 6000 }
    )
    return
  }

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
