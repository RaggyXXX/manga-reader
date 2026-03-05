"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
}

type ToastFn = (message: string, type?: ToastType) => void;

const ToastContext = createContext<ToastFn | null>(null);

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 3000;
const EXIT_ANIMATION_MS = 150;

const TYPE_STYLES: Record<ToastType, string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  error: "border-rose-300 bg-rose-50 text-rose-900",
  info: "border-border bg-card text-card-foreground",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

  const toast: ToastFn = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = Date.now() + ++counterRef.current;

      setToasts((prev) => {
        const next = [...prev, { id, message, type, exiting: false }];
        while (next.filter((t) => !t.exiting).length > MAX_VISIBLE) {
          const oldest = next.find((t) => !t.exiting);
          if (oldest) oldest.exiting = true;
        }
        return next;
      });

      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {toasts.length > 0 ? (
        <div className="fixed right-4 z-[110] flex w-[min(92vw,360px)] flex-col gap-2 md:bottom-4" role="status" aria-live="polite" style={{ bottom: "calc(5rem + var(--sab, 0px))" }}>
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl border px-3 py-2.5 text-sm shadow-md transition-opacity ${TYPE_STYLES[t.type]} ${
                t.exiting ? "opacity-0" : "opacity-100"
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}
