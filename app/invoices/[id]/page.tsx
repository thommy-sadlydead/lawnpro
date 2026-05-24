'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, Send, Printer, Trash2, DollarSign,
  Mail, Phone, MapPin, Calendar, FileText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { formatCurrency, formatDate, formatPhone } from '@/lib/utils'
import type { Invoice, InvoiceItem, Customer } from '@/types'
import { toast } from 'sonner'
import { format } from 'date-fns'

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [paidDate, setPaidDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    setLoading(true)
    const [invRes, itemsRes] = await Promise.all([
      supabase.from('invoices').select('*, customer:customers(*)').eq('id', id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('service_date'),
    ])
    setInvoice(invRes.data as Invoice ?? null)
    setItems((itemsRes.data ?? []) as InvoiceItem[])
    setLoading(false)
  }

  async function markAsPaid() {
    setSaving(true)
    const { error } = await supabase.from('invoices').update({
      status: 'paid',
      paid_at: new Date(paidDate).toISOString(),
    }).eq('id', id)
    setSaving(false)
    if (error) { toast.error('Failed to update'); return }
    toast.success('Invoice marked as paid!')
    setMarkPaidOpen(false)
    loadData()
  }

  async function markAsSent() {
    setSaving(true)
    const { error } = await supabase.from('invoices').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
    }).eq('id', id)
    setSaving(false)
    if (error) { toast.error('Failed to update'); return }
    toast.success('Invoice marked as sent!')
    setSendOpen(false)
    loadData()
  }

  async function voidInvoice() {
    if (!confirm('Are you sure you want to void this invoice?')) return
    await supabase.from('invoices').update({ status: 'void' }).eq('id', id)
    toast.success('Invoice voided')
    router.push('/invoices')
  }

  function printInvoice() {
    window.print()
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950"><div className="animate-pulse text-gray-400">Loading...</div></div>
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 gap-4">
        <p className="text-gray-500">Invoice not found</p>
        <Link href="/invoices"><Button variant="outline">Back to Invoices</Button></Link>
      </div>
    )
  }

  const customer = (invoice as Invoice & { customer?: Customer }).customer

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-4 print:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/invoices">
              <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <ArrowLeft size={18} />
              </button>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">{invoice.invoice_number}</h1>
              <div className="flex items-center gap-2">
                <StatusBadge status={invoice.status} />
                {invoice.due_date && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">Due {formatDate(invoice.due_date)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<Printer size={15} />} onClick={printInvoice}>Print</Button>
            {invoice.status !== 'paid' && invoice.status !== 'void' && (
              <Button size="sm" icon={<DollarSign size={15} />} onClick={() => setMarkPaidOpen(true)}>Mark Paid</Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
        {/* Invoice Card */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 print:border-0 print:shadow-none overflow-hidden">
          {/* Invoice header */}
          <div className="bg-green-600 print:bg-green-600 p-6 text-white">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
                    <span className="text-white text-xs font-bold">L</span>
                  </div>
                  <span className="font-bold text-lg">LawnPro</span>
                </div>
                <p className="text-green-100 text-sm">Professional Lawn Care</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{invoice.invoice_number}</p>
                <p className="text-green-100 text-sm mt-0.5">
                  {format(new Date(invoice.created_at), 'MMMM d, yyyy')}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Bill To */}
            {customer && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Bill To</h3>
                <div className="space-y-1">
                  <Link href={`/customers/${customer.id}`} className="font-bold text-gray-900 dark:text-white text-lg hover:text-green-600 transition-colors">
                    {customer.name}
                  </Link>
                  {customer.address && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                      <MapPin size={13} className="text-gray-400" />
                      {customer.address}{customer.city ? `, ${customer.city}` : ''}
                    </p>
                  )}
                  {customer.phone && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                      <Phone size={13} className="text-gray-400" />
                      {formatPhone(customer.phone)}
                    </p>
                  )}
                  {customer.email && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                      <Mail size={13} className="text-gray-400" />
                      {customer.email}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Invoice Info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-4 border-y border-gray-100 dark:border-gray-800">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Invoice Date</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{format(new Date(invoice.created_at), 'MMM d, yyyy')}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Due Date</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{invoice.due_date ? format(new Date(invoice.due_date), 'MMM d, yyyy') : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
                <div className="mt-0.5"><StatusBadge status={invoice.status} /></div>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left pb-2">Description</th>
                    <th className="text-center pb-2">Date</th>
                    <th className="text-center pb-2">Qty</th>
                    <th className="text-right pb-2">Price</th>
                    <th className="text-right pb-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3 text-sm text-gray-900 dark:text-white">{item.description}</td>
                      <td className="py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                        {item.service_date ? format(new Date(item.service_date), 'MMM d') : '—'}
                      </td>
                      <td className="py-3 text-sm text-gray-500 dark:text-gray-400 text-center">{item.quantity}</td>
                      <td className="py-3 text-sm text-gray-900 dark:text-white text-right">{formatCurrency(item.unit_price)}</td>
                      <td className="py-3 text-sm font-semibold text-gray-900 dark:text-white text-right">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
              {invoice.tax > 0 && (
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span>{formatCurrency(invoice.subtotal)}</span>
                </div>
              )}
              {invoice.tax > 0 && (
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Tax</span>
                  <span>{formatCurrency(invoice.tax)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold">
                <span className="text-gray-900 dark:text-white">Total</span>
                <span className="text-green-600 dark:text-green-400">{formatCurrency(invoice.total)}</span>
              </div>
              {invoice.status === 'paid' && invoice.paid_at && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg mt-2">
                  <CheckCircle2 size={16} className="text-green-600" />
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">
                    Paid on {format(new Date(invoice.paid_at), 'MMMM d, yyyy')}
                  </p>
                </div>
              )}
            </div>

            {invoice.notes && (
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {invoice.status !== 'void' && (
          <div className="space-y-2 print:hidden">
            {invoice.status === 'draft' && (
              <Button
                variant="secondary"
                className="w-full"
                size="lg"
                icon={<Send size={16} />}
                onClick={() => setSendOpen(true)}
              >
                Mark as Sent
              </Button>
            )}
            {invoice.status !== 'paid' && (
              <Button
                className="w-full"
                size="lg"
                icon={<CheckCircle2 size={16} />}
                onClick={() => setMarkPaidOpen(true)}
              >
                Mark as Paid
              </Button>
            )}
            {invoice.status !== 'paid' && (
              <Button
                variant="ghost"
                className="w-full text-red-500"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={voidInvoice}
              >
                Void Invoice
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Mark Paid Modal */}
      <Modal isOpen={markPaidOpen} onClose={() => setMarkPaidOpen(false)} title="Mark Invoice as Paid" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Total amount: <strong className="text-green-600">{formatCurrency(invoice.total)}</strong>
          </p>
          <Input
            label="Payment Date"
            type="date"
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setMarkPaidOpen(false)}>Cancel</Button>
            <Button className="flex-1" loading={saving} icon={<CheckCircle2 size={15} />} onClick={markAsPaid}>
              Mark Paid
            </Button>
          </div>
        </div>
      </Modal>

      {/* Send Modal */}
      <Modal isOpen={sendOpen} onClose={() => setSendOpen(false)} title="Mark Invoice as Sent" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This will mark the invoice as sent. Email integration coming soon — please send manually for now.
          </p>
          {customer?.email && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Mail size={14} className="text-gray-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">{customer.email}</span>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button className="flex-1" loading={saving} icon={<Send size={15} />} onClick={markAsSent}>
              Mark as Sent
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
