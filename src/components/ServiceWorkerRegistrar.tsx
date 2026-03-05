"use client";

import { useEffect, useState, useCallback } from "react";

export function ServiceWorkerRegistrar() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage("SKIP_WAITING");
    }
  }, [waitingWorker]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Reload once the new SW takes over
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // If there's already a waiting worker on load
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setUpdateAvailable(true);
        }

        // Detect when a new SW is installed and waiting
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New version installed but waiting to activate
              setWaitingWorker(newWorker);
              setUpdateAvailable(true);
            }
          });
        });

        // Periodically check for updates (every 60 minutes)
        const interval = setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

        return () => clearInterval(interval);
      })
      .catch(() => {
        // SW registration failed — likely not HTTPS in dev
      });

    // Capture the native install prompt for later use
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__pwaInstallPrompt = e;
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed left-0 right-0 top-0 z-[200] flex items-center justify-between gap-3 bg-amber-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
      <span>Neue Version verfügbar!</span>
      <button
        onClick={applyUpdate}
        className="shrink-0 rounded-lg bg-white px-4 py-1.5 text-sm font-bold text-amber-700 transition-colors hover:bg-amber-50 active:bg-amber-100"
      >
        Update
      </button>
    </div>
  );
}
