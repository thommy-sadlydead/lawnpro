'use client'

import React, {
  createContext, useCallback, useContext,
  useEffect, useRef, useState,
} from 'react'
import { Lock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

const OWNER_PIN = '6969'

// ── Context ───────────────────────────────────────────────────────────────────

interface OwnerAuthContextType {
  isUnlocked: boolean
  requestAccess: () => void  // opens the PIN modal
  lock: () => void           // re-locks the session
}

const OwnerAuthContext = createContext<OwnerAuthContextType>({
  isUnlocked: false,
  requestAccess: () => {},
  lock: () => {},
})

export function useOwnerAuth() {
  return useContext(OwnerAuthContext)
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function OwnerAuthProvider({ children }: { children: React.ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [open, setOpen]             = useState(false)
  const [pin, setPin]               = useState('')
  const [error, setError]           = useState(false)
  const [shake, setShake]           = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus the input whenever the modal opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60)
  }, [open])

  const requestAccess = useCallback(() => {
    if (isUnlocked) return
    setPin('')
    setError(false)
    setShake(false)
    setOpen(true)
  }, [isUnlocked])

  const lock = useCallback(() => setIsUnlocked(false), [])

  function handleSubmit() {
    if (pin === OWNER_PIN) {
      setIsUnlocked(true)
      setOpen(false)
      setPin('')
      setError(false)
    } else {
      setError(true)
      setPin('')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      inputRef.current?.focus()
    }
  }

  function handleClose() {
    setOpen(false)
    setPin('')
    setError(false)
    setShake(false)
  }

  return (
    <OwnerAuthContext.Provider value={{ isUnlocked, requestAccess, lock }}>
      {children}

      {/* PIN modal — rendered at the root so it floats above any page */}
      <Modal isOpen={open} onClose={handleClose} title="Owner Access" size="sm">
        <div className="p-6 space-y-5">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
              <Lock size={28} className="text-green-600 dark:text-green-400" />
            </div>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Enter the owner access code to view financial information.
          </p>

          {/* PIN input */}
          <div className="space-y-2">
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              placeholder="Access code"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(false) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              className={[
                'w-full text-center text-xl font-bold tracking-[0.4em] px-4 py-3 rounded-xl border',
                'transition-all focus:outline-none focus:ring-2 focus:ring-green-500',
                shake ? 'animate-[shake_0.4s_ease-in-out]' : '',
                error
                  ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white',
              ].join(' ')}
            />
            {error && (
              <p className="text-sm text-red-500 dark:text-red-400 font-medium text-center">
                Incorrect access code.
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button className="flex-1" icon={<Lock size={15} />} onClick={handleSubmit}>
              Unlock
            </Button>
          </div>
        </div>
      </Modal>
    </OwnerAuthContext.Provider>
  )
}

// ── OwnerLockScreen — full-page lock placeholder ──────────────────────────────

export function OwnerLockScreen({ title = 'Owner Access Required' }: { title?: string }) {
  const { requestAccess } = useOwnerAuth()
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 py-16">
      <div className="w-20 h-20 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-6">
        <Lock size={36} className="text-gray-400 dark:text-gray-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{title}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mb-8 leading-relaxed">
        This section contains confidential financial data and requires owner authorization.
      </p>
      <Button size="lg" icon={<Lock size={16} />} onClick={requestAccess}>
        Enter Access Code
      </Button>
    </div>
  )
}

// ── LockedValue — inline financial number gate ────────────────────────────────
// Shows children when unlocked; shows a "••••" lock button when locked.

export function LockedValue({
  children,
  className = '',
}: {
  children?: React.ReactNode
  className?: string
}) {
  const { isUnlocked, requestAccess } = useOwnerAuth()

  if (isUnlocked) return <>{children}</>

  return (
    <button
      onClick={requestAccess}
      title="Owner access required"
      className={`inline-flex items-center gap-1 text-gray-400 dark:text-gray-600
        hover:text-gray-600 dark:hover:text-gray-400 transition-colors ${className}`}
    >
      <Lock size={11} className="flex-shrink-0" />
      <span className="font-mono tracking-widest text-sm">••••</span>
    </button>
  )
}
