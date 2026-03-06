"use client";

import { motion } from "framer-motion";
import { BarChart3, BookOpen, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Library", icon: BookOpen, tourId: "mobile-library" },
  { href: "/add", label: "Add", icon: PlusCircle, tourId: "mobile-add" },
  { href: "/stats", label: "Stats", icon: BarChart3, tourId: "mobile-stats" },
];

interface MobileNavProps {
  activeTab?: string;
  onNavigate?: (path: string) => void;
}

export function MobileNav({ activeTab, onNavigate }: MobileNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-card/95 px-3 pt-1.5 backdrop-blur md:hidden"
      style={{
        paddingBottom: "max(0.45rem, var(--sab))",
        paddingLeft: "max(0.75rem, var(--sal))",
        paddingRight: "max(0.75rem, var(--sar))",
      }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-xl items-center justify-around gap-1">
        {items.map((item) => {
          const active = activeTab === item.href;
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <button
                type="button"
                data-tour={item.tourId}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                title={item.label}
                onClick={() => onNavigate?.(item.href)}
                className={cn(
                  "relative flex h-11 w-full items-center justify-center overflow-hidden rounded-lg transition-colors",
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
                <Icon className="relative z-10 h-5 w-5" />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
