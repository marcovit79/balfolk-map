# Festival Aggregator Microservice (`ms_festival_aggregator`)

This document specifies the Festival Aggregator backend microservice, including multi-source event scraping, session handling, response transformation, and caching strategy.

---

## 1. Description
* **Framework:** NestJS (TypeScript, Node.js 20 LTS)
* **Internal Port:** `3000`
* **Container Name:** `be_fa`
* **Purpose:** Concurrently aggregates events from multiple external providers ([AgendaTrad](https://agendatrad.org) for traditional dance festivals and [TrovaSagre](https://trovasagre.com) for Italian food and cultural sagre), normalizes their dates and HTML popups into a unified schema, caches them, and exposes them to the API Gateway.

---

## 2. External Integration Providers

The aggregator concurrently queries two upstream sources in parallel using `Promise.allSettled`:

### 2.1 Provider A: AgendaTrad (`agendatrad.org`)
* **Step 1 (Session Cookie Acquisition):** Issues an HTTP `GET` request to `https://agendatrad.org/calendar/map` with a desktop `User-Agent` to obtain session cookies.
* **Step 2 (Dynamic Search Query):** Computes dynamic query dates from `today` and bounds (`-10.0, 34.0, 35.0, 60.0`), sending a `POST` request with multipart/form-data payload to `https://agendatrad.org/calendar/map.json`.
* **URL Rewriting:** Converts relative links (`href="/..."`) and images (`src="/..."`) to `https://agendatrad.org/...`.

### 2.2 Provider B: TrovaSagre (`trovasagre.com`)
* **REST API Query:** Issues an HTTP `GET` request to `https://trovasagre.com/api/events?limit=250&page=1`.
* **Payload Parsing:** Extracts event titles, locations, dates (`date_start`, `date_end`), pre-geocoded `lat` and `lng` coordinates, descriptions, and flyer images (`https://trovasagre.com/uploads/...`).
* **HTML Generation:** Synthesizes styled popup HTML matching the map application's look and feel with a direct link to the TrovaSagre event page (`https://trovasagre.com/evento/...`).

---

## 3. Data Transformation & Normalization

All events from both sources are mapped to a unified `EventPopup` interface:
1. **Event Type Tagging (`evt_type`):** Tagged with `'balfolk'` for traditional dance & music festivals from AgendaTrad, and `'sagra'` for culinary & cultural festival events from TrovaSagre.
2. **Date Normalization:** Dates are parsed and standardized into ISO `YYYY-MM-DD` format (supporting French and Italian textual and slash formats).
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
* **Response Body (JSON):**
  ```json
  [
    {
      "lat": 43.5391,
      "lng": 10.9540,
      "date": "2026-08-18",
      "evt_type": "sagra",
      "content": "<h4 style=\"font-size: 16px;\">2026-08-18 – 2026-08-23</h4><h5><a href=\"https://trovasagre.com/evento/sagra-della-lepre-gambassi-terme-2026\" target=\"_blank\">Sagra della Lepre</a></h5>..."
    },
    {
      "lat": 45.5422,
      "lng": 11.7861,
      "date": "2026-09-01",
      "evt_type": "balfolk",
      "content": "<h4 style=\"font-size: 16px;\">mardi 01 sept. 2026</h4><h5><a href=\"https://agendatrad.org/e_2026-09/...\" target=\"_blank\">Festa a ballo...</a></h5>..."
    }
  ]
  ```
