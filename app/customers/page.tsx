'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Phone, MapPin, RefreshCw, Filter } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusBadge, Badge } from '@/components/ui/Badge'
import { MobileHeader } from '@/components/nav/MobileNav'
import { formatCurrency, formatPhone, getFrequencyLabel } from '@/lib/utils'
import type { Customer } from '@/types'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const supabase = createClient()

  useEffect(() => {
    loadCustomers()
  }, [filter])

  async function loadCustomers() {
    setLoading(true)
    let query = supabase.from('customers').select('*').order('name')
    if (filter === 'active') query = query.eq('is_active', true)
    if (filter === 'inactive') query = query.eq('is_active', false)
    const { data } = await query
    setCustomers((data ?? []) as Customer[])
    setLoading(false)
  }

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.address?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <MobileHeader title="Customers" />

      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 lg:px-6 py-4">
          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Customers</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{filtered.length} customers</p>
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <Link href="/customers/new">
              <Button size="sm" icon={<Plus size={16} />}>Add</Button>
            </Link>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-4 lg:px-6 pb-0">
          {(['active', 'all', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                filter === f
                  ? 'border-green-600 text-green-600 dark:text-green-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Customer List */}
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Search className="h-8 w-8 text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 font-medium">No customers found</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try adjusting your search</p>
            <Link href="/customers/new">
              <Button className="mt-4" icon={<Plus size={16} />}>Add First Customer</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((customer) => (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="flex items-start gap-4 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-green-400 dark:hover:border-green-600 hover:shadow-sm transition-all"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-green-700 dark:text-green-400 font-bold text-sm">
                    {customer.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{customer.name}</p>
                      {customer.address && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin size={11} className="text-gray-400 flex-shrink-0" />
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {customer.address}{customer.city ? `, ${customer.city}` : ''}
                          </p>
                        </div>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Phone size={11} className="text-gray-400 flex-shrink-0" />
                          <p className="text-xs text-gray-500 dark:text-gray-400">{formatPhone(customer.phone)}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {customer.price && (
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(customer.price)}</p>
                      )}
                      <Badge variant={customer.service_frequency === 'weekly' ? 'green' : 'blue'}>
                        {getFrequencyLabel(customer.service_frequency)}
                      </Badge>
                    </div>
                  </div>
                  {customer.service_notes && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 line-clamp-1 italic">
                      {customer.service_notes}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
