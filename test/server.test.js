import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { validateQuery, MAX_QUERY_LENGTH } from '../src/validate.js';

const fakeResults = [
  { position: 1, title: 'První', url: 'https://one.cz/', displayedUrl: 'one.cz', snippet: 'Popis' },
  { position: 2, title: 'Druhý', url: 'https://two.cz/', displayedUrl: 'two.cz', snippet: 'Další, s čárkou' },
];

function start(app) {
  return new Promise((resolve) => app.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${app.address().port}`)));
}

describe('validateQuery', () => {
  test('ořízne a sjednotí mezery, odmítne prázdné a příliš dlouhé', () => {
    assert.deepEqual(validateQuery('  kávovar \n  levně '), { ok: true, query: 'kávovar levně' });
    assert.equal(validateQuery('   ').ok, false);
    assert.equal(validateQuery(undefined).ok, false);
    assert.equal(validateQuery('x'.repeat(MAX_QUERY_LENGTH + 1)).ok, false);
  });
});

describe('HTTP API', () => {
  let app, base, calls;
  before(async () => {
    calls = 0;
    const provider = { name: 'fake', search: async () => { calls++; return fakeResults; } };
    app = createApp({ provider, rateLimit: { limit: 1000, windowMs: 60_000 } });
    base = await start(app);
  });
  after(() => {
    app.closeAllConnections();
    app.close();
  });

  test('GET /api/search vrátí strukturovaný výstup s výsledky', async () => {
    const res = await fetch(`${base}/api/search?q=${encodeURIComponent('kávovar')}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.query, 'kávovar');
    assert.equal(body.count, 2);
    assert.deepEqual(body.results, fakeResults);
    assert.equal(body.demo, false);
  });

  test('stejný dotaz podruhé jde z cache (neplýtvá kredity)', async () => {
    const before = calls;
    const res = await fetch(`${base}/api/search?q=${encodeURIComponent('KÁVOVAR')}`);
    const body = await res.json();
    assert.equal(body.cached, true);
    assert.equal(calls, before);
  });

  test('prázdný dotaz vrátí 400', async () => {
    const res = await fetch(`${base}/api/search?q=`);
    assert.equal(res.status, 400);
  });

  test('POST /api/export: CSV má správné hlavičky a obsah', async () => {
    const res = await fetch(`${base}/api/export`, {
      method: 'POST',
      body: JSON.stringify({ format: 'csv', query: 'kávovar', results: fakeResults }),
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), /filename="serp-kavovar\.csv"/);
    const text = await res.text();
    assert.ok(text.includes('"Další, s čárkou"'));
  });

  test('POST /api/export: JSON jde znovu načíst a odpovídá vstupu', async () => {
    const res = await fetch(`${base}/api/export`, {
      method: 'POST',
      body: JSON.stringify({ format: 'json', query: 'x', results: fakeResults }),
    });
    const parsed = JSON.parse(await res.text());
    assert.deepEqual(parsed.results, fakeResults);
  });

  test('POST /api/export: neznámý formát a rozbitý JSON vrátí 400', async () => {
    const a = await fetch(`${base}/api/export`, { method: 'POST', body: JSON.stringify({ format: 'exe', query: 'x', results: [] }) });
    assert.equal(a.status, 400);
    const b = await fetch(`${base}/api/export`, { method: 'POST', body: '{nope' });
    assert.equal(b.status, 400);
  });

  test('GET / servíruje HTML s jedním vyhledávacím inputem', async () => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.equal((html.match(/<input\b/g) || []).length, 1);
  });

  test('neznámá cesta vrátí 404', async () => {
    assert.equal((await fetch(`${base}/nic`)).status, 404);
  });
});

describe('chybové stavy', () => {
  // t.after zajistí zavření serveru i při selhání asserce (jinak by test runner nikdy neskončil)
  async function startFor(t, opts) {
    const app = createApp(opts);
    t.after(() => {
      app.closeAllConnections();
      app.close();
    });
    return start(app);
  }

  test('bez provideru vrátí 503 s popisem', async (t) => {
    const base = await startFor(t, { provider: null });
    const res = await fetch(`${base}/api/search?q=test`);
    assert.equal(res.status, 503);
  });

  test('chyba provideru vrátí 502 a neprozradí vnitřní detaily', async (t) => {
    const base = await startFor(t, { provider: { name: 'x', search: async () => { throw new Error('boom-secret'); } } });
    const res = await fetch(`${base}/api/search?q=test`);
    assert.equal(res.status, 502);
    const text = await res.text();
    assert.ok(!text.includes('boom-secret'));
    assert.ok(!/\n\s+at /.test(text));
  });

  test('rate limit vrátí 429 po překročení limitu', async (t) => {
    const base = await startFor(t, {
      provider: { name: 'x', search: async () => fakeResults },
      rateLimit: { limit: 2, windowMs: 60_000 },
      cacheTtlMs: 0,
    });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await fetch(`${base}/api/search?q=a${i}`)).status);
    assert.deepEqual(statuses, [200, 200, 429]);
  });
});
