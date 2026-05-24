import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { Sidebar } from '@/components/nav/Sidebar'
import { MobileNav } from '@/components/nav/MobileNav'
import './globals.css'

export const metadata: Metadata = {
  title: 'LawnPro — Lawn Business Manager',
  description: 'Manage customers, scheduling, jobs, employees, and invoices for your lawn care business.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LawnPro',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#16a34a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white antialiased">
        <div className="flex h-full">
          <Sidebar />
          <main className="flex-1 flex flex-col min-h-screen min-w-0 overflow-x-hidden">
            <div className="flex-1 pb-20 lg:pb-0">
              {children}
            </div>
          </main>
        </div>
        <MobileNav />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  )
}
