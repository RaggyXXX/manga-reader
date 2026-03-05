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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-3xl">
          🔄
        </div>
        <h2 className="mb-2 text-lg font-bold text-card-foreground">
          Update verfügbar
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Eine neue Version von Manga Blast ist verfügbar. Bitte aktualisiere, um die neuesten Verbesserungen zu erhalten.
        </p>
        <button
          onClick={applyUpdate}
          className="w-full rounded-xl bg-amber-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-amber-700 active:bg-amber-800"
        >
          Jetzt aktualisieren
        </button>
      </div>
    </div>
  );
}
