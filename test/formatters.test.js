import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toJSON, toCSV, toXML, escapeXml, filenameFor, serialize, FIELDS } from '../src/formatters.js';

const NOW = new Date('2026-10-16T10:00:00.000Z');
const sample = [
  { position: 1, title: 'Kávovar „Pro“, 2026', url: 'https://a.cz/x?y=1&z=2', displayedUrl: 'a.cz › x', snippet: 'Řádek 1\nŘádek 2 s "uvozovkami"' },
  { position: 2, title: '=HYPERLINK("http://evil")', url: 'https://b.cz', displayedUrl: 'b.cz', snippet: '' },
];

describe('toJSON', () => {
  test('obsahuje dotaz, čas, počet a výsledky a je validní JSON', () => {
    const parsed = JSON.parse(toJSON('kávovar', sample, NOW));
    assert.equal(parsed.query, 'kávovar');
    assert.equal(parsed.fetchedAt, '2026-10-16T10:00:00.000Z');
    assert.equal(parsed.count, 2);
    assert.deepEqual(parsed.results, sample);
  });
});

describe('toCSV', () => {
  test('začíná BOM a hlavičkou se správnými sloupci', () => {
    const csv = toCSV(sample);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.equal(csv.slice(1).split('\r\n')[0], FIELDS.join(','));
  });

  test('správně escapuje čárky, uvozovky a zalomení řádků (RFC 4180)', () => {
    const csv = toCSV(sample);
    assert.ok(csv.includes('"Kávovar „Pro“, 2026"'));
    assert.ok(csv.includes('"Řádek 1\nŘádek 2 s ""uvozovkami"""'));
  });

  test('neutralizuje buňky začínající vzorcem (CSV injection)', () => {
    const csv = toCSV(sample);
    assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`));
    assert.ok(!/,=HYPERLINK/.test(csv));
  });

  test('prázdný seznam vrátí jen hlavičku', () => {
    assert.equal(toCSV([]), '﻿' + FIELDS.join(',') + '\r\n');
  });
});

describe('toXML', () => {
  test('escapuje speciální znaky a nese atributy kořene', () => {
    const xml = toXML('a & b', sample, NOW);
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
    assert.ok(xml.includes('query="a &amp; b"'));
    assert.ok(xml.includes('count="2"'));
    assert.ok(xml.includes('<url>https://a.cz/x?y=1&amp;z=2</url>'));
  });

  test('escapeXml odstraní řídicí znaky a zachová českou diakritiku', () => {
    assert.equal(escapeXml('ž\u0001š<>'), 'žš&lt;&gt;');
  });
});

describe('serialize a filenameFor', () => {
  test('serialize vybere správný formát a odmítne neznámý', () => {
    assert.ok(serialize('json', 'x', [], NOW).includes('"count": 0'));
    assert.throws(() => serialize('pdf', 'x', []), /Nepodporovaný/);
  });

  test('filenameFor vyrobí bezpečný název bez diakritiky', () => {
    assert.equal(filenameFor('Kávovar DeLonghi!', 'csv'), 'serp-kavovar-delonghi.csv');
    assert.equal(filenameFor('???', 'json'), 'serp-vysledky.json');
    assert.ok(!filenameFor('../../etc/passwd', 'xml').includes('/'));
  });
});
