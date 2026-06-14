'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Calendar,
  Briefcase,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Home' },
  { href: '/customers', icon: Users, label: 'Customers' },
  { href: '/schedule', icon: Calendar, label: 'Schedule' },
  { href: '/jobs', icon: Briefcase, label: 'Jobs' },
  { href: '/activity', icon: Activity, label: 'Activity' },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 safe-bottom">
      <div className="flex">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-xs font-medium transition-colors',
                isActive
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-500 dark:text-gray-400'
              )}
            >
              <Icon size={20} className={isActive ? 'stroke-[2.5]' : 'stroke-[1.5]'} />
              <span className={cn('text-[10px]', isActive && 'font-semibold')}>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function MobileHeader({ title }: { title: string }) {
  return (
    <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/crosscut-logo.png" alt="CrossCut" className="w-7 h-7 rounded-lg object-cover" />
      <h1 className="text-base font-semibold text-gray-900 dark:text-white truncate">{title}</h1>
    </header>
  )
}
