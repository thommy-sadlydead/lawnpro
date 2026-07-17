'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, Send, Printer, Trash2, DollarSign,
  Mail, Phone, MapPin, Calendar, FileText, Copy, Check, FileDown,
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
  const [copied, setCopied] = useState(false)
  const [pdfing, setPdfing] = useState(false)

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

  // ── Copy Invoice ─────────────────────────────────────────────────────────────

  function buildInvoiceText(): string {
    if (!invoice) return ''
    const customer = (invoice as Invoice & { customer?: Customer }).customer
    const lines: string[] = []

    // ── Header / branding ─────────────────────────────────────────────────────
    lines.push('CrossCut Lawn Care')
    lines.push('='.repeat(36))
    lines.push('')

    // ── Invoice meta ──────────────────────────────────────────────────────────
    lines.push(`Invoice:  ${invoice.invoice_number}`)
    lines.push(`Date:     ${format(new Date(invoice.created_at), 'MMMM d, yyyy')}`)
    if (invoice.due_date) {
      lines.push(`Due:      ${format(new Date(invoice.due_date), 'MMMM d, yyyy')}`)
    }
    lines.push(`Status:   ${invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}`)
    lines.push('')

    // ── Customer ──────────────────────────────────────────────────────────────
    if (customer) {
      lines.push('Bill To:')
      lines.push('-'.repeat(24))
      lines.push(customer.name)

      const addressParts = [
        customer.address,
        customer.city,
        customer.state,
        customer.zip,
      ].filter(Boolean)
      if (addressParts.length > 0) lines.push(addressParts.join(', '))
      if (customer.phone) lines.push(formatPhone(customer.phone))
      if (customer.email) lines.push(customer.email)
      lines.push('')
    }

    // ── Line items ────────────────────────────────────────────────────────────
    if (items.length > 0) {
      lines.push('Services:')
      lines.push('-'.repeat(24))
      for (const item of items) {
        const date = item.service_date
          ? format(new Date(item.service_date), 'MMM d')
          : null
        const qtyPrice =
          item.quantity > 1
            ? `${item.quantity}x @ ${formatCurrency(item.unit_price)}`
            : formatCurrency(item.unit_price)

        // Compose line: description  [date]  qty/price  total
        const parts = [
          item.description,
          date,
          qtyPrice,
          `→  ${formatCurrency(item.total)}`,
        ].filter(Boolean)
        lines.push(parts.join('   '))
      }
      lines.push('')
    }

    // ── Totals ────────────────────────────────────────────────────────────────
    lines.push('-'.repeat(24))
    if (invoice.tax > 0) {
      lines.push(`Subtotal:  ${formatCurrency(invoice.subtotal)}`)
      lines.push(`Tax:       ${formatCurrency(invoice.tax)}`)
    }
    lines.push(`TOTAL DUE: ${formatCurrency(invoice.total)}`)

    if (invoice.status === 'paid' && invoice.paid_at) {
      lines.push('')
      lines.push(`✓ Paid on ${format(new Date(invoice.paid_at), 'MMMM d, yyyy')}`)
    }

    // ── Notes ─────────────────────────────────────────────────────────────────
    if (invoice.notes) {
      lines.push('')
      lines.push('Notes:')
      lines.push(invoice.notes)
    }

    lines.push('')
    lines.push('='.repeat(36))
    lines.push('Thank you for your business!')

    return lines.join('\n')
  }

  async function copyInvoice() {
    const text = buildInvoiceText()

    // Modern Clipboard API (requires HTTPS or localhost + user gesture)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text)
        flashCopied()
        return
      } catch {
        // Fall through to legacy fallback
      }
    }

    // Legacy execCommand fallback (deprecated but widely supported)
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (ok) { flashCopied(); return }
    } catch {
      // ignore
    }

    toast.error('Unable to copy — please select and copy the invoice manually.')
  }

  function flashCopied() {
    setCopied(true)
    toast.success('Invoice copied successfully.')
    setTimeout(() => setCopied(false), 2000)
  }

  // ── PDF Download ─────────────────────────────────────────────────────────

  async function downloadPDF() {
    if (!invoice) return
    setPdfing(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'pt', format: 'letter' })
      const PW = 612, PH = 792
      const ML = 40, MR = 40
      const CW = PW - ML - MR  // 532

      const O   = '#E66B1A'  // brand orange
      const DK  = '#111827'  // near-black
      const GN  = '#16a34a'  // green (paid label)
      const DGN = '#166534'  // dark green (CHECK TO text)
      const LG  = '#f3f4f6'  // light gray footer
      const MG  = '#d1d5db'  // border gray
      const WH  = '#ffffff'

      const customer = (invoice as Invoice & { customer?: Customer }).customer

      // ── WHITE HEADER BACKGROUND ──────────────────────────────────────
      doc.setFillColor(WH)
      doc.rect(0, 0, PW, 215, 'F')

      // ── LARGE ORANGE CROSS ───────────────────────────────────────────
      // Vertical bar
      doc.setFillColor(O)
      doc.roundedRect(197, 12, 36, 168, 10, 10, 'F')
      // Horizontal bar (starts after "CUT" text ~x130)
      doc.roundedRect(128, 76, 180, 36, 10, 10, 'F')

      // ── CROSS / CUT / LAWN CARE TEXT ─────────────────────────────────
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(28)
      doc.setTextColor(DK)
      doc.text('CROSS', ML, 68)
      doc.text('CUT',   ML, 100)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.text('LAWN CARE', 254, 168)

      // ── INVOICE TITLE (right) ─────────────────────────────────────────
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(64)
      doc.setTextColor(DK)
      doc.text('INVOICE', PW - MR, 90, { align: 'right' })

      // Date + To (right side, below INVOICE)
      const mLX = 375
      let mY = 128
      doc.setFontSize(12)

      doc.setFont('helvetica', 'bold')
      doc.setTextColor(O)
      doc.text('Date:', mLX, mY)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(DK)
      doc.text(format(new Date(invoice.created_at), 'MMMM d, yyyy'), mLX + 46, mY)

      mY += 34
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(O)
      doc.text('To:', mLX, mY)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(DK)
      doc.text(customer?.name ?? '', mLX + 30, mY)

      // ── GRASS STRIP (layered greens for depth) ────────────────────────
      doc.setFillColor('#14532d')
      doc.rect(0, 196, PW, 22, 'F')
      doc.setFillColor('#15803d')
      doc.rect(0, 196, PW, 16, 'F')
      doc.setFillColor('#16a34a')
      doc.rect(0, 196, PW, 10, 'F')
      doc.setFillColor('#22c55e')
      doc.rect(0, 196, PW, 5, 'F')

      // ── TABLE ─────────────────────────────────────────────────────────
      const TY = 228
      const dateColW  = 90
      const descColW  = 290
      const priceColW = CW - dateColW - descColW   // 152
      const rowH      = 30
      const displayRows = Math.max(7, items.length)

      // Header
      doc.setFillColor(DK)
      doc.rect(ML, TY, dateColW + descColW, 26, 'F')
      doc.setFillColor(O)
      doc.rect(ML + dateColW + descColW, TY, priceColW, 26, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(WH)
      doc.text('DATE',          ML + dateColW / 2,                        TY + 17, { align: 'center' })
      doc.text('DESCRIPTION',   ML + dateColW + descColW / 2,             TY + 17, { align: 'center' })
      doc.text('PRICE PER MOW', ML + dateColW + descColW + priceColW / 2, TY + 17, { align: 'center' })

      // Data rows
      for (let i = 0; i < displayRows; i++) {
        const rowY = TY + 26 + i * rowH
        const item = items[i]

        doc.setFillColor(WH)
        doc.rect(ML, rowY, CW, rowH, 'F')

        // Dashed row separator
        doc.setDrawColor(MG)
        doc.setLineWidth(0.5)
        doc.setLineDashPattern([2, 3], 0)
        doc.line(ML, rowY + rowH, ML + CW, rowY + rowH)
        doc.setLineDashPattern([], 0)

        if (item) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(11)
          doc.setTextColor(DK)
          const dStr = item.service_date
            ? format(new Date(item.service_date + 'T12:00:00'), 'M/d')
            : ''
          doc.text(dStr,                            ML + dateColW / 2,                        rowY + 20, { align: 'center' })
          doc.text(item.description ?? '',           ML + dateColW + 12,                       rowY + 20)
          doc.text(formatCurrency(item.unit_price),  ML + dateColW + descColW + priceColW / 2, rowY + 20, { align: 'center' })
        }
      }

      // Vertical dividers + outer border
      const tableH = 26 + displayRows * rowH
      doc.setDrawColor(MG)
      doc.setLineWidth(0.6)
      doc.setLineDashPattern([], 0)
      doc.line(ML + dateColW,            TY, ML + dateColW,            TY + tableH)
      doc.line(ML + dateColW + descColW, TY, ML + dateColW + descColW, TY + tableH)
      doc.rect(ML, TY, CW, tableH)

      // ── TOTALS (bordered rows, right-aligned block) ───────────────────
      const paidAmt    = invoice.status === 'paid' ? invoice.total : 0
      const dueAmt     = invoice.status === 'paid' ? 0 : invoice.total
      const totStartX  = ML + dateColW + descColW - 80   // start 80pt into desc col
      const totBoxW    = ML + CW - totStartX
      const totRowH    = 30
      let totY = TY + tableH

      const totalsRows = [
        { label: 'SUBTOTAL', value: formatCurrency(invoice.subtotal ?? invoice.total), lc: DK, vc: DK },
        { label: 'PAID',     value: formatCurrency(paidAmt),                           lc: GN, vc: O  },
        { label: 'DUE',      value: formatCurrency(dueAmt),                            lc: O,  vc: O  },
      ]
      for (const t of totalsRows) {
        doc.setFillColor(WH)
        doc.rect(totStartX, totY, totBoxW, totRowH, 'F')
        doc.setDrawColor(MG)
        doc.setLineWidth(0.8)
        doc.rect(totStartX, totY, totBoxW, totRowH)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(t.lc)
        doc.text(t.label, totStartX + 14, totY + 20)

        doc.setTextColor(t.vc)
        doc.text(t.value, totStartX + totBoxW - 12, totY + 20, { align: 'right' })
        totY += totRowH
      }

      // ── THANK YOU ─────────────────────────────────────────────────────
      let curY = totY + 36
      doc.setFontSize(22)
      doc.setFont('helvetica', 'bolditalic')
      doc.setTextColor(O)
      doc.text('Thank you', ML, curY)
      const tyW = doc.getTextWidth('Thank you')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(DK)
      doc.text(' for your business!', ML + tyW, curY)
      curY += 36

      // ── PAYMENT BOX (full width, orange border) ───────────────────────
      const boxW = CW
      const boxH = 72
      doc.setLineWidth(2)
      doc.setDrawColor(O)
      doc.roundedRect(ML, curY, boxW, boxH, 8, 8, 'S')

      const bCX = ML + boxW / 2

      // "CHECK TO:  " dark + "CROSS CUT LAWN CARE" dark green
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      const p1 = 'CHECK TO:  '
      const p2 = 'CROSS CUT LAWN CARE'
      const w1 = doc.getTextWidth(p1)
      const w2 = doc.getTextWidth(p2)
      const txtW = w1 + w2
      const txtX = bCX - txtW / 2
      const chkY = curY + 30

      doc.setLineWidth(1.2)
      doc.setDrawColor(O)
      doc.line(ML + 18, chkY - 4, txtX - 10, chkY - 4)
      doc.setTextColor(DK)
      doc.text(p1, txtX, chkY)
      doc.setTextColor(DGN)
      doc.text(p2, txtX + w1, chkY)
      doc.line(txtX + txtW + 10, chkY - 4, ML + boxW - 18, chkY - 4)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      doc.setTextColor(DK)
      doc.text('VENMO: @Crosscut-Cbrower', bCX, curY + 54, { align: 'center' })

      // ── FOOTER (light gray, 3 columns + icons) ────────────────────────
      const FY = PH - 82
      doc.setFillColor(LG)
      doc.rect(0, FY, PW, 56, 'F')

      const col1 = PW * 0.18
      const col2 = PW * 0.50
      const col3 = PW * 0.80
      const ftY  = FY + 24

      // Vertical separators
      doc.setDrawColor('#9ca3af')
      doc.setLineWidth(0.8)
      doc.line(PW * 0.363, FY + 10, PW * 0.363, FY + 46)
      doc.line(PW * 0.637, FY + 10, PW * 0.637, FY + 46)

      // Col 1 — location pin + address
      doc.setFillColor(O)
      doc.circle(col1 - 52, ftY - 5, 7, 'F')
      doc.setFillColor(WH)
      doc.circle(col1 - 52, ftY - 5, 3, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(DK)
      doc.text('1166 JAYROGERS CT 49696', col1 - 40, ftY + 2)

      // Col 2 — phone circle + number
      doc.setFillColor(O)
      doc.circle(col2 - 46, ftY - 5, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(DK)
      doc.text('231-463-5080', col2 - 34, ftY + 2)

      // Col 3 — tagline
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(DK)
      doc.text('RELIABLE. LOCAL. PROFESSIONAL.', col3, ftY - 4, { align: 'center' })
      doc.setFontSize(10)
      doc.setTextColor(O)
      doc.text('CROSS CUT LAWN CARE', col3, ftY + 13, { align: 'center' })

      // ── BOTTOM DARK BAND ──────────────────────────────────────────────
      doc.setFillColor(DK)
      doc.rect(0, PH - 26, PW, 26, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(WH)
      doc.text('THANK YOU FOR CHOOSING CROSS CUT LAWN CARE!', PW / 2, PH - 10, { align: 'center' })

      // ── SAVE ──────────────────────────────────────────────────────────
      const safeNum  = invoice.invoice_number.replace(/[^a-z0-9]/gi, '_')
      const safeCust = (customer?.name ?? 'invoice').replace(/\s+/g, '_')
      doc.save(`${safeNum}_${safeCust}.pdf`)
    } catch (err) {
      console.error('[PDF]', err)
      toast.error('Failed to generate PDF')
    } finally {
      setPdfing(false)
    }
  }

  // ── Loading / not-found ───────────────────────────────────────────────────

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
            {/* Copy Invoice — header shortcut */}
            <Button
              variant="outline"
              size="sm"
              icon={copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
              onClick={copyInvoice}
              className={copied ? 'border-green-400 text-green-600 dark:border-green-600 dark:text-green-400' : ''}
            >
              <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<FileDown size={15} />}
              onClick={downloadPDF}
              loading={pdfing}
            >
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button variant="outline" size="sm" icon={<Printer size={15} />} onClick={printInvoice}>
              <span className="hidden sm:inline">Print</span>
            </Button>
            {invoice.status !== 'paid' && invoice.status !== 'void' && (
              <Button size="sm" icon={<DollarSign size={15} />} onClick={() => setMarkPaidOpen(true)}>
                <span className="hidden sm:inline">Mark Paid</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
        {/* Invoice Card */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 print:border-0 print:shadow-none overflow-hidden">
          {/* Invoice header */}
          <div className="bg-gray-950 p-6 text-white">
            <div className="flex items-start justify-between">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/crosscut-logo.png"
                  alt="CrossCut Lawn Care"
                  className="h-12 w-auto mb-1.5"
                />
                <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">CrossCut Lawn Care</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{invoice.invoice_number}</p>
                <p className="text-gray-400 text-sm mt-0.5">
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
        <div className="space-y-2 print:hidden">
          {/* Copy + Download PDF side-by-side */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className={`transition-all ${
                copied
                  ? 'border-green-500 text-green-700 bg-green-50 dark:border-green-500 dark:text-green-400 dark:bg-green-900/20'
                  : ''
              }`}
              size="lg"
              icon={
                copied
                  ? <Check size={16} className="text-green-600 dark:text-green-400" />
                  : <Copy size={16} />
              }
              onClick={copyInvoice}
            >
              {copied ? 'Copied!' : 'Copy Invoice'}
            </Button>
            <Button
              variant="outline"
              size="lg"
              icon={<FileDown size={16} />}
              onClick={downloadPDF}
              loading={pdfing}
            >
              Download PDF
            </Button>
          </div>

          {invoice.status !== 'void' && (
            <>
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
            </>
          )}
        </div>
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
