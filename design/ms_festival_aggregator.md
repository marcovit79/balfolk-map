# Festival Aggregator Microservice (`ms_festival_aggregator`)

This document specifies the Festival Aggregator backend microservice, including external data scraping, session handling, response transformation, and caching strategy.

---

## 1. Description
* **Framework:** NestJS (TypeScript, Node.js 20 LTS)
* **Internal Port:** `3000`
* **Container Name:** `be_fa`
* **Purpose:** Aggregates traditional dance, festival, and concert events from external sources (`agendatrad.org`), caches them, cleans and transforms the HTML content, and exposes them to the API Gateway.

---

## 2. External Integration Protocol (`agendatrad.org`)

The external source requires session management and multipart form submission. The service performs a two-step integration:

### 2.1 Step 1: Session Cookie Acquisition
* Performs an HTTP `GET` request to `https://agendatrad.org/calendar/map` with a desktop `User-Agent`.
* Extracts and maintains the returned `Set-Cookie` header (`session=...`, etc.) for subsequent calls.

### 2.2 Step 2: Dynamic Event Query
* Computes dynamic dates based on the current date:
  * `data[Event][date_startInput]`: Current date in `DD/MM/YYYY` format.
  * `data[Event][date_start]`: Current date in `YYYY-MM-DD` format.
* Constructs a `multipart/form-data` payload containing:
  * `_method`: `POST`
  * `data[Event][bounds]`: `-10.0, 34.0, 35.0, 60.0` (covering Western & Central Europe)
  * `data[Event][zoom]`: `5`
  * `data[Check][types]`: `1`
  * `data[EventType][EventType][]`: Selected event categories `[1, 2, 3, 4, 5, 6, 8, 9, 11, 12]`
* Sends an HTTP `POST` request to `https://agendatrad.org/calendar/map.json` including the session cookie, `X-Requested-With: XMLHttpRequest`, `Origin`, and `Referer` headers.

---

## 3. Data Transformation & URL Rewriting

The raw response returns `{ count: number, boundaries: object, popups: [{ lat, lng, content }] }`.

The service processes the raw `content` HTML strings before returning them:
1. **Date Extraction & Normalization:** Extracts the event date from the leading `<h4>` header tag (supporting French and Italian textual and numeric formats, e.g. `vendredi 28 août 2026`, `martedì 1 settembre 2026`, `28/08/2026`) and converts it to standard ISO `YYYY-MM-DD` format (e.g. `2026-08-28`) in a top-level `date` property.
2. **Hyperlink Rewriting:** Relative links (`href="/..."`) are converted to absolute URLs (`href="https://agendatrad.org/..."`) with `target="_blank" rel="noopener noreferrer"`.
3. **Image Source Rewriting:** Relative image poster paths (`src="/..."`) are converted to absolute URLs (`src="https://agendatrad.org/..."`).
4. **Type Coercion:** Ensures `lat` and `lng` are parsed as floating-point numbers.

---

## 4. Caching & Resilience

* **Cache TTL:** In-memory cache with a 10-minute expiration time (`CACHE_TTL_MS = 600000`).
* **Cache Warm-Up:** Triggered automatically upon service startup via the NestJS `OnModuleInit` lifecycle hook.
* **Cache Invalidation:** On subsequent requests after TTL expiry, fresh data is fetched from the external source.
* **Failure Resilience:** If the upstream source is unreachable, times out, or returns an error, the service gracefully falls back to existing cached events or fallback data, ensuring high availability.

---

## 5. API Specification

### `GET /events`
* **Description:** Returns the list of all cached festival and concert map markers.
* **Response Status:** `200 OK`
* **Response Body (JSON):**
  ```json
  [
    {
      "lat": 45.5422,
      "lng": 11.7861,
      "date": "2026-09-01",
      "content": "<h4>mardi 01 sept. 2026</h4><h5><a href=\"https://agendatrad.org/e_2026-09/...\" target=\"_blank\">Festa a ballo...</a></h5>..."
    }
  ]
  ```
