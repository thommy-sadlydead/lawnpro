'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import {
  BarChart2, Calendar, Download, FileSpreadsheet,
  Briefcase, DollarSign, CheckCircle2, Clock, Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { MobileHeader } from '@/components/nav/MobileNav'
import { StatusBadge } from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { useOwnerAuth, OwnerLockScreen } from '@/contexts/OwnerAuth'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawJob {
  id: string
  scheduled_date: string
  customer_id: string
  customer: { id: string; name: string; price: number | null } | null
  crew: {
    employee_id: string
    payout_amount: number | null
    employee: { id: string; name: string } | null
  }[]
}

interface RawInvoice {
  id: string
  invoice_number: string
  status: string
  total: number
  due_date: string | null
  paid_at: string | null
  created_at: string
  customer: { id: string; name: string } | null
}

interface CustomerSummary {
  id: string
  name: string
  jobCount: number
  revenue: number
  dates: string[]
}

interface EmployeeSummary {
  id: string
  name: string
  jobCount: number
  totalPayout: number
}

interface ReportData {
  jobs: RawJob[]
  invoices: RawInvoice[]
  byCustomer: CustomerSummary[]
  byEmployee: EmployeeSummary[]
  summary: {
    totalJobs: number
    totalRevenue: number
    paidCount: number
    paidAmount: number
    outstandingCount: number
    outstandingAmount: number
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function csvEscape(v: string | number | null | undefined) {
  const s = String(v ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const supabase = createClient()
  const { isUnlocked } = useOwnerAuth()

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ReportData | null>(null)
  const [exporting, setExporting] = useState(false)

  const currentYear = now.getFullYear()
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]

  // ── Load report ─────────────────────────────────────────────────────────────

  async function loadReport() {
    setLoading(true)
    setData(null)

    const periodStart = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd')
    const periodEnd   = format(endOfMonth(new Date(year, month - 1)),   'yyyy-MM-dd')

    const [jobsRes, invoicesRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, scheduled_date, customer_id, customer:customers(id, name, price), crew:job_crew(employee_id, payout_amount, employee:employees(id, name))')
        .eq('status', 'completed')
        .gte('scheduled_date', periodStart)
        .lte('scheduled_date', periodEnd)
        .order('scheduled_date'),
      supabase
        .from('invoices')
        .select('id, invoice_number, status, total, due_date, paid_at, created_at, customer:customers(id, name)')
        .neq('status', 'void')
        .gte('created_at', `${periodStart}T00:00:00`)
        .lte('created_at', `${periodEnd}T23:59:59`)
        .order('created_at'),
    ])

    const jobs     = (jobsRes.data     ?? []) as unknown as RawJob[]
    const invoices = (invoicesRes.data ?? []) as unknown as RawInvoice[]

    // Revenue by customer
    const customerMap: Record<string, CustomerSummary> = {}
    for (const job of jobs) {
      if (!job.customer) continue
      const cid = job.customer_id
      if (!customerMap[cid]) {
        customerMap[cid] = { id: cid, name: job.customer.name, jobCount: 0, revenue: 0, dates: [] }
      }
      customerMap[cid].jobCount++
      customerMap[cid].revenue += job.customer.price ?? 0
      customerMap[cid].dates.push(job.scheduled_date)
    }
    const byCustomer = Object.values(customerMap).sort((a, b) => b.revenue - a.revenue)

    // Revenue by employee (from job_crew)
    const employeeMap: Record<string, EmployeeSummary> = {}
    for (const job of jobs) {
      for (const entry of (job.crew ?? [])) {
        if (!entry.employee) continue
        const eid = entry.employee_id
        if (!employeeMap[eid]) {
          employeeMap[eid] = { id: eid, name: entry.employee.name, jobCount: 0, totalPayout: 0 }
        }
        employeeMap[eid].jobCount++
        employeeMap[eid].totalPayout += entry.payout_amount ?? 0
      }
    }
    const byEmployee = Object.values(employeeMap).sort((a, b) => b.totalPayout - a.totalPayout)

    // Summary totals
    const totalRevenue = byCustomer.reduce((s, c) => s + c.revenue, 0)
    const paid         = invoices.filter((i) => i.status === 'paid')
    const outstanding  = invoices.filter((i) => i.status === 'sent' || i.status === 'draft')

    setData({
      jobs,
      invoices,
      byCustomer,
      byEmployee,
      summary: {
        totalJobs: jobs.length,
        totalRevenue,
        paidCount: paid.length,
        paidAmount: paid.reduce((s, i) => s + i.total, 0),
        outstandingCount: outstanding.length,
        outstandingAmount: outstanding.reduce((s, i) => s + i.total, 0),
      },
    })

    setLoading(false)
  }

  // ── Export PDF ───────────────────────────────────────────────────────────────

  async function exportPDF() {
    if (!data) return
    setExporting(true)
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ])

      const doc = new jsPDF()
      const periodLabel = `${MONTHS[month - 1]} ${year}`
      const pageW = doc.internal.pageSize.getWidth()

      // ── Dark header bar
      doc.setFillColor(10, 10, 10)
      doc.rect(0, 0, pageW, 26, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('CrossCut Lawn Care', 14, 11)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(`Monthly Revenue Report  ·  ${periodLabel}`, 14, 20)

      // Generated date (right-aligned)
      doc.setFontSize(8)
      doc.text(`Generated ${format(new Date(), 'MMM d, yyyy')}`, pageW - 14, 20, { align: 'right' })

      doc.setTextColor(0, 0, 0)
      let y = 36

      // ── Summary
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(80, 80, 80)
      doc.text('SUMMARY', 14, y)
      doc.setTextColor(0, 0, 0)
      y += 4

      autoTable(doc, {
        startY: y,
        head: [],
        body: [
          ['Total Lawns Completed', String(data.summary.totalJobs)],
          ['Total Revenue', formatCurrency(data.summary.totalRevenue)],
          ['Paid Invoices', `${data.summary.paidCount}  —  ${formatCurrency(data.summary.paidAmount)}`],
          ['Outstanding Invoices', `${data.summary.outstandingCount}  —  ${formatCurrency(data.summary.outstandingAmount)}`],
        ],
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
          0: { fontStyle: 'normal', textColor: [80, 80, 80] },
          1: { halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: 14, right: 14 },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 10

      // ── Revenue by Customer
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(80, 80, 80)
      doc.text('REVENUE BY CUSTOMER', 14, y)
      doc.setTextColor(0, 0, 0)
      y += 4

      if (data.byCustomer.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Customer', 'Services', 'Service Dates', 'Revenue']],
          body: data.byCustomer.map((c) => [
            c.name,
            String(c.jobCount),
            c.dates.map((d) => format(parseISO(d), 'MMM d')).join(', '),
            formatCurrency(c.revenue),
          ]),
          theme: 'striped',
          headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold', fontSize: 9 },
          styles: { fontSize: 9, cellPadding: 3 },
          columnStyles: { 1: { halign: 'center' }, 3: { halign: 'right', fontStyle: 'bold' } },
          margin: { left: 14, right: 14 },
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        y = (doc as any).lastAutoTable.finalY + 10
      } else {
        doc.setFontSize(9)
        doc.setTextColor(150)
        doc.text('No completed services this period.', 14, y + 4)
        doc.setTextColor(0, 0, 0)
        y += 14
      }

      if (y > 230) { doc.addPage(); y = 20 }

      // ── Revenue by Employee
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(80, 80, 80)
      doc.text('REVENUE BY EMPLOYEE', 14, y)
      doc.setTextColor(0, 0, 0)
      y += 4

      if (data.byEmployee.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Employee', 'Jobs Completed', 'Total Earnings']],
          body: data.byEmployee.map((e) => [
            e.name,
            String(e.jobCount),
            formatCurrency(e.totalPayout),
          ]),
          theme: 'striped',
          headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold', fontSize: 9 },
          styles: { fontSize: 9, cellPadding: 3 },
          columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right', fontStyle: 'bold' } },
          margin: { left: 14, right: 14 },
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        y = (doc as any).lastAutoTable.finalY + 10
      } else {
        doc.setFontSize(9)
        doc.setTextColor(150)
        doc.text('No crew payroll data this period.', 14, y + 4)
        doc.setTextColor(0, 0, 0)
        y += 14
      }

      if (y > 230) { doc.addPage(); y = 20 }

      // ── Invoices
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(80, 80, 80)
      doc.text('INVOICES', 14, y)
      doc.setTextColor(0, 0, 0)
      y += 4

      if (data.invoices.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Invoice #', 'Customer', 'Status', 'Due', 'Paid', 'Total']],
          body: data.invoices.map((inv) => [
            inv.invoice_number,
            inv.customer?.name ?? '—',
            inv.status.charAt(0).toUpperCase() + inv.status.slice(1),
            inv.due_date  ? format(parseISO(inv.due_date),  'MMM d, yyyy') : '—',
            inv.paid_at   ? format(parseISO(inv.paid_at),   'MMM d, yyyy') : '—',
            formatCurrency(inv.total),
          ]),
          theme: 'striped',
          headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold', fontSize: 9 },
          styles: { fontSize: 9, cellPadding: 3 },
          columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
          margin: { left: 14, right: 14 },
        })
      } else {
        doc.setFontSize(9)
        doc.setTextColor(150)
        doc.text('No invoices created this period.', 14, y + 4)
      }

      // ── Page footers
      const pageCount = doc.getNumberOfPages()
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        doc.setFontSize(8)
        doc.setTextColor(160)
        const pageH = doc.internal.pageSize.getHeight()
        doc.text('CrossCut Lawn Care — Confidential', 14, pageH - 8)
        doc.text(`Page ${p} of ${pageCount}`, pageW - 14, pageH - 8, { align: 'right' })
      }

      doc.save(`CrossCut-Revenue-${MONTHS[month - 1]}-${year}.pdf`)
      toast.success('PDF downloaded!')
    } catch {
      toast.error('PDF export failed')
    } finally {
      setExporting(false)
    }
  }

  // ── Export CSV ───────────────────────────────────────────────────────────────

  function exportCSV() {
    if (!data) return
    const periodLabel = `${MONTHS[month - 1]} ${year}`
    const rows: string[][] = []

    rows.push([`CrossCut Lawn Care — Revenue Report — ${periodLabel}`])
    rows.push([`Generated: ${format(new Date(), 'MMMM d, yyyy')}`])
    rows.push([])

    // Summary
    rows.push(['SUMMARY'])
    rows.push(['Metric', 'Value'])
    rows.push(['Total Lawns Completed', String(data.summary.totalJobs)])
    rows.push(['Total Revenue', formatCurrency(data.summary.totalRevenue)])
    rows.push(['Paid Invoices (count)', String(data.summary.paidCount)])
    rows.push(['Paid Invoices (amount)', formatCurrency(data.summary.paidAmount)])
    rows.push(['Outstanding Invoices (count)', String(data.summary.outstandingCount)])
    rows.push(['Outstanding Invoices (amount)', formatCurrency(data.summary.outstandingAmount)])
    rows.push([])

    // Revenue by customer
    rows.push(['REVENUE BY CUSTOMER'])
    rows.push(['Customer', 'Services Completed', 'Revenue', 'Service Dates'])
    for (const c of data.byCustomer) {
      rows.push([
        c.name,
        String(c.jobCount),
        formatCurrency(c.revenue),
        c.dates.map((d) => format(parseISO(d), 'MMM d')).join('; '),
      ])
    }
    rows.push([])

    // Revenue by employee
    rows.push(['REVENUE BY EMPLOYEE'])
    rows.push(['Employee', 'Jobs Completed', 'Total Earnings'])
    for (const e of data.byEmployee) {
      rows.push([e.name, String(e.jobCount), formatCurrency(e.totalPayout)])
    }
    rows.push([])

    // Invoices
    rows.push(['INVOICES'])
    rows.push(['Invoice #', 'Customer', 'Status', 'Due Date', 'Paid Date', 'Total'])
    for (const inv of data.invoices) {
      rows.push([
        inv.invoice_number,
        inv.customer?.name ?? '',
        inv.status,
        inv.due_date ? format(parseISO(inv.due_date), 'MMM d, yyyy') : '',
        inv.paid_at  ? format(parseISO(inv.paid_at),  'MMM d, yyyy') : '',
        formatCurrency(inv.total),
      ])
    }
    rows.push([])

    // Detailed jobs log
    rows.push(['DETAILED JOB LOG'])
    rows.push(['Date', 'Customer', 'Revenue', 'Crew'])
    for (const job of data.jobs) {
      const crewNames = (job.crew ?? []).map((c) => c.employee?.name ?? '').filter(Boolean).join('; ')
      rows.push([
        format(parseISO(job.scheduled_date), 'MMM d, yyyy'),
        job.customer?.name ?? '',
        formatCurrency(job.customer?.price ?? 0),
        crewNames,
      ])
    }

    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CrossCut-Revenue-${MONTHS[month - 1]}-${year}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('CSV downloaded!')
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const periodLabel = `${MONTHS[month - 1]} ${year}`

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <MobileHeader title="Revenue Report" />

      {/* Desktop header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between gap-3 px-4 lg:px-6 py-4">
          <div className="hidden lg:flex items-center gap-2">
            <BarChart2 size={20} className="text-gray-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Revenue Report</h1>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-2 flex-1 lg:flex-none justify-start">
            <Calendar size={15} className="text-gray-400 hidden sm:block" />
            <select
              value={month}
              onChange={(e) => { setMonth(parseInt(e.target.value)); setData(null) }}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={(e) => { setYear(parseInt(e.target.value)); setData(null) }}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <Button size="sm" onClick={loadReport} loading={loading} icon={<Sparkles size={14} />}>
              Generate
            </Button>
          </div>

          {/* Export buttons */}
          {data && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={<FileSpreadsheet size={15} />}
                onClick={exportCSV}
              >
                <span className="hidden sm:inline">CSV</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Download size={15} />}
                loading={exporting}
                onClick={exportPDF}
              >
                <span className="hidden sm:inline">PDF</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Owner gate — show lock screen if not authenticated ── */}
      {!isUnlocked && <OwnerLockScreen title="Revenue Reports" />}

      {/* Loading skeleton */}
      {isUnlocked && loading && (
        <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 animate-pulse" />
            ))}
          </div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty prompt */}
      {isUnlocked && !loading && !data && (
        <div className="flex flex-col items-center justify-center py-24 text-center px-4">
          <BarChart2 size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
          <p className="font-semibold text-gray-700 dark:text-gray-300 text-lg">Select a period and generate the report</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
            Choose a month and year above, then tap Generate to see revenue, jobs, and invoice data.
          </p>
        </div>
      )}

      {/* Report body */}
      {isUnlocked && !loading && data && (
        <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">

          {/* Period label */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {periodLabel} Report
            </span>
            {data.summary.totalJobs === 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">— no activity recorded</span>
            )}
          </div>

          {/* ── Summary cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase size={15} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Lawns</span>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{data.summary.totalJobs}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">completed</p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={15} className="text-green-500" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Revenue</span>
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(data.summary.totalRevenue)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">from completed jobs</p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={15} className="text-blue-500" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Paid</span>
              </div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(data.summary.paidAmount)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{data.summary.paidCount} invoice{data.summary.paidCount !== 1 ? 's' : ''}</p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={15} className="text-yellow-500" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Outstanding</span>
              </div>
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{formatCurrency(data.summary.outstandingAmount)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{data.summary.outstandingCount} invoice{data.summary.outstandingCount !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* ── Revenue by Customer ─────────────────────────────────────────── */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <DollarSign size={15} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Revenue by Customer</h2>
              <span className="ml-auto text-xs text-gray-400">{data.byCustomer.length} customer{data.byCustomer.length !== 1 ? 's' : ''}</span>
            </div>
            {data.byCustomer.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 px-5 py-6 text-center">No completed services this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Services</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Dates</th>
                      <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {data.byCustomer.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{c.name}</td>
                        <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{c.jobCount}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {c.dates.map((d, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                                {format(parseISO(d), 'MMM d')}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-green-600 dark:text-green-400">
                          {formatCurrency(c.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <td className="px-5 py-3 font-semibold text-gray-700 dark:text-gray-300">Total</td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300">
                        {data.summary.totalJobs}
                      </td>
                      <td className="hidden md:table-cell" />
                      <td className="px-5 py-3 text-right font-bold text-lg text-green-600 dark:text-green-400">
                        {formatCurrency(data.summary.totalRevenue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ── Revenue by Employee ─────────────────────────────────────────── */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <Briefcase size={15} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Revenue by Employee</h2>
              <span className="ml-auto text-xs text-gray-400">{data.byEmployee.length} employee{data.byEmployee.length !== 1 ? 's' : ''}</span>
            </div>
            {data.byEmployee.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 px-5 py-6 text-center">No crew payroll recorded this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Employee</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Jobs</th>
                      <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Earnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {data.byEmployee.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{e.name}</td>
                        <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{e.jobCount}</td>
                        <td className="px-5 py-3 text-right font-bold text-gray-900 dark:text-white">
                          {formatCurrency(e.totalPayout)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Invoices ────────────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <CheckCircle2 size={15} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Invoices</h2>
              <span className="ml-auto text-xs text-gray-400">{data.invoices.length} invoice{data.invoices.length !== 1 ? 's' : ''}</span>
            </div>
            {data.invoices.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 px-5 py-6 text-center">No invoices created this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Invoice #</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Due</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Paid</th>
                      <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {data.invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{inv.invoice_number}</td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{inv.customer?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={inv.status as 'draft' | 'sent' | 'paid' | 'overdue' | 'void'} />
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                          {inv.due_date ? formatDate(inv.due_date) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                          {inv.paid_at ? formatDate(inv.paid_at) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-gray-900 dark:text-white">
                          {formatCurrency(inv.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <td colSpan={2} className="px-5 py-3 font-semibold text-gray-700 dark:text-gray-300">Total</td>
                      <td />
                      <td className="hidden md:table-cell" />
                      <td className="hidden md:table-cell" />
                      <td className="px-5 py-3 text-right font-bold text-lg text-gray-900 dark:text-white">
                        {formatCurrency(data.invoices.reduce((s, i) => s + i.total, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Export CTA (bottom — visible on mobile) */}
          <div className="flex gap-3 pb-4">
            <Button
              variant="outline"
              className="flex-1"
              icon={<FileSpreadsheet size={16} />}
              onClick={exportCSV}
            >
              Export CSV
            </Button>
            <Button
              className="flex-1"
              icon={<Download size={16} />}
              loading={exporting}
              onClick={exportPDF}
            >
              Export PDF
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
