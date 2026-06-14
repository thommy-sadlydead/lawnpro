import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { Sidebar } from '@/components/nav/Sidebar'
import { MobileNav } from '@/components/nav/MobileNav'
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration'
import { InstallPrompt } from '@/components/InstallPrompt'
import './globals.css'

export const metadata: Metadata = {
  title: 'CrossCut — Lawn Business Manager',
  description: 'Manage customers, scheduling, jobs, employees, and invoices for your lawn care business.',
  manifest: '/manifest.json',

  // PWA / Apple
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CrossCut',
  },

  // Open Graph (looks nicer when shared from the installed app)
  openGraph: {
    title: 'CrossCut Business Manager',
    description: 'Manage your lawn care business from anywhere.',
    type: 'website',
  },

  // Icons
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/icons/favicon-32.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,           // Allow pinch-zoom (accessibility)
  viewportFit: 'cover',      // Edge-to-edge on notched iPhones
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#16a34a' },
    { media: '(prefers-color-scheme: dark)',  color: '#16a34a' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/*
          Apple splash screens — these tell iOS what image to show while
          the PWA is launching in standalone mode. Add your own generated
          splash PNGs to /public/splash/ if you want custom launch images.
          The sizes below cover the most common iOS devices.
        */}
        <link
          rel="apple-touch-startup-image"
          href="/icons/icon-512.png"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icons/icon-512.png"
          media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icons/icon-512.png"
          media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icons/icon-512.png"
          media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)"
        />
      </head>
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
        <InstallPrompt />
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
