# Scénář videa (cca 3–4 minuty, Vidyard / Loom)

Cíl: vlastními slovy popsat funkci kódu + ukázat zelené unit testy. Nahrávejte obrazovku s IDE/terminálem a prohlížečem.

## 1) Úvod (15 s)
„Dobrý den, tady Jan Haloun. Ukážu vám řešení druhého kola: stránku s jedním inputem, která vrátí organické výsledky
1. strany Google a umožní je uložit ve strojově čitelném formátu.“

## 2) Ukázka v prohlížeči (45 s)
- Otevřít nasazenou URL, zadat klíčové slovo, ukázat výpis (pozice, titulek, URL, popisek).
- Kliknout na **Uložit JSON**, **CSV**, **XML**, otevřít stažený soubor.
- Říct: reklamy a ostatní bloky (Lidé se také ptají apod.) se zahazují, bere se jen organika.

## 3) Architektura (60 s) – ukázat soubory
- `public/index.html` – jeden input, volá `/api/search`, výsledky vykreslí přes `textContent` (bez XSS).
- `src/server.js` – Node bez závislostí: `/api/search`, `/api/export`, `/healthz`; validace, cache 10 min, limit 20 req/min na IP.
- `src/providers.js` – data z Google tahá licencované SERP API (SerpAPI / Serper). Důvod: přímý scraping Google porušuje
  podmínky a končí na CAPTCHA. Odpověď se **normalizuje** na jednotný tvar a omezí na 10 organických výsledků.
- `src/formatters.js` – JSON, CSV (RFC 4180, BOM pro Excel, ochrana proti CSV injection), XML (escapování).

## 4) Unit testy (45 s)
- V terminálu spustit `npm test`, ukázat zelený výstup (29 testů).
- Zmínit tři skupiny: formátovače (správnost výstupu), normalizace providerů (jen organika, max 10, prázdné odpovědi),
  HTTP API end-to-end (cache, export, chybové stavy 400/429/502/503).

## 5) Docker Compose a závěr (20 s)
- `docker compose up` spustí vše lokálně, `docker compose run --rm tests` pustí testy v kontejneru.
- „Děkuji za zadání, těším se na pohovor.“

Tip: před nahráváním spusťte `npm test` ať je výstup čistý a text v terminálu zvětšete (Ctrl +).
