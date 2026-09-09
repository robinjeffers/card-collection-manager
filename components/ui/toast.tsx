"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { Undo2, X } from "lucide-react"

type ToastOptions = {
  message: string
  /** Label for the optional action button, e.g. "Undo". */
  actionLabel?: string
  onAction?: () => void
  /** Auto-dismiss delay in ms. Defaults to 7000. */
  duration?: number
}

type ToastItem = ToastOptions & { id: number }

type ToastContextValue = {
  toast: (opts: ToastOptions) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>")
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++
      setToasts((prev) => [...prev, { ...opts, id }])
      const timer = setTimeout(() => dismiss(id), opts.duration ?? 7000)
      timers.current.set(id, timer)
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((t) => clearTimeout(t))
      map.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-border bg-popover px-4 py-3 text-popover-foreground shadow-lg animate-in slide-in-from-bottom-2 fade-in"
          >
            <span className="min-w-0 flex-1 text-sm">{t.message}</span>
            {t.actionLabel ? (
              <button
                type="button"
                onClick={() => {
                  t.onAction?.()
                  dismiss(t.id)
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Undo2 className="size-3.5" />
                {t.actionLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-md p-1 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
