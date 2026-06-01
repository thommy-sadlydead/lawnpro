'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { toast } from 'sonner'

export default function NewCustomerPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    address: '',
    city: '',
    state: 'TX',
    zip: '',
    phone: '',
    email: '',
    price: '',
    employee_pay_per_mow: '',
    service_frequency: 'biweekly',
    gate_code: '',
    service_notes: '',
    general_notes: '',
  })

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Customer name is required')
      return
    }
    setLoading(true)
    const { data, error } = await supabase.from('customers').insert({
      name: form.name.trim(),
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      zip: form.zip || null,
      phone: form.phone || null,
      email: form.email || null,
      price: form.price ? parseFloat(form.price) : null,
      employee_pay_per_mow: form.employee_pay_per_mow ? parseFloat(form.employee_pay_per_mow) : null,
      service_frequency: form.service_frequency,
      gate_code: form.gate_code || null,
      service_notes: form.service_notes || null,
      general_notes: form.general_notes || null,
      is_active: true,
    }).select().single()

    setLoading(false)
    if (error) {
      toast.error('Failed to create customer')
      return
    }
    toast.success('Customer added!')
    router.push(`/customers/${data.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/customers">
            <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors">
              <ArrowLeft size={18} />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">New Customer</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 lg:p-6 max-w-2xl mx-auto space-y-6">
        {/* Basic Info */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wide">Basic Info</h2>
          <Input
            label="Full Name *"
            placeholder="John Anderson"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone"
              type="tel"
              placeholder="555-1234"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              placeholder="john@email.com"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </div>
        </div>

        {/* Address */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wide">Address</h2>
          <Input
            label="Street Address"
            placeholder="123 Oak Street"
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
          />
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <Input
                label="City"
                placeholder="Springfield"
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
              />
            </div>
            <Input
              label="State"
              placeholder="TX"
              value={form.state}
              onChange={(e) => update('state', e.target.value)}
            />
            <Input
              label="ZIP"
              placeholder="75001"
              value={form.zip}
              onChange={(e) => update('zip', e.target.value)}
            />
          </div>
        </div>

        {/* Service */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wide">Service Details</h2>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Service Price ($)"
              type="number"
              step="0.01"
              placeholder="45.00"
              value={form.price}
              onChange={(e) => update('price', e.target.value)}
            />
            <Input
              label="Employee Pay Per Mow ($)"
              type="number"
              step="0.01"
              placeholder="20.00"
              value={form.employee_pay_per_mow}
              onChange={(e) => update('employee_pay_per_mow', e.target.value)}
              hint="Total paid to crew (Rule 3)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Frequency"
              value={form.service_frequency}
              onChange={(e) => update('service_frequency', e.target.value)}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-Weekly</option>
              <option value="custom">Custom</option>
              <option value="one-time">One-Time</option>
            </Select>
          </div>
          <Input
            label="Gate Code"
            placeholder="1234"
            value={form.gate_code}
            onChange={(e) => update('gate_code', e.target.value)}
          />
          <Textarea
            label="Service Notes"
            placeholder="Large backyard, careful near flower beds, dog in yard..."
            value={form.service_notes}
            onChange={(e) => update('service_notes', e.target.value)}
            rows={3}
          />
          <Textarea
            label="General Notes"
            placeholder="Prefers early morning, billing info, etc..."
            value={form.general_notes}
            onChange={(e) => update('general_notes', e.target.value)}
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-4">
          <Link href="/customers" className="flex-1">
            <Button variant="outline" className="w-full" type="button">Cancel</Button>
          </Link>
          <Button loading={loading} className="flex-1" type="submit">Add Customer</Button>
        </div>
      </form>
    </div>
  )
}
