"use client";

import { useCallback, useEffect, useState } from "react";

type Platform = "ios" | "android" | "desktop";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __pwaInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function checkStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone) return true;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return false;
}

export function useInstallPrompt() {
  const [canInstallNatively, setCanInstallNatively] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [platform] = useState<Platform>(() => detectPlatform());

  useEffect(() => {
    setIsStandalone(checkStandalone());

    // Pick up prompt stored by ServiceWorkerRegistrar
    if (window.__pwaInstallPrompt) {
      setCanInstallNatively(true);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__pwaInstallPrompt = e as BeforeInstallPromptEvent;
      setCanInstallNatively(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const promptInstall = useCallback(async () => {
    const prompt = window.__pwaInstallPrompt;
    if (!prompt) return;
    await prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === "accepted") {
      window.__pwaInstallPrompt = null;
      setCanInstallNatively(false);
      setIsStandalone(true);
    }
  }, []);

  return { canInstallNatively, promptInstall, platform, isStandalone };
}
