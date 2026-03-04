import type { Metadata, Viewport } from "next";
import { Nunito, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { ToastProvider } from "@/components/Toast";
import { SyncProvider } from "@/contexts/SyncContext";
import { SyncProgressBar } from "@/components/SyncProgressBar";
import { AppShell } from "@/components/layout/AppShell";

const nunito = Nunito({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["400", "600", "700", "800"],
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Manga Blast",
  description: "Cozy mobile-first manga reader PWA",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Manga Blast",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#1a1612",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} ${nunitoSans.variable}`}>
      <body
        data-testid="app-shell"
        className="bg-background font-sans text-foreground antialiased"
        style={{ fontFamily: "var(--font-body), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
      >
        <SyncProvider>
          <SyncProgressBar />
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </SyncProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
