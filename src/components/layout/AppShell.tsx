"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, PlusCircle } from "lucide-react";
import { MobileNav } from "./MobileNav";
import { cn } from "@/lib/utils";
import { fadeUpVariants, motionOrInstant } from "@/lib/motion";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isReaderRoute = pathname.startsWith("/read/");
  const reduced = useReducedMotion();

  if (isReaderRoute) {
    return <div data-testid="app-shell">{children}</div>;
  }

  return (
    <div data-testid="app-shell" className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur" role="banner">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/" className="font-semibold tracking-tight">
            Manga Reader
          </Link>
          <div className="hidden items-center gap-2 md:flex">
            <Link
              href="/add"
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
