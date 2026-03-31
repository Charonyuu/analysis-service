const sharp = require('sharp');

// ═══════════════════════════════════════════════════════════════════════════════
// Pixel Buffer — 直接操作 RGBA raw buffer
// ═══════════════════════════════════════════════════════════════════════════════
class PixelBuffer {
  constructor(data, width, height) {
    this.data = Buffer.from(data);
    this.width = width;
    this.height = height;
  }

  offset(x, y) { return (y * this.width + x) * 4; }
  getA(x, y) { return this.data[this.offset(x, y) + 3]; }
  setA(x, y, v) { this.data[this.offset(x, y) + 3] = v; }

  brightness(x, y) {
    const o = this.offset(x, y);
    return (this.data[o] + this.data[o + 1] + this.data[o + 2]) / 3;
  }

  toSharp() {
    return sharp(Buffer.from(this.data), {
      raw: { width: this.width, height: this.height, channels: 4 },
    });
  }
}

async function sharpToPixels(sharpImg) {
  const { data, info } = await sharpImg
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new PixelBuffer(data, info.width, info.height);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 格線偵測 — 分析每行/每列的亮度 + 變異度，找出格線位置
// ═══════════════════════════════════════════════════════════════════════════════
function detectGridSplits(pixels, grid, brightThresh = 220, varThresh = 15) {
  const { width, height } = pixels;

  // 計算每行統計
  const rowMean = new Float64Array(height);
  const rowStd = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0, sumSq = 0;
    for (let x = 0; x < width; x++) {
      const b = pixels.brightness(x, y);
      sum += b;
      sumSq += b * b;
    }
    rowMean[y] = sum / width;
    rowStd[y] = Math.sqrt(Math.max(0, sumSq / width - rowMean[y] ** 2));
  }

  // 計算每列統計
  const colMean = new Float64Array(width);
  const colStd = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    let sum = 0, sumSq = 0;
    for (let y = 0; y < height; y++) {
      const b = pixels.brightness(x, y);
      sum += b;
      sumSq += b * b;
    }
    colMean[x] = sum / height;
    colStd[x] = Math.sqrt(Math.max(0, sumSq / height - colMean[x] ** 2));
  }

  function findSplits(mean, std, size, n) {
    // 標記「格線列/欄」：亮度高且色彩均勻
    const isLine = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      isLine[i] = (mean[i] > brightThresh && std[i] < varThresh) ? 1 : 0;
    }

    // 找連續亮帶 (bands)
    const bands = [];
    let inSeg = false, segStart = 0;
    for (let i = 0; i < size; i++) {
      if (isLine[i]) {
        if (!inSeg) { inSeg = true; segStart = i; }
      } else {
        if (inSeg) { bands.push([segStart, i]); inSeg = false; }
      }
    }
    if (inSeg) bands.push([segStart, size]);

    // 只取夠長的帶（過濾雜訊）
    const minBand = Math.max(10, Math.floor(size / 100));
    const longBands = bands.filter(b => (b[1] - b[0]) >= minBand);

    const splits = [0];
    const margin = Math.floor(size / n / 2);

    for (let k = 1; k < n; k++) {
      const ideal = Math.floor(size * k / n);
      const pool = longBands.length >= n - 1 ? longBands : bands;
      const near = pool.filter(b =>
        Math.abs(Math.floor((b[0] + b[1]) / 2) - ideal) <= margin
      );

      if (near.length > 0) {
        // 距離最近 + 較長的帶優先
        near.sort((a, b) => {
          const da = Math.abs(Math.floor((a[0] + a[1]) / 2) - ideal);
          const db = Math.abs(Math.floor((b[0] + b[1]) / 2) - ideal);
          return da !== db ? da - db : (b[1] - b[0]) - (a[1] - a[0]);
        });
        const best = near[0];
        // 帶內找局部最暗點（真正的格線像素）
        let minIdx = best[0], minVal = mean[best[0]];
        for (let i = best[0] + 1; i < best[1]; i++) {
          if (mean[i] < minVal) { minVal = mean[i]; minIdx = i; }
        }
        splits.push(minIdx);
      } else {
        splits.push(ideal); // fallback 等分
      }
    }
    splits.push(size);
    return splits;
  }

  let rowSplits = findSplits(rowMean, rowStd, height, grid);
  let colSplits = findSplits(colMean, colStd, width, grid);

  // 驗證切點數量
  if (rowSplits.length !== grid + 1 || colSplits.length !== grid + 1) {
    // Fallback: content-gap detection
    rowSplits = contentGapSplits(pixels, 'row', grid);
    colSplits = contentGapSplits(pixels, 'col', grid);
  }

  return { rowSplits, colSplits };
}

function contentGapSplits(pixels, axis, grid) {
  const { width, height } = pixels;
  const size = axis === 'row' ? height : width;
  const density = new Float64Array(size);

  for (let i = 0; i < size; i++) {
    let count = 0;
    const len = axis === 'row' ? width : height;
    for (let j = 0; j < len; j++) {
      const x = axis === 'row' ? j : i;
      const y = axis === 'row' ? i : j;
      const o = (y * width + x) * 4;
      const r = pixels.data[o], g = pixels.data[o + 1], b = pixels.data[o + 2];
      // 計算 std of RGB
      const mean = (r + g + b) / 3;
      const variance = ((r - mean) ** 2 + (g - mean) ** 2 + (b - mean) ** 2) / 3;
      if (Math.sqrt(variance) > 5) count++;
    }
    density[i] = count;
  }

  // 找 gaps（密度 <= 3 的連續段）
  const gaps = [];
  let inGap = false, gapStart = 0;
  for (let i = 0; i < size; i++) {
    if (density[i] <= 3) {
      if (!inGap) { inGap = true; gapStart = i; }
    } else {
      if (inGap) { gaps.push(Math.floor((gapStart + i) / 2)); inGap = false; }
    }
  }
  if (inGap) gaps.push(Math.floor((gapStart + size) / 2));

  const margin = Math.floor(size / grid / 3);
  const splits = [0];
  for (let k = 1; k < grid; k++) {
    const ideal = Math.floor(size * k / grid);
    const near = gaps.filter(g => Math.abs(g - ideal) <= margin);
    splits.push(near.length > 0
      ? near.reduce((a, b) => Math.abs(a - ideal) < Math.abs(b - ideal) ? a : b)
      : ideal
    );
  }
  splits.push(size);
  return splits;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 去背 — Flood fill 從四邊開始，只移除邊緣連通的亮色背景
// 【改進】不再用 clear_cell_edge_lines 暴力清邊緣 3%
// ═══════════════════════════════════════════════════════════════════════════════
function removeOuterBackground(pixels, threshold = 240) {
  const { width, height } = pixels;
  const bg = new Uint8Array(width * height);
  // 使用 flat array 作為 queue（比 deque 快）
  const queue = [];

  function seed(x, y) {
    const idx = y * width + x;
    if (!bg[idx] && pixels.brightness(x, y) > threshold) {
      bg[idx] = 1;
      queue.push(x, y);
    }
  }

  // 從四邊開始
  for (let x = 0; x < width; x++) { seed(x, 0); seed(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { seed(0, y); seed(width - 1, y); }

  // BFS
  let qi = 0;
  while (qi < queue.length) {
    const x = queue[qi++], y = queue[qi++];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const idx = ny * width + nx;
        if (!bg[idx] && pixels.brightness(nx, ny) > threshold) {
          bg[idx] = 1;
          queue.push(nx, ny);
        }
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bg[y * width + x]) pixels.setA(x, y, 0);
    }
  }
  return pixels;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 智慧 Artifact 移除
// 【取代原本三個獨立函式：clear_cell_edge_lines / remove_small_edge_blobs / remove_thin_side_artifacts】
//
// 策略：
//   1. 找所有 connected components
//   2. 找到最大 component（主體）
//   3. 其他 component 只在滿足以下條件時移除：
//      a. 小於主體的 5% → 且在邊緣區域 12% 內 → 移除
//      b. 寬度 <= 3px 且高度 >= 50% 圖片高度 → 格線殘留 → 移除
//      c. 其他一律保留（保護多元素 icon 如 sparkles、小裝飾）
// ═══════════════════════════════════════════════════════════════════════════════
function findComponents(pixels) {
  const { width, height } = pixels;
  const visited = new Uint8Array(width * height);
  const components = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx] || pixels.getA(x, y) <= 10) continue;

      const queue = [x, y];
      visited[idx] = 1;
      const pixelList = [];
      let minX = x, maxX = x, minY = y, maxY = y;
      let qi = 0;

      while (qi < queue.length) {
        const cx = queue[qi++], cy = queue[qi++];
        pixelList.push(cx, cy);
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const ni = ny * width + nx;
            if (!visited[ni] && pixels.getA(nx, ny) > 10) {
              visited[ni] = 1;
              queue.push(nx, ny);
            }
          }
        }
      }

      components.push({
        pixels: pixelList,
        count: pixelList.length / 2,
        minX, maxX, minY, maxY,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
      });
    }
  }

  return components;
}

function removeArtifacts(pixels) {
  const { width, height } = pixels;
  const components = findComponents(pixels);
  if (components.length <= 1) return pixels;

  // 按大小排序，最大的是主體
  components.sort((a, b) => b.count - a.count);
  const mainSize = components[0].count;

  const edgeZoneX = Math.floor(width * 0.12);
  const edgeZoneY = Math.floor(height * 0.12);

  for (let i = 1; i < components.length; i++) {
    const comp = components[i];
    let shouldRemove = false;

    // 條件 A：小碎片 + 靠近邊緣
    if (comp.count < mainSize * 0.05) {
      const nearEdge =
        comp.minX < edgeZoneX ||
        comp.maxX >= width - edgeZoneX ||
        comp.minY < edgeZoneY ||
        comp.maxY >= height - edgeZoneY;
      if (nearEdge) shouldRemove = true;
    }

    // 條件 B：格線殘留（極細 + 極長的垂直/水平線）
    const isThinVertical = comp.w <= 3 && comp.h >= height * 0.5;
    const isThinHorizontal = comp.h <= 3 && comp.w >= width * 0.5;
    if (isThinVertical || isThinHorizontal) shouldRemove = true;

    if (shouldRemove) {
      for (let j = 0; j < comp.pixels.length; j += 2) {
        pixels.setA(comp.pixels[j], comp.pixels[j + 1], 0);
      }
    }
  }

  return pixels;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 正規化 — bbox 裁切 + 縮放 + 置中 + padding
// ═══════════════════════════════════════════════════════════════════════════════
async function normalizeIcon(pixels, outputSize, paddingRatio) {
  const { width, height } = pixels;

  // 找 bounding box
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let hasContent = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels.getA(x, y) > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        hasContent = true;
      }
    }
  }

  if (!hasContent) {
    return sharp({
      create: { width: outputSize, height: outputSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  // Crop → Resize → Center
  const innerSize = Math.floor(outputSize * (1 - 2 * paddingRatio));
  const scale = Math.min(innerSize / cropW, innerSize / cropH);
  const newW = Math.max(1, Math.round(cropW * scale));
  const newH = Math.max(1, Math.round(cropH * scale));

  const resized = await pixels
    .toSharp()
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .resize(newW, newH, { kernel: 'nearest' })
    .png()
    .toBuffer();

  const offsetX = Math.floor((outputSize - newW) / 2);
  const offsetY = Math.floor((outputSize - newH) / 2);

  return sharp({
    create: { width: outputSize, height: outputSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: resized, left: offsetX, top: offsetY }])
    .png()
    .toBuffer();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════════════════════════
async function splitSpriteSheet(imageBuffer, options = {}) {
  const {
    grid = 4,
    outputSize = 256,
    paddingRatio = 0.12,
    bgThreshold = 240,
    brightThresh = 220,
    varThresh = 15,
    names = null,
  } = options;

  const img = sharp(imageBuffer).ensureAlpha();
  const pixels = await sharpToPixels(img);

  // 偵測格線
  const { rowSplits, colSplits } = detectGridSplits(pixels, grid, brightThresh, varThresh);

  const results = [];
  let index = 0;

  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const left = colSplits[col];
      const top = rowSplits[row];
      const right = colSplits[col + 1];
      const bottom = rowSplits[row + 1];
      const cellW = right - left;
      const cellH = bottom - top;

      if (cellW <= 0 || cellH <= 0) {
        index++;
        continue;
      }

      // 1) 切出 cell
      const cellBuffer = await sharp(imageBuffer)
        .ensureAlpha()
        .extract({ left, top, width: cellW, height: cellH })
        .raw()
        .toBuffer();

      let cellPixels = new PixelBuffer(cellBuffer, cellW, cellH);

      // 2) 去背（flood fill，不暴力清邊緣）
      cellPixels = removeOuterBackground(cellPixels, bgThreshold);

      // 3) 智慧移除 artifacts（取代三個獨立函式）
      cellPixels = removeArtifacts(cellPixels);

      // 4) 正規化（bbox → 縮放 → 置中）
      const pngBuffer = await normalizeIcon(cellPixels, outputSize, paddingRatio);

      const name = (names && index < names.length)
        ? names[index]
        : `icon_${String(row).padStart(2, '0')}_${String(col).padStart(2, '0')}`;

      results.push({
        index,
        name,
        row,
        col,
        cropRegion: { left, top, right, bottom },
        buffer: pngBuffer,
      });

      index++;
    }
  }

  return {
    gridInfo: { rowSplits, colSplits, grid },
    icons: results,
  };
}

module.exports = { splitSpriteSheet };
