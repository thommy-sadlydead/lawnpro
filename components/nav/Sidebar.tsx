'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Calendar,
  Briefcase,
  UserCheck,
  FileText,
  Map,
  Leaf,
  Activity,
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/customers', icon: Users, label: 'Customers' },
  { href: '/schedule', icon: Calendar, label: 'Schedule' },
  { href: '/jobs', icon: Briefcase, label: 'Jobs' },
  { href: '/activity', icon: Activity, label: 'Activity' },
  { href: '/employees', icon: UserCheck, label: 'Employees' },
  { href: '/employee-jobs', icon: ClipboardList, label: 'Employee Jobs' },
  { href: '/invoices', icon: FileText, label: 'Invoices' },
  { href: '/routes', icon: Map, label: 'Routes' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 bg-gray-950 border-r border-gray-800 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-800">
        <div className="p-2 bg-green-600 rounded-xl">
          <Leaf className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-white text-sm leading-tight">CrossCut</p>
          <p className="text-xs text-gray-400">Business Manager</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                isActive
                  ? 'bg-green-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              )}
            >
              <Icon className="h-4.5 w-4.5 flex-shrink-0" size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        <p className="text-xs text-gray-500">© 2025 CrossCut Lawn Care</p>
      </div>
    </aside>
  )
}
