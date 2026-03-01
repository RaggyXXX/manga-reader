import type { Browser, Page } from "puppeteer-core";

const SCROLL_PAUSE = 500;
const IMAGE_LOAD_WAIT = 5000;
const PAGE_TIMEOUT = 45000;
const MAX_SCROLL_TIME = 30000;

const REALISTIC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Known manga reader container selectors (priority order)
const READER_SELECTORS = [
  // manhwazone.to — images in <figure> inside <article class="prose">
  "article.prose",
  "#main-content article",
  ".reading-content",
  ".chapter-content",
  "#chapter-content",
  "#readerarea",
  ".entry-content",
  ".page-break",
  ".wp-manga-chapter-img",
  "[class*='chapter-image']",
  "[class*='reader-content']",
  "[class*='read-container']",
  ".container-chapter-reader",
  "#content .manga-reading-content",
];

// Patterns in URLs that indicate non-content images
const SKIP_PATTERNS = [
  "placeholder", "loading.", "/avatar/", "/icon/", "/logo",
  "gravatar.com", "1x1", "pixel", "blank.", "spacer",
  "/cover/", "fallback", "favicon",
  "advertisement", "banner", "/ad/", "adsense",
];

export async function getBrowser(): Promise<Browser> {
  if (process.env.NODE_ENV === "production" || process.env.USE_CHROMIUM_MIN) {
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

  const puppeteerExtra = (await import("puppeteer-extra")).default;
  const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
  puppeteerExtra.use(StealthPlugin());

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
  await page.setUserAgent(REALISTIC_UA);

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", {
      get: () => [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
        { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
        { name: "Native Client", filename: "internal-nacl-plugin" },
      ],
    });
    Object.defineProperty(navigator, "languages", {
      get: () => ["de-DE", "de", "en-US", "en"],
    });
    // @ts-expect-error Faking chrome runtime
    window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };

    const originalQuery = window.navigator.permissions.query.bind(
      window.navigator.permissions
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator.permissions as any).query = (parameters: any) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);
  });

  await page.setExtraHTTPHeaders({
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  });

  page.setDefaultTimeout(PAGE_TIMEOUT);
}

async function waitForCloudflare(page: Page) {
  await new Promise((r) => setTimeout(r, 2000));

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
      console.log(`[CF] Challenge detected (${sel}), waiting up to 30s...`);
      await page.waitForSelector(sel, { hidden: true, timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
      await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
      console.log("[CF] Challenge resolved.");
      return;
    }
  }

  const blocked = await page.evaluate(() => {
    const body = document.body?.textContent?.toLowerCase() || "";
    return body.includes("sorry, you have been blocked") ||
           body.includes("access denied") ||
           body.includes("ray id");
  });

  if (blocked) {
    console.log("[CF] Blocked, retrying once...");
    await new Promise((r) => setTimeout(r, 5000));
    await page.reload({ waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 3000));

    const stillBlocked = await page.evaluate(() => {
      const body = document.body?.textContent?.toLowerCase() || "";
      return body.includes("sorry, you have been blocked") || body.includes("access denied");
    });

    if (stillBlocked) {
      throw new Error("Blocked by Cloudflare after retry.");
    }
  }
}

/** Force all lazy-loaded images to load by copying data-src → src.
 *  IMPORTANT: Keep data-src intact so extractImageUrls can still resolve URLs
 *  even if the browser hasn't actually loaded the image yet. */
async function forceLazyLoad(page: Page) {
  await page.evaluate(() => {
    const lazyAttrs = ["data-src", "data-lazy-src", "data-original", "data-url"];
    document.querySelectorAll("img").forEach((img) => {
      for (const attr of lazyAttrs) {
        const val = img.getAttribute(attr);
        if (val && val.startsWith("http")) {
          img.src = val;
          // Don't remove data-src — extraction needs it as fallback
          break;
        }
      }
      if (img.loading === "lazy") {
        img.loading = "eager";
      }
    });
  });
}

/** Scroll through page with time limit to trigger lazy-loading */
async function scrollThrough(page: Page) {
  const startTime = Date.now();

  const totalHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  let current = 0;
  const step = viewportHeight * 0.7;

  while (current < totalHeight) {
    if (Date.now() - startTime > MAX_SCROLL_TIME) {
      console.log("[Scroll] Time limit reached.");
      break;
    }
    current += step;
    await page.evaluate((y) => window.scrollTo(0, y), Math.floor(current));
    await new Promise((r) => setTimeout(r, SCROLL_PAUSE));
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight > totalHeight) {
      current = Math.min(current, newHeight);
    }
  }

  // Force lazy-load after scrolling
  await forceLazyLoad(page);

  // Final scroll to bottom + wait
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, IMAGE_LOAD_WAIT));
}

// ─── Discovery ───────────────────────────────────────────

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
    await page.goto(seriesUrl, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT });
    await waitForCloudflare(page);

    const meta = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const metaTitle = document.querySelector("meta[property='og:title']") as HTMLMetaElement | null;
      const title = h1?.textContent?.trim() || metaTitle?.content || document.title;

      const ogImage = document.querySelector("meta[property='og:image']") as HTMLMetaElement | null;
      const coverImg = document.querySelector('img[src*="cover"]') as HTMLImageElement | null;
      const coverUrl = ogImage?.content || coverImg?.src || undefined;

      return { title: title || "Unknown Series", coverUrl };
    });

    let chapters = await extractChapterLinks(page);

    if (chapters.length === 0) {
      await scrollThrough(page);
      await new Promise((r) => setTimeout(r, 2000));
      chapters = await extractChapterLinks(page);
    }

    if (chapters.length === 0) {
      const showAllBtn = await page.$('button[wire\\:click*="loadAll"], [wire\\:click*="showAll"], button:has-text("all chapters")');
      if (showAllBtn) {
        await showAllBtn.click();
        await new Promise((r) => setTimeout(r, 3000));
        chapters = await extractChapterLinks(page);
      }
    }

    chapters.sort((a, b) => a.number - b.number);

    return { title: meta.title, coverUrl: meta.coverUrl, chapters };
  } finally {
    await page.close().catch(() => {});
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

// ─── Chapter Image Extraction ────────────────────────────

export async function extractChapterImages(
  browser: Browser,
  chapterUrl: string
): Promise<string[]> {
  const page = await browser.newPage();
  await setupPage(page);

  try {
    console.log(`[Crawl] Loading: ${chapterUrl}`);
    await page.goto(chapterUrl, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT });
    await waitForCloudflare(page);

    // Wait for content container to appear (JS-rendered sites like Livewire/Alpine)
    await page.waitForSelector("article.prose, .reading-content, .chapter-content, #readerarea", {
      timeout: 10000,
    }).catch(() => {});

    // Extra wait for JS-rendered content to fully load
    await new Promise((r) => setTimeout(r, 2000));

    // Force lazy-load before scrolling
    await forceLazyLoad(page);

    // Scroll to trigger remaining lazy-loading
    await scrollThrough(page);

    // Force again after scroll (new images may have appeared in DOM)
    await forceLazyLoad(page);
    await new Promise((r) => setTimeout(r, 2000));

    // Extract with smart container detection
    const images = await extractImageUrls(page);
    console.log(`[Crawl] Found ${images.length} images in: ${chapterUrl}`);
    return images;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Smart image extraction with 3-level fallback:
 * 1. Known manga reader CSS selectors
 * 2. Container with the most large images
 * 3. All large images on the page
 */
async function extractImageUrls(page: Page): Promise<string[]> {
  const skipPatterns = SKIP_PATTERNS;

  // Strategy 1: Try known manga reader selectors
  for (const selector of READER_SELECTORS) {
    const urls = await page.evaluate(
      (sel: string, skip: string[]) => {
        const container = document.querySelector(sel);
        if (!container) return [];

        const imgs = container.querySelectorAll("img");
        if (imgs.length === 0) return [];

        const urls: string[] = [];
        const seen = new Set<string>();

        for (const img of imgs) {
          const url = _resolveUrl(img);
          if (!url) continue;
          if (skip.some((p) => url.toLowerCase().includes(p))) continue;
          const key = url.split("?")[0];
          if (seen.has(key)) continue;
          seen.add(key);
          urls.push(url);
        }
        return urls;

        function _resolveUrl(img: HTMLImageElement): string | null {
          for (const attr of ["data-src", "data-lazy-src", "data-original", "data-url"]) {
            const val = img.getAttribute(attr);
            if (val && val.startsWith("http") && !val.startsWith("data:")) return val;
          }
          if (img.src && img.src.startsWith("http") && !img.src.includes("1x1") && !img.src.startsWith("data:")) {
            return img.src;
          }
          return null;
        }
      },
      selector,
      skipPatterns
    );

    if (urls.length >= 3) {
      console.log(`[Extract] Selector "${selector}" → ${urls.length} images`);
      return urls;
    }
  }

  // Strategy 2: Find container with most large images
  console.log("[Extract] No known selector matched, searching for large-image container...");
  const fallbackUrls = await page.evaluate((skip: string[]) => {
    function _resolveUrl(img: HTMLImageElement): string | null {
      for (const attr of ["data-src", "data-lazy-src", "data-original", "data-url"]) {
        const val = img.getAttribute(attr);
        if (val && val.startsWith("http") && !val.startsWith("data:")) return val;
      }
      if (img.src && img.src.startsWith("http") && !img.src.includes("1x1") && !img.src.startsWith("data:")) {
        return img.src;
      }
      return null;
    }

    function isLargeImage(img: HTMLImageElement): boolean {
      if (img.naturalWidth > 200 && img.naturalHeight > 200) return true;
      if (img.width > 200 && img.height > 200) return true;
      const src = img.src || img.getAttribute("data-src") || "";
      return /\/(manga|chapter|uploads|scan|page|read|image|content)\//i.test(src);
    }

    // Find container with most large images
    const allDivs = document.querySelectorAll("div");
    let bestEl: Element | null = null;
    let bestCount = 0;

    for (const div of allDivs) {
      const imgs = div.querySelectorAll("img");
      let count = 0;
      for (const img of imgs) {
        if (isLargeImage(img)) count++;
      }
      // Prefer deeper containers (more specific) when counts are equal
      if (count > bestCount || (count === bestCount && count > 0 && div.children.length < (bestEl?.children.length ?? Infinity))) {
        bestCount = count;
        bestEl = div;
      }
    }

    const container = bestCount >= 3 ? bestEl : document;
    if (!container) return [];

    const imgs = container.querySelectorAll("img");
    const urls: string[] = [];
    const seen = new Set<string>();

    for (const img of imgs) {
      if (container !== document && !isLargeImage(img)) continue;

      const url = _resolveUrl(img);
      if (!url) continue;
      if (skip.some((p) => url.toLowerCase().includes(p))) continue;
      const key = url.split("?")[0];
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push(url);
    }

    return urls;
  }, skipPatterns);

  if (fallbackUrls.length >= 1) {
    console.log(`[Extract] Large-image fallback → ${fallbackUrls.length} images`);
  } else {
    console.log("[Extract] No images found at all.");
  }

  return fallbackUrls;
}
