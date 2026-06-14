'use client'

import { useEffect, useState } from 'react'
import { X, Download, Share } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

type Platform = 'chrome' | 'ios' | null

/**
 * Install Prompt / Banner
 *
 * - On Chrome/Android/Desktop: catches `beforeinstallprompt` and shows a
 *   custom banner. Clicking "Install" triggers the native prompt.
 * - On iOS/Safari: shows instructions since Safari doesn't support
 *   `beforeinstallprompt`.
 * - Dismissed state is persisted in localStorage for 30 days.
 */
export function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [iosInstructions, setIosInstructions] = useState(false)

  useEffect(() => {
    // Don't show if already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if ((window.navigator as { standalone?: boolean }).standalone === true) return

    // Don't show if recently dismissed
    const dismissedAt = localStorage.getItem('crosscut-install-dismissed')
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24)
      if (daysSince < 30) return
    }

    // Detect iOS Safari
    const ua = navigator.userAgent
    const isIos = /iphone|ipad|ipod/i.test(ua)
    const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua)

    if (isIos && isSafari) {
      // Show after a short delay so it doesn't pop up immediately
      const t = setTimeout(() => {
        setPlatform('ios')
        setVisible(true)
      }, 3000)
      return () => clearTimeout(t)
    }

    // Chrome / Edge / Android — listen for native install event
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setPlatform('chrome')
      // Show after a short delay
      setTimeout(() => setVisible(true), 2500)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    setVisible(false)
    setIosInstructions(false)
    localStorage.setItem('crosscut-install-dismissed', Date.now().toString())
  }

  const install = async () => {
    if (platform === 'ios') {
      setIosInstructions(true)
      return
    }
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
    }
    setDeferredPrompt(null)
  }

  if (!visible) return null

  // ── iOS share-sheet instructions modal ──────────────────────────────────
  if (iosInstructions) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={dismiss}
        />
        <div className="relative w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl p-5 shadow-2xl">
          <button
            onClick={dismiss}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <img src="/icons/icon-96.png" alt="" className="w-7 h-7 rounded-lg" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Add to Home Screen</p>
              <p className="text-xs text-gray-400">CrossCut</p>
            </div>
          </div>

          <ol className="space-y-3 text-sm text-gray-300">
            <li className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">1</span>
              <span>
                Tap the{' '}
                <Share size={14} className="inline-block text-blue-400 mx-0.5 -mt-0.5" />
                <strong className="text-white">Share</strong> button at the bottom of Safari
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">2</span>
              <span>
                Scroll down and tap <strong className="text-white">Add to Home Screen</strong>
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">3</span>
              <span>
                Tap <strong className="text-white">Add</strong> to confirm
              </span>
            </li>
          </ol>

          <button
            onClick={dismiss}
            className="mt-5 w-full py-2.5 rounded-xl bg-gray-700 text-gray-200 text-sm font-medium hover:bg-gray-600 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    )
  }

  // ── Chrome / Android / Desktop install banner ───────────────────────────
  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] lg:bottom-4 left-0 right-0 z-[90] flex justify-center px-4 pointer-events-none">
      <div
        className="pointer-events-auto flex items-center gap-3 bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 shadow-2xl max-w-sm w-full"
        role="banner"
      >
        {/* Icon */}
        <div className="w-9 h-9 flex-shrink-0">
          <img src="/icons/icon-96.png" alt="CrossCut" className="w-9 h-9 rounded-lg" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">Install CrossCut</p>
          <p className="text-xs text-gray-400 truncate">Add to home screen for quick access</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={install}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 active:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Download size={13} />
            Install
          </button>
          <button
            onClick={dismiss}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
