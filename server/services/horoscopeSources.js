/**
 * Horoscope data source — scrapes daily horoscope from Elle Taiwan.
 * https://www.elle.com/tw/starsigns/today/
 */

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
// Helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Parser — extract horoscope data from Elle sign page HTML
// ---------------------------------------------------------------------------

function parseElleHoroscope(html) {
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

  // ---- Extract quick info from <li> items ----
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liRegex.exec(html)) !== null) {
    const text = liMatch[1].replace(/<[^>]+>/g, '').trim();
    if (text.startsWith('今日短評：')) result.summary = text.replace('今日短評：', '').trim();
    else if (text.startsWith('幸運數字：')) result.luckyNumber = text.replace('幸運數字：', '').trim();
    else if (text.startsWith('幸運顏色：')) result.luckyColor = text.replace('幸運顏色：', '').trim();
    else if (text.startsWith('開運方位：')) result.luckyDirection = text.replace('開運方位：', '').trim();
    else if (text.startsWith('今日吉時：')) result.luckyTime = text.replace('今日吉時：', '').trim();
    else if (text.startsWith('幸運星座：')) result.luckySign = text.replace('幸運星座：', '').trim();
  }

  // ---- Extract sections: 整體運勢, 愛情運勢, 事業運勢, 財運運勢 ----
  const sectionMap = [
    { key: 'overall', label: '整體運勢' },
    { key: 'love',    label: '愛情運勢' },
    { key: 'career',  label: '事業運勢' },
    { key: 'money',   label: '財運運勢' },
  ];

  const bodyStart = html.indexOf('article-body-content');
  if (bodyStart === -1) return result;
  const body = html.substring(bodyStart);

  for (let i = 0; i < sectionMap.length; i++) {
    const { key, label } = sectionMap[i];
    const sIdx = body.indexOf(label);
    if (sIdx === -1) continue;

    // Determine section boundary
    const nextLabel = i < sectionMap.length - 1 ? sectionMap[i + 1].label : null;
    const eIdx = nextLabel ? body.indexOf(nextLabel, sIdx) : body.length;
    const section = body.substring(sIdx, eIdx);

    // Count star-fill icons for rating
    const starFills = (section.match(/star-fill/g) || []).length;
    result[key].rating = Math.min(starFills, 5);

    // Extract text from <p data-journey-content="true">
    const pMatches = [...section.matchAll(/<p[^>]*data-journey-content="true"[^>]*>([\s\S]*?)<\/p>/gi)];
    const texts = pMatches
      .map(m => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(t => t && !t.startsWith('延伸閱讀'));
    let text = texts.join(' ');
    // Strip ELLE promo text that sometimes leaks in
    text = text.replace(/\s*追蹤 ELLE[\s\S]*$/, '').trim();
    result[key].text = text;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main fetch function — scrape all 12 signs
// ---------------------------------------------------------------------------

async function fetchAllHoroscopes() {
  const results = [];

  // Fetch in batches of 4 to avoid overwhelming the server
  for (let i = 0; i < SIGNS.length; i += 4) {
    const batch = SIGNS.slice(i, i + 4);
    const batchResults = await Promise.all(
      batch.map(async (sign) => {
        try {
          const url = `${BASE_URL}${sign.path}`;
          const res = await fetchWithTimeout(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            }
          });

          if (!res.ok) {
            console.error(`[horoscope] ${sign.id}: HTTP ${res.status}`);
            return null;
          }

          const html = await res.text();
          const data = parseElleHoroscope(html);

          return {
            signId: sign.id,
            name: sign.name,
            nameEN: sign.nameEN,
            emoji: sign.emoji,
            dateRange: sign.dateRange,
            ...data,
          };
        } catch (err) {
          console.error(`[horoscope] ${sign.id}: fetch error:`, err.message);
          return null;
        }
      })
    );
    results.push(...batchResults);
  }

  return results.filter(Boolean);
}

module.exports = { fetchAllHoroscopes, SIGNS };
