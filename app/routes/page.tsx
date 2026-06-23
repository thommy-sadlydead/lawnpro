'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Map, ChevronLeft, ChevronRight, CheckCircle2, Clock,
  MapPin, Phone, Lock, ExternalLink, Navigation,
  Loader2, AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { MobileHeader } from '@/components/nav/MobileNav'
import { formatPhone, formatCurrency } from '@/lib/utils'
import type { Job, Employee } from '@/types'
import { format, addDays, subDays, isToday } from 'date-fns'

// ── Home base ─────────────────────────────────────────────────────────────────
const HOME_ADDRESS = '1166 Jay Rogers Ct, Grawn, MI 49696'
// Pre-geocoded so the first load is instant
const HOME_COORDS  = { lat: 44.6897, lng: -85.6525 }

// ── Types ─────────────────────────────────────────────────────────────────────
type Coords = { lat: number; lng: number }

type RichJob = Job & {
  customer?: {
    id: string; name: string; address?: string; city?: string
    state?: string; zip?: string; phone?: string
    gate_code?: string; service_notes?: string; price?: number
  }
  employee?: { id: string; name: string }
  _coords?: Coords | null   // injected after geocoding
}

// ── Haversine distance (miles) ────────────────────────────────────────────────
function dist(a: Coords, b: Coords): number {
  const R = 3959
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

// ── Nearest-neighbour TSP starting from home ──────────────────────────────────
// Jobs without coordinates are appended at the end in original order.
function optimizeRoute(jobs: RichJob[]): RichJob[] {
  const withCoords = jobs.filter(j => j._coords)
  const noCoords   = jobs.filter(j => !j._coords)

  const pool: RichJob[] = [...withCoords]
  const route: RichJob[] = []
  let current: Coords = HOME_COORDS

  while (pool.length > 0) {
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < pool.length; i++) {
      const d = dist(current, pool[i]._coords!)
      if (d < bestDist) { bestDist = d; best = i }
    }
    route.push(pool[best])
    current = pool[best]._coords!
    pool.splice(best, 1)
  }

  return [...route, ...noCoords]
}

// ── Geocode via Nominatim (OSM) with localStorage cache ───────────────────────
// Rate-limit: 1 req / second per OSM policy.  Cache persists across sessions.
async function geocode(address: string): Promise<Coords | null> {
  if (!address.trim()) return null

  const key = `geocode:${address.toLowerCase().trim()}`
  try {
    const hit = localStorage.getItem(key)
    if (hit) return JSON.parse(hit)
  } catch { /* incognito / storage disabled */ }

  try {
    // Honour OSM rate-limit between requests
    await new Promise(r => setTimeout(r, 500))
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`,
      { headers: { 'User-Agent': 'CrossCutLawnCare/1.0' } }
    )
    const data = await res.json()
    if (!data.length) return null
    const coords: Coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    try { localStorage.setItem(key, JSON.stringify(coords)) } catch { /* quota */ }
    return coords
  } catch {
    return null
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RoutesPage() {
  const supabase = createClient()

  const [date,             setDate]             = useState(new Date())
  const [rawJobs,          setRawJobs]          = useState<RichJob[]>([])
  const [optimizedJobs,    setOptimizedJobs]    = useState<RichJob[]>([])
  const [employees,        setEmployees]        = useState<Employee[]>([])
  const [loading,          setLoading]          = useState(true)
  const [optimizing,       setOptimizing]       = useState(false)
  const [totalMiles,       setTotalMiles]       = useState<number | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all')

  useEffect(() => { loadData() }, [date])

  // ── Load from Supabase, then kick off route optimisation ────────────────────
  async function loadData() {
    setLoading(true)
    setOptimizedJobs([])
    setTotalMiles(null)
    const dateStr = format(date, 'yyyy-MM-dd')

    const [jobsRes, empRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, customer:customers(id, name, address, city, state, zip, phone, gate_code, service_notes, price), employee:employees!assigned_employee_id(id, name)')
        .eq('scheduled_date', dateStr)
        .order('customer_id'),
      supabase.from('employees').select('id, name').eq('is_active', true).order('name'),
    ])

    const jobs = (jobsRes.data ?? []) as RichJob[]
    setRawJobs(jobs)
    setEmployees((empRes.data ?? []) as Employee[])
    setLoading(false)

    if (jobs.length > 1) runOptimize(jobs)
    else if (jobs.length === 1) setOptimizedJobs(jobs) // single stop — no need to sort
  }

  // ── Geocode all addresses then sort ─────────────────────────────────────────
  async function runOptimize(jobs: RichJob[]) {
    setOptimizing(true)

    const geocoded: RichJob[] = []
    for (const job of jobs) {
      const c = job.customer
      const addr = [c?.address, c?.city, c?.state, c?.zip].filter(Boolean).join(', ')
      const coords = addr ? await geocode(addr) : null
      geocoded.push({ ...job, _coords: coords })
    }

    const sorted = optimizeRoute(geocoded)
    setOptimizedJobs(sorted)

    // Total driving distance estimate (straight-line, home → stop1 → … → stopN)
    let miles = 0
    let prev: Coords = HOME_COORDS
    for (const j of sorted) {
      if (j._coords) { miles += dist(prev, j._coords); prev = j._coords }
    }
    setTotalMiles(Math.round(miles * 10) / 10)
    setOptimizing(false)
  }

  // ── Toggle job completion ────────────────────────────────────────────────────
  async function toggleComplete(job: RichJob) {
    const next = job.status === 'completed' ? 'pending' : 'completed'
    await supabase.from('jobs').update({
      status: next,
      ...(next === 'completed' ? { completed_at: new Date().toISOString() } : { completed_at: null }),
    }).eq('id', job.id)
    const patch = (arr: RichJob[]) => arr.map(j => j.id === job.id ? { ...j, status: next as Job['status'] } : j)
    setRawJobs(patch)
    setOptimizedJobs(patch)
  }

  // ── Derived display list (optimised if ready, otherwise original) ────────────
  const displayJobs = (optimizedJobs.length > 0 ? optimizedJobs : rawJobs) as RichJob[]
  const filteredJobs = displayJobs.filter(j =>
    selectedEmployee === 'all' || j.assigned_employee_id === selectedEmployee
  )

  const completedCount = filteredJobs.filter(j => j.status === 'completed').length
  const totalPayout    = filteredJobs
    .filter(j => j.status === 'completed')
    .reduce((s, j) => s + (j.payout_amount ?? 0), 0)

  // ── Open full multi-stop route in Google Maps ────────────────────────────────
  function openInMaps() {
    const addrs = filteredJobs
      .map(j => [j.customer?.address, j.customer?.city, j.customer?.state].filter(Boolean).join(', '))
      .filter(Boolean)
    if (!addrs.length) return

    // Google Maps multi-stop URL (works without API key)
    const stops = [HOME_ADDRESS, ...addrs].map(encodeURIComponent).join('/')
    window.open(`https://www.google.com/maps/dir/${stops}`, '_blank')
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <MobileHeader title="Routes" />

      {/* ── Header ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3 px-4 lg:px-6 py-4">
          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Route Manager</h1>
          </div>

          {/* Date navigator */}
          <div className="flex items-center gap-2 flex-1">
            <button
              onClick={() => setDate(d => subDays(d, 1))}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setDate(new Date())}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              {isToday(date) ? 'Today' : format(date, 'EEE, MMM d')}
            </button>
            <button
              onClick={() => setDate(d => addDays(d, 1))}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {filteredJobs.length > 0 && (
            <Button variant="outline" size="sm" icon={<ExternalLink size={14} />} onClick={openInMaps}>
              Maps
            </Button>
          )}
        </div>

        {/* Employee filter */}
        {employees.length > 1 && (
          <div className="flex gap-2 px-4 lg:px-6 pb-3 overflow-x-auto">
            <button
              onClick={() => setSelectedEmployee('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedEmployee === 'all'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              All Employees
            </button>
            {employees.map(emp => (
              <button
                key={emp.id}
                onClick={() => setSelectedEmployee(emp.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedEmployee === emp.id
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {emp.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Progress / status bar ── */}
      {(filteredJobs.length > 0 || optimizing) && (
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-3 space-y-2">

          {/* Top row */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {completedCount} of {filteredJobs.length} complete
            </span>
            <div className="flex items-center gap-3">
              {optimizing ? (
                <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium animate-pulse">
                  <Loader2 size={12} className="animate-spin" />
                  Optimizing route…
                </span>
              ) : totalMiles !== null && (
                <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
                  <Navigation size={12} />
                  ~{totalMiles} mi · Route optimized
                </span>
              )}
              <span className="font-semibold text-green-600 dark:text-green-400">
                {formatCurrency(totalPayout)} earned
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-600 rounded-full transition-all duration-300"
              style={{ width: filteredJobs.length > 0 ? `${(completedCount / filteredJobs.length) * 100}%` : '0%' }}
            />
          </div>

          {/* Starting point label */}
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
            <MapPin size={10} />
            Starting from {HOME_ADDRESS}
          </div>
        </div>
      )}

      {/* ── Job list ── */}
      <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-20">
            <Map className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">No jobs scheduled</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              {isToday(date) ? 'No jobs today' : `No jobs on ${format(date, 'EEEE, MMMM d')}`}
            </p>
            <Link href="/schedule">
              <Button variant="outline" className="mt-4">Go to Schedule</Button>
            </Link>
          </div>
        ) : (
          filteredJobs.map((job, idx) => {
            const customer  = job.customer
            const employee  = job.employee
            const completed = job.status === 'completed'
            const located   = !!job._coords

            return (
              <div
                key={job.id}
                className={`bg-white dark:bg-gray-900 rounded-xl border transition-all ${
                  completed
                    ? 'border-green-200 dark:border-green-800 opacity-75'
                    : 'border-gray-200 dark:border-gray-800'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">

                    {/* Stop number badge */}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      completed
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}>
                      {completed ? <CheckCircle2 size={16} /> : idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">

                          {/* Customer name + geocode warning */}
                          <div className="flex items-center gap-1.5">
                            <Link href={`/customers/${job.customer_id}`}>
                              <p className={`font-bold text-gray-900 dark:text-white hover:text-green-600 transition-colors ${completed ? 'line-through decoration-green-500' : ''}`}>
                                {customer?.name}
                              </p>
                            </Link>
                            {/* Shown only after optimisation finishes and this job couldn't be located */}
                            {!optimizing && optimizedJobs.length > 0 && !located && customer?.address && (
                              <span title="Address couldn't be located — placed at end of route">
                                <AlertCircle size={13} className="text-amber-400 flex-shrink-0" />
                              </span>
                            )}
                          </div>

                          {/* Address → opens in Maps */}
                          {customer?.address && (
                            <a
                              href={`https://maps.google.com/?q=${encodeURIComponent(`${customer.address} ${customer.city ?? ''} ${customer.state ?? ''}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 mt-0.5 hover:text-green-600 transition-colors"
                            >
                              <MapPin size={12} className="text-gray-400 flex-shrink-0" />
                              <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                {customer.address}{customer.city ? `, ${customer.city}` : ''}
                              </span>
                              <ExternalLink size={10} className="text-gray-400 flex-shrink-0" />
                            </a>
                          )}

                          {/* Phone + assigned employee */}
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {customer?.phone && (
                              <a href={`tel:${customer.phone}`} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-green-600">
                                <Phone size={11} /> {formatPhone(customer.phone)}
                              </a>
                            )}
                            {employee && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">{employee.name}</span>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>

                      {/* Gate code highlight */}
                      {customer?.gate_code && (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <Lock size={11} className="text-amber-600" />
                          <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400">
                            Gate: {customer.gate_code}
                          </span>
                        </div>
                      )}

                      {/* Service notes */}
                      {customer?.service_notes && (
                        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 italic line-clamp-2">
                          {customer.service_notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => toggleComplete(job)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                        completed
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-700 dark:hover:text-green-400'
                      }`}
                    >
                      {completed
                        ? <><CheckCircle2 size={15} /> Completed — tap to undo</>
                        : <><Clock size={15} /> Mark Complete</>
                      }
                    </button>
                    <Link href={`/jobs/${job.id}`}>
                      <button className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        Details
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
