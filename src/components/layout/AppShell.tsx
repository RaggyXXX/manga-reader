"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, Moon, PlusCircle, Sun, WifiOff } from "lucide-react";
import { MobileNav } from "./MobileNav";
import { cn } from "@/lib/utils";
import { fadeUpVariants, motionOrInstant } from "@/lib/motion";
import { applyThemeClass, resolveInitialTheme, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isReaderRoute = pathname.startsWith("/read/");
  const reduced = useReducedMotion();
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const saved = (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null) ?? null;
    return resolveInitialTheme(saved, window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  const [isOffline, setIsOffline] = useState(() => typeof window !== "undefined" ? !navigator.onLine : false);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyThemeClass(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
  };

  if (isReaderRoute) {
    return <div data-testid="app-shell">{children}</div>;
  }

  return (
    <div data-testid="app-shell" className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur" role="banner">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2">
              <picture>
                <source srcSet="/mangablast.webp" type="image/webp" />
                <img src="/mangablast.png" alt="Manga Blast" className="h-10 w-auto" />
              </picture>
              <span className="font-display text-lg font-extrabold tracking-tight" style={{ background: "linear-gradient(135deg, #e8a849, #d4783a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Manga Blast
              </span>
            </Link>
            {isOffline && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                <WifiOff className="h-3 w-3" />
                Offline
              </span>
            )}
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              Appearance
            </button>
            <Link
              href="/add"
              data-tour="nav-add"
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname === "/add"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <PlusCircle className="h-4 w-4" />
              Add
            </Link>
            <Link
              href="/stats"
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname === "/stats"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <BarChart3 className="h-4 w-4" />
              Stats
            </Link>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>
      <motion.main
        variants={fadeUpVariants}
        initial="hidden"
        animate="visible"
        transition={motionOrInstant(!!reduced)}
        className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 md:pb-8"
      >
        {children}
      </motion.main>
      <MobileNav />
    </div>
  );
}
