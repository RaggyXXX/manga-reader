"use client";

import {
  CheckCircle2,
  Download,
  Fullscreen,
  Globe,
  Home,
  MonitorSmartphone,
  RefreshCw,
  Share,
  Smartphone,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContextBackChevron } from "@/components/navigation/ContextBackChevron";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const BENEFITS = [
  { icon: Home, title: "Home Screen Icon", desc: "Launch with one tap, just like a native app" },
  { icon: Fullscreen, title: "Fullscreen Mode", desc: "No browser bars — immersive reading" },
  { icon: Download, title: "Offline Access", desc: "Read synced chapters without internet" },
  { icon: Zap, title: "Faster Loading", desc: "Cached assets load instantly" },
  { icon: RefreshCw, title: "Background Updates", desc: "New chapters sync automatically" },
  { icon: MonitorSmartphone, title: "Native Feel", desc: "Smooth animations and gestures" },
];

const IOS_STEPS = [
  { icon: Globe, title: "Open in Safari", desc: "Make sure you're using Safari — other browsers can't install PWAs on iOS." },
  { icon: Share, title: "Tap the Share button", desc: "It's the square icon with an arrow at the bottom of the screen." },
  { icon: Home, title: '"Add to Home Screen"', desc: "Scroll down in the share sheet and tap \"Add to Home Screen\"." },
  { icon: CheckCircle2, title: 'Tap "Add"', desc: "Confirm the name and tap Add in the top right corner." },
];

const ANDROID_STEPS = [
  { icon: Globe, title: "Open in Chrome", desc: "Use Google Chrome for the best experience." },
  { icon: Smartphone, title: "Tap the ⋮ menu", desc: "It's the three-dot icon in the top right corner." },
  { icon: Download, title: '"Install app"', desc: 'Tap "Install app" or "Add to Home screen" from the menu.' },
  { icon: CheckCircle2, title: 'Tap "Install"', desc: "Confirm the install in the dialog that appears." },
];

export default function InstallPage() {
  const { canInstallNatively, promptInstall, platform, isStandalone } = useInstallPrompt();

  const defaultTab = platform === "ios" ? "ios" : "android";

  return (
    <div className="space-y-5" data-tour="install-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ContextBackChevron className="shrink-0" />
        <div>
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Install App</h1>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">Add Manga Blast to your home screen</p>
        </div>
      </div>

      {/* Already installed banner */}
      {isStandalone && (
        <Card className="border-green-500/30 bg-green-500/10">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
            <div>
              <p className="font-medium text-green-700 dark:text-green-400">Already Installed</p>
              <p className="text-sm text-green-600/80 dark:text-green-400/70">
                You&apos;re running Manga Blast as an installed app.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* What does Install mean? */}
      <Card>
        <CardContent className="p-4">
          <h2 className="mb-2 font-semibold">What does &quot;Install&quot; mean?</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Manga Blast is a <strong>Progressive Web App</strong> (PWA). Installing it adds a shortcut to
            your home screen so it opens fullscreen — like a real app — without downloading anything from an
            app store. It&apos;s free, takes almost no storage, and you can remove it anytime.
          </p>
        </CardContent>
      </Card>

      {/* Benefits grid */}
      <div>
        <h2 className="mb-3 font-semibold">Why Install?</h2>
        <div className="grid grid-cols-2 gap-3">
          {BENEFITS.map((b) => (
            <Card key={b.title}>
              <CardContent className="flex flex-col items-center p-4 text-center">
                <b.icon className="mb-2 h-6 w-6 text-primary" />
                <p className="text-sm font-medium">{b.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{b.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Native install button (Android with prompt) */}
      {canInstallNatively && (
        <Button className="w-full" size="lg" onClick={promptInstall}>
          <Download className="mr-2 h-5 w-5" />
          Install Now
        </Button>
      )}

      {/* Step-by-step tabs */}
      {!isStandalone && (
        <div>
          <h2 className="mb-3 font-semibold">Step-by-Step Guide</h2>
          <Tabs defaultValue={defaultTab}>
            <TabsList>
              <TabsTrigger value="ios">iOS (Safari)</TabsTrigger>
              <TabsTrigger value="android">Android (Chrome)</TabsTrigger>
            </TabsList>

            <TabsContent value="ios">
              <div className="space-y-3">
                {IOS_STEPS.map((step, i) => (
                  <StepCard key={i} index={i + 1} icon={step.icon} title={step.title} desc={step.desc} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="android">
              <div className="space-y-3">
                {ANDROID_STEPS.map((step, i) => (
                  <StepCard key={i} index={i + 1} icon={step.icon} title={step.title} desc={step.desc} />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function StepCard({
  index,
  icon: Icon,
  title,
  desc,
}: {
  index: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {index}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <p className="font-medium">{title}</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        </div>
      </CardContent>
    </Card>
  );
}
