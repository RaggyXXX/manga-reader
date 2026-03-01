"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styles from "./Toast.module.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
}

type ToastFn = (message: string, type?: ToastType) => void;

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const ToastContext = createContext<ToastFn | null>(null);

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 3000;
const EXIT_ANIMATION_MS = 150; // matches --transition-fast

/* ------------------------------------------------------------------ */
/*  Dot class map                                                      */
/* ------------------------------------------------------------------ */

const DOT_CLASS: Record<ToastType, string> = {
  success: styles.dotSuccess,
  error: styles.dotError,
  info: styles.dotInfo,
};

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  /* Mark a toast as "exiting", then remove it after the animation. */
  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

  /* Public toast() function exposed via context. */
  const toast: ToastFn = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = Date.now() + ++counterRef.current;

      setToasts((prev) => {
        const next = [...prev, { id, message, type, exiting: false }];
        /* Evict the oldest toasts beyond MAX_VISIBLE. */
        while (next.filter((t) => !t.exiting).length > MAX_VISIBLE) {
          const oldest = next.find((t) => !t.exiting);
          if (oldest) oldest.exiting = true;
        }
        return next;
      });

      /* Auto-dismiss after timeout. */
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {toasts.length > 0 && (
        <div className={styles.container} role="status" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`${styles.toast}${t.exiting ? ` ${styles.exiting}` : ""}`}
            >
              <span className={`${styles.dot} ${DOT_CLASS[t.type]}`} />
              <span className={styles.message}>{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}
