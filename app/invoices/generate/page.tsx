'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Calendar, CheckCircle2, FileText, Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { formatCurrency, generateInvoiceNumber } from '@/lib/utils'
import { toast } from 'sonner'
import { format, startOfMonth, endOfMonth, addDays, parseISO } from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BillableCustomer {
  id: string
  name: string
  price: number | null
  email: string | null
}

interface BillableJob {
  id: string
  scheduled_date: string
  customer_id: string
  customer: BillableCustomer
}

interface CustomerGroup {
  customer: BillableCustomer
  jobs: BillableJob[]
  subtotal: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function prevMonth() {
  const now = new Date()
  return { month: now.getMonth() === 0 ? 12 : now.getMonth(), year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear() }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GenerateInvoicesPage() {
  const supabase = createClient()

  const def = prevMonth()
  const [month, setMonth] = useState(def.month)
  const [year, setYear] = useState(def.year)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [groups, setGroups] = useState<CustomerGroup[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewed, setPreviewed] = useState(false)
  const [generatedCount, setGeneratedCount] = useState(0)
  const [done, setDone] = useState(false)

  const currentYear = new Date().getFullYear()
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]

  // ── Load preview ────────────────────────────────────────────────────────────

  async function loadPreview() {
    setLoading(true)
    setPreviewed(false)
    setGroups([])
    setSelected(new Set())

    try {
      // 1. Collect job IDs already linked to an invoice item
      const { data: invoicedItems } = await supabase
        .from('invoice_items')
        .select('job_id')
        .not('job_id', 'is', null)

      const invoicedJobIds = new Set(
        (invoicedItems ?? []).map((i: { job_id: string | null }) => i.job_id).filter(Boolean)
      )

      // 2. Fetch completed jobs in the selected period
      const periodStart = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd')
      const periodEnd   = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd')

      const { data: jobs, error } = await supabase
        .from('jobs')
        .select('id, scheduled_date, customer_id, customer:customers(id, name, price, email)')
        .eq('status', 'completed')
        .gte('scheduled_date', periodStart)
        .lte('scheduled_date', periodEnd)
        .order('scheduled_date')

      if (error) { toast.error('Failed to load jobs'); return }

      // 3. Filter out already-invoiced jobs
      const uninvoiced = (jobs ?? [] as unknown[]).filter(
        (j: unknown) => !invoicedJobIds.has((j as BillableJob).id)
      ) as unknown as BillableJob[]

      // 4. Group by customer
      const byCustomer: Record<string, CustomerGroup> = {}
      for (const job of uninvoiced) {
        const cust = job.customer
        if (!cust) continue
        if (!byCustomer[job.customer_id]) {
          byCustomer[job.customer_id] = { customer: cust, jobs: [], subtotal: 0 }
        }
        byCustomer[job.customer_id].jobs.push(job)
        byCustomer[job.customer_id].subtotal += cust.price ?? 0
      }

      const groupList = Object.values(byCustomer).sort((a, b) =>
        a.customer.name.localeCompare(b.customer.name)
      )

      setGroups(groupList)
      setSelected(new Set(groupList.map((g) => g.customer.id)))
      setPreviewed(true)
    } finally {
      setLoading(false)
    }
  }

  // ── Generate invoices ────────────────────────────────────────────────────────

  async function generateInvoices() {
    const toGenerate = groups.filter((g) => selected.has(g.customer.id))
    if (toGenerate.length === 0) { toast.error('No customers selected'); return }

    setGenerating(true)
    let count = 0
    const dueDate = format(addDays(endOfMonth(new Date(year, month - 1)), 14), 'yyyy-MM-dd')
    const periodLabel = `${MONTHS[month - 1]} ${year}`

    try {
      for (const group of toGenerate) {
        const invoiceNumber = generateInvoiceNumber()
        const subtotal = group.subtotal

        const { data: invoice, error } = await supabase
          .from('invoices')
          .insert({
            customer_id: group.customer.id,
            invoice_number: invoiceNumber,
            subtotal,
            tax: 0,
            total: subtotal,
            status: 'draft',
            due_date: dueDate,
            notes: `Services for ${periodLabel}`,
          })
          .select()
          .single()

        if (error || !invoice) continue

        await supabase.from('invoice_items').insert(
          group.jobs.map((job) => ({
            invoice_id: invoice.id,
            job_id: job.id,
            description: 'Lawn Mowing Service',
            quantity: 1,
            unit_price: group.customer.price ?? 0,
            total: group.customer.price ?? 0,
            service_date: job.scheduled_date,
          }))
        )

        count++
      }

      setGeneratedCount(count)
      setDone(true)
      toast.success(`Generated ${count} invoice${count !== 1 ? 's' : ''}!`)
    } finally {
      setGenerating(false)
    }
  }

  // ── Selection helpers ────────────────────────────────────────────────────────

  function toggleCustomer(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(selected.size === groups.length ? new Set() : new Set(groups.map((g) => g.customer.id)))
  }

  const selectedGroups = groups.filter((g) => selected.has(g.customer.id))
  const grandTotal = selectedGroups.reduce((sum, g) => sum + g.subtotal, 0)

  // ── Done state ───────────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {generatedCount} Invoice{generatedCount !== 1 ? 's' : ''} Generated
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8">
            Invoices for {MONTHS[month - 1]} {year} are saved as drafts. Review and send them from the Invoices page.
          </p>
          <div className="flex flex-col gap-3">
            <Link href="/invoices">
              <Button className="w-full" size="lg" icon={<FileText size={16} />}>
                View Invoices
              </Button>
            </Link>
            <Button
              variant="outline"
              className="w-full"
              size="lg"
              onClick={() => { setDone(false); setPreviewed(false); setGroups([]) }}
            >
              Generate Another Month
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main UI ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/invoices">
            <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
              <ArrowLeft size={18} />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Generate Monthly Invoices</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Batch-create invoices for all billable services in a period</p>
          </div>
        </div>
      </div>

      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-5">

        {/* Period selector */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={15} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Billing Period</h2>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">Month</label>
              <select
                value={month}
                onChange={(e) => { setMonth(parseInt(e.target.value)); setPreviewed(false) }}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">Year</label>
              <select
                value={year}
                onChange={(e) => { setYear(parseInt(e.target.value)); setPreviewed(false) }}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <Button onClick={loadPreview} loading={loading} icon={<Sparkles size={15} />}>
              Preview
            </Button>
          </div>
        </div>

        {/* Preview results */}
        {previewed && groups.length === 0 && (
          <div className="text-center py-14 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <CheckCircle2 size={36} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="font-semibold text-gray-700 dark:text-gray-300">All caught up!</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              No un-invoiced completed services found for {MONTHS[month - 1]} {year}.
            </p>
          </div>
        )}

        {previewed && groups.length > 0 && (
          <>
            {/* Header row */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-white">{groups.length}</span> customer{groups.length !== 1 ? 's' : ''} with billable services in {MONTHS[month - 1]}
              </p>
              <button
                onClick={toggleAll}
                className="text-sm font-medium text-green-600 dark:text-green-400 hover:underline"
              >
                {selected.size === groups.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            {/* Customer cards */}
            <div className="space-y-2">
              {groups.map((group) => {
                const isSelected = selected.has(group.customer.id)
                return (
                  <button
                    key={group.customer.id}
                    onClick={() => toggleCustomer(group.customer.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-white dark:bg-gray-900 border-green-500 dark:border-green-600 ring-1 ring-green-500 dark:ring-green-600'
                        : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 opacity-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                        isSelected ? 'bg-green-600 border-green-600' : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 12 12">
                            <polyline points="2,6 5,9 10,3" />
                          </svg>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="font-semibold text-gray-900 dark:text-white">{group.customer.name}</p>
                          <p className="font-bold text-gray-900 dark:text-white flex-shrink-0">
                            {formatCurrency(group.subtotal)}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {group.jobs.length} service{group.jobs.length !== 1 ? 's' : ''}
                          {group.customer.price != null && ` · ${formatCurrency(group.customer.price)} each`}
                        </p>
                        {/* Service date chips */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {group.jobs.map((job) => (
                            <span
                              key={job.id}
                              className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded"
                            >
                              {format(parseISO(job.scheduled_date), 'MMM d')}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Generate button */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedGroups.length} invoice{selectedGroups.length !== 1 ? 's' : ''} to create
                </span>
                <span className="font-bold text-lg text-gray-900 dark:text-white">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
              <Button
                className="w-full"
                size="lg"
                loading={generating}
                disabled={selectedGroups.length === 0}
                onClick={generateInvoices}
                icon={<FileText size={16} />}
              >
                Generate {selectedGroups.length > 0 ? `${selectedGroups.length} ` : ''}Invoice{selectedGroups.length !== 1 ? 's' : ''}
              </Button>
              <p className="text-xs text-center text-gray-400 dark:text-gray-500">
                Invoices are created as drafts — review before sending
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
