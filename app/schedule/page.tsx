'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, Plus, Cloud, CheckCircle2,
  Clock, X, Calendar, Filter,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Select, Input, Textarea } from '@/components/ui/Input'
import { MobileHeader } from '@/components/nav/MobileNav'
import { CompleteJobModal } from '@/components/jobs/CompleteJobModal'
import { type CrewMember } from '@/components/ui/CrewPicker'
import { formatCurrency } from '@/lib/utils'
import type { Job, Customer, Employee } from '@/types'
import { toast } from 'sonner'
import {
  format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay,
  parseISO, isToday, startOfMonth, endOfMonth, eachDayOfInterval,
} from 'date-fns'

type ViewMode = 'week' | 'day'

function SchedulePageInner() {
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [jobs, setJobs] = useState<Job[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [newJobOpen, setNewJobOpen] = useState(false)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [rainDelayOpen, setRainDelayOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')

  // Complete modal
  const [completeModalOpen, setCompleteModalOpen] = useState(false)
  const [completeModalJob, setCompleteModalJob] = useState<Job | null>(null)
  const [completeModalInitialCrew, setCompleteModalInitialCrew] = useState<CrewMember[]>([])

  const [newJobForm, setNewJobForm] = useState({
    customer_id: searchParams.get('customer') ?? '',
    assigned_employee_id: '',
    scheduled_date: format(new Date(), 'yyyy-MM-dd'),
    payout_amount: '',
    notes: '',
  })

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => {
    loadData()
  }, [currentDate])

  const loadData = useCallback(async () => {
    setLoading(true)
    const start = format(weekStart, 'yyyy-MM-dd')
    const end = format(addDays(weekStart, 6), 'yyyy-MM-dd')

    const [jobsRes, custRes, empRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, customer:customers(id, name, address, city, price, gate_code, employee_pay_per_mow), employee:employees!assigned_employee_id(id, name)')
        .gte('scheduled_date', start)
        .lte('scheduled_date', end)
        .order('scheduled_date'),
      supabase.from('customers').select('id, name, address, price, service_frequency').eq('is_active', true).order('name'),
      supabase.from('employees').select('id, name, is_owner, is_active, default_payout, phone, email, notes, created_at, updated_at').eq('is_active', true).order('name'),
    ])

    setJobs((jobsRes.data ?? []) as Job[])
    setCustomers((custRes.data ?? []) as Customer[])
    setEmployees((empRes.data ?? []) as Employee[])
    setLoading(false)
  }, [currentDate])

  function getJobsForDay(date: Date) {
    const dateStr = format(date, 'yyyy-MM-dd')
    return jobs.filter((j) => j.scheduled_date === dateStr)
  }

  async function createJob() {
    if (!newJobForm.customer_id || !newJobForm.scheduled_date) {
      toast.error('Customer and date are required')
      return
    }
    const customer = customers.find((c) => c.id === newJobForm.customer_id)
    const employee = employees.find((e) => e.id === newJobForm.assigned_employee_id)

    const { error } = await supabase.from('jobs').insert({
      customer_id: newJobForm.customer_id,
      assigned_employee_id: newJobForm.assigned_employee_id || null,
      scheduled_date: newJobForm.scheduled_date,
      payout_amount: newJobForm.payout_amount
        ? parseFloat(newJobForm.payout_amount)
        : (employee?.default_payout ?? customer?.price ?? null),
      notes: newJobForm.notes || null,
      status: 'pending',
    })
    if (error) { toast.error('Failed to create job'); return }
    toast.success('Job scheduled!')
    setNewJobOpen(false)
    setNewJobForm({
      customer_id: '',
      assigned_employee_id: '',
      scheduled_date: format(new Date(), 'yyyy-MM-dd'),
      payout_amount: '',
      notes: '',
    })
    loadData()
  }

  async function updateJobStatus(job: Job, status: Job['status'], reason?: string) {
    const updates: Partial<Job> = {
      status,
      ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      ...(reason ? { skip_reason: reason } : {}),
    }
    const { error } = await supabase.from('jobs').update(updates).eq('id', job.id)
    if (error) { toast.error('Failed to update'); return }
    toast.success(`Job marked ${status}`)
    setSelectedJob(null)
    loadData()
  }

  async function rainDelay(job: Job, newDate: string) {
    const { error } = await supabase.from('jobs').update({
      scheduled_date: newDate,
      original_date: job.scheduled_date,
      is_weather_delayed: true,
      status: 'rescheduled',
    }).eq('id', job.id)
    if (error) { toast.error('Failed to reschedule'); return }
    toast.success('Job rescheduled for rain delay')
    setRainDelayOpen(false)
    setSelectedJob(null)
    loadData()
  }

  function openCompleteModal(job: Job) {
    const jobWithCustomer = job as Job & { customer?: { price?: number; employee_pay_per_mow?: number } }
    const assignedId = job.assigned_employee_id
    const assigned = assignedId ? employees.find((e) => e.id === assignedId) : null
    setCompleteModalInitialCrew(
      assigned
        ? [{ employee_id: assigned.id, payout_amount: assigned.default_payout?.toString() ?? '' }]
        : []
    )
    setCompleteModalJob(job)
    setCompleteModalOpen(true)
    // Close job detail modal if open
    setSelectedJob(null)
  }

  const todayJobs = getJobsForDay(new Date())

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <MobileHeader title="Schedule" />

      {/* Top bar */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3 px-4 lg:px-6 py-3">
          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Schedule</h1>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <button
              onClick={() => setCurrentDate((d) => subWeeks(d, 1))}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
            </button>
            <button
              onClick={() => setCurrentDate((d) => addWeeks(d, 1))}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="flex gap-2">
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {(['week', 'day'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                    viewMode === v
                      ? 'bg-green-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => {
                setNewJobForm((f) => ({ ...f, scheduled_date: format(currentDate, 'yyyy-MM-dd') }))
                setNewJobOpen(true)
              }}
            >
              <span className="hidden sm:inline">Schedule Job</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Week View */}
      {viewMode === 'week' && (
        <div className="flex-1 overflow-x-auto">
          <div className="min-w-full">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-10">
              {weekDays.map((day) => {
                const dayJobs = getJobsForDay(day)
                const completed = dayJobs.filter((j) => j.status === 'completed').length
                return (
                  <div
                    key={day.toISOString()}
                    className={`py-3 px-2 text-center border-r border-gray-100 dark:border-gray-800 last:border-r-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                      isToday(day) ? 'bg-green-50 dark:bg-green-900/10' : ''
                    }`}
                    onClick={() => {
                      setCurrentDate(day)
                      setViewMode('day')
                    }}
                  >
                    <p className={`text-xs font-medium ${isToday(day) ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {format(day, 'EEE')}
                    </p>
                    <p className={`text-base font-bold mt-0.5 ${isToday(day) ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                      {format(day, 'd')}
                    </p>
                    {dayJobs.length > 0 && (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{dayJobs.length}</span>
                        {completed > 0 && (
                          <span className="text-xs text-green-600 dark:text-green-400">({completed}✓)</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Day columns */}
            <div className="grid grid-cols-7 min-h-96">
              {weekDays.map((day) => {
                const dayJobs = getJobsForDay(day)
                return (
                  <div
                    key={day.toISOString()}
                    className={`border-r border-gray-100 dark:border-gray-800 last:border-r-0 p-2 space-y-1.5 min-h-32 ${
                      isToday(day) ? 'bg-green-50/30 dark:bg-green-900/5' : ''
                    }`}
                  >
                    {dayJobs.length === 0 && (
                      <button
                        onClick={() => {
                          setNewJobForm((f) => ({ ...f, scheduled_date: format(day, 'yyyy-MM-dd') }))
                          setNewJobOpen(true)
                        }}
                        className="w-full h-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-center hover:border-green-400 dark:hover:border-green-600 transition-colors opacity-0 hover:opacity-100 group-hover:opacity-100"
                      >
                        <Plus size={12} className="text-gray-400" />
                      </button>
                    )}
                    {dayJobs.map((job) => (
                      <button
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className={`w-full text-left p-2 rounded-lg text-xs transition-all hover:shadow-md ${
                          job.status === 'completed'
                            ? 'bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800'
                            : job.status === 'skipped' || job.status === 'cancelled'
                            ? 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 opacity-60'
                            : job.is_weather_delayed
                            ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                            : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-green-400'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="font-medium text-gray-900 dark:text-white truncate leading-tight">
                            {(job as Job & { customer?: { name: string } }).customer?.name}
                          </p>
                          {job.status === 'completed' && <CheckCircle2 size={10} className="text-green-600 flex-shrink-0 mt-0.5" />}
                          {job.is_weather_delayed && <Cloud size={10} className="text-blue-500 flex-shrink-0 mt-0.5" />}
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {(job as Job & { employee?: { name: string } }).employee?.name ?? 'Unassigned'}
                        </p>
                        {job.payout_amount && (
                          <p className="text-green-600 dark:text-green-400 font-medium mt-0.5">{formatCurrency(job.payout_amount)}</p>
                        )}
                      </button>
                    ))}
                    {dayJobs.length > 0 && (
                      <button
                        onClick={() => {
                          setNewJobForm((f) => ({ ...f, scheduled_date: format(day, 'yyyy-MM-dd') }))
                          setNewJobOpen(true)
                        }}
                        className="w-full h-6 border border-dashed border-gray-200 dark:border-gray-700 rounded text-gray-400 flex items-center justify-center hover:border-green-400 hover:text-green-600 transition-colors text-xs"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Day View */}
      {viewMode === 'day' && (
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-2xl mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentDate((d) => addDays(d, -1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <ChevronLeft size={18} />
              </button>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {isToday(currentDate) ? 'Today — ' : ''}{format(currentDate, 'EEEE, MMM d')}
              </h2>
              <button onClick={() => setCurrentDate((d) => addDays(d, 1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
            <Button
              size="sm"
              icon={<Plus size={15} />}
              onClick={() => {
                setNewJobForm((f) => ({ ...f, scheduled_date: format(currentDate, 'yyyy-MM-dd') }))
                setNewJobOpen(true)
              }}
            >
              Add Job
            </Button>
          </div>

          {getJobsForDay(currentDate).length === 0 ? (
            <div className="text-center py-16">
              <Calendar className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No jobs scheduled</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                icon={<Plus size={15} />}
                onClick={() => {
                  setNewJobForm((f) => ({ ...f, scheduled_date: format(currentDate, 'yyyy-MM-dd') }))
                  setNewJobOpen(true)
                }}
              >
                Schedule a Job
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {getJobsForDay(currentDate).map((job, idx) => (
                <div
                  key={job.id}
                  className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 cursor-pointer hover:border-green-400 dark:hover:border-green-600 transition-all"
                  onClick={() => setSelectedJob(job)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {(job as Job & { customer?: { name: string } }).customer?.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                          {(job as Job & { customer?: { address: string } }).customer?.address}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {(job as Job & { employee?: { name: string } }).employee?.name ?? 'Unassigned'}
                        </p>
                        {(job as Job & { customer?: { gate_code?: string } }).customer?.gate_code && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 font-mono mt-1">
                            Gate: {(job as Job & { customer?: { gate_code?: string } }).customer?.gate_code}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <StatusBadge status={job.status} />
                      {job.payout_amount && (
                        <p className="text-sm font-bold text-green-600 dark:text-green-400 mt-1">{formatCurrency(job.payout_amount)}</p>
                      )}
                    </div>
                  </div>
                  {job.notes && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 pl-10 italic">{job.notes}</p>
                  )}
                  {/* Action buttons */}
                  {job.status === 'pending' && (
                    <div className="flex gap-2 mt-3 pl-10">
                      <Button
                        size="sm"
                        variant="primary"
                        className="flex-1"
                        icon={<CheckCircle2 size={14} />}
                        onClick={(e) => { e.stopPropagation(); openCompleteModal(job) }}
                      >
                        Complete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Cloud size={14} />}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedJob(job)
                          setRainDelayOpen(true)
                        }}
                      >
                        Rain
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<X size={14} />}
                        onClick={(e) => { e.stopPropagation(); updateJobStatus(job, 'skipped', 'Skipped') }}
                      >
                        Skip
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Job Modal */}
      <Modal isOpen={newJobOpen} onClose={() => setNewJobOpen(false)} title="Schedule a Job" size="md">
        <div className="p-5 space-y-4">
          <Select
            label="Customer *"
            value={newJobForm.customer_id}
            onChange={(e) => {
              const customer = customers.find((c) => c.id === e.target.value)
              setNewJobForm((f) => ({
                ...f,
                customer_id: e.target.value,
                payout_amount: customer?.price?.toString() ?? f.payout_amount,
              }))
            }}
          >
            <option value="">Select a customer...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select
            label="Assign Employee"
            value={newJobForm.assigned_employee_id}
            onChange={(e) => {
              const emp = employees.find((em) => em.id === e.target.value)
              setNewJobForm((f) => ({
                ...f,
                assigned_employee_id: e.target.value,
                payout_amount: emp?.default_payout?.toString() ?? f.payout_amount,
              }))
            }}
          >
            <option value="">Unassigned</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </Select>
          <Input
            label="Date *"
            type="date"
            value={newJobForm.scheduled_date}
            onChange={(e) => setNewJobForm((f) => ({ ...f, scheduled_date: e.target.value }))}
          />
          <Input
            label="Payout Amount ($)"
            type="number"
            step="0.01"
            placeholder="35.00"
            value={newJobForm.payout_amount}
            onChange={(e) => setNewJobForm((f) => ({ ...f, payout_amount: e.target.value }))}
            hint="Leave blank to use customer price or employee default"
          />
          <Textarea
            label="Notes"
            placeholder="Any special instructions..."
            value={newJobForm.notes}
            onChange={(e) => setNewJobForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
          />
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setNewJobOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={createJob}>Schedule Job</Button>
          </div>
        </div>
      </Modal>

      {/* Job Detail Modal */}
      {selectedJob && !rainDelayOpen && (
        <Modal isOpen={!!selectedJob} onClose={() => setSelectedJob(null)} title="Job Details" size="md">
          <div className="p-5 space-y-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Customer</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {(selectedJob as Job & { customer?: { name: string } }).customer?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Date</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {format(parseISO(selectedJob.scheduled_date), 'EEEE, MMM d, yyyy')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Employee</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {(selectedJob as Job & { employee?: { name: string } }).employee?.name ?? 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Payout</span>
                <span className="text-sm font-bold text-green-600">{formatCurrency(selectedJob.payout_amount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">Status</span>
                <StatusBadge status={selectedJob.status} />
              </div>
            </div>

            {selectedJob.notes && (
              <p className="text-sm text-gray-600 dark:text-gray-400 italic">{selectedJob.notes}</p>
            )}

            {selectedJob.status === 'pending' && (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  icon={<CheckCircle2 size={16} />}
                  onClick={() => openCompleteModal(selectedJob)}
                >
                  Mark Completed
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  icon={<Cloud size={16} />}
                  onClick={() => setRainDelayOpen(true)}
                >
                  Rain Delay — Reschedule
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-red-500"
                  icon={<X size={16} />}
                  onClick={() => updateJobStatus(selectedJob, 'skipped', 'Customer skipped')}
                >
                  Skip Job
                </Button>
              </div>
            )}

            <div className="flex gap-3">
              <Link href={`/jobs/${selectedJob.id}`} className="flex-1">
                <Button variant="outline" className="w-full">View Full Details</Button>
              </Link>
            </div>
          </div>
        </Modal>
      )}

      {/* Complete Job Modal */}
      {completeModalJob && (
        <CompleteJobModal
          isOpen={completeModalOpen}
          onClose={() => setCompleteModalOpen(false)}
          jobId={completeModalJob.id}
          jobPrice={(completeModalJob as Job & { customer?: { price?: number } }).customer?.price ?? null}
          employeePayPerMow={(completeModalJob as Job & { customer?: { employee_pay_per_mow?: number } }).customer?.employee_pay_per_mow ?? null}
          initialCrew={completeModalInitialCrew}
          employees={employees}
          onCompleted={() => { setCompleteModalJob(null); loadData() }}
        />
      )}

      {/* Rain Delay Modal */}
      <Modal isOpen={rainDelayOpen && !!selectedJob} onClose={() => { setRainDelayOpen(false) }} title="Rain Delay — Reschedule" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Move this job to a new date due to weather. The original date will be recorded.
          </p>
          <Input
            label="New Date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setRainDelayOpen(false)}>Cancel</Button>
            <Button
              className="flex-1"
              icon={<Cloud size={15} />}
              onClick={() => {
                if (selectedJob && selectedDate) rainDelay(selectedJob, selectedDate)
              }}
            >
              Reschedule
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function SchedulePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950"><div className="animate-pulse text-gray-400">Loading...</div></div>}>
      <SchedulePageInner />
    </Suspense>
  )
}
