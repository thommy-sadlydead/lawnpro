/**
 * CrossCut Payroll Calculator
 *
 * Three rules govern how job revenue is split:
 *
 * Rule 1 — Owner works alone
 *   Owner receives 100% of job price.
 *
 * Rule 2 — Non-owner works alone (owner NOT on the job)
 *   Worker receives 50% of job price.
 *   Owner receives the other 50% implicitly (business revenue).
 *   Employee Pay Per Mow is ignored.
 *
 * Rule 3 — Owner + one or more employees
 *   Employee Pay Per Mow is split equally among all non-owner workers.
 *   Owner receives: job price − total employee pay.
 *
 * Edge cases:
 *   - Null job price → treated as 0
 *   - Null employee_pay_per_mow in Rule 3 → employees get $0, owner gets 100%
 *   - Multiple non-owners in Rule 2 → 50% split evenly among them
 */

export interface PayrollCrew {
  id: string
  isOwner: boolean
  name: string
}

export interface PayrollInput {
  jobPrice: number | null
  employeePayPerMow: number | null
  crew: PayrollCrew[]
}

export type PayrollRule = 1 | 2 | 3

export interface PayrollResult {
  /** employee_id → dollar amount for this job */
  payouts: Map<string, number>
  rule: PayrollRule | null
  /** Human-readable explanation shown in the complete modal */
  summary: string
  /** Short label for the rule chip */
  ruleLabel: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function money(n: number): string {
  return `$${n.toFixed(2).replace(/\.00$/, '')}`
}

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const price = input.jobPrice ?? 0
  const employeePayPerMow = input.employeePayPerMow ?? 0
  const { crew } = input

  const payouts = new Map<string, number>()

  if (crew.length === 0) {
    return {
      payouts,
      rule: null,
      summary: 'Select crew to auto-calculate payroll.',
      ruleLabel: '',
    }
  }

  const owner = crew.find((c) => c.isOwner) ?? null
  const nonOwners = crew.filter((c) => !c.isOwner)

  // ── Rule 1: Owner alone ──────────────────────────────────────────────────
  if (owner && nonOwners.length === 0) {
    payouts.set(owner.id, round2(price))
    return {
      payouts,
      rule: 1,
      ruleLabel: 'Rule 1',
      summary: `${owner.name} works alone → receives 100% (${money(price)}).`,
    }
  }

  // ── Rule 2: Non-owners only (owner not physically present) ───────────────
  if (!owner && nonOwners.length > 0) {
    const employeeTotal = round2(price * 0.5)
    const perEmployee = round2(employeeTotal / nonOwners.length)

    for (const emp of nonOwners) {
      payouts.set(emp.id, perEmployee)
    }

    const ownerTake = round2(price - employeeTotal)
    const employeeDesc =
      nonOwners.length === 1
        ? `${nonOwners[0].name} receives ${money(perEmployee)}`
        : `${nonOwners.length} employees each receive ${money(perEmployee)}`

    return {
      payouts,
      rule: 2,
      ruleLabel: 'Rule 2',
      summary:
        `${employeeDesc} (50%). Christian receives ${money(ownerTake)} (50%) — ` +
        `Employee Pay Per Mow is ignored.`,
    }
  }

  // ── Rule 3: Owner + employees ─────────────────────────────────────────────
  if (owner && nonOwners.length > 0) {
    const totalEmpPay = employeePayPerMow
    const perEmployee = nonOwners.length > 0 ? round2(totalEmpPay / nonOwners.length) : 0
    const ownerPay = round2(price - totalEmpPay)

    payouts.set(owner.id, ownerPay)
    for (const emp of nonOwners) {
      payouts.set(emp.id, perEmployee)
    }

    const employeeDesc =
      nonOwners.length === 1
        ? `${nonOwners[0].name} receives ${money(perEmployee)} (property rate)`
        : `${nonOwners.length} employees each receive ${money(perEmployee)} (${money(totalEmpPay)} split)`

    return {
      payouts,
      rule: 3,
      ruleLabel: 'Rule 3',
      summary: `${employeeDesc}. ${owner.name} receives ${money(ownerPay)} (${money(price)} − ${money(totalEmpPay)}).`,
    }
  }

  return { payouts, rule: null, summary: '', ruleLabel: '' }
}

/**
 * Returns a CSS color class for the rule label chip.
 */
export function ruleColor(rule: PayrollRule | null): string {
  switch (rule) {
    case 1: return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
    case 2: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
    case 3: return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
    default: return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
  }
}
