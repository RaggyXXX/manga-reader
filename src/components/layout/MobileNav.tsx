"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart3, BookOpen, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Library", icon: BookOpen, tourId: "mobile-library" },
  { href: "/add", label: "Add", icon: PlusCircle, tourId: "mobile-add" },
  { href: "/stats", label: "Stats", icon: BarChart3, tourId: "mobile-stats" },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-card/95 px-3 py-2 backdrop-blur md:hidden"
      style={{ paddingBottom: "calc(0.5rem + var(--sab))", paddingLeft: "max(0.75rem, var(--sal))", paddingRight: "max(0.75rem, var(--sar))" }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-xl items-center justify-between gap-2">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                data-tour={item.tourId}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center justify-center gap-1 overflow-hidden rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="mobile-nav-active"
                    className="absolute inset-0 rounded-xl bg-primary"
                    transition={{ duration: 0.22, ease: [0.22, 0.8, 0.2, 1] }}
                  />
                ) : null}
                <Icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
