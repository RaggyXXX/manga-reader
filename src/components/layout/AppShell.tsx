"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, ChevronLeft, Moon, PlusCircle, Sun, WifiOff } from "lucide-react";
import { MobileNav } from "./MobileNav";
import { cn } from "@/lib/utils";
import { applyThemeClass, resolveInitialTheme, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme";
import { LibraryPage } from "@/app/page";
import { AddSeriesPage } from "@/app/add/page";
import { StatsPage } from "@/app/stats/page";
import { BookmarksPage } from "@/app/bookmarks/page";
import { InstallPage } from "@/app/install/page";

const TAB_PATHS = ["/", "/add", "/stats", "/bookmarks", "/install"] as const;
type TabPath = (typeof TAB_PATHS)[number];

function isTabPath(path: string): path is TabPath {
  return (TAB_PATHS as readonly string[]).includes(path);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isReaderRoute = pathname.startsWith("/read/");

  const [activeTab, setActiveTab] = useState<TabPath>(() => {
    return isTabPath(pathname) ? pathname : "/";
  });

  const [mountedTabs, setMountedTabs] = useState<Set<TabPath>>(() => {
    const initial = new Set<TabPath>(["/"]);
    if (isTabPath(pathname)) initial.add(pathname);
    return initial;
  });

  const isOnTabPage = isTabPath(pathname);
  const isSubpage = !isTabPath(pathname) && pathname !== "/";

  // Handle popstate for browser Back/Forward
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (isTabPath(path)) {
        setActiveTab(path);
        setMountedTabs((prev) => {
          if (prev.has(path)) return prev;
          const next = new Set(prev);
          next.add(path);
          return next;
        });
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateTab = useCallback((path: TabPath) => {
    setActiveTab(path);
    setMountedTabs((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
    window.history.pushState(null, "", path);
  }, []);

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

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      navigateTab("/");
    }
  };

  if (isReaderRoute) {
    return <div data-testid="app-shell">{children}</div>;
  }

  return (
    <div data-testid="app-shell" className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur" role="banner" style={{ paddingTop: "var(--sat)" }}>
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4" style={{ paddingLeft: "max(1rem, var(--sal))", paddingRight: "max(1rem, var(--sar))" }}>
          {/* Left slot: back button on subpages, empty spacer on home */}
          <div className="flex w-10 shrink-0 items-center">
            {isSubpage ? (
              <button
                type="button"
                onClick={handleBack}
                aria-label="Go back"
                title="Go back"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/70 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted/60"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {/* Center: Logo & Title */}
          <button type="button" onClick={() => navigateTab("/")} className="flex items-center gap-2">
            <picture>
              <source srcSet="/mangablast.webp" type="image/webp" />
              <img src="/mangablast.png" alt="Manga Blast" className="h-10 w-auto" />
            </picture>
            <span className="font-display text-lg font-extrabold tracking-tight" style={{ background: "linear-gradient(135deg, #e8a849, #d4783a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Manga Blast
            </span>
            {isOffline && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                <WifiOff className="h-3 w-3" />
                Offline
              </span>
            )}
          </button>

          {/* Right slot: theme toggle (mobile) + desktop nav */}
          <div className="flex w-10 shrink-0 items-center justify-end">
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
              <button
                type="button"
                onClick={() => navigateTab("/add")}
                data-tour="nav-add"
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  activeTab === "/add"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <PlusCircle className="h-4 w-4" />
                Add
              </button>
              <button
                type="button"
                onClick={() => navigateTab("/stats")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  activeTab === "/stats"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <BarChart3 className="h-4 w-4" />
                Stats
              </button>
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
        </div>
      </header>
      <main
        className="mx-auto w-full max-w-5xl px-4 pt-6 md:pb-8"
        style={{ paddingBottom: "calc(4.75rem + var(--sab))", paddingLeft: "max(1rem, var(--sal))", paddingRight: "max(1rem, var(--sar))" }}
      >
        {/* Persistent tabs */}
        <div style={{ display: isOnTabPage && activeTab === "/" ? "contents" : "none" }}>
          {mountedTabs.has("/") && <LibraryPage />}
        </div>
        <div style={{ display: isOnTabPage && activeTab === "/add" ? "contents" : "none" }}>
          {mountedTabs.has("/add") && <AddSeriesPage />}
        </div>
        <div style={{ display: isOnTabPage && activeTab === "/stats" ? "contents" : "none" }}>
          {mountedTabs.has("/stats") && <StatsPage />}
        </div>
        <div style={{ display: isOnTabPage && activeTab === "/bookmarks" ? "contents" : "none" }}>
          {mountedTabs.has("/bookmarks") && <BookmarksPage />}
        </div>
        <div style={{ display: isOnTabPage && activeTab === "/install" ? "contents" : "none" }}>
          {mountedTabs.has("/install") && <InstallPage />}
        </div>

        {/* Subpages via Next.js router */}
        {!isOnTabPage && children}
      </main>
      <MobileNav activeTab={activeTab} onNavigate={(path) => navigateTab(path as TabPath)} />
    </div>
  );
}
