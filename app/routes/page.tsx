'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Map, ChevronLeft, ChevronRight, CheckCircle2, Clock, MapPin, Phone, Lock, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { MobileHeader } from '@/components/nav/MobileNav'
import { formatPhone, formatCurrency } from '@/lib/utils'
import type { Job, Employee } from '@/types'
import { format, addDays, subDays, isToday } from 'date-fns'

export default function RoutesPage() {
  const supabase = createClient()
  const [date, setDate] = useState(new Date())
  const [jobs, setJobs] = useState<Job[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all')

  useEffect(() => {
    loadData()
  }, [date])

  async function loadData() {
    setLoading(true)
    const dateStr = format(date, 'yyyy-MM-dd')

    const [jobsRes, empRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, customer:customers(id, name, address, city, state, zip, phone, gate_code, service_notes, price), employee:employees!assigned_employee_id(id, name)')
        .eq('scheduled_date', dateStr)
        .order('customer_id'),
      supabase.from('employees').select('id, name').eq('is_active', true).order('name'),
    ])

    setJobs((jobsRes.data ?? []) as Job[])
    setEmployees((empRes.data ?? []) as Employee[])
    setLoading(false)
  }

  async function toggleComplete(job: Job) {
    const newStatus = job.status === 'completed' ? 'pending' : 'completed'
    await supabase.from('jobs').update({
      status: newStatus,
      ...(newStatus === 'completed' ? { completed_at: new Date().toISOString() } : { completed_at: null }),
    }).eq('id', job.id)
    setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, status: newStatus } : j))
  }

  const filteredJobs = selectedEmployee === 'all'
    ? jobs
    : jobs.filter((j) => j.assigned_employee_id === selectedEmployee)

  const completedCount = filteredJobs.filter((j) => j.status === 'completed').length
  const totalPayout = filteredJobs.filter((j) => j.status === 'completed').reduce((sum, j) => sum + (j.payout_amount ?? 0), 0)

  function openAllInMaps() {
    const firstJob = filteredJobs[0]
    if (!firstJob) return
    const c = (firstJob as Job & { customer?: { address?: string; city?: string; state?: string } }).customer
    const addr = [c?.address, c?.city, c?.state].filter(Boolean).join(', ')
    if (addr) window.open(`https://maps.google.com/maps?q=${encodeURIComponent(addr)}`, '_blank')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <MobileHeader title="Routes" />

      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3 px-4 lg:px-6 py-4">
          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Route Manager</h1>
          </div>

          {/* Date nav */}
          <div className="flex items-center gap-2 flex-1">
            <button onClick={() => setDate((d) => subDays(d, 1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setDate(new Date())}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              {isToday(date) ? 'Today' : format(date, 'EEE, MMM d')}
            </button>
            <button onClick={() => setDate((d) => addDays(d, 1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>

          {filteredJobs.length > 0 && (
            <Button variant="outline" size="sm" icon={<ExternalLink size={14} />} onClick={openAllInMaps}>
              Maps
            </Button>
          )}
        </div>

        {/* Employee filter */}
        {employees.length > 1 && (
          <div className="flex gap-2 px-4 lg:px-6 pb-3 overflow-x-auto">
            <button
              onClick={() => setSelectedEmployee('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedEmployee === 'all'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              All Employees
            </button>
            {employees.map((emp) => (
              <button
                key={emp.id}
                onClick={() => setSelectedEmployee(emp.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedEmployee === emp.id
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {emp.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {filteredJobs.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-500 dark:text-gray-400">
              {completedCount} of {filteredJobs.length} complete
            </span>
            <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(totalPayout)} earned</span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-600 rounded-full transition-all duration-300"
              style={{ width: filteredJobs.length > 0 ? `${(completedCount / filteredJobs.length) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-20">
            <Map className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">No jobs scheduled</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              {isToday(date) ? 'No jobs today' : `No jobs on ${format(date, 'EEEE, MMMM d')}`}
            </p>
            <Link href="/schedule">
              <Button variant="outline" className="mt-4">Go to Schedule</Button>
            </Link>
          </div>
        ) : (
          filteredJobs.map((job, idx) => {
            const customer = (job as Job & { customer?: { id: string; name: string; address?: string; city?: string; state?: string; phone?: string; gate_code?: string; service_notes?: string; price?: number } }).customer
            const employee = (job as Job & { employee?: { name: string } }).employee
            const isCompleted = job.status === 'completed'

            return (
              <div
                key={job.id}
                className={`bg-white dark:bg-gray-900 rounded-xl border transition-all ${
                  isCompleted
                    ? 'border-green-200 dark:border-green-800 opacity-80'
                    : 'border-gray-200 dark:border-gray-800'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Stop number */}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      isCompleted
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}>
                      {isCompleted ? <CheckCircle2 size={16} /> : idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/customers/${job.customer_id}`}>
                            <p className={`font-bold text-gray-900 dark:text-white hover:text-green-600 transition-colors ${isCompleted ? 'line-through decoration-green-500' : ''}`}>
                              {customer?.name}
                            </p>
                          </Link>
                          {customer?.address && (
                            <a
                              href={`https://maps.google.com/?q=${encodeURIComponent(`${customer.address} ${customer.city ?? ''} ${customer.state ?? ''}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 mt-0.5 hover:text-green-600 transition-colors"
                            >
                              <MapPin size={12} className="text-gray-400 flex-shrink-0" />
                              <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                {customer.address}{customer.city ? `, ${customer.city}` : ''}
                              </span>
                              <ExternalLink size={10} className="text-gray-400 flex-shrink-0" />
                            </a>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            {customer?.phone && (
                              <a href={`tel:${customer.phone}`} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-green-600">
                                <Phone size={11} /> {formatPhone(customer.phone)}
                              </a>
                            )}
                            {employee && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">{employee.name}</span>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>

                      {/* Gate code highlight */}
                      {customer?.gate_code && (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <Lock size={11} className="text-amber-600" />
                          <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400">
                            Gate: {customer.gate_code}
                          </span>
                        </div>
                      )}

                      {/* Service notes */}
                      {customer?.service_notes && (
                        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 italic line-clamp-2">
                          {customer.service_notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Complete toggle */}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => toggleComplete(job)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isCompleted
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-700 dark:hover:text-green-400'
                      }`}
                    >
                      {isCompleted ? (
                        <>
                          <CheckCircle2 size={15} />
                          Completed — tap to undo
                        </>
                      ) : (
                        <>
                          <Clock size={15} />
                          Mark Complete
                        </>
                      )}
                    </button>
                    <Link href={`/jobs/${job.id}`}>
                      <button className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        Details
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
