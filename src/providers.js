// Získání organických výsledků Google přes SERP API.
// Google scraping napřímo je v rozporu s jeho podmínkami a bez proxy rychle skončí CAPTCHA,
// proto používáme licencované SERP API (SerpAPI nebo Serper.dev). Vrací se pouze organické výsledky.

const MAX_RESULTS = 10; // 1. strana

function str(v) {
  return typeof v === 'string' ? v : '';
}

function finalize(items) {
  return items
    .filter((i) => i.url)
    .slice(0, MAX_RESULTS)
    .map((i, idx) => ({ ...i, position: idx + 1 }));
}

/** SerpAPI: odpověď má pole organic_results (reklamy jsou v ads, ostatní bloky jinde). */
export function normalizeSerpApi(data) {
  const organic = Array.isArray(data?.organic_results) ? data.organic_results : [];
  return finalize(
    organic.map((r) => ({
      title: str(r.title),
      url: str(r.link),
      displayedUrl: str(r.displayed_link) || safeHost(r.link),
      snippet: str(r.snippet),
    })),
  );
}

/** Serper.dev: odpověď má pole organic. */
export function normalizeSerper(data) {
  const organic = Array.isArray(data?.organic) ? data.organic : [];
  return finalize(
    organic.map((r) => ({
      title: str(r.title),
      url: str(r.link),
      displayedUrl: safeHost(r.link),
      snippet: str(r.snippet),
    })),
  );
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export class ProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

export function createSerpApiProvider({ apiKey, gl, hl, googleDomain }, fetchImpl = fetch) {
  return {
    name: 'serpapi',
    async search(query) {
      const url = new URL('https://serpapi.com/search.json');
      url.search = new URLSearchParams({
        engine: 'google',
        q: query,
        api_key: apiKey,
        gl,
        hl,
        google_domain: googleDomain,
        num: String(MAX_RESULTS),
      }).toString();
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new ProviderError(`SerpAPI vrátilo HTTP ${res.status}`);
      const data = await res.json();
      if (data.error && !data.organic_results) {
        // "Google hasn't returned any results for this query." není chyba, jen prázdný výsledek
        if (/hasn't returned any results/i.test(data.error)) return [];
        throw new ProviderError(`SerpAPI: ${data.error}`);
      }
      return normalizeSerpApi(data);
    },
  };
}

export function createSerperProvider({ apiKey, gl, hl }, fetchImpl = fetch) {
  return {
    name: 'serper',
    async search(query) {
      const res = await fetchImpl('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, gl, hl, num: MAX_RESULTS }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new ProviderError(`Serper vrátil HTTP ${res.status}`);
      return normalizeSerper(await res.json());
    },
  };
}

/** Demo režim bez klíče: deterministická, jasně označená data (NIKDY ne jako skutečné výsledky Google). */
export function createMockProvider() {
  return {
    name: 'mock',
    async search(query) {
      return Array.from({ length: MAX_RESULTS }, (_, i) => ({
        position: i + 1,
        title: `[DEMO] Výsledek ${i + 1} pro „${query}“`,
        url: `https://example.com/${encodeURIComponent(query)}/${i + 1}`,
        displayedUrl: `example.com › ${i + 1}`,
        snippet: `Ukázkový popisek č. ${i + 1}. Jde o demo data, ne o skutečné výsledky Google.`,
      }));
    },
  };
}

/** Výběr provideru podle proměnných prostředí. */
export function providerFromEnv(env = process.env, fetchImpl = fetch) {
  const gl = env.GOOGLE_GL || 'cz';
  const hl = env.GOOGLE_HL || 'cs';
  const googleDomain = env.GOOGLE_DOMAIN || 'google.cz';
  if (env.SERPAPI_KEY) return createSerpApiProvider({ apiKey: env.SERPAPI_KEY, gl, hl, googleDomain }, fetchImpl);
  if (env.SERPER_API_KEY) return createSerperProvider({ apiKey: env.SERPER_API_KEY, gl, hl }, fetchImpl);
  if (env.MOCK === '1') return createMockProvider();
  return null;
}
