'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

/**
 * Registers the service worker and notifies the user when a new version
 * is available. This component renders nothing — mount it once in layout.tsx.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    let refreshing = false

    // When the new SW takes control, reload to get fresh assets
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })

        // Check for updates every time the page becomes visible
        const checkForUpdate = () => registration.update().catch(() => null)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate()
        })

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            // A new SW has been installed and is waiting to activate
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // Show an update toast — clicking it activates the new SW
              toast('Update available', {
                description: 'A new version of LawnPro is ready.',
                duration: Infinity,
                action: {
                  label: 'Refresh',
                  onClick: () => {
                    newWorker.postMessage({ type: 'SKIP_WAITING' })
                  },
                },
              })
            }
          })
        })
      } catch (err) {
        // SW registration failure is non-fatal — app still works online
        console.warn('[SW] Registration failed:', err)
      }
    }

    // Register after the page has loaded so it doesn't compete with critical resources
    if (document.readyState === 'complete') {
      registerSW()
    } else {
      window.addEventListener('load', registerSW, { once: true })
    }
  }, [])

  return null
}
