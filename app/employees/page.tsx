'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Phone, Mail, DollarSign, Briefcase } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea } from '@/components/ui/Input'
import { MobileHeader } from '@/components/nav/MobileNav'
import { formatCurrency, formatPhone } from '@/lib/utils'
import type { Employee } from '@/types'
import { toast } from 'sonner'

export default function EmployeesPage() {
  const supabase = createClient()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [jobCounts, setJobCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', default_payout: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data: emps } = await supabase.from('employees').select('*').order('name')
    setEmployees((emps ?? []) as Employee[])

    // Get completed job counts this month
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const { data: jobs } = await supabase
      .from('jobs')
      .select('assigned_employee_id')
      .eq('status', 'completed')
      .gte('scheduled_date', monthStart.toISOString().split('T')[0])

    const counts: Record<string, number> = {}
    for (const job of jobs ?? []) {
      if (job.assigned_employee_id) {
        counts[job.assigned_employee_id] = (counts[job.assigned_employee_id] ?? 0) + 1
      }
    }
    setJobCounts(counts)
    setLoading(false)
  }

  async function addEmployee() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const { error } = await supabase.from('employees').insert({
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      default_payout: form.default_payout ? parseFloat(form.default_payout) : null,
      notes: form.notes || null,
      is_active: true,
    })
    setSaving(false)
    if (error) { toast.error('Failed to add employee'); return }
    toast.success('Employee added!')
    setAddOpen(false)
    setForm({ name: '', phone: '', email: '', default_payout: '', notes: '' })
    loadData()
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <MobileHeader title="Employees" />

      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Employees</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{employees.length} team members</p>
          </div>
          <Button size="sm" icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
            Add Employee
          </Button>
        </div>
      </div>

      <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Briefcase className="h-8 w-8 text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 font-medium">No employees yet</p>
            <Button className="mt-4" icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
              Add First Employee
            </Button>
          </div>
        ) : (
          employees.map((emp) => (
            <Link
              key={emp.id}
              href={`/employees/${emp.id}`}
              className="block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-green-400 dark:hover:border-green-600 hover:shadow-sm transition-all p-4"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-lg">
                    {emp.name.split(' ').map((n) => n[0]).slice(0, 1).join('')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{emp.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {emp.phone && (
                          <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Phone size={12} /> {formatPhone(emp.phone)}
                          </span>
                        )}
                        {emp.email && (
                          <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Mail size={12} /> {emp.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant={emp.is_active ? 'green' : 'gray'}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 dark:border-gray-800">
                    <div className="flex items-center gap-1.5">
                      <DollarSign size={13} className="text-green-600" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {emp.default_payout ? <strong>{formatCurrency(emp.default_payout)}</strong> : 'No default payout'} /job
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Briefcase size={13} className="text-blue-600" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        <strong>{jobCounts[emp.id] ?? 0}</strong> jobs this month
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Add Employee Modal */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add Employee" size="md">
        <div className="p-5 space-y-4">
          <Input label="Full Name *" placeholder="Carlos Rivera" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" type="tel" placeholder="555-1234" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            <Input label="Email" type="email" placeholder="carlos@email.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <Input
            label="Default Payout Per Job ($)"
            type="number"
            step="0.01"
            placeholder="35.00"
            value={form.default_payout}
            onChange={(e) => setForm((f) => ({ ...f, default_payout: e.target.value }))}
            hint="This can be overridden per job"
          />
          <Textarea label="Notes" placeholder="Any notes about this employee..." value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="flex-1" loading={saving} onClick={addEmployee}>Add Employee</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
