import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSerpApi,
  normalizeSerper,
  createSerpApiProvider,
  createSerperProvider,
  providerFromEnv,
  ProviderError,
} from '../src/providers.js';

// Zkrácená odpověď SerpAPI: obsahuje reklamy, organiku i "related questions", které NESMÍ projít.
const serpApiFixture = {
  ads: [{ title: 'Reklama', link: 'https://ad.example', snippet: 'koupit' }],
  organic_results: [
    { position: 1, title: 'První', link: 'https://one.cz/', displayed_link: 'one.cz', snippet: 'Popis 1' },
    { position: 2, title: 'Druhý', link: 'https://two.cz/a', snippet: 'Popis 2' },
    { position: 3, title: 'Bez odkazu', snippet: 'vyřadit' },
  ],
  related_questions: [{ question: 'Co je to?' }],
};

const serperFixture = {
  organic: [
    { title: 'A', link: 'https://a.com/x', snippet: 'sa', position: 1 },
    { title: 'B', link: 'https://b.com/y', snippet: 'sb', position: 2 },
  ],
  peopleAlsoAsk: [{ question: 'x' }],
};

describe('normalizace', () => {
  test('SerpAPI: bere pouze organické výsledky, přečísluje pozice, vyřadí položky bez URL', () => {
    const out = normalizeSerpApi(serpApiFixture);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], { position: 1, title: 'První', url: 'https://one.cz/', displayedUrl: 'one.cz', snippet: 'Popis 1' });
    assert.equal(out[1].displayedUrl, 'two.cz'); // doplněno z URL
    assert.ok(out.every((r) => !r.url.includes('ad.example')));
  });

  test('Serper: bere pouze pole organic', () => {
    const out = normalizeSerper(serperFixture);
    assert.deepEqual(out.map((r) => r.url), ['https://a.com/x', 'https://b.com/y']);
    assert.equal(out[0].displayedUrl, 'a.com');
  });

  test('omezí výsledek na 10 položek (1. strana)', () => {
    const many = { organic_results: Array.from({ length: 25 }, (_, i) => ({ title: `t${i}`, link: `https://x.cz/${i}` })) };
    assert.equal(normalizeSerpApi(many).length, 10);
  });

  test('odolá prázdné / nevalidní odpovědi', () => {
    assert.deepEqual(normalizeSerpApi({}), []);
    assert.deepEqual(normalizeSerpApi(null), []);
    assert.deepEqual(normalizeSerper({ organic: 'nope' }), []);
  });
});

describe('providery (s mock fetch)', () => {
  test('SerpAPI posílá správné parametry a vrací normalizované výsledky', async () => {
    let calledUrl;
    const fakeFetch = async (url) => {
      calledUrl = new URL(url);
      return { ok: true, json: async () => serpApiFixture };
    };
    const p = createSerpApiProvider({ apiKey: 'K', gl: 'cz', hl: 'cs', googleDomain: 'google.cz' }, fakeFetch);
    const out = await p.search('kávovar');
    assert.equal(out.length, 2);
    assert.equal(calledUrl.searchParams.get('q'), 'kávovar');
    assert.equal(calledUrl.searchParams.get('gl'), 'cz');
    assert.equal(calledUrl.searchParams.get('num'), '10');
    assert.equal(calledUrl.searchParams.get('api_key'), 'K');
  });

  test('SerpAPI: "žádné výsledky" vrátí prázdné pole, jiná chyba vyhodí ProviderError', async () => {
    const empty = createSerpApiProvider({ apiKey: 'K' }, async () => ({
      ok: true,
      json: async () => ({ error: "Google hasn't returned any results for this query." }),
    }));
    assert.deepEqual(await empty.search('zzz'), []);

    const bad = createSerpApiProvider({ apiKey: 'K' }, async () => ({ ok: true, json: async () => ({ error: 'Invalid API key' }) }));
    await assert.rejects(bad.search('x'), ProviderError);

    const http500 = createSerpApiProvider({ apiKey: 'K' }, async () => ({ ok: false, status: 500 }));
    await assert.rejects(http500.search('x'), /HTTP 500/);
  });

  test('Serper posílá POST s hlavičkou X-API-KEY', async () => {
    let init;
    const p = createSerperProvider({ apiKey: 'S', gl: 'cz', hl: 'cs' }, async (_url, i) => {
      init = i;
      return { ok: true, json: async () => serperFixture };
    });
    const out = await p.search('test');
    assert.equal(out.length, 2);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['X-API-KEY'], 'S');
    assert.equal(JSON.parse(init.body).q, 'test');
  });
});

describe('providerFromEnv', () => {
  test('vybírá podle klíčů; bez klíče a bez MOCK vrací null', () => {
    assert.equal(providerFromEnv({ SERPAPI_KEY: 'a' }).name, 'serpapi');
    assert.equal(providerFromEnv({ SERPER_API_KEY: 'b' }).name, 'serper');
    assert.equal(providerFromEnv({ MOCK: '1' }).name, 'mock');
    assert.equal(providerFromEnv({}), null);
  });
});
