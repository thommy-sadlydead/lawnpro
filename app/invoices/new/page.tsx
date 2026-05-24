'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { formatCurrency, generateInvoiceNumber } from '@/lib/utils'
import type { Customer, Job } from '@/types'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  service_date: string
  job_id?: string
}

function NewInvoiceForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [unInvoicedJobs, setUnInvoicedJobs] = useState<Job[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState(searchParams.get('customer') ?? '')
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 14), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: 'Lawn Mowing Service', quantity: 1, unit_price: 0, service_date: '' },
  ])
  const [loading, setLoading] = useState(false)
  const [loadingJobs, setLoadingJobs] = useState(false)

  useEffect(() => {
    supabase.from('customers').select('id, name, price, service_frequency').eq('is_active', true).order('name')
      .then(({ data }) => setCustomers((data ?? []) as Customer[]))
  }, [])

  useEffect(() => {
    if (selectedCustomerId) {
      loadCustomerJobs(selectedCustomerId)
      const customer = customers.find((c) => c.id === selectedCustomerId)
      if (customer?.price && lineItems.length === 1 && lineItems[0].unit_price === 0) {
        setLineItems([{ ...lineItems[0], unit_price: customer.price }])
      }
    }
  }, [selectedCustomerId])

  async function loadCustomerJobs(customerId: string) {
    setLoadingJobs(true)
    // Get completed jobs not yet invoiced
    const { data: existingItems } = await supabase.from('invoice_items').select('job_id').not('job_id', 'is', null)
    const invoicedJobIds = new Set((existingItems ?? []).map((i) => i.job_id).filter(Boolean))

    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, scheduled_date, payout_amount')
      .eq('customer_id', customerId)
      .eq('status', 'completed')
      .order('scheduled_date', { ascending: false })
      .limit(30)

    const available = ((jobs ?? []) as Job[]).filter((j) => !invoicedJobIds.has(j.id))
    setUnInvoicedJobs(available)
    setLoadingJobs(false)
  }

  function addFromJob(job: Job) {
    const customer = customers.find((c) => c.id === selectedCustomerId)
    const amount = job.payout_amount ?? customer?.price ?? 0
    const exists = lineItems.some((li) => li.job_id === job.id)
    if (exists) return

    setLineItems((items) => [
      ...items.filter((i) => i.description !== 'Lawn Mowing Service' || i.unit_price !== 0),
      {
        description: 'Lawn Mowing Service',
        quantity: 1,
        unit_price: amount,
        service_date: job.scheduled_date,
        job_id: job.id,
      },
    ])
  }

  function addLineItem() {
    setLineItems((items) => [...items, { description: '', quantity: 1, unit_price: 0, service_date: '' }])
  }

  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setLineItems((items) => items.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function removeItem(idx: number) {
    setLineItems((items) => items.filter((_, i) => i !== idx))
  }

  const subtotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
  const total = subtotal

  async function createInvoice() {
    if (!selectedCustomerId) { toast.error('Select a customer'); return }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return }
    if (lineItems.some((i) => !i.description)) { toast.error('All items need a description'); return }

    setLoading(true)
    const invoiceNumber = generateInvoiceNumber()

    const { data: invoice, error } = await supabase.from('invoices').insert({
      customer_id: selectedCustomerId,
      invoice_number: invoiceNumber,
      subtotal,
      tax: 0,
      total,
      due_date: dueDate || null,
      notes: notes || null,
      status: 'draft',
    }).select().single()

    if (error) { toast.error('Failed to create invoice'); setLoading(false); return }

    // Insert line items
    const items = lineItems.map((item) => ({
      invoice_id: invoice.id,
      job_id: item.job_id ?? null,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.quantity * item.unit_price,
      service_date: item.service_date || null,
    }))

    await supabase.from('invoice_items').insert(items)

    setLoading(false)
    toast.success('Invoice created!')
    router.push(`/invoices/${invoice.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/invoices">
            <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
              <ArrowLeft size={18} />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">New Invoice</h1>
        </div>
      </div>

      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-5">
        {/* Customer & Date */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wide">Invoice Details</h2>
          <Select
            label="Customer *"
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
          >
            <option value="">Select a customer...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <Textarea
            label="Notes (optional)"
            placeholder="Thank you for your business!"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        {/* Quick-add from completed jobs */}
        {selectedCustomerId && unInvoicedJobs.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-4">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
              {unInvoicedJobs.length} completed jobs not yet invoiced
            </p>
            <div className="flex flex-wrap gap-2">
              {unInvoicedJobs.slice(0, 10).map((job) => (
                <button
                  key={job.id}
                  onClick={() => addFromJob(job)}
                  disabled={lineItems.some((li) => li.job_id === job.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    lineItems.some((li) => li.job_id === job.id)
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 cursor-default'
                      : 'bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                  }`}
                >
                  {lineItems.some((li) => li.job_id === job.id) ? '✓ ' : '+ '}
                  {format(new Date(job.scheduled_date), 'MMM d')}
                  {job.payout_amount && ` · ${formatCurrency(job.payout_amount)}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Line Items */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wide">Line Items</h2>
            <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={addLineItem}>Add Item</Button>
          </div>

          <div className="space-y-3">
            {lineItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-start p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex-1 space-y-2">
                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="Date"
                      type="date"
                      value={item.service_date}
                      onChange={(e) => updateItem(idx, 'service_date', e.target.value)}
                    />
                    <Input
                      placeholder="Qty"
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                    />
                    <Input
                      placeholder="Price"
                      type="number"
                      step="0.01"
                      value={item.unit_price || ''}
                      onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0 pt-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {formatCurrency(item.quantity * item.unit_price)}
                  </p>
                  <button onClick={() => removeItem(idx)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white">
              <span>Total</span>
              <span className="text-green-600 dark:text-green-400">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-4">
          <Link href="/invoices" className="flex-1">
            <Button variant="outline" className="w-full">Cancel</Button>
          </Link>
          <Button className="flex-1" loading={loading} onClick={createInvoice}>Create Invoice</Button>
        </div>
      </div>
    </div>
  )
}

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950"><div className="animate-pulse text-gray-400">Loading...</div></div>}>
      <NewInvoiceForm />
    </Suspense>
  )
}
