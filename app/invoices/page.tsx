'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, FileText, Zap, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { MobileHeader } from '@/components/nav/MobileNav'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Invoice } from '@/types'
import { toast } from 'sonner'
import { LockedValue } from '@/contexts/OwnerAuth'

type StatusFilter = 'all' | 'draft' | 'sent' | 'paid' | 'overdue'

export default function InvoicesPage() {
  const supabase = createClient()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sendAllOpen, setSendAllOpen] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    loadInvoices()
  }, [statusFilter])

  async function loadInvoices() {
    setLoading(true)
    let query = supabase
      .from('invoices')
      .select('*, customer:customers(id, name)')
      .order('created_at', { ascending: false })
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    const { data } = await query.limit(100)
    setInvoices((data ?? []) as Invoice[])
    setLoading(false)
  }

  const filtered = invoices.filter((inv) => {
    const customer = (inv as Invoice & { customer?: { name: string } }).customer
    return !search ||
      customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoice_number.toLowerCase().includes(search.toLowerCase())
  })

  // Draft invoices visible in current view
  const draftInvoices = filtered.filter((i) => i.status === 'draft')

  async function sendAllDrafts() {
    if (draftInvoices.length === 0) return
    setSending(true)
    const ids = draftInvoices.map((i) => i.id)
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .in('id', ids)
    setSending(false)
    setSendAllOpen(false)
    if (error) { toast.error('Failed to send invoices'); return }
    toast.success(`${ids.length} invoice${ids.length !== 1 ? 's' : ''} marked as sent!`)
    loadInvoices()
  }

  const stats = {
    total: filtered.length,
    unpaid: filtered.filter((i) => i.status === 'sent' || i.status === 'overdue').length,
    unpaidAmount: filtered
      .filter((i) => i.status === 'sent' || i.status === 'overdue')
      .reduce((s, i) => s + i.total, 0),
    paidAmount: filtered
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + i.total, 0),
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <MobileHeader title="Invoices" />

      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between gap-3 px-4 lg:px-6 py-4">
          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Invoices</h1>
          </div>
          <div className="relative flex-1 lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="flex gap-2">
            <Link href="/invoices/generate">
              <Button size="sm" variant="outline" icon={<Zap size={15} />}>
                <span className="hidden sm:inline">Generate Monthly</span>
              </Button>
            </Link>
            <Link href="/invoices/new">
              <Button size="sm" icon={<Plus size={16} />}>New Invoice</Button>
            </Link>
          </div>
        </div>

        {/* Status filter */}
        <div className="flex gap-1 px-4 lg:px-6 pb-0 overflow-x-auto">
          {(['all', 'draft', 'sent', 'paid', 'overdue'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors capitalize ${
                statusFilter === f
                  ? 'border-green-600 text-green-600 dark:text-green-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 divide-x divide-gray-100 dark:divide-gray-800">
        <div className="py-3 px-4 text-center">
          <p className="text-base font-bold text-gray-900 dark:text-white">{stats.total}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
        </div>
        <div className="py-3 px-4 text-center">
          <p className="text-base font-bold text-yellow-600 dark:text-yellow-400">
            <LockedValue>{formatCurrency(stats.unpaidAmount)}</LockedValue>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Outstanding</p>
        </div>
        <div className="py-3 px-4 text-center">
          <p className="text-base font-bold text-green-600 dark:text-green-400">
            <LockedValue>{formatCurrency(stats.paidAmount)}</LockedValue>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Collected</p>
        </div>
      </div>

      {/* Send All Drafts banner — shows when there are drafts in view */}
      {!loading && draftInvoices.length > 0 && (
        <div className="px-4 lg:px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 flex items-center justify-between gap-3">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            <span className="font-semibold">{draftInvoices.length}</span> draft invoice{draftInvoices.length !== 1 ? 's' : ''} ready to send
          </p>
          <Button
            size="sm"
            icon={<Send size={14} />}
            onClick={() => setSendAllOpen(true)}
          >
            Send All Drafts
          </Button>
        </div>
      )}

      {/* Invoice list */}
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">No invoices found</p>
            <Link href="/invoices/new">
              <Button className="mt-4" icon={<Plus size={16} />}>Create Invoice</Button>
            </Link>
          </div>
        ) : (
          filtered.map((inv) => {
            const customer = (inv as Invoice & { customer?: { name: string } }).customer
            return (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="flex items-center gap-4 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-green-400 dark:hover:border-green-600 hover:shadow-sm transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{customer?.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {inv.invoice_number}
                    {inv.due_date && ` · Due ${formatDate(inv.due_date)}`}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Created {formatDate(inv.created_at)}
                    {inv.paid_at && ` · Paid ${formatDate(inv.paid_at)}`}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-bold text-gray-900 dark:text-white">{formatCurrency(inv.total)}</p>
                  <StatusBadge status={inv.status} />
                </div>
              </Link>
            )
          })
        )}
      </div>
      {/* Send All Drafts modal */}
      <Modal isOpen={sendAllOpen} onClose={() => setSendAllOpen(false)} title="Send All Draft Invoices" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This will mark <span className="font-semibold text-gray-900 dark:text-white">{draftInvoices.length} invoice{draftInvoices.length !== 1 ? 's' : ''}</span> as <span className="font-semibold text-blue-600 dark:text-blue-400">Sent</span> and set today as the sent date.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Email delivery is not automated — send invoices to customers manually or via your email client.
          </p>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setSendAllOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1" loading={sending} icon={<Send size={15} />} onClick={sendAllDrafts}>
              Mark {draftInvoices.length} as Sent
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
