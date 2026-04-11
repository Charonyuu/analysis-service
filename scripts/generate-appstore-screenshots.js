const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// ═══════════════════════════════════════════════════════
//  App Store Screenshot Generator
//  Output: 1284 x 2778 (iPhone 6.5" display)
// ═══════════════════════════════════════════════════════

const OUTPUT_WIDTH = 1284;
const OUTPUT_HEIGHT = 2778;

const TITLE_COLOR = '#333333';
const SUBTITLE_COLOR = '#666666';

// iPhone mockup 原始尺寸 & 座標
const MOCKUP = {
  originalWidth: 369,
  originalHeight: 750,
  // 螢幕透明區域
  screen: { left: 20, top: 57, right: 347, bottom: 731 },
  // 截圖從更上面開始，確保沒有細線
  innerTop: 14,
};

// ═══════════════════════════════════════════════════════
//  📝 截圖設定
// ═══════════════════════════════════════════════════════
const BG_COLORS = ['#f6c28b', '#f4ead3', '#caf5f7', '#dff5e3', '#eaeaf2'];

const SCREENS = [
  {
    screenshot: 'IMG_0055.png',
    zh: '整理你的相簿，從此不再混亂',
    en: 'Organize Your Gallery, Effortlessly',
  },
  {
    screenshot: 'IMG_0057.png',
    zh: '不需要的，輕輕滑掉',
    en: 'Swipe Away What You Don\'t Need',
  },
  {
    screenshot: 'IMG_0058.png',
    zh: '值得留下的，好好保留',
    en: 'Keep What Truly Matters',
  },
  {
    screenshot: 'IMG_0061.png',
    zh: '自動分類，照片一目了然',
    en: 'Smart Sorting, Instantly Clear',
  },
  {
    screenshot: 'IMG_0063.png',
    zh: '相似照片，一次整理',
    en: 'Clean Similar Photos in One Go',
  },
];

// ═══════════════════════════════════════════════════════
//  Layout
// ═══════════════════════════════════════════════════════
const LAYOUT = {
  phone: {
    scale: 3.0,
    centerX: 0.5,
    topY: null, // 自動計算，上下 padding 10%
  },
  title: {
    fontSize: 88,
    fontWeight: 'bold',
    y: 200,
  },
};

// ═══════════════════════════════════════════════════════

async function generateScreenshot(config, lang, index, mockupPath, screenshotDir, outputDir) {
  const { screenshot } = config;
  const title = config[lang];
  const bgColor = BG_COLORS[index];

  const screenshotPath = path.join(screenshotDir, screenshot);
  if (!fs.existsSync(screenshotPath)) {
    console.log(`  ⚠️  跳過：找不到 ${screenshot}`);
    return;
  }

  const phoneW = Math.round(MOCKUP.originalWidth * LAYOUT.phone.scale);
  const phoneH = Math.round(MOCKUP.originalHeight * LAYOUT.phone.scale);
  const phoneX = Math.round(OUTPUT_WIDTH * LAYOUT.phone.centerX - phoneW / 2);
  // 上下 padding 10%，手機底部貼齊下 padding
  const bottomPadding = Math.round(OUTPUT_HEIGHT * 0.05);
  const phoneY = OUTPUT_HEIGHT - bottomPadding - phoneH;

  // 截圖區域：從 innerTop 開始（動態島上緣），這樣截圖會延伸到動態島後面
  const scrLeft = MOCKUP.screen.left;
  const scrRight = MOCKUP.screen.right;
  const scrTop = MOCKUP.innerTop;  // 從動態島上方開始
  const scrBottom = MOCKUP.screen.bottom;

  const screenX = phoneX + Math.round(scrLeft * LAYOUT.phone.scale);
  const screenY = phoneY + Math.round(scrTop * LAYOUT.phone.scale);
  const screenW = Math.round((scrRight - scrLeft + 1) * LAYOUT.phone.scale);
  const screenH = Math.round((scrBottom - scrTop + 1) * LAYOUT.phone.scale);

  // 截圖 resize + 圓角
  const cornerRadius = Math.round(18 * LAYOUT.phone.scale);
  const resizedScreenshot = await sharp(screenshotPath)
    .resize(screenW, screenH, { fit: 'cover' })
    .toBuffer();

  const roundedMask = Buffer.from(`
    <svg width="${screenW}" height="${screenH}">
      <rect x="0" y="0" width="${screenW}" height="${screenH}"
            rx="${cornerRadius}" ry="${cornerRadius}" fill="white"/>
    </svg>
  `);

  const roundedScreenshot = await sharp(resizedScreenshot)
    .composite([{ input: roundedMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // 手機 mockup 放大
  const resizedPhone = await sharp(mockupPath)
    .resize(phoneW, phoneH, { fit: 'contain' })
    .png()
    .toBuffer();

  // 標題 SVG
  const fontFamily = lang === 'zh'
    ? "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    : "'SF Pro Display', 'Helvetica Neue', Arial, sans-serif";

  // 標題放在手機上方空間的偏下位置（靠近手機）
  // 根據文字長度自動縮小字體，確保不超出畫面
  const baseFontSize = LAYOUT.title.fontSize;
  const maxTextWidth = OUTPUT_WIDTH - 120; // 左右留 60px padding
  const charWidth = lang === 'zh' ? baseFontSize : baseFontSize * 0.55;
  const textWidth = title.length * charWidth;
  const fontSize = textWidth > maxTextWidth
    ? Math.round(baseFontSize * (maxTextWidth / textWidth))
    : baseFontSize;

  // 標題垂直置中在手機上方空間
  const titleY = Math.round(phoneY / 2) + Math.round(fontSize / 3);

  const titleSVG = Buffer.from(`
    <svg width="${OUTPUT_WIDTH}" height="${phoneY}">
      <style>
        .title {
          fill: ${TITLE_COLOR};
          font-size: ${fontSize}px;
          font-weight: ${LAYOUT.title.fontWeight};
          font-family: ${fontFamily};
        }
      </style>
      <text x="50%" y="${titleY}" text-anchor="middle" class="title">
        ${escapeXml(title)}
      </text>
    </svg>
  `);

  // 手機陰影（柔和擴散）
  const shadowPad = 80;
  const shadowW = phoneW + shadowPad * 2;
  const shadowH = phoneH + shadowPad * 2;
  const shadowSVG = Buffer.from(`
    <svg width="${shadowW}" height="${shadowH}">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="35"/>
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0"/>
        </filter>
      </defs>
      <rect x="${shadowPad}" y="${shadowPad}" width="${phoneW}" height="${phoneH}"
            rx="55" ry="55" fill="black" filter="url(#shadow)"/>
    </svg>
  `);
  const shadowBuf = await sharp(Buffer.from(shadowSVG))
    .resize(shadowW, shadowH)
    .png()
    .toBuffer();

  // 背景微漸層（上方稍亮，下方原色）
  const { r, g, b } = hexToRgba(bgColor);
  const lighterR = Math.min(255, r + 20);
  const lighterG = Math.min(255, g + 20);
  const lighterB = Math.min(255, b + 20);
  const gradientSVG = Buffer.from(`
    <svg width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgb(${lighterR},${lighterG},${lighterB})"/>
          <stop offset="100%" stop-color="rgb(${r},${g},${b})"/>
        </linearGradient>
      </defs>
      <rect width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}" fill="url(#bg)"/>
    </svg>
  `);
  const gradientBuf = await sharp(Buffer.from(gradientSVG))
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT)
    .png()
    .toBuffer();

  // 合成順序：漸層背景 → 陰影 → 截圖 → 手機框 → 標題
  const filename = `${lang}_${index + 1}.png`;
  await sharp(gradientBuf)
    .composite([
      { input: shadowBuf, top: phoneY - shadowPad, left: phoneX - shadowPad },
      { input: roundedScreenshot, top: screenY, left: screenX },
      { input: resizedPhone, top: phoneY, left: phoneX },
      { input: titleSVG, top: 0, left: 0 },
    ])
    .png()
    .toFile(path.join(outputDir, filename));

  console.log(`  ✅ ${filename}`);
}

function hexToRgba(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
    alpha: 1,
  };
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function main() {
  const mockupPath = path.resolve(__dirname, '..', 'docs', 'apple-iphone-16-2024-medium.png');
  const screenshotDir = path.resolve(__dirname, '..', 'screenshot');
  const outputDir = path.resolve(__dirname, '..', 'docs', 'output', 'appstore');

  fs.mkdirSync(outputDir, { recursive: true });

  console.log('');
  console.log('📱 App Store Screenshot Generator');
  console.log(`   輸出尺寸：${OUTPUT_WIDTH} x ${OUTPUT_HEIGHT}`);
  console.log('═══════════════════════════════════════');

  for (const lang of ['zh', 'en']) {
    console.log('');
    console.log(lang === 'zh' ? '🇹🇼 中文版' : '🇺🇸 English');
    console.log('───────────────────────────────────────');

    for (let i = 0; i < SCREENS.length; i++) {
      await generateScreenshot(SCREENS[i], lang, i, mockupPath, screenshotDir, outputDir);
    }
  }

  console.log('');
  console.log(`📁 完成！共 ${SCREENS.length * 2} 張`);
  console.log(`   ${outputDir}/`);
  console.log('');
}

main().catch(console.error);
