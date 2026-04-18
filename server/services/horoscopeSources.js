/**
 * Horoscope data source — scrapes daily horoscope from Elle Taiwan via Playwright.
 * https://www.elle.com/tw/starsigns/today/
 */

const { chromium } = require('playwright');

// ---------------------------------------------------------------------------
// Sign definitions & URL mapping
// ---------------------------------------------------------------------------

const SIGNS = [
  { id: 'aries',       name: '牡羊座', nameEN: 'Aries',       emoji: '♈', dateRange: '3/21-4/19',  path: '/tw/starsigns/today/a33789900/aries-today/' },
  { id: 'taurus',      name: '金牛座', nameEN: 'Taurus',      emoji: '♉', dateRange: '4/20-5/20',  path: '/tw/starsigns/today/a21025258/taurus-today/' },
  { id: 'gemini',      name: '雙子座', nameEN: 'Gemini',      emoji: '♊', dateRange: '5/21-6/21',  path: '/tw/starsigns/today/a21025248/gemini-today/' },
  { id: 'cancer',      name: '巨蟹座', nameEN: 'Cancer',      emoji: '♋', dateRange: '6/22-7/22',  path: '/tw/starsigns/today/a21610231/cancer-today/' },
  { id: 'leo',         name: '獅子座', nameEN: 'Leo',         emoji: '♌', dateRange: '7/23-8/22',  path: '/tw/starsigns/today/a21549505/leo-today/' },
  { id: 'virgo',       name: '處女座', nameEN: 'Virgo',       emoji: '♍', dateRange: '8/23-9/22',  path: '/tw/starsigns/today/a21535128/virgo-today/' },
  { id: 'libra',       name: '天秤座', nameEN: 'Libra',       emoji: '♎', dateRange: '9/23-10/23', path: '/tw/starsigns/today/a21533471/libra-today/' },
  { id: 'scorpio',     name: '天蠍座', nameEN: 'Scorpio',     emoji: '♏', dateRange: '10/24-11/22',path: '/tw/starsigns/today/a21452009/scorpio-today/' },
  { id: 'sagittarius', name: '射手座', nameEN: 'Sagittarius', emoji: '♐', dateRange: '11/23-12/21',path: '/tw/starsigns/today/a21346791/sagittarius-today/' },
  { id: 'capricorn',   name: '摩羯座', nameEN: 'Capricorn',   emoji: '♑', dateRange: '12/22-1/19', path: '/tw/starsigns/today/a21282264/capricorn-today/' },
  { id: 'aquarius',    name: '水瓶座', nameEN: 'Aquarius',    emoji: '♒', dateRange: '1/20-2/18',  path: '/tw/starsigns/today/a21265913/aquarius-today/' },
  { id: 'pisces',      name: '雙魚座', nameEN: 'Pisces',      emoji: '♓', dateRange: '2/19-3/20',  path: '/tw/starsigns/today/a21078224/pisces-today/' },
];

const BASE_URL = 'https://www.elle.com';

// ---------------------------------------------------------------------------
// Scrape a single sign page via Playwright
// ---------------------------------------------------------------------------

async function scrapeSingleSign(page, sign) {
  const url = `${BASE_URL}${sign.path}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Wait for article body to appear
  await page.waitForSelector('.article-body-content', { timeout: 10000 });

  const data = await page.evaluate(() => {
    const result = {
      summary: '',
      luckyNumber: '',
      luckyColor: '',
      luckyDirection: '',
      luckyTime: '',
      luckySign: '',
      overall: { rating: 0, text: '' },
      love: { rating: 0, text: '' },
      career: { rating: 0, text: '' },
      money: { rating: 0, text: '' },
    };

    // ---- Quick info from <li> ----
    const lis = document.querySelectorAll('.article-body-content li');
    for (const li of lis) {
      const t = li.textContent.trim();
      if (t.startsWith('今日短評：')) result.summary = t.replace('今日短評：', '').trim();
      else if (t.startsWith('幸運數字：')) result.luckyNumber = t.replace('幸運數字：', '').trim();
      else if (t.startsWith('幸運顏色：')) result.luckyColor = t.replace('幸運顏色：', '').trim();
      else if (t.startsWith('開運方位：')) result.luckyDirection = t.replace('開運方位：', '').trim();
      else if (t.startsWith('今日吉時：')) result.luckyTime = t.replace('今日吉時：', '').trim();
      else if (t.startsWith('幸運星座：')) result.luckySign = t.replace('幸運星座：', '').trim();
    }

    // ---- Sections: 整體運勢, 愛情運勢, 事業運勢, 財運運勢 ----
    const sectionMap = [
      { key: 'overall', label: '整體運勢' },
      { key: 'love',    label: '愛情運勢' },
      { key: 'career',  label: '事業運勢' },
      { key: 'money',   label: '財運運勢' },
    ];

    const h2s = document.querySelectorAll('.article-body-content h2');
    for (const { key, label } of sectionMap) {
      // Find the matching h2
      const h2 = [...h2s].find(el => el.textContent.trim() === label);
      if (!h2) continue;

      // Walk siblings after h2 to collect rating + text
      let el = h2.nextElementSibling;
      let rating = 0;
      let texts = [];

      while (el) {
        // Stop at next h2
        if (el.tagName === 'H2') break;

        // Rating: count star-fill images
        const stars = el.querySelectorAll('img[src*="star-fill"]');
        if (stars.length > 0) rating = stars.length;

        // Text: grab <p> content
        if (el.tagName === 'P') {
          const t = el.textContent.trim();
          if (t && !t.startsWith('延伸閱讀') && !t.includes('追蹤 ELLE')) {
            texts.push(t);
          }
        }

        el = el.nextElementSibling;
      }

      result[key].rating = Math.min(rating, 5);
      result[key].text = texts.join(' ');
    }

    return result;
  });

  return {
    signId: sign.id,
    name: sign.name,
    nameEN: sign.nameEN,
    emoji: sign.emoji,
    dateRange: sign.dateRange,
    ...data,
  };
}

// ---------------------------------------------------------------------------
// Main — scrape all 12 signs, reusing one browser instance
// ---------------------------------------------------------------------------

async function fetchAllHoroscopes() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'zh-TW',
    });
    const page = await context.newPage();

    const results = [];
    for (const sign of SIGNS) {
      try {
        const data = await scrapeSingleSign(page, sign);
        results.push(data);
        console.log(`[horoscope] ${sign.emoji} ${sign.name}: ★${data.overall.rating} — ${data.summary.substring(0, 20)}`);
      } catch (err) {
        console.error(`[horoscope] ${sign.id}: scrape error:`, err.message);
      }
    }

    await browser.close();
    return results;
  } catch (err) {
    console.error('[horoscope] Browser launch error:', err.message);
    if (browser) await browser.close().catch(() => {});
    return [];
  }
}

module.exports = { fetchAllHoroscopes, SIGNS };
