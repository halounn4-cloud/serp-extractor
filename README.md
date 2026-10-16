# Google SERP extractor

Webová stránka s jedním inputem: zadáte klíčové slovní spojení a dostanete **organické výsledky 1. strany Google**
(pozice, titulek, URL, zobrazená URL, popisek). Výsledek lze uložit jako **JSON, CSV nebo XML**.

## Jak to funguje

```
prohlížeč ── GET /api/search?q=… ──▶ server (Node) ──▶ SERP API (SerpAPI / Serper) ──▶ Google
          ◀── JSON s výsledky ─────                    (pouze organic_results / organic)
          ── POST /api/export {format,…} ─▶ server převede do JSON/CSV/XML a vrátí soubor ke stažení
```

- **Žádné závislosti** (jen Node 20+, vestavěný `node:test`).
- Z odpovědi se bere **pouze organické vyhledávání**; reklamy, "Lidé se také ptají", obrázky aj. se zahazují.
- Data tahá licencované **SERP API**, ne přímý scraping google.com (ten je v rozporu s podmínkami Google a bez proxy
  brzy skončí CAPTCHA). Lokalizace je výchozně CZ (`gl=cz`, `hl=cs`).
- Ochrana kreditů a zneužití: validace vstupu, cache stejných dotazů (10 min), limit 20 požadavků/min na IP.
- CSV: RFC 4180, UTF-8 s BOM (správná čeština v Excelu), ochrana proti CSV injection.

## Spuštění lokálně

```bash
cp .env.example .env        # doplňte SERPAPI_KEY nebo SERPER_API_KEY
npm start                   # http://localhost:3000
# bez klíče, jen demo data:  MOCK=1 npm start
```

## Docker Compose (nepovinný bod)

```bash
cp .env.example .env
docker compose up                      # app na http://localhost:3000 (s node --watch)
docker compose run --rm tests          # unit testy v kontejneru
```

## Unit testy

```bash
npm test
```

29 testů, které pokrývají:

| Soubor | Co testuje |
|---|---|
| `test/formatters.test.js` | správnost výstupu JSON / CSV / XML (escapování, BOM, CSV injection, názvy souborů) |
| `test/providers.test.js` | normalizaci odpovědí SerpAPI a Serper (jen organika, max 10, prázdné odpovědi), parametry volání |
| `test/server.test.js` | HTTP API end-to-end (search, cache, export, 400/404/429/502/503) |

## Nasazení

Aplikace je jeden Docker kontejner (`Dockerfile`), v repozitáři je i `render.yaml` pro Render.com.
Po nasazení stačí nastavit proměnnou `SERPAPI_KEY` (nebo `SERPER_API_KEY`).

## Struktura

```
public/index.html      UI (jeden input, výpis, tlačítka pro export)
src/server.js          HTTP server, API, cache, rate limit
src/providers.js       SerpAPI / Serper / mock provider + normalizace
src/formatters.js      JSON / CSV / XML
src/validate.js        validace dotazu
test/                  unit testy
```
