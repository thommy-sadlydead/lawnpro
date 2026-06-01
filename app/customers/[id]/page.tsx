'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Phone, Mail, MapPin, Lock, Edit2, Trash2,
  FileText, Plus, DollarSign, CheckCircle2,
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
  const [deleteCustomerOpen, setDeleteCustomerOpen] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Customer>>({})
  const [saving, setSaving] = useState(false)
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null)
  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'history' | 'invoices'>('history')

  // Inline payroll editing
  const [editingPayPerMow, setEditingPayPerMow] = useState(false)
  const [payPerMowInput, setPayPerMowInput] = useState('')
  const [savingPayPerMow, setSavingPayPerMow] = useState(false)

  const [editingPrice, setEditingPrice] = useState(false)
  const [priceInput, setPriceInput] = useState('')
  const [savingPrice, setSavingPrice] = useState(false)

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
      employee_pay_per_mow: editForm.employee_pay_per_mow ?? null,
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

  async function savePrice() {
    if (!customer) return
    setSavingPrice(true)
    const value = priceInput.trim() === '' ? null : parseFloat(priceInput)
    const { error } = await supabase
      .from('customers')
      .update({ price: value })
      .eq('id', customer.id)
    setSavingPrice(false)
    if (error) { toast.error('Failed to save'); return }
    toast.success('Job price updated')
    setEditingPrice(false)
    setCustomer((c) => c ? { ...c, price: value } : c)
  }

  async function savePayPerMow() {
    if (!customer) return
    setSavingPayPerMow(true)
    const value = payPerMowInput.trim() === '' ? null : parseFloat(payPerMowInput)
    const { error } = await supabase
      .from('customers')
      .update({ employee_pay_per_mow: value })
      .eq('id', customer.id)
    setSavingPayPerMow(false)
    if (error) { toast.error('Failed to save'); return }
    toast.success('Pay rate updated')
    setEditingPayPerMow(false)
    // Optimistically update local state
    setCustomer((c) => c ? { ...c, employee_pay_per_mow: value } : c)
  }

  async function deleteCustomer() {
    if (!customer) return
    setSaving(true)
    // CASCADE deletes jobs, schedules, invoices automatically
    const { error } = await supabase.from('customers').delete().eq('id', customer.id)
    setSaving(false)
    if (error) { toast.error('Failed to delete customer'); return }
    toast.success(`${customer.name} deleted`)
    router.replace('/customers')
  }

  async function deleteJob(jobId: string) {
    setDeletingJobId(jobId)
    const { error } = await supabase.from('jobs').delete().eq('id', jobId)
    setDeletingJobId(null)
    setConfirmDeleteJobId(null)
    if (error) { toast.error('Failed to delete job'); return }
    toast.success('Job deleted')
    setJobs((prev) => prev.filter((j) => j.id !== jobId))
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
              {customer.employee_pay_per_mow != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <DollarSign size={12} /> Employee Pay/Mow
                  </span>
                  <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{formatCurrency(customer.employee_pay_per_mow)}</span>
                </div>
              )}
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

        {/* ── Payroll Rules ─────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Payroll Rules
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Tap any value to edit — rules update instantly
            </p>
          </div>

          <div className="p-4 space-y-4">
            {/* ── Two editable fields side by side ───────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Job Price */}
              <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Job Price</p>
                {editingPrice ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-400">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        autoFocus
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') savePrice()
                          if (e.key === 'Escape') setEditingPrice(false)
                        }}
                        placeholder="0.00"
                        className="w-full text-base font-bold text-right px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={savePrice}
                        disabled={savingPrice}
                        className="flex-1 py-1 text-xs font-semibold bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        {savingPrice ? '…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingPrice(false)}
                        className="flex-1 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setPriceInput(customer.price?.toString() ?? ''); setEditingPrice(true) }}
                    className="w-full flex items-center justify-between group"
                  >
                    <span className={`text-xl font-bold ${customer.price != null ? 'text-green-600 dark:text-green-400' : 'text-gray-300 dark:text-gray-600'}`}>
                      {customer.price != null ? formatCurrency(customer.price) : '—'}
                    </span>
                    <span className="text-[10px] text-gray-400 group-hover:text-green-600 dark:group-hover:text-green-400 border border-gray-200 dark:border-gray-700 group-hover:border-green-400 px-1.5 py-0.5 rounded-md transition-colors flex items-center gap-0.5">
                      <Edit2 size={9} /> Edit
                    </span>
                  </button>
                )}
              </div>

              {/* Employee Pay Per Mow */}
              <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Employee Pay/Mow</p>
                {editingPayPerMow ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-400">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        autoFocus
                        value={payPerMowInput}
                        onChange={(e) => setPayPerMowInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') savePayPerMow()
                          if (e.key === 'Escape') setEditingPayPerMow(false)
                        }}
                        placeholder="0.00"
                        className="w-full text-base font-bold text-right px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={savePayPerMow}
                        disabled={savingPayPerMow}
                        className="flex-1 py-1 text-xs font-semibold bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        {savingPayPerMow ? '…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingPayPerMow(false)}
                        className="flex-1 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setPayPerMowInput(customer.employee_pay_per_mow?.toString() ?? ''); setEditingPayPerMow(true) }}
                    className="w-full flex items-center justify-between group"
                  >
                    <span className={`text-xl font-bold ${customer.employee_pay_per_mow != null ? 'text-purple-600 dark:text-purple-400' : 'text-gray-300 dark:text-gray-600'}`}>
                      {customer.employee_pay_per_mow != null ? formatCurrency(customer.employee_pay_per_mow) : '—'}
                    </span>
                    <span className="text-[10px] text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 border border-gray-200 dark:border-gray-700 group-hover:border-purple-400 px-1.5 py-0.5 rounded-md transition-colors flex items-center gap-0.5">
                      <Edit2 size={9} /> Edit
                    </span>
                  </button>
                )}
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">Used in Rule 3 only</p>
              </div>
            </div>

            {/* ── Rule breakdown (live, driven by values above) ───────── */}
            <div className="space-y-2">
              {/* Rule 1 */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-900/15 border border-green-100 dark:border-green-900/40">
                <span className="flex-shrink-0 text-[10px] font-bold bg-green-600 text-white px-1.5 py-0.5 rounded-full mt-0.5">R1</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-green-800 dark:text-green-300">Christian works alone</p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                    Christian receives{' '}
                    <strong>{customer.price != null ? formatCurrency(customer.price) : '—'}</strong>
                    {customer.price != null ? ' (100%)' : ' — set job price to calculate'}
                  </p>
                </div>
              </div>

              {/* Rule 2 */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-900/40">
                <span className="flex-shrink-0 text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full mt-0.5">R2</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Employee alone — no Christian</p>
                  {customer.price != null ? (
                    <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                      Employee gets <strong>{formatCurrency(customer.price * 0.5)}</strong>
                      {' '}· Christian gets <strong>{formatCurrency(customer.price * 0.5)}</strong>
                      {' '}(50 / 50)
                    </p>
                  ) : (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">50 / 50 split — set job price to see amounts</p>
                  )}
                  <p className="text-[10px] text-blue-400 dark:text-blue-500 mt-1">Employee Pay/Mow ignored for this rule</p>
                </div>
              </div>

              {/* Rule 3 */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-purple-50 dark:bg-purple-900/15 border border-purple-100 dark:border-purple-900/40">
                <span className="flex-shrink-0 text-[10px] font-bold bg-purple-600 text-white px-1.5 py-0.5 rounded-full mt-0.5">R3</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-purple-800 dark:text-purple-300">Christian + employees</p>
                  {customer.price != null && customer.employee_pay_per_mow != null ? (
                    <div className="mt-1 space-y-1">
                      <div className="flex items-center justify-between text-xs text-purple-700 dark:text-purple-400">
                        <span>+ 1 employee</span>
                        <span>
                          <strong>{formatCurrency(customer.employee_pay_per_mow)}</strong> to employee
                          {' '}· <strong>{formatCurrency(customer.price - customer.employee_pay_per_mow)}</strong> to Christian
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-purple-700 dark:text-purple-400">
                        <span>+ 2 employees</span>
                        <span>
                          <strong>{formatCurrency(customer.employee_pay_per_mow / 2)}</strong> each
                          {' '}· <strong>{formatCurrency(customer.price - customer.employee_pay_per_mow)}</strong> to Christian
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-purple-700 dark:text-purple-400">
                        <span>+ 3 employees</span>
                        <span>
                          <strong>{formatCurrency(customer.employee_pay_per_mow / 3)}</strong> each
                          {' '}· <strong>{formatCurrency(customer.price - customer.employee_pay_per_mow)}</strong> to Christian
                        </span>
                      </div>
                    </div>
                  ) : customer.employee_pay_per_mow == null && customer.price != null ? (
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                      Set <strong>Employee Pay/Mow</strong> above to calculate
                    </p>
                  ) : customer.price == null ? (
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                      Set <strong>Job Price</strong> above to calculate
                    </p>
                  ) : null}
                </div>
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
                jobs.map((job) => {
                  const isConfirming = confirmDeleteJobId === job.id
                  const isDeleting = deletingJobId === job.id
                  return (
                    <div key={job.id} className="relative">
                      {/* Inline confirm overlay */}
                      {isConfirming && (
                        <div className="absolute inset-0 z-10 flex items-center justify-between gap-3 px-4 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700">
                          <p className="text-xs font-medium text-red-700 dark:text-red-300">
                            Delete {formatDate(job.scheduled_date)} job?
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setConfirmDeleteJobId(null)}
                              className="px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => deleteJob(job.id)}
                              disabled={isDeleting}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-600 text-white disabled:opacity-50"
                            >
                              {isDeleting ? '…' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      )}
                      <div className={`flex items-center gap-3 px-4 py-3 transition-colors ${isConfirming ? 'opacity-0' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          job.status === 'completed' ? 'bg-green-500' :
                          job.status === 'pending' ? 'bg-yellow-500' : 'bg-gray-400'
                        }`} />
                        <Link href={`/jobs/${job.id}`} className="flex-1 min-w-0 flex items-center gap-3">
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
                        <button
                          onClick={() => setConfirmDeleteJobId(job.id)}
                          className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          aria-label="Delete job"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })
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
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Account</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={customer.is_active ? 'outline' : 'outline'}
              size="sm"
              onClick={toggleActive}
            >
              {customer.is_active ? 'Deactivate Customer' : 'Reactivate Customer'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={14} />}
              onClick={() => setDeleteCustomerOpen(true)}
            >
              Delete Customer
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Customer Confirmation Modal */}
      <Modal isOpen={deleteCustomerOpen} onClose={() => setDeleteCustomerOpen(false)} title="Delete Customer" size="sm">
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
            <Trash2 size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">This cannot be undone</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                Permanently deletes this customer and all their jobs, schedules, and invoices.
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Delete <strong className="text-gray-900 dark:text-white">{customer.name}</strong>?
            {jobs.length > 0 && (
              <span className="block mt-1 text-red-600 dark:text-red-400">
                ⚠ This will also delete {jobs.length} job{jobs.length !== 1 ? 's' : ''} from their history.
              </span>
            )}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteCustomerOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" loading={saving} onClick={deleteCustomer} icon={<Trash2 size={14} />}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

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
            <Input label="Service Price ($)" type="number" step="0.01" value={editForm.price?.toString() ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, price: parseFloat(e.target.value) }))} />
            <Input
              label="Employee Pay Per Mow ($)"
              type="number"
              step="0.01"
              placeholder="0.00"
              hint="Total to crew (Rule 3)"
              value={editForm.employee_pay_per_mow?.toString() ?? ''}
              onChange={(e) => setEditForm((f) => ({ ...f, employee_pay_per_mow: e.target.value ? parseFloat(e.target.value) : null }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
