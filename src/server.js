import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { providerFromEnv, ProviderError } from './providers.js';
import { validateQuery } from './validate.js';
import { FORMATS, serialize, filenameFor } from './formatters.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MAX_BODY = 512 * 1024;

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Příliš velký požadavek.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Jednoduchý limiter na IP (okno v ms), chrání kredity SERP API před zneužitím. */
function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  return (key) => {
    const t = now();
    const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (arr.length >= limit) {
      hits.set(key, arr);
      return false;
    }
    arr.push(t);
    hits.set(key, arr);
    return true;
  };
}

/** Malá TTL cache, ať stejný dotaz opakovaně nespotřebovává kredity. */
function createCache(ttlMs, now = () => Date.now()) {
  const map = new Map();
  return {
    get(k) {
      const e = map.get(k);
      if (!e) return undefined;
      if (now() - e.t > ttlMs) {
        map.delete(k);
        return undefined;
      }
      return e.v;
    },
    set(k, v) {
      if (map.size > 500) map.delete(map.keys().next().value);
      map.set(k, { v, t: now() });
    },
  };
}

export function createApp({ provider, rateLimit = { limit: 20, windowMs: 60_000 }, cacheTtlMs = 10 * 60_000 } = {}) {
  const allow = createRateLimiter(rateLimit);
  const cache = createCache(cacheTtlMs);

  async function handleSearch(req, res, url) {
    const v = validateQuery(url.searchParams.get('q'));
    if (!v.ok) return sendJson(res, 400, { error: v.error });
    if (!provider) {
      return sendJson(res, 503, {
        error: 'Server nemá nastavený klíč SERP API (SERPAPI_KEY nebo SERPER_API_KEY). Viz README.',
      });
    }
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    if (!allow(ip)) return sendJson(res, 429, { error: 'Příliš mnoho požadavků, zkuste to za chvíli.' });

    const key = v.query.toLowerCase();
    let results = cache.get(key);
    let cached = true;
    if (!results) {
      cached = false;
      try {
        results = await provider.search(v.query);
      } catch (err) {
        const status = err instanceof ProviderError ? err.status : 502;
        console.error('Chyba provideru:', err.message);
        // Do odpovědi dáváme jen naše vlastní ProviderError zprávy, ne vnitřnosti jiných chyb.
        const detail = err instanceof ProviderError ? ` (${err.message})` : '';
        return sendJson(res, status, { error: `Nepodařilo se získat výsledky z Google.${detail}` });
      }
      cache.set(key, results);
    }
    sendJson(res, 200, {
      query: v.query,
      provider: provider.name,
      demo: provider.name === 'mock',
      cached,
      fetchedAt: new Date().toISOString(),
      count: results.length,
      results,
    });
  }

  async function handleExport(req, res) {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (err) {
      return sendJson(res, err.status || 400, { error: err.status === 413 ? err.message : 'Neplatný JSON.' });
    }
    const { format, query, results } = payload || {};
    if (!FORMATS[format]) return sendJson(res, 400, { error: 'Neznámý formát (json | csv | xml).' });
    if (typeof query !== 'string' || !Array.isArray(results) || results.length > 100) {
      return sendJson(res, 400, { error: 'Neplatná data k exportu.' });
    }
    const clean = results.map((r, i) => ({
      position: Number.isFinite(r?.position) ? r.position : i + 1,
      title: String(r?.title ?? ''),
      url: String(r?.url ?? ''),
      displayedUrl: String(r?.displayedUrl ?? ''),
      snippet: String(r?.snippet ?? ''),
    }));
    send(res, 200, serialize(format, query, clean), {
      'Content-Type': FORMATS[format].mime,
      'Content-Disposition': `attachment; filename="${filenameFor(query, format)}"`,
    });
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/search') return await handleSearch(req, res, url);
      if (req.method === 'POST' && url.pathname === '/api/export') return await handleExport(req, res);
      if (req.method === 'GET' && url.pathname === '/healthz') return sendJson(res, 200, { ok: true });
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const html = await readFile(path.join(PUBLIC_DIR, 'index.html'));
        return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' });
      }
      sendJson(res, 404, { error: 'Nenalezeno.' });
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: 'Interní chyba serveru.' });
    }
  });
}

// Spuštění jen při přímém běhu (ne při importu v testech).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const provider = providerFromEnv();
  if (!provider) {
    console.warn('⚠️  Není nastaven SERPAPI_KEY ani SERPER_API_KEY (ani MOCK=1). /api/search vrátí 503.');
  } else {
    console.log(`Provider: ${provider.name}`);
  }
  const port = Number(process.env.PORT) || 3000;
  createApp({ provider }).listen(port, '0.0.0.0', () => console.log(`Běží na http://localhost:${port}`));
}
