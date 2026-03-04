/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Generate PWA PNG icons for manga-reader.
 * Pure Node.js — no external dependencies.
 * Creates icon-192.png, icon-512.png, icon-maskable-512.png in public/icons/
 *
 * Icon design: rounded purple (#6c5ce7) background with a white open-book / manga icon.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ── PNG encoder (minimal, RGBA) ────────────────────────────────────────────

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  // Build raw scanlines: filter byte 0 (None) + row data
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (rowBytes + 1);
    raw[offset] = 0; // filter: None
    rgba.copy(raw, offset + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const iend = Buffer.alloc(0);

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", iend),
  ]);
}

// ── Drawing helpers ────────────────────────────────────────────────────────

function setPixel(buf, w, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w || y >= w) return;
  x = Math.floor(x);
  y = Math.floor(y);
  const idx = (y * w + x) * 4;
  if (a === 255) {
    buf[idx] = r;
    buf[idx + 1] = g;
    buf[idx + 2] = b;
    buf[idx + 3] = 255;
  } else {
    // Alpha blend
    const srcA = a / 255;
    const dstA = buf[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA > 0) {
      buf[idx]     = Math.round((r * srcA + buf[idx]     * dstA * (1 - srcA)) / outA);
      buf[idx + 1] = Math.round((g * srcA + buf[idx + 1] * dstA * (1 - srcA)) / outA);
      buf[idx + 2] = Math.round((b * srcA + buf[idx + 2] * dstA * (1 - srcA)) / outA);
      buf[idx + 3] = Math.round(outA * 255);
    }
  }
}

function fillRect(buf, w, x1, y1, x2, y2, r, g, b, a = 255) {
  for (let y = Math.max(0, Math.floor(y1)); y < Math.min(w, Math.ceil(y2)); y++) {
    for (let x = Math.max(0, Math.floor(x1)); x < Math.min(w, Math.ceil(x2)); x++) {
      setPixel(buf, w, x, y, r, g, b, a);
    }
  }
}

function fillRoundedRect(buf, size, x1, y1, x2, y2, radius, r, g, b, a = 255) {
  for (let y = Math.max(0, Math.floor(y1)); y < Math.min(size, Math.ceil(y2)); y++) {
    for (let x = Math.max(0, Math.floor(x1)); x < Math.min(size, Math.ceil(x2)); x++) {
      // Check corners
      let inside = true;
      // Top-left
      if (x < x1 + radius && y < y1 + radius) {
        const dx = x - (x1 + radius), dy = y - (y1 + radius);
        if (dx * dx + dy * dy > radius * radius) inside = false;
      }
      // Top-right
      if (x > x2 - radius && y < y1 + radius) {
        const dx = x - (x2 - radius), dy = y - (y1 + radius);
        if (dx * dx + dy * dy > radius * radius) inside = false;
      }
      // Bottom-left
      if (x < x1 + radius && y > y2 - radius) {
        const dx = x - (x1 + radius), dy = y - (y2 - radius);
        if (dx * dx + dy * dy > radius * radius) inside = false;
      }
      // Bottom-right
      if (x > x2 - radius && y > y2 - radius) {
        const dx = x - (x2 - radius), dy = y - (y2 - radius);
        if (dx * dx + dy * dy > radius * radius) inside = false;
      }
      if (inside) setPixel(buf, size, x, y, r, g, b, a);
    }
  }
}

function strokeRect(buf, w, x1, y1, x2, y2, thickness, r, g, b, a = 255) {
  fillRect(buf, w, x1, y1, x2, y1 + thickness, r, g, b, a); // top
  fillRect(buf, w, x1, y2 - thickness, x2, y2, r, g, b, a); // bottom
  fillRect(buf, w, x1, y1, x1 + thickness, y2, r, g, b, a); // left
  fillRect(buf, w, x2 - thickness, y1, x2, y2, r, g, b, a); // right
}

function fillCircle(buf, size, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius;
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(size - 1, Math.ceil(cy + radius)); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(size - 1, Math.ceil(cx + radius)); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(buf, size, x, y, r, g, b, a);
    }
  }
}

// Filled bezier-ish book page shape (simplified curved page)
function fillBookPage(buf, size, leftX, rightX, topY, bottomY, curveX, isLeft, r, g, b, a) {
  // Fill area between the straight spine edge and the curved outer edge
  for (let y = Math.floor(topY); y < Math.ceil(bottomY); y++) {
    const t = (y - topY) / (bottomY - topY); // 0..1
    // Curve the outer edge: sine-based bulge
    const bulge = Math.sin(t * Math.PI) * curveX;
    let rowLeft, rowRight;
    if (isLeft) {
      rowLeft = leftX - bulge;
      rowRight = rightX;
    } else {
      rowLeft = leftX;
      rowRight = rightX + bulge;
    }
    for (let x = Math.max(0, Math.floor(rowLeft)); x < Math.min(size, Math.ceil(rowRight)); x++) {
      setPixel(buf, size, x, y, r, g, b, a);
    }
  }
}

// ── Icon renderer ──────────────────────────────────────────────────────────

function renderIcon(size, maskable) {
  const buf = Buffer.alloc(size * size * 4, 0);
  const S = size / 512; // scale factor

  // Background gradient (top-left to bottom-right)
  const bgR1 = 0x7c, bgG1 = 0x6c, bgB1 = 0xf7; // #7c6cf7
  const bgR2 = 0x5a, bgG2 = 0x4b, bgB2 = 0xd6; // #5a4bd6

  if (maskable) {
    // Maskable icon: fill entire canvas with solid color (safe zone is inner 80%)
    for (let y = 0; y < size; y++) {
      const t = (y + 0) / size;
      const r = Math.round(bgR1 + (bgR2 - bgR1) * t);
      const g = Math.round(bgG1 + (bgG2 - bgG1) * t);
      const b = Math.round(bgB1 + (bgB2 - bgB1) * t);
      for (let x = 0; x < size; x++) {
        setPixel(buf, size, x, y, r, g, b, 255);
      }
    }
  } else {
    // Rounded rect background
    const radius = Math.round(96 * S);
    for (let y = 0; y < size; y++) {
      const t = y / size;
      const r = Math.round(bgR1 + (bgR2 - bgR1) * t);
      const g = Math.round(bgG1 + (bgG2 - bgG1) * t);
      const b = Math.round(bgB1 + (bgB2 - bgB1) * t);
      for (let x = 0; x < size; x++) {
        let inside = true;
        // corners
        if (x < radius && y < radius) {
          const dx = x - radius, dy = y - radius;
          if (dx * dx + dy * dy > radius * radius) inside = false;
        }
        if (x > size - 1 - radius && y < radius) {
          const dx = x - (size - 1 - radius), dy = y - radius;
          if (dx * dx + dy * dy > radius * radius) inside = false;
        }
        if (x < radius && y > size - 1 - radius) {
          const dx = x - radius, dy = y - (size - 1 - radius);
          if (dx * dx + dy * dy > radius * radius) inside = false;
        }
        if (x > size - 1 - radius && y > size - 1 - radius) {
          const dx = x - (size - 1 - radius), dy = y - (size - 1 - radius);
          if (dx * dx + dy * dy > radius * radius) inside = false;
        }
        if (inside) setPixel(buf, size, x, y, r, g, b, 255);
      }
    }
  }

  // Book spine shadow
  fillRect(buf, size, 244 * S, 120 * S, 268 * S, 392 * S, 0x4a, 0x3c, 0xb8, 128);

  // Left page (white, slightly transparent)
  fillBookPage(buf, size, 136 * S, 252 * S, 130 * S, 380 * S, 18 * S, true, 255, 255, 255, 242);

  // Right page
  fillBookPage(buf, size, 260 * S, 376 * S, 130 * S, 380 * S, 18 * S, false, 255, 255, 255, 242);

  // Spine highlight
  fillRect(buf, size, 254 * S, 128 * S, 258 * S, 380 * S, 0xe0, 0xdc, 0xfc, 100);

  // Left page "text" lines
  const lineColor = { r: 0x6c, g: 0x5c, b: 0xe7 };
  const lineAlphas = [100, 76, 100, 76, 100];
  const lineYs = [172, 196, 220, 244, 268];
  const lineWidths = [68, 68, 68, 52, 60];
  for (let i = 0; i < lineYs.length; i++) {
    fillRoundedRect(buf, size,
      164 * S, lineYs[i] * S,
      (164 + lineWidths[i]) * S, (lineYs[i] + 5) * S,
      2 * S,
      lineColor.r, lineColor.g, lineColor.b, lineAlphas[i]
    );
  }

  // Right page manga panels (panel borders)
  const panelThickness = Math.max(1, Math.round(3.5 * S));
  const panelAlpha = 90;

  // Top panel (wide)
  strokeRect(buf, size, 280 * S, 164 * S, 360 * S, 224 * S, panelThickness,
    lineColor.r, lineColor.g, lineColor.b, panelAlpha);

  // Middle-left panel
  strokeRect(buf, size, 280 * S, 232 * S, 316 * S, 280 * S, panelThickness,
    lineColor.r, lineColor.g, lineColor.b, panelAlpha);

  // Middle-right panel
  strokeRect(buf, size, 324 * S, 232 * S, 360 * S, 280 * S, panelThickness,
    lineColor.r, lineColor.g, lineColor.b, panelAlpha);

  // Bottom panel (wide)
  strokeRect(buf, size, 280 * S, 288 * S, 360 * S, 340 * S, panelThickness,
    lineColor.r, lineColor.g, lineColor.b, panelAlpha);

  return buf;
}

// ── Main ───────────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

const sizes = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
];

for (const { name, size, maskable } of sizes) {
  console.log(`Generating ${name} (${size}x${size}, maskable=${maskable})...`);
  const rgba = renderIcon(size, maskable);
  const png = encodePNG(size, size, rgba);
  const outPath = path.join(outDir, name);
  fs.writeFileSync(outPath, png);
  console.log(`  -> ${outPath} (${png.length} bytes)`);
}

console.log("Done! All icons generated.");
