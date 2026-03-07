# Capacitor Native App Integration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional Capacitor native app (Android + iOS) that loads UI from Netlify but scrapes directly from each device — no CORS, no server proxy load. Web/PWA stays unchanged.

**Architecture:** Hybrid approach — Capacitor WebView loads the deployed Netlify URL (updates via `git push`). The `@capacitor/http` plugin patches `fetch()` globally on native, bypassing CORS. A `isNative()` check routes scraping: native → direct fetch to manga sources, web → existing `/api/scrape` proxy. Background sync via `@capacitor-community/background-task`.

**Tech Stack:** Capacitor 6, @capacitor/http, @capacitor-community/background-task, Android Studio, Xcode

---

### Task 1: Install Capacitor Core

**Files:**
- Modify: `package.json`
- Create: `capacitor.config.ts`

**Step 1: Install Capacitor packages**

Run:
```bash
npm install @capacitor/core @capacitor/cli
npx cap init "MangaBlast" "com.mangablast.app" --web-dir=out
```

**Step 2: Create capacitor.config.ts**

Replace the generated config with:

```typescript
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mangablast.app",
  appName: "MangaBlast",
  webDir: "out",
  server: {
    // Load UI from Netlify — updates via git push, no app store release needed
    url: "https://delicate-cactus-5e5fe3.netlify.app",
    cleartext: false,
  },
  plugins: {
    CapacitorHttp: {
      // Patches global fetch() on native — all requests bypass CORS
      enabled: true,
    },
  },
  android: {
    // Allow mixed content for image loading from various CDNs
    allowMixedContent: true,
  },
  ios: {
    // iOS-specific: allow arbitrary loads for manga image CDNs
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
```

**Step 3: Commit**

```bash
git add package.json package-lock.json capacitor.config.ts
git commit -m "feat: add Capacitor core setup"
```

---

### Task 2: Add Android and iOS Platforms

**Files:**
- New directory: `android/`
- New directory: `ios/`
- Modify: `.gitignore`

**Step 1: Install platform packages**

```bash
npm install @capacitor/android @capacitor/ios
```

**Step 2: Add platforms**

```bash
npx cap add android
npx cap add ios
```

**Step 3: Update .gitignore**

Add to `.gitignore`:
```
# Capacitor native builds (generated, not committed)
android/app/build/
ios/App/Pods/
```

**Step 4: Commit**

```bash
git add android/ ios/ .gitignore package.json package-lock.json
git commit -m "feat: add Android and iOS platforms"
```

---

### Task 3: Create isNative() Helper

**Files:**
- Create: `src/lib/platform.ts`

**Step 1: Create the platform detection helper**

```typescript
// Detect if running inside a Capacitor native app (Android/iOS)
// Returns false for web/PWA — only true when wrapped in native shell

let _isNative: boolean | null = null;

export function isNative(): boolean {
  if (_isNative !== null) return _isNative;
  try {
    // Capacitor injects this on the window object in native apps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    _isNative = !!(win.Capacitor?.isNativePlatform?.());
  } catch {
    _isNative = false;
  }
  return _isNative;
}

// For use in sync-worker.js (Web Worker context — no window.Capacitor)
// The worker receives isNative as a flag from the main thread
```

**Step 2: Commit**

```bash
git add src/lib/platform.ts
git commit -m "feat: add isNative() platform detection helper"
```

---

### Task 4: Adapt Client-Side Scraper for Native Direct Fetch

**Files:**
- Modify: `src/lib/scraper.ts`

The key change: when `isNative()` is true, fetch directly from manga sources (no CORS restriction). When false (web/PWA), use existing `/api/scrape` proxy chain.

**Step 1: Add native detection import and update fetchHtml**

At the top of `scraper.ts`, add the import:

```typescript
import { isNative } from "./platform";
```

**Step 2: Replace the `fetchHtml` function**

Replace the entire `fetchHtml` function with:

```typescript
async function fetchHtml(url: string): Promise<Document> {
  // Native app: fetch directly — Capacitor patches fetch() to bypass CORS
  if (isNative() || isCorsOpen(url)) {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
    const text = await resp.text();
    validateHtmlText(text);
    return new DOMParser().parseFromString(text, "text/html");
  }

  // Web/PWA: use server proxy chain (CORS restricted)
  const endpoints: ProxyEndpoint[] = [];
  if (CF_PROXY_URL) {
    endpoints.push({ url: CF_PROXY_URL + "?url=" + encodeURIComponent(url) });
  }
  endpoints.push({ url: "/api/scrape?url=" + encodeURIComponent(url) });
  endpoints.push({ url: IMAGE_PROXY_BASE + encodeURIComponent(url) });

  let lastError: Error | null = null;
  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint.url);
      if (!resp.ok) {
        lastError = new Error(`Proxy returned ${resp.status}`);
        continue;
      }
      let text: string;
      if (endpoint.json) {
        const data = await resp.json();
        text = data.contents;
      } else {
        text = await resp.text();
      }
      validateHtmlText(text);
      return new DOMParser().parseFromString(text, "text/html");
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError || new Error("All proxies failed");
}
```

**Step 3: Update imageProxyUrl for native**

Replace `imageProxyUrl` with:

```typescript
export function imageProxyUrl(url: string, source?: MangaSource): string {
  // Native app: load all images directly (no CORS)
  if (isNative()) {
    if (source === "atsumaru" && url.startsWith("/")) {
      return `https://atsu.moe${url}`;
    }
    return url;
  }

  // Web/PWA: proxy MangaDex images, others load directly
  if (source === "mangadex") {
    return `/api/mangadex/img?url=${encodeURIComponent(url)}`;
  }
  if (source === "atsumaru" && url.startsWith("/")) {
    return `https://atsu.moe${url}`;
  }
  return url;
}
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 5: Commit**

```bash
git add src/lib/scraper.ts
git commit -m "feat: direct fetch in scraper when running as native app"
```

---

### Task 5: Adapt Sync Worker for Native Direct Fetch

**Files:**
- Modify: `public/sync-worker.js`
- Modify: `src/contexts/SyncContext.tsx`

The sync worker runs in a Web Worker context — no `window.Capacitor`. The main thread passes an `isNative` flag in the start message.

**Step 1: Update sync-worker.js fetchHtmlText**

At the top of `sync-worker.js`, add a variable after `let cfProxyUrl`:

```javascript
let nativeMode = false; // Set from start message — direct fetch, no proxy needed
```

Replace the `fetchHtmlText` function with:

```javascript
async function fetchHtmlText(url, origin) {
  // Native app: fetch directly — no CORS restrictions
  if (nativeMode || isCorsOpen(url)) {
    var resp = await fetchWithTimeout(url, 12000);
    if (!resp.ok) throw new Error("Direct fetch failed: " + resp.status);
    var text = await resp.text();
    validateHtmlText(text);
    return text;
  }

  // Web/PWA: server proxy chain
  var endpoints = [];
  if (cfProxyUrl) {
    endpoints.push({ url: cfProxyUrl + "?url=" + encodeURIComponent(url), json: false });
  }
  endpoints.push({ url: origin + "/api/scrape?url=" + encodeURIComponent(url), json: false });
  endpoints.push({ url: origin + "/api/proxy?url=" + encodeURIComponent(url), json: false });

  var lastError = null;
  for (var i = 0; i < endpoints.length; i++) {
    try {
      var resp = await fetchWithTimeout(endpoints[i].url, 12000);
      if (!resp.ok) {
        lastError = new Error("Proxy returned " + resp.status);
        continue;
      }
      var text;
      if (endpoints[i].json) {
        var data = await resp.json();
        text = data.contents;
      } else {
        text = await resp.text();
      }
      validateHtmlText(text);
      return text;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("All proxies failed");
}
```

**Step 2: Update onmessage handler to read nativeMode**

In `self.onmessage`, inside the `if (msg.type === "start")` block, add after `cfProxyUrl = msg.cfProxyUrl || ""`:

```javascript
nativeMode = msg.nativeMode || false;
```

**Step 3: Also update MangaDex sync to fetch API directly when native**

In `syncMangadex`, replace the `fetchJson(origin + "/api/mangadex/chapters?..."` calls. Find both occurrences of:

```javascript
const chaptersData = await fetchJson(origin + "/api/mangadex/chapters?mangaId=" + sourceId + "&lang=" + encodeURIComponent(lang));
```

And wrap them:

```javascript
var chaptersData;
if (nativeMode) {
  // Direct MangaDex API call — no CORS in native
  var mdResp = await fetchJson("https://api.mangadex.org/manga/" + sourceId + "/feed?translatedLanguage[]=" + encodeURIComponent(lang) + "&limit=500&order[chapter]=asc&includes[]=scanlation_group");
  var mdChapters = (mdResp.data || []).map(function(ch) {
    return { id: ch.id, chapter: ch.attributes.chapter, title: ch.attributes.title };
  });
  chaptersData = { chapters: mdChapters };
} else {
  chaptersData = await fetchJson(origin + "/api/mangadex/chapters?mangaId=" + sourceId + "&lang=" + encodeURIComponent(lang));
}
```

Similarly, replace MangaDex image fetching. Find:
```javascript
const imgData = await fetchJson(origin + "/api/mangadex/images?chapterId=" + chapterId);
const imageUrls = imgData.imageUrls || [];
```

Wrap it:
```javascript
var imgData, imageUrls;
if (nativeMode) {
  var atHome = await fetchJson("https://api.mangadex.org/at-home/server/" + chapterId);
  var baseUrl = atHome.baseUrl;
  var chapter = atHome.chapter;
  imageUrls = (chapter.data || []).map(function(f) { return baseUrl + "/data/" + chapter.hash + "/" + f; });
} else {
  imgData = await fetchJson(origin + "/api/mangadex/images?chapterId=" + chapterId);
  imageUrls = imgData.imageUrls || [];
}
```

**Step 4: Update SyncContext.tsx to pass nativeMode flag**

In `src/contexts/SyncContext.tsx`, add the import at the top:

```typescript
import { isNative } from "@/lib/platform";
```

In `sendWorkerScrapeStart`, add `nativeMode` to the postMessage object (after `cfProxyUrl`):

```typescript
nativeMode: isNative(),
```

In the background update checker `worker.postMessage` call (around line 141), add to the message object:

```typescript
nativeMode: isNative(),
```

**Step 5: Update update-checker-worker.js similarly**

In `public/update-checker-worker.js`, add `nativeMode` handling the same way — read from message, use direct fetch when true.

**Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add public/sync-worker.js src/contexts/SyncContext.tsx src/lib/scraper.ts
git commit -m "feat: native direct fetch in sync worker and update checker"
```

---

### Task 6: Add Background Sync Plugin

**Files:**
- Modify: `package.json`
- Create: `src/lib/background-sync.ts`
- Modify: `src/contexts/SyncContext.tsx`

**Step 1: Install background task plugin**

```bash
npm install @capacitor-community/background-task
npx cap sync
```

**Step 2: Create background-sync.ts**

```typescript
import { isNative } from "./platform";

let backgroundTaskRegistered = false;

export async function registerBackgroundSync(): Promise<void> {
  if (!isNative() || backgroundTaskRegistered) return;
  backgroundTaskRegistered = true;

  const { BackgroundTask } = await import("@capacitor-community/background-task");

  // Register a listener for when the app goes to background
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;

    BackgroundTask.beforeExit(async ({ taskId }) => {
      // Run the update checker in background (max ~30s on iOS, ~10min on Android)
      try {
        const { getAllSeries } = await import("./manga-store");
        const { getUpdateFlags, initUpdateFlagStore, setUpdateFlag } = await import("./update-flag-store");

        await initUpdateFlagStore();
        const allSeries = await getAllSeries();
        const flags = getUpdateFlags();
        const now = Date.now();
        const RECHECK_INTERVAL = 12 * 60 * 60 * 1000;

        const needsCheck = allSeries.filter((s) => {
          const flag = flags[s.slug];
          return !flag || now - flag.checkedAt > RECHECK_INTERVAL;
        });

        if (needsCheck.length > 0) {
          // Launch the update checker worker
          const worker = new Worker("/update-checker-worker.js");

          await new Promise<void>((resolve) => {
            worker.onmessage = (e) => {
              const msg = e.data;
              if (msg.type === "result") {
                setUpdateFlag(msg.slug, { newCount: msg.newCount, checkedAt: Date.now() });
              }
              if (msg.type === "done") {
                worker.terminate();
                resolve();
              }
            };
            worker.onerror = () => {
              worker.terminate();
              resolve();
            };

            worker.postMessage({
              type: "check",
              series: needsCheck.slice(0, 5).map((s) => ({
                slug: s.slug,
                sourceUrl: s.sourceUrl,
                source: s.source || "manhwazone",
                sourceId: s.sourceId,
                totalChapters: s.totalChapters,
                preferredLanguage: s.preferredLanguage || "en",
              })),
              origin: window.location.origin,
              nativeMode: true,
            });
          });
        }
      } catch (err) {
        console.error("Background sync failed:", err);
      }

      // Signal task completion to OS
      BackgroundTask.finish({ taskId });
    });
  });
}
```

**Step 3: Call registerBackgroundSync from SyncContext**

In `SyncContext.tsx`, add at the top:

```typescript
import { registerBackgroundSync } from "@/lib/background-sync";
```

Inside the `SyncProvider` component, add a useEffect after the existing ones:

```typescript
// Register background sync for native apps
useEffect(() => {
  void registerBackgroundSync();
}, []);
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/lib/background-sync.ts src/contexts/SyncContext.tsx package.json package-lock.json
git commit -m "feat: add background sync for native apps"
```

---

### Task 7: Add npm Scripts and Sync Capacitor

**Files:**
- Modify: `package.json`

**Step 1: Add native build scripts to package.json**

Add to `"scripts"`:

```json
"cap:sync": "npx cap sync",
"cap:open:android": "npx cap open android",
"cap:open:ios": "npx cap open ios",
"cap:run:android": "npx cap run android",
"cap:run:ios": "npx cap run ios"
```

**Step 2: Run cap sync**

```bash
npx cap sync
```

Expected: Syncs web assets and plugins to both platforms

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add Capacitor npm scripts"
```

---

### Task 8: Configure Android App Permissions

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

**Step 1: Verify required permissions exist**

Capacitor adds `INTERNET` by default. Verify and add if missing:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

Also add `usesCleartextTraffic` to the `<application>` tag if not present:

```xml
<application
    android:usesCleartextTraffic="true"
    ...>
```

**Step 2: Commit**

```bash
git add android/
git commit -m "feat: configure Android permissions for network access"
```

---

### Task 9: Configure iOS App Transport Security

**Files:**
- Modify: `ios/App/App/Info.plist`

**Step 1: Add NSAppTransportSecurity**

Ensure this key exists in Info.plist to allow connections to manga CDN hosts:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

**Step 2: Commit**

```bash
git add ios/
git commit -m "feat: configure iOS ATS for manga source connections"
```

---

### Task 10: Test and Verify

**Step 1: Verify web build still works**

```bash
npm run build
```
Expected: No errors, all routes present

**Step 2: Verify unit tests pass**

```bash
npm run test:unit
```
Expected: All unit tests pass

**Step 3: Test Android (if Android Studio available)**

```bash
npx cap sync
npx cap open android
```
Then build and run from Android Studio on emulator/device.

**Step 4: Test iOS (if Xcode available on Mac)**

```bash
npx cap sync
npx cap open ios
```
Then build and run from Xcode on simulator/device.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Capacitor native app with direct scraping and background sync"
```
