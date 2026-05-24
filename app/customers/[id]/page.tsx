'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Phone, Mail, MapPin, Lock, Edit2, Trash2,
  Calendar, FileText, Plus, DollarSign, Clock, CheckCircle2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusBadge, Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { formatCurrency, formatPhone, formatDate, getFrequencyLabel } from '@/lib/utils'
import type { Customer, Job, Invoice } from '@/types'
import { toast } from 'sonner'

export default function CustomerDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Customer>>({})
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'history' | 'invoices'>('history')

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    setLoading(true)
    const [custRes, jobsRes, invRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase.from('jobs')
        .select('*, employee:employees!assigned_employee_id(id, name)')
        .eq('customer_id', id)
        .order('scheduled_date', { ascending: false })
        .limit(20),
      supabase.from('invoices').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
    ])
    if (custRes.data) {
      setCustomer(custRes.data as Customer)
      setEditForm(custRes.data as Customer)
    }
    setJobs((jobsRes.data ?? []) as Job[])
    setInvoices((invRes.data ?? []) as Invoice[])
    setLoading(false)
  }

  async function saveEdit() {
    if (!customer) return
    setSaving(true)
    const { error } = await supabase.from('customers').update({
      name: editForm.name,
      address: editForm.address,
      city: editForm.city,
      state: editForm.state,
      zip: editForm.zip,
      phone: editForm.phone,
      email: editForm.email,
      price: editForm.price,
      service_frequency: editForm.service_frequency,
      gate_code: editForm.gate_code,
      service_notes: editForm.service_notes,
      general_notes: editForm.general_notes,
    }).eq('id', customer.id)
    setSaving(false)
    if (error) { toast.error('Failed to save'); return }
    toast.success('Customer updated')
    setEditOpen(false)
    loadData()
  }

  async function toggleActive() {
    if (!customer) return
    const { error } = await supabase
      .from('customers')
      .update({ is_active: !customer.is_active })
      .eq('id', customer.id)
    if (!error) {
      toast.success(customer.is_active ? 'Customer deactivated' : 'Customer reactivated')
      loadData()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">Customer not found</p>
        <Link href="/customers"><Button variant="outline">Back to Customers</Button></Link>
      </div>
    )
  }

  const completedJobs = jobs.filter((j) => j.status === 'completed')
  const totalRevenue = completedJobs.reduce((sum, j) => sum + (j.payout_amount ?? customer.price ?? 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/customers">
              <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <ArrowLeft size={18} />
              </button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{customer.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant={customer.is_active ? 'green' : 'gray'}>
                  {customer.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <Badge variant={customer.service_frequency === 'weekly' ? 'blue' : 'default'}>
                  {getFrequencyLabel(customer.service_frequency)}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<Edit2 size={15} />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
        {/* Info Cards Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Contact */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Contact</h3>
            <div className="space-y-2">
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-green-600 transition-colors">
                  <Phone size={14} className="text-gray-400 flex-shrink-0" />
                  {formatPhone(customer.phone)}
                </a>
              )}
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-green-600 transition-colors">
                  <Mail size={14} className="text-gray-400 flex-shrink-0" />
                  {customer.email}
                </a>
              )}
              {customer.address && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(`${customer.address} ${customer.city ?? ''} ${customer.state ?? ''}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-green-600 transition-colors"
                >
                  <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <span>{customer.address}{customer.city ? `, ${customer.city}` : ''}{customer.state ? `, ${customer.state}` : ''}</span>
                </a>
              )}
            </div>
          </div>

          {/* Service */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Service</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Price</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(customer.price)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Frequency</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{getFrequencyLabel(customer.service_frequency)}</span>
              </div>
              {customer.gate_code && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Lock size={12} /> Gate Code
                  </span>
                  <span className="text-sm font-mono font-bold text-green-600 dark:text-green-400">{customer.gate_code}</span>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Stats</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1"><CheckCircle2 size={12} /> Completed</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{completedJobs.length} jobs</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1"><DollarSign size={12} /> Revenue</span>
                <span className="text-sm font-bold text-green-600">{formatCurrency(totalRevenue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1"><FileText size={12} /> Invoices</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{invoices.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {(customer.service_notes || customer.general_notes) && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            {customer.service_notes && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Service Notes</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">{customer.service_notes}</p>
              </div>
            )}
            {customer.general_notes && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">General Notes</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">{customer.general_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Quick actions */}
        <div className="flex gap-3">
          <Link href={`/schedule?customer=${id}`} className="flex-1">
            <Button variant="outline" className="w-full" size="sm" icon={<Plus size={15} />}>Schedule Job</Button>
          </Link>
          <Link href={`/invoices/new?customer=${id}`} className="flex-1">
            <Button className="w-full" size="sm" icon={<FileText size={15} />}>New Invoice</Button>
          </Link>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="flex border-b border-gray-100 dark:border-gray-800">
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'text-green-600 dark:text-green-400 border-b-2 border-green-600'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Job History ({jobs.length})
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'invoices'
                  ? 'text-green-600 dark:text-green-400 border-b-2 border-green-600'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Invoices ({invoices.length})
            </button>
          </div>

          {activeTab === 'history' && (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {jobs.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">No service history yet</div>
              ) : (
                jobs.map((job) => (
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
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(job.scheduled_date)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {(job as Job & { employee?: { name: string } }).employee?.name ?? 'Unassigned'}
                        {job.notes && ` · ${job.notes}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <StatusBadge status={job.status} />
                      {job.payout_amount && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatCurrency(job.payout_amount)}</p>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}

          {activeTab === 'invoices' && (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {invoices.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">No invoices yet</div>
              ) : (
                invoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{inv.invoice_number}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Created {formatDate(inv.created_at)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(inv.total)}</p>
                      <StatusBadge status={inv.status} />
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Account</h3>
          <Button
            variant={customer.is_active ? 'danger' : 'outline'}
            size="sm"
            onClick={toggleActive}
          >
            {customer.is_active ? 'Deactivate Customer' : 'Reactivate Customer'}
          </Button>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit Customer" size="lg">
        <div className="p-5 space-y-4">
          <Input label="Full Name *" value={editForm.name ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" value={editForm.phone ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
            <Input label="Email" value={editForm.email ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <Input label="Address" value={editForm.address ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="City" value={editForm.city ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))} />
            <Input label="State" value={editForm.state ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))} />
            <Input label="ZIP" value={editForm.zip ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, zip: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Price ($)" type="number" step="0.01" value={editForm.price?.toString() ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, price: parseFloat(e.target.value) }))} />
            <Select label="Frequency" value={editForm.service_frequency ?? 'biweekly'} onChange={(e) => setEditForm((f) => ({ ...f, service_frequency: e.target.value as Customer['service_frequency'] }))}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-Weekly</option>
              <option value="custom">Custom</option>
              <option value="one-time">One-Time</option>
            </Select>
          </div>
          <Input label="Gate Code" value={editForm.gate_code ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, gate_code: e.target.value }))} />
          <Textarea label="Service Notes" value={editForm.service_notes ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, service_notes: e.target.value }))} rows={3} />
          <Textarea label="General Notes" value={editForm.general_notes ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, general_notes: e.target.value }))} rows={2} />
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="flex-1" loading={saving} onClick={saveEdit}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
