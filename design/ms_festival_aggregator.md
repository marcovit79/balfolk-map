# Festival Aggregator Microservice (`ms_festival_aggregator`)

This document specifies the Festival Aggregator backend microservice, including multi-source event scraping, session handling, response transformation, and caching strategy.

---

## 1. Description
* **Framework:** NestJS (TypeScript, Node.js 20 LTS)
* **Internal Port:** `3000`
* **Container Name:** `be_fa`
* **Purpose:** Concurrently aggregates events from multiple external providers ([AgendaTrad](https://agendatrad.org) for traditional dance festivals, [TrovaSagre](https://trovasagre.com) for Italian food and cultural sagre, and [uMap OpenStreetMap / TuttoBalfolk](https://umap.openstreetmap.fr/it/datalayer/1379731/c2c6318f-c677-4b24-acce-6e8a49a06bbe/) for Italian balfolk events), normalizes their dates and HTML popups into a unified schema, caches them, and exposes them to the API Gateway.

---

## 2. External Integration Providers

The aggregator concurrently queries three upstream sources in parallel using `Promise.allSettled`:

### 2.1 Provider A: AgendaTrad (`agendatrad.org`)
* **Step 1 (Session Cookie Acquisition):** Issues an HTTP `GET` request to `https://agendatrad.org/calendar/map` with a desktop `User-Agent` to obtain session cookies.
* **Step 2 (Dynamic Search Query):** Computes dynamic query dates from `today` and bounds (`-10.0, 34.0, 35.0, 60.0`), sending a `POST` request with multipart/form-data payload to `https://agendatrad.org/calendar/map.json`.
* **URL Rewriting:** Converts relative links (`href="/..."`) and images (`src="/..."`) to `https://agendatrad.org/...`.

### 2.2 Provider B: TrovaSagre (`trovasagre.com`)
* **REST API Query:** Issues an initial HTTP `GET` request to `https://trovasagre.com/api/events?page=1&limit=100` to retrieve the initial batch and `total` count, then executes concurrent `Promise.allSettled` queries across all remaining pages to fetch 100% of active events.
* **Payload Parsing:** Extracts event titles, locations, dates (`date_start`, `date_end`), pre-geocoded `lat` and `lng` coordinates, descriptions, and flyer images (`https://trovasagre.com/uploads/...`).
* **HTML Generation:** Synthesizes styled popup HTML matching the map application's look and feel with a direct link to the TrovaSagre event page (`https://trovasagre.com/evento/...`).

### 2.3 Provider C: uMap OpenStreetMap / TuttoBalfolk (`umap.openstreetmap.fr`)
* **GeoJSON Query:** Issues an HTTP `GET` request to `https://umap.openstreetmap.fr/it/datalayer/1379731/c2c6318f-c677-4b24-acce-6e8a49a06bbe/` retrieving the GeoJSON FeatureCollection.
* **Payload Parsing:** Extracts point coordinates `[lng, lat]`, event titles (`title`/`name`), dates/locations from the description (e.g. `[Date] @ [Location]`), and markdown links (`[Evento Facebook](url)`).
* **HTML Generation:** Synthesizes structured popups with location, dates, event links, and badges (`Balfolk` / `TuttoBalfolk`).

### 2.4 Provider D: Folkdance.page (`folkdance.page`)
* **JSON Feed Query:** Issues an HTTP `GET` request to `https://folkdance.page/index.json?styles=balfolk` retrieving international balfolk events across Europe, UK, and North America.
* **Geocoding & Payload Parsing:** Matches `city` and `country` against a pre-compiled coordinates cache with dynamic Open-Meteo fallback geocoding.
* **HTML Generation:** Synthesizes structured popups with bands/artists, organization, pricing, workshops, and links (`Balfolk` / `Folkdance.page`).

---

## 3. Data Transformation & Normalization

All events from all sources are mapped to a unified `EventPopup` interface:
1. **Event Type Tagging (`evt_type`):** Tagged with `'balfolk'` for traditional dance & music festivals from AgendaTrad, uMap (TuttoBalfolk), and Folkdance.page, and `'sagra'` for culinary & cultural festival events from TrovaSagre.
2. **Date Range Normalization (`start_date`, `end_date`):** Dates are parsed and standardized into ISO `YYYY-MM-DD` format (supporting French and Italian textual and slash formats). Events with a multi-day duration provide distinct start and end boundaries.
3. **Type Coercion:** Ensures `lat` and `lng` are validated floating-point numbers.
4. **Badge Tagging:** Popups include category badges indicating the event type and source provider.

---

## 4. Caching & Resilience

* **Cache TTL:** In-memory cache with a 10-minute expiration time (`CACHE_TTL_MS = 600000`).
* **Cache Warm-Up:** Triggered automatically upon service startup via the NestJS `OnModuleInit` lifecycle hook.
* **Cache Invalidation:** On subsequent requests after TTL expiry, fresh data is concurrently re-fetched.
* **Failure Resilience:** If one upstream provider is temporarily down, the other provider's events are still served without interruption. If all upstream providers fail, existing cache or fallback data is returned.

---

## 5. API Specification

### `GET /events`
* **Description:** Returns the list of all cached festival and sagra map markers.
* **Response Status:** `200 OK`

### `GET /events/folkdance` (or `GET /debug/folkdance`)
* **Description:** Separate, **uncached** debug endpoint to directly query and return normalized events from `folkdance.page`.
* **Response Status:** `200 OK`

* **Response Body (JSON):**
  ```json
  [
    {
      "lat": 43.5391,
      "lng": 10.9540,
      "start_date": "2026-08-18",
      "end_date": "2026-08-23",
      "evt_type": "sagra",
      "content": "<h4 style=\"font-size: 16px;\">2026-08-18 – 2026-08-23</h4><h5><a href=\"https://trovasagre.com/evento/sagra-della-lepre-gambassi-terme-2026\" target=\"_blank\">Sagra della Lepre</a></h5>..."
    },
    {
      "lat": 45.5422,
      "lng": 11.7861,
      "start_date": "2026-09-01",
      "end_date": "2026-09-01",
      "evt_type": "balfolk",
      "content": "<h4 style=\"font-size: 16px;\">mardi 01 sept. 2026</h4><h5><a href=\"https://agendatrad.org/e_2026-09/...\" target=\"_blank\">Festa a ballo...</a></h5>..."
    }
  ]
  ```
