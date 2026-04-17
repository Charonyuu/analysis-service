/**
 * Cloudflare Worker — PTT Proxy
 *
 * 用法：POST https://ptt-proxy.<your-domain>.workers.dev/
 * Body: { "url": "https://www.ptt.cc/bbs/Gossiping/index.html" }
 * Header: X-Proxy-Secret: <PROXY_SECRET>
 *
 * 回傳 PTT 的 HTML（text/html）。
 */

export default {
  async fetch(request, env) {
    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Verify secret
    const secret = request.headers.get('X-Proxy-Secret');
    if (secret !== env.PROXY_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Parse request
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const { url } = body;
    if (!url || !url.startsWith('https://www.ptt.cc/')) {
      return new Response('Invalid URL — only ptt.cc allowed', { status: 400 });
    }

    // Fetch PTT
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Cookie': 'over18=1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      const html = await res.text();

      return new Response(html, {
        status: res.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-PTT-Status': String(res.status),
        },
      });
    } catch (err) {
      return new Response(`Fetch error: ${err.message}`, { status: 502 });
    }
  },
};
