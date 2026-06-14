'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import {
  LayoutDashboard,
  Users,
  Calendar,
  Briefcase,
  Activity,
  UserCheck,
  ClipboardList,
  FileText,
  BarChart2,
  Crown,
  Map,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/',              icon: LayoutDashboard, label: 'Home'      },
  { href: '/customers',     icon: Users,           label: 'Customers' },
  { href: '/schedule',      icon: Calendar,        label: 'Schedule'  },
  { href: '/jobs',          icon: Briefcase,       label: 'Jobs'      },
  { href: '/activity',      icon: Activity,        label: 'Activity'  },
  { href: '/employees',     icon: UserCheck,       label: 'Employees' },
  { href: '/employee-jobs', icon: ClipboardList,   label: 'Crew Jobs' },
  { href: '/invoices',      icon: FileText,        label: 'Invoices'  },
  { href: '/reports',       icon: BarChart2,       label: 'Reports'   },
  { href: '/owner',         icon: Crown,           label: 'Owner'     },
  { href: '/routes',        icon: Map,             label: 'Routes'    },
]

export function MobileNav() {
  const pathname = usePathname()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll the active tab into the center of the bar whenever the route changes
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const activeEl = container.querySelector<HTMLElement>('[data-active="true"]')
    if (!activeEl) return
    // Center the active item in the scroll container
    const offset = activeEl.offsetLeft - container.clientWidth / 2 + activeEl.clientWidth / 2
    container.scrollTo({ left: offset, behavior: 'smooth' })
  }, [pathname])

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 safe-bottom">
      <div className="relative">
        {/* Scrollable tab row */}
        <div ref={scrollRef} className="flex overflow-x-auto scrollbar-hide">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                data-active={isActive ? 'true' : undefined}
                className={cn(
                  'flex-shrink-0 w-16 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors',
                  isActive
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-500 dark:text-gray-400'
                )}
              >
                <Icon size={20} className={isActive ? 'stroke-[2.5]' : 'stroke-[1.5]'} />
                <span className={cn(
                  'text-[10px] leading-tight text-center font-medium',
                  isActive && 'font-semibold'
                )}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>

        {/* Subtle right-edge fade — hints that more tabs exist */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white dark:from-gray-950 to-transparent" />
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
