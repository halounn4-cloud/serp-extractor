// Převod výsledků do strojově čitelných formátů (JSON, CSV, XML).

export const FIELDS = ['position', 'title', 'url', 'displayedUrl', 'snippet'];

/** @param {string} query @param {Array<object>} results @param {Date} [now] */
export function toJSON(query, results, now = new Date()) {
  return JSON.stringify(
    {
      query,
      fetchedAt: now.toISOString(),
      count: results.length,
      results,
    },
    null,
    2,
  );
}

// Ochrana proti CSV injection (Excel by buňku začínající = + - @ vyhodnotil jako vzorec).
function neutralize(value) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value) {
  const s = neutralize(value === null || value === undefined ? '' : String(value));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV, s BOM kvůli správné češtině v Excelu. */
export function toCSV(results) {
  const lines = [FIELDS.join(',')];
  for (const r of results) {
    lines.push(FIELDS.map((f) => csvCell(r[f])).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function escapeXml(value) {
  return String(value ?? '')
    // odstranění znaků nepovolených v XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function toXML(query, results, now = new Date()) {
  const items = results
    .map(
      (r) =>
        `    <result position="${escapeXml(r.position)}">\n` +
        `      <title>${escapeXml(r.title)}</title>\n` +
        `      <url>${escapeXml(r.url)}</url>\n` +
        `      <displayedUrl>${escapeXml(r.displayedUrl)}</displayedUrl>\n` +
        `      <snippet>${escapeXml(r.snippet)}</snippet>\n` +
        `    </result>`,
    )
    .join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<serp query="${escapeXml(query)}" fetchedAt="${now.toISOString()}" count="${results.length}">\n` +
    `  <results>\n${items}${items ? '\n' : ''}  </results>\n` +
    `</serp>\n`
  );
}

export const FORMATS = {
  json: { mime: 'application/json; charset=utf-8', ext: 'json' },
  csv: { mime: 'text/csv; charset=utf-8', ext: 'csv' },
  xml: { mime: 'application/xml; charset=utf-8', ext: 'xml' },
};

export function serialize(format, query, results, now = new Date()) {
  switch (format) {
    case 'json':
      return toJSON(query, results, now);
    case 'csv':
      return toCSV(results);
    case 'xml':
      return toXML(query, results, now);
    default:
      throw new Error(`Nepodporovaný formát: ${format}`);
  }
}

/** Bezpečný název souboru z dotazu, např. "Kávovar DeLonghi!" -> "kavovar-delonghi". */
export function filenameFor(query, format) {
  const slug =
    query
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'vysledky';
  return `serp-${slug}.${FORMATS[format].ext}`;
}
