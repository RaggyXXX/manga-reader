/**
 * Canvas-based panel gutter detection for manga/manhwa images.
 *
 * Detects horizontal and vertical "gutters" (strips of near-white or
 * near-black pixels that separate panels) and returns an array of
 * panel rectangles sorted in reading order.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GutterResult {
  panels: PanelRect[];
  /** `false` when no gutters were found – panels[] contains a single
   *  rectangle covering the whole image. */
  hasPanels: boolean;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const cache = new Map<string, GutterResult>();

export function clearPanelCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum image dimension (width or height) to attempt detection. */
const MIN_IMAGE_SIZE = 200;

/** A row/column is considered a gutter line when this fraction of its
 *  pixels are gutter-colored. */
const GUTTER_RATIO = 0.9;

/** Brightness thresholds – a pixel is "gutter-colored" when its
 *  grayscale value is above HIGH or below LOW. */
const BRIGHTNESS_HIGH = 240;
const BRIGHTNESS_LOW = 15;

/** Minimum consecutive gutter rows/columns to count as a real gutter. */
const MIN_GUTTER_RUN = 8;

/** Panels thinner than this in either dimension are discarded. */
const MIN_PANEL_SIZE = 40;

/** Vertical tolerance (px) when grouping panels into the same row for
 *  reading-order sorting. */
const ROW_TOLERANCE = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load an image from a URL into an HTMLImageElement.
 * Resolves with the loaded image or rejects on error / timeout.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Draw the image to a canvas and return the raw RGBA pixel data together
 * with the image dimensions.
 */
function getPixelData(
  img: HTMLImageElement
): { data: Uint8ClampedArray; width: number; height: number } {
  const { naturalWidth: width, naturalHeight: height } = img;

  // Prefer OffscreenCanvas when available (works in Web Workers too).
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null =
    null;

  if (typeof OffscreenCanvas !== "undefined") {
    const oc = new OffscreenCanvas(width, height);
    ctx = oc.getContext("2d");
  }

  if (!ctx) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext("2d");
  }

  if (!ctx) {
    throw new Error("Unable to obtain a 2D canvas context");
  }

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  return { data: imageData.data, width, height };
}

/** Convert an RGBA pixel at offset `i` to a grayscale brightness value. */
function grayscale(data: Uint8ClampedArray, i: number): number {
  // Standard luminance formula (ITU-R BT.601).
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/** Return `true` when the brightness qualifies as gutter-colored. */
function isGutterPixel(brightness: number): boolean {
  return brightness > BRIGHTNESS_HIGH || brightness < BRIGHTNESS_LOW;
}

// ---------------------------------------------------------------------------
// Gutter detection
// ---------------------------------------------------------------------------

/**
 * Build a boolean array indicating which rows are gutter rows.
 * A row is a gutter row when >= GUTTER_RATIO of its pixels are gutter-colored.
 */
function findGutterRows(
  data: Uint8ClampedArray,
  width: number,
  height: number
): boolean[] {
  const isGutter = new Array<boolean>(height);
  const threshold = Math.floor(width * GUTTER_RATIO);

  for (let y = 0; y < height; y++) {
    let count = 0;
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (isGutterPixel(grayscale(data, rowOffset + x * 4))) {
        count++;
      }
    }
    isGutter[y] = count >= threshold;
  }

  return isGutter;
}

/**
 * Build a boolean array indicating which columns are gutter columns.
 */
function findGutterCols(
  data: Uint8ClampedArray,
  width: number,
  height: number
): boolean[] {
  const isGutter = new Array<boolean>(width);
  const threshold = Math.floor(height * GUTTER_RATIO);

  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < height; y++) {
      if (isGutterPixel(grayscale(data, (y * width + x) * 4))) {
        count++;
      }
    }
    isGutter[x] = count >= threshold;
  }

  return isGutter;
}

/**
 * Given a boolean array marking gutter lines, return the boundaries of
 * non-gutter regions (i.e. the content strips between gutters).
 *
 * Each returned pair `[start, end)` represents a contiguous run of
 * non-gutter lines whose run-length of the surrounding gutter is at
 * least `MIN_GUTTER_RUN` (or the line sits at image edge).
 */
function extractRegions(
  isGutter: boolean[],
  length: number
): Array<[number, number]> {
  // First, collapse the boolean array into runs of gutter / non-gutter.
  interface Run {
    gutter: boolean;
    start: number;
    end: number; // exclusive
  }

  const runs: Run[] = [];
  let runStart = 0;
  for (let i = 1; i <= length; i++) {
    if (i === length || isGutter[i] !== isGutter[runStart]) {
      runs.push({ gutter: isGutter[runStart], start: runStart, end: i });
      runStart = i;
    }
  }

  // Mark which gutter runs are "significant" (>= MIN_GUTTER_RUN long).
  // Image edges act as implicit significant gutters.
  const significantGutterEnds = new Set<number>();
  const significantGutterStarts = new Set<number>();

  // Implicit gutters at edges.
  significantGutterStarts.add(0);
  significantGutterEnds.add(length);

  for (const run of runs) {
    if (run.gutter && run.end - run.start >= MIN_GUTTER_RUN) {
      significantGutterEnds.add(run.start);
      significantGutterStarts.add(run.end);
    }
  }

  // Build sorted arrays from the sets.
  const starts = Array.from(significantGutterStarts).sort((a, b) => a - b);
  const ends = Array.from(significantGutterEnds).sort((a, b) => a - b);

  // Pair up consecutive start/end to form content regions.
  const regions: Array<[number, number]> = [];
  for (const s of starts) {
    // Find the smallest end > s.
    for (const e of ends) {
      if (e > s) {
        regions.push([s, e]);
        break;
      }
    }
  }

  return regions;
}

// ---------------------------------------------------------------------------
// Panel construction
// ---------------------------------------------------------------------------

function buildPanels(
  hRegions: Array<[number, number]>,
  vRegions: Array<[number, number]>,
  imgWidth: number,
  imgHeight: number
): PanelRect[] {
  const panels: PanelRect[] = [];

  for (const [y1, y2] of hRegions) {
    for (const [x1, x2] of vRegions) {
      const w = x2 - x1;
      const h = y2 - y1;
      if (w >= MIN_PANEL_SIZE && h >= MIN_PANEL_SIZE) {
        panels.push({ x: x1, y: y1, width: w, height: h });
      }
    }
  }

  return panels;
}

/**
 * Sort panels in reading order:
 *  - primary: top-to-bottom (panels whose `y` values differ by <= ROW_TOLERANCE
 *    are considered to be in the same row)
 *  - secondary: left-to-right (LTR) or right-to-left (RTL)
 */
function sortPanels(panels: PanelRect[], rtl: boolean): PanelRect[] {
  return panels.slice().sort((a, b) => {
    // Group into rows with tolerance.
    const sameRow = Math.abs(a.y - b.y) <= ROW_TOLERANCE;
    if (!sameRow) {
      return a.y - b.y;
    }
    // Within the same row, sort by x.
    return rtl ? b.x - a.x : a.x - b.x;
  });
}

// ---------------------------------------------------------------------------
// Full-image fallback
// ---------------------------------------------------------------------------

function fullImageFallback(width: number, height: number): GutterResult {
  return {
    panels: [{ x: 0, y: 0, width, height }],
    hasPanels: false,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Detect panels in a manga page image by analysing pixel gutters.
 *
 * @param imageUrl  URL of the image to analyse (must be CORS-accessible).
 * @param rtl       When `true`, panels within the same row are sorted
 *                  right-to-left (manga reading order). Default `false`.
 * @returns         A `GutterResult` with the detected panels.
 */
export async function detectPanels(
  imageUrl: string,
  rtl: boolean = false
): Promise<GutterResult> {
  // Return cached result if available.
  const cacheKey = `${imageUrl}::${rtl ? "rtl" : "ltr"}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let img: HTMLImageElement;
  try {
    img = await loadImage(imageUrl);
  } catch {
    // Cannot load image – return a 0×0 fallback.
    const fallback = fullImageFallback(0, 0);
    cache.set(cacheKey, fallback);
    return fallback;
  }

  const { naturalWidth: imgWidth, naturalHeight: imgHeight } = img;

  // Too-small images – skip detection.
  if (imgWidth < MIN_IMAGE_SIZE || imgHeight < MIN_IMAGE_SIZE) {
    const fallback = fullImageFallback(imgWidth, imgHeight);
    cache.set(cacheKey, fallback);
    return fallback;
  }

  let result: GutterResult;

  try {
    const { data, width, height } = getPixelData(img);

    // Detect gutter rows and columns.
    const gutterRows = findGutterRows(data, width, height);
    const gutterCols = findGutterCols(data, width, height);

    // Extract content regions between significant gutters.
    const hRegions = extractRegions(gutterRows, height);
    const vRegions = extractRegions(gutterCols, width);

    // If we only have one region in both axes there are no real gutters.
    if (hRegions.length <= 1 && vRegions.length <= 1) {
      result = fullImageFallback(imgWidth, imgHeight);
    } else {
      const panels = buildPanels(hRegions, vRegions, imgWidth, imgHeight);

      if (panels.length <= 1) {
        result = fullImageFallback(imgWidth, imgHeight);
      } else {
        result = {
          panels: sortPanels(panels, rtl),
          hasPanels: true,
        };
      }
    }
  } catch {
    result = fullImageFallback(imgWidth, imgHeight);
  }

  cache.set(cacheKey, result);
  return result;
}
