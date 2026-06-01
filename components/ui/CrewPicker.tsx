'use client'

import { Check, Users } from 'lucide-react'
import type { Employee } from '@/types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface CrewMember {
  employee_id: string
  payout_amount: string // kept as string for input binding
}

interface CrewPickerProps {
  employees: Employee[]
  value: CrewMember[]
  onChange: (crew: CrewMember[]) => void
  /** Section heading — defaults to "Who worked on this job?" */
  label?: string
  /** Require at least one selection */
  required?: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function totalPayout(crew: CrewMember[]) {
  return crew.reduce((sum, m) => sum + (parseFloat(m.payout_amount) || 0), 0)
}

// ── Component ────────────────────────────────────────────────────────────────

export function CrewPicker({
  employees,
  value,
  onChange,
  label = 'Who worked on this job?',
  required,
}: CrewPickerProps) {
  const selectedIds = new Set(value.map((m) => m.employee_id))

  // Toggle an employee in/out of the crew
  const toggle = (emp: Employee) => {
    if (selectedIds.has(emp.id)) {
      onChange(value.filter((m) => m.employee_id !== emp.id))
    } else {
      onChange([
        ...value,
        {
          employee_id: emp.id,
          payout_amount: emp.default_payout?.toString() ?? '',
        },
      ])
    }
  }

  // Update one member's payout amount
  const updatePayout = (employee_id: string, payout_amount: string) => {
    onChange(value.map((m) => (m.employee_id === employee_id ? { ...m, payout_amount } : m)))
  }

  return (
    <div className="space-y-4">
      {/* ── Label ── */}
      <div className="flex items-center gap-2">
        <Users size={15} className="text-gray-400" />
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </p>
        {value.length > 0 && (
          <span className="ml-auto text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
            {value.length} selected
          </span>
        )}
      </div>

      {/* ── Employee grid (2 columns) ── */}
      <div className="grid grid-cols-2 gap-2">
        {employees.map((emp) => {
          const selected = selectedIds.has(emp.id)
          return (
            <button
              key={emp.id}
              type="button"
              onClick={() => toggle(emp)}
              className={[
                'flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all select-none',
                selected
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/25 shadow-sm'
                  : 'border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-700 bg-white dark:bg-gray-800/60',
              ].join(' ')}
            >
              {/* Avatar */}
              <div
                className={[
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors',
                  selected
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
                ].join(' ')}
              >
                {selected ? <Check size={13} strokeWidth={3} /> : initials(emp.name)}
              </div>

              {/* Name */}
              <p
                className={[
                  'text-sm font-medium leading-snug',
                  selected
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-gray-900 dark:text-white',
                ].join(' ')}
              >
                {emp.name}
              </p>
            </button>
          )
        })}
      </div>

      {/* ── Per-person payout inputs (only shown when someone is selected) ── */}
      {value.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Payout per person
            </p>
          </div>

          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {value.map((member) => {
              const emp = employees.find((e) => e.id === member.employee_id)
              if (!emp) return null
              return (
                <div key={member.employee_id} className="flex items-center gap-3 px-3 py-2.5">
                  {/* Mini avatar */}
                  <div className="w-6 h-6 rounded-md bg-green-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                    {initials(emp.name)}
                  </div>

                  {/* Name */}
                  <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 min-w-0 truncate">
                    {emp.name}
                  </span>

                  {/* Payout input */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-sm text-gray-400 font-medium">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={member.payout_amount}
                      onChange={(e) => updatePayout(member.employee_id, e.target.value)}
                      className="w-20 text-sm text-right px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Total row — only show when 2+ selected */}
          {value.length > 1 && (
            <div className="flex items-center justify-between px-3 py-2.5 bg-green-50 dark:bg-green-900/20 border-t border-green-200 dark:border-green-800">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Total payout
              </span>
              <span className="text-sm font-bold text-green-600 dark:text-green-400">
                ${totalPayout(value).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Empty state hint */}
      {value.length === 0 && required && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <span>⚠</span> Select at least one crew member
        </p>
      )}
    </div>
  )
}
