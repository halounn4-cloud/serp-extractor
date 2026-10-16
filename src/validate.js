export const MAX_QUERY_LENGTH = 200;

/** Vrátí { ok: true, query } nebo { ok: false, error }. */
export function validateQuery(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Chybí klíčové slovo.' };
  // sjednocení bílých znaků + odstranění řídicích znaků
  // eslint-disable-next-line no-control-regex
  const query = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!query) return { ok: false, error: 'Zadejte klíčové slovo.' };
  if (query.length > MAX_QUERY_LENGTH) {
    return { ok: false, error: `Dotaz je příliš dlouhý (max ${MAX_QUERY_LENGTH} znaků).` };
  }
  return { ok: true, query };
}
