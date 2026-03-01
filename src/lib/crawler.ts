import type { Browser, Page } from "puppeteer-core";

const SCROLL_PAUSE = 1000;
const IMAGE_LOAD_WAIT = 5000;
const PAGE_TIMEOUT = 60000;

const REALISTIC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function getBrowser(): Promise<Browser> {
  if (process.env.NODE_ENV === "production" || process.env.USE_CHROMIUM_MIN) {
    // Production (Netlify): use @sparticuz/chromium-min
    const puppeteer = (await import("puppeteer-core")).default;
    const chromium = (await import("@sparticuz/chromium-min")).default;
    return puppeteer.launch({
      args: [...chromium.args, "--hide-scrollbars", "--disable-web-security", "--no-sandbox"],
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: await chromium.executablePath(
        process.env.CHROMIUM_REMOTE_URL!
      ),
      headless: true,
    });
  }

  // Local development: use puppeteer-extra with stealth plugin
  const puppeteerExtra = (await import("puppeteer-extra")).default;
  const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
  puppeteerExtra.use(StealthPlugin());

  // Find local Chrome / Edge
  const paths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ];

  let executablePath: string | undefined;
  const fs = await import("fs");
  for (const p of paths) {
    if (fs.existsSync(p)) {
      executablePath = p;
      break;
    }
  }

  return puppeteerExtra.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--window-size=1920,1080",
    ],
    defaultViewport: { width: 1920, height: 1080 },
  }) as unknown as Browser;
}

async function setupPage(page: Page) {
  // Set realistic User-Agent
  await page.setUserAgent(REALISTIC_UA);

  // Override navigator properties
  await page.evaluateOnNewDocument(() => {
    // Hide webdriver
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });

    // Fake plugins (real Chrome has plugins)
    Object.defineProperty(navigator, "plugins", {
      get: () => [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
        { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
        { name: "Native Client", filename: "internal-nacl-plugin" },
      ],
    });

    // Fake languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["de-DE", "de", "en-US", "en"],
    });

    // Chrome runtime
    // @ts-expect-error Faking chrome runtime
    window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };

    // Permissions API
    const originalQuery = window.navigator.permissions.query.bind(
      window.navigator.permissions
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator.permissions as any).query = (parameters: any) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);
  });

  // Set extra headers
  await page.setExtraHTTPHeaders({
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  });

  page.setDefaultTimeout(PAGE_TIMEOUT);
}

async function waitForCloudflare(page: Page) {
  // Wait a moment for CF to evaluate
  await new Promise((r) => setTimeout(r, 3000));

  const cfSelectors = [
    "#challenge-running",
    "#challenge-stage",
    ".cf-browser-verification",
    "iframe[src*='challenges.cloudflare.com']",
    "#turnstile-wrapper",
    "[data-translate='checking_browser']",
  ];

  for (const sel of cfSelectors) {
    const el = await page.$(sel);
    if (el) {
      console.log("[CF] Cloudflare challenge detected, waiting up to 30s...");
      await page.waitForSelector(sel, { hidden: true, timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 3000));
      await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
      console.log("[CF] Challenge resolved.");
      return;
    }
  }

  // Check for block page
  const blocked = await page.evaluate(() => {
    const body = document.body?.textContent?.toLowerCase() || "";
    return body.includes("sorry, you have been blocked") ||
           body.includes("access denied") ||
           body.includes("ray id");
  });

  if (blocked) {
    console.log("[CF] Blocked by Cloudflare, retrying with delay...");
    await new Promise((r) => setTimeout(r, 5000));
    await page.reload({ waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 5000));
    await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});

    // Check if still blocked
    const stillBlocked = await page.evaluate(() => {
      const body = document.body?.textContent?.toLowerCase() || "";
      return body.includes("sorry, you have been blocked") || body.includes("access denied");
    });

    if (stillBlocked) {
      throw new Error("Blocked by Cloudflare. Try again later or use a VPN.");
    }
  }
}

async function scrollThrough(page: Page) {
  const totalHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  let current = 0;
  const step = viewportHeight * 0.7;

  while (current < totalHeight) {
    current += step;
    await page.evaluate((y) => window.scrollTo(0, y), Math.floor(current));
    await new Promise((r) => setTimeout(r, SCROLL_PAUSE));
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight > totalHeight) {
      current = Math.min(current, newHeight);
    }
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, IMAGE_LOAD_WAIT));
}

export interface DiscoveryResult {
  title: string;
  coverUrl?: string;
  chapters: Array<{ number: number; url: string; title: string }>;
}

export async function discoverChapters(
  browser: Browser,
  seriesUrl: string
): Promise<DiscoveryResult> {
  const page = await browser.newPage();
  await setupPage(page);

  try {
    await page.goto(seriesUrl, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT });
    await waitForCloudflare(page);
    await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});

    // Extract series metadata
    const meta = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const metaTitle = document.querySelector("meta[property='og:title']") as HTMLMetaElement | null;
      const title = h1?.textContent?.trim() || metaTitle?.content || document.title;

      const ogImage = document.querySelector("meta[property='og:image']") as HTMLMetaElement | null;
      const coverImg = document.querySelector('img[src*="cover"]') as HTMLImageElement | null;
      const coverUrl = ogImage?.content || coverImg?.src || undefined;

      return { title: title || "Unknown Series", coverUrl };
    });

    // Extract chapter links
    let chapters = await extractChapterLinks(page);

    if (chapters.length === 0) {
      // Maybe Livewire hasn't rendered yet, scroll + wait
      await scrollThrough(page);
      await new Promise((r) => setTimeout(r, 2000));
      chapters = await extractChapterLinks(page);
    }

    if (chapters.length === 0) {
      // Try clicking "Show all chapters" button if it exists
      const showAllBtn = await page.$('button[wire\\:click*="loadAll"], [wire\\:click*="showAll"], button:has-text("all chapters")');
      if (showAllBtn) {
        await showAllBtn.click();
        await new Promise((r) => setTimeout(r, 3000));
        chapters = await extractChapterLinks(page);
      }
    }

    chapters.sort((a, b) => a.number - b.number);

    return {
      title: meta.title,
      coverUrl: meta.coverUrl,
      chapters,
    };
  } finally {
    await page.close();
  }
}

async function extractChapterLinks(page: Page) {
  return page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="chapter"]');
    const chapters: Array<{ number: number; url: string; title: string }> = [];
    const seen = new Set<string>();

    for (const link of links) {
      const a = link as HTMLAnchorElement;
      const href = a.href;
      if (!href || seen.has(href) || !href.includes("/chapter-")) continue;
      seen.add(href);

      const match = href.match(/chapter-(\d+)/);
      if (!match) continue;

      const num = parseInt(match[1], 10);
      const title = a.textContent?.trim() || `Chapter ${num}`;
      chapters.push({ number: num, url: href, title });
    }
    return chapters;
  });
}

export async function extractChapterImages(
  browser: Browser,
  chapterUrl: string
): Promise<string[]> {
  const page = await browser.newPage();
  await setupPage(page);

  try {
    await page.goto(chapterUrl, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT });
    await waitForCloudflare(page);
    await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});

    // Scroll to trigger lazy loading
    await scrollThrough(page);

    // Extract image URLs
    let images = await extractImageUrls(page);

    if (images.length === 0) {
      // Retry with slower scroll
      await slowScroll(page);
      images = await extractImageUrls(page);
    }

    return images;
  } finally {
    await page.close();
  }
}

async function slowScroll(page: Page) {
  const totalHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  let current = 0;
  const step = viewportHeight * 0.5;

  while (current < totalHeight) {
    current += step;
    await page.evaluate((y) => window.scrollTo(0, y), Math.floor(current));
    await new Promise((r) => setTimeout(r, 2000));
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight > totalHeight) {
      current = Math.min(current, newHeight);
    }
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 1000));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, IMAGE_LOAD_WAIT * 2));
}

async function extractImageUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // Find container with most images
    const divs = document.querySelectorAll("div[id]");
    let bestDiv: Element | null = null;
    let bestCount = 0;
    for (const div of divs) {
      const count = div.querySelectorAll("img").length;
      if (count > bestCount) {
        bestCount = count;
        bestDiv = div;
      }
    }

    const container = bestCount >= 3 ? bestDiv : document;
    if (!container) return [];

    const imgs = container.querySelectorAll("img");
    const urls: string[] = [];
    const seen = new Set<string>();

    for (const img of imgs) {
      const candidates = [
        img.getAttribute("data-src"),
        img.getAttribute("data-lazy-src"),
        img.getAttribute("data-original"),
        img.getAttribute("data-url"),
        img.src,
      ];

      let url: string | null = null;
      for (const c of candidates) {
        if (c && c.startsWith("http") && !c.includes("1x1.webp") && !c.startsWith("data:")) {
          url = c;
          break;
        }
      }

      if (!url) continue;
      if (url.includes("placeholder")) continue;
      if (url.includes("loading.")) continue;
      if (url.includes("/avatar/")) continue;
      if (url.includes("/icon/")) continue;
      if (url.includes("/logo")) continue;
      if (url.includes("/cover/")) continue;
      if (url.includes("gravatar.com")) continue;
      if (seen.has(url)) continue;
      seen.add(url);

      urls.push(url);
    }
    return urls;
  });
}
