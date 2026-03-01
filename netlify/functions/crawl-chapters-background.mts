/**
 * Netlify Background Function: crawl-chapters-background
 *
 * The `-background` suffix tells Netlify to run this asynchronously.
 * It returns 202 Accepted immediately, then runs for up to 15 minutes.
 *
 * Expects POST body: { seriesId: string, jobId: string, batch: number }
 *   - seriesId: MongoDB ObjectId of the series
 *   - jobId: MongoDB ObjectId of the CrawlJob tracking this run
 *   - batch: 0-indexed batch number (each batch = 20 chapters)
 */

import mongoose from "mongoose";

// Netlify function context type (minimal definition so we don't need
// @netlify/functions installed as a dependency)
interface NetlifyContext {
  geo?: { city?: string; country?: { code?: string } };
  ip?: string;
  params?: Record<string, string>;
  requestId?: string;
  server?: { region?: string };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 20;
const DELAY_BETWEEN_CHAPTERS = 2000; // ms between chapter crawls
const MONGO_CONNECT_TIMEOUT = 10_000;

// ---------------------------------------------------------------------------
// Mongoose models (inline re-definitions — Netlify functions run outside
// the Next.js runtime so we cannot import from `@/lib/models/*`)
// ---------------------------------------------------------------------------

/* ---- Chapter ---- */

const ChapterSchema = new mongoose.Schema(
  {
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: "Series", required: true },
    number: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    sourceUrl: { type: String, required: true },
    imageUrls: { type: [String], default: [] },
    pageCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "crawled", "error"],
      default: "pending",
    },
    errorMessage: { type: String, default: undefined },
    crawledAt: { type: Date, default: undefined },
  },
  { timestamps: true, versionKey: false, collection: "chapters" }
);

ChapterSchema.index({ seriesId: 1, number: 1 }, { unique: true });
ChapterSchema.index({ seriesId: 1, status: 1 });

const Chapter =
  mongoose.models.Chapter ?? mongoose.model("Chapter", ChapterSchema);

/* ---- CrawlJob ---- */

const CrawlJobSchema = new mongoose.Schema(
  {
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: "Series", required: true },
    type: { type: String, enum: ["discover", "chapters"], required: true },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed"],
      default: "queued",
    },
    progress: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    currentBatch: { type: Number, default: 1 },
    errorMessage: { type: String, default: undefined },
    startedAt: { type: Date, default: undefined },
    completedAt: { type: Date, default: undefined },
  },
  { timestamps: true, versionKey: false, collection: "crawl_jobs" }
);

CrawlJobSchema.index({ seriesId: 1, type: 1, status: 1 });

const CrawlJob =
  mongoose.models.CrawlJob ?? mongoose.model("CrawlJob", CrawlJobSchema);

/* ---- Series ---- */

const SeriesSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sourceUrl: { type: String, required: true, unique: true },
    coverUrl: { type: String, default: undefined },
    totalChapters: { type: Number, default: 0 },
    crawledChapters: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["discovering", "partial", "complete"],
      default: "discovering",
    },
    lastSynced: { type: Date, default: undefined },
  },
  { timestamps: true, versionKey: false, collection: "series" }
);

const Series =
  mongoose.models.Series ?? mongoose.model("Series", SeriesSchema);

// ---------------------------------------------------------------------------
// MongoDB connection (direct mongoose.connect — no Next.js global cache)
// ---------------------------------------------------------------------------

let dbConnected = false;

async function connectDB(): Promise<void> {
  if (dbConnected && mongoose.connection.readyState === 1) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not defined");
  }

  await mongoose.connect(uri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: MONGO_CONNECT_TIMEOUT,
    socketTimeoutMS: 45_000,
    family: 4,
  });

  dbConnected = true;
  console.log("[bg] Connected to MongoDB");
}

// ---------------------------------------------------------------------------
// Puppeteer / crawler helpers (duplicated from src/lib/crawler.ts because
// Netlify functions cannot resolve the @/* path alias)
// ---------------------------------------------------------------------------

const SCROLL_PAUSE = 1000;
const IMAGE_LOAD_WAIT = 5000;
const PAGE_TIMEOUT = 60_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Browser = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any;

async function getBrowser(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;

  if (process.env.NODE_ENV === "production" || process.env.USE_CHROMIUM_MIN) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    return puppeteer.launch({
      args: [
        ...chromium.args,
        "--hide-scrollbars",
        "--disable-web-security",
        "--no-sandbox",
      ],
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: await chromium.executablePath(
        process.env.CHROMIUM_REMOTE_URL!
      ),
      headless: true,
    });
  }

  // Local fallback
  const paths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
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

  return puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
    defaultViewport: { width: 1920, height: 1080 },
  });
}

async function setupPage(page: Page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  page.setDefaultTimeout(PAGE_TIMEOUT);
}

async function waitForCloudflare(page: Page) {
  const cfSelectors = [
    "#challenge-running",
    "#challenge-stage",
    ".cf-browser-verification",
    "iframe[src*='challenges.cloudflare.com']",
  ];
  for (const sel of cfSelectors) {
    const el = await page.$(sel);
    if (el) {
      console.log("[CF] Cloudflare challenge detected, waiting...");
      await page
        .waitForSelector(sel, { hidden: true, timeout: 30_000 })
        .catch(() => {});
      await page.waitForNetworkIdle({ timeout: 15_000 }).catch(() => {});
      console.log("[CF] Challenge passed.");
      return;
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
    await page.evaluate((y: number) => window.scrollTo(0, y), Math.floor(current));
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

async function slowScroll(page: Page) {
  const totalHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  let current = 0;
  const step = viewportHeight * 0.5;

  while (current < totalHeight) {
    current += step;
    await page.evaluate((y: number) => window.scrollTo(0, y), Math.floor(current));
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
        if (
          c &&
          c.startsWith("http") &&
          !c.includes("1x1.webp") &&
          !c.startsWith("data:")
        ) {
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

async function extractChapterImages(
  browser: Browser,
  chapterUrl: string
): Promise<string[]> {
  const page = await browser.newPage();
  await setupPage(page);

  try {
    await page.goto(chapterUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT,
    });
    await waitForCloudflare(page);
    await page.waitForNetworkIdle({ timeout: 15_000 }).catch(() => {});

    await scrollThrough(page);

    let images = await extractImageUrls(page);

    if (images.length === 0) {
      await slowScroll(page);
      images = await extractImageUrls(page);
    }

    return images;
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export default async function handler(req: Request, _context: NetlifyContext) {
  // Background functions only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: { seriesId?: string; jobId?: string; batch?: number };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { seriesId, jobId, batch } = body;

  if (!seriesId || !jobId || batch === undefined || batch === null) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: seriesId, jobId, batch" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const batchNumber = Number(batch);
  console.log(
    `[bg] Starting crawl — seriesId=${seriesId}, jobId=${jobId}, batch=${batchNumber}`
  );

  let browser: Browser | null = null;

  try {
    // ---- Connect to MongoDB ----
    await connectDB();

    // ---- Load the CrawlJob ----
    const job = await CrawlJob.findById(jobId);
    if (!job) {
      console.error(`[bg] CrawlJob ${jobId} not found`);
      return new Response(
        JSON.stringify({ error: "CrawlJob not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Mark job as running with current batch
    await CrawlJob.updateOne(
      { _id: jobId },
      {
        status: "running",
        currentBatch: batchNumber + 1, // 1-indexed for display
        startedAt: job.startedAt ?? new Date(),
      }
    );

    // ---- Find pending chapters for this batch ----
    const pendingChapters = await Chapter.find({
      seriesId,
      status: "pending",
    })
      .sort({ number: 1 })
      .skip(batchNumber * BATCH_SIZE)
      .limit(BATCH_SIZE)
      .lean();

    if (pendingChapters.length === 0) {
      console.log("[bg] No pending chapters found for this batch, marking complete");

      // Check overall status
      const totalChapters = await Chapter.countDocuments({ seriesId });
      const crawledCount = await Chapter.countDocuments({ seriesId, status: "crawled" });
      const pendingCount = await Chapter.countDocuments({ seriesId, status: "pending" });

      const finalStatus = pendingCount === 0 ? "completed" : "completed";
      await CrawlJob.updateOne(
        { _id: jobId },
        {
          status: finalStatus,
          completedAt: new Date(),
          progress: 100,
        }
      );

      await Series.updateOne(
        { _id: seriesId },
        {
          crawledChapters: crawledCount,
          status: crawledCount >= totalChapters ? "complete" : "partial",
          lastSynced: new Date(),
        }
      );

      return new Response(
        JSON.stringify({ message: "No chapters in batch", completed: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[bg] Processing ${pendingChapters.length} chapters (batch ${batchNumber}, ` +
        `chapters #${pendingChapters[0].number}–#${pendingChapters[pendingChapters.length - 1].number})`
    );

    // ---- Launch browser ----
    browser = await getBrowser();
    let completedInBatch = 0;

    // ---- Process each chapter ----
    for (const chapter of pendingChapters) {
      const chapterLabel = `Ch.${chapter.number}`;

      try {
        console.log(`[bg] Crawling ${chapterLabel}: ${chapter.sourceUrl}`);
        const imageUrls = await extractChapterImages(browser, chapter.sourceUrl);

        if (imageUrls.length > 0) {
          await Chapter.updateOne(
            { _id: chapter._id },
            {
              imageUrls,
              pageCount: imageUrls.length,
              status: "crawled",
              errorMessage: undefined,
              crawledAt: new Date(),
            }
          );
          console.log(`[bg] ${chapterLabel}: found ${imageUrls.length} images`);
        } else {
          await Chapter.updateOne(
            { _id: chapter._id },
            {
              status: "error",
              errorMessage: "No images found on page",
              crawledAt: new Date(),
            }
          );
          console.warn(`[bg] ${chapterLabel}: no images found`);
        }
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        console.error(`[bg] ${chapterLabel} failed: ${errorMessage}`);

        await Chapter.updateOne(
          { _id: chapter._id },
          {
            status: "error",
            errorMessage: errorMessage.slice(0, 500), // Truncate long errors
          }
        );
      }

      completedInBatch++;

      // ---- Update CrawlJob progress ----
      // completed = previously completed chapters + this batch's progress
      const totalCrawledOrErrored = await Chapter.countDocuments({
        seriesId,
        status: { $in: ["crawled", "error"] },
      });

      const totalChapters = await Chapter.countDocuments({ seriesId });
      const progress =
        totalChapters > 0
          ? Math.round((totalCrawledOrErrored / totalChapters) * 100)
          : 0;

      await CrawlJob.updateOne(
        { _id: jobId },
        {
          completed: totalCrawledOrErrored,
          progress,
          total: totalChapters,
        }
      );

      // ---- Update series crawled count ----
      const crawledCount = await Chapter.countDocuments({
        seriesId,
        status: "crawled",
      });
      await Series.updateOne(
        { _id: seriesId },
        { crawledChapters: crawledCount }
      );

      // ---- Delay between chapters (avoid rate limiting) ----
      if (completedInBatch < pendingChapters.length) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_CHAPTERS));
      }
    }

    // ---- Batch finished — check if more chapters remain ----
    const remainingPending = await Chapter.countDocuments({
      seriesId,
      status: "pending",
    });

    const totalChapters = await Chapter.countDocuments({ seriesId });
    const crawledCount = await Chapter.countDocuments({
      seriesId,
      status: "crawled",
    });

    if (remainingPending > 0) {
      // More batches needed — update job but keep it running
      console.log(
        `[bg] Batch ${batchNumber} done. ${remainingPending} chapters still pending. ` +
          `Triggering next batch.`
      );

      await CrawlJob.updateOne(
        { _id: jobId },
        {
          status: "running",
          currentBatch: batchNumber + 2, // next batch (1-indexed for display)
        }
      );

      // Trigger the next batch by calling ourselves
      const siteUrl =
        process.env.URL || process.env.DEPLOY_URL || "http://localhost:8888";

      try {
        await fetch(`${siteUrl}/.netlify/functions/crawl-chapters-background`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seriesId,
            jobId,
            batch: batchNumber + 1,
          }),
        });
        console.log(`[bg] Triggered batch ${batchNumber + 1}`);
      } catch (chainErr) {
        console.error("[bg] Failed to trigger next batch:", chainErr);
        // Don't fail the job — the frontend can retry or the user can
        // manually trigger the next batch.
        await CrawlJob.updateOne(
          { _id: jobId },
          {
            status: "running",
            errorMessage: `Batch ${batchNumber} complete but failed to trigger batch ${batchNumber + 1}. ` +
              `${remainingPending} chapters remaining.`,
          }
        );
      }
    } else {
      // All chapters processed
      console.log(
        `[bg] All chapters processed. ${crawledCount}/${totalChapters} crawled successfully.`
      );

      await CrawlJob.updateOne(
        { _id: jobId },
        {
          status: "completed",
          completedAt: new Date(),
          progress: 100,
          completed: totalChapters,
        }
      );

      await Series.updateOne(
        { _id: seriesId },
        {
          crawledChapters: crawledCount,
          status: crawledCount >= totalChapters ? "complete" : "partial",
          lastSynced: new Date(),
        }
      );
    }
  } catch (fatalErr: unknown) {
    // Fatal error — something outside the per-chapter loop failed
    const errorMessage =
      fatalErr instanceof Error ? fatalErr.message : String(fatalErr);
    console.error(`[bg] Fatal error in batch ${batchNumber}: ${errorMessage}`);

    try {
      await CrawlJob.updateOne(
        { _id: jobId },
        {
          status: "failed",
          errorMessage: `Batch ${batchNumber} fatal: ${errorMessage}`.slice(0, 500),
          completedAt: new Date(),
        }
      );
    } catch {
      // If even the error update fails (e.g. DB disconnected), just log
      console.error("[bg] Could not update job status after fatal error");
    }
  } finally {
    // ---- Clean up browser ----
    if (browser) {
      try {
        await browser.close();
        console.log("[bg] Browser closed");
      } catch {
        console.warn("[bg] Failed to close browser (may already be closed)");
      }
    }

    // ---- Disconnect from MongoDB ----
    try {
      await mongoose.disconnect();
      dbConnected = false;
      console.log("[bg] Disconnected from MongoDB");
    } catch {
      // Not critical
    }
  }

  return new Response(
    JSON.stringify({ message: "Batch processing complete" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

export const config = {
  path: "/.netlify/functions/crawl-chapters-background",
};
