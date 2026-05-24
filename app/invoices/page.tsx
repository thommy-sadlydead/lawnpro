'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, FileText, DollarSign } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { MobileHeader } from '@/components/nav/MobileNav'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Invoice } from '@/types'

type StatusFilter = 'all' | 'draft' | 'sent' | 'paid' | 'overdue'

export default function InvoicesPage() {
  const supabase = createClient()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

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
          <Link href="/invoices/new">
            <Button size="sm" icon={<Plus size={16} />}>New Invoice</Button>
          </Link>
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
          <p className="text-base font-bold text-yellow-600 dark:text-yellow-400">{formatCurrency(stats.unpaidAmount)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Outstanding</p>
        </div>
        <div className="py-3 px-4 text-center">
          <p className="text-base font-bold text-green-600 dark:text-green-400">{formatCurrency(stats.paidAmount)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Collected</p>
        </div>
      </div>

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
    </div>
  )
}
