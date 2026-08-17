# Frontend Specification

This document specifies the architecture, UI/UX behavior, and data flow of the frontend application.

---

## 1. Technology Stack
* **Framework:** Vue 3 (Composition API `<script setup>`) + TypeScript
* **Bundler & Tooling:** Vite
* **Mapping Libraries:** Leaflet (v1.9+) and Leaflet MarkerCluster (v1.5+)
* **Security:** DOMPurify (HTML sanitization)

---

## 2. Layout & UI Components

### 2.1 Viewport Map Container
* The map container (`#map-container`) occupies 100% width and 100% height of the browser viewport (`100vw` x `100vh`).
* Uses OpenStreetMap standard tile layers (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`).
* Default zoom control is positioned at the bottom-right corner for a clean layout.

### 2.2 Floating HUD Header & Filter Panel
* Fixed at the top-center of the viewport with a blurred translucent backdrop (`backdrop-filter: blur(12px)`).
* **Main Bar:**
  * **Application Title & Icon:** 🎪 Festival Aggregator.
  * **Event Category Selector:**
    * `All`: Displays both event categories.
    * `🎵 Balfolk`: Filters exclusively for traditional folk dance & concert events (Royal Blue markers).
    * `🥘 Sagra`: Filters exclusively for Italian food & cultural festivals (Warm Orange markers).
  * **Event Counter Badge:** Displays the count of currently filtered events vs total loaded events (`X of Y`).
  * **Refresh Button:** Allows manually triggering a re-fetch of event data from the backend.
* **Date Filter Bar:**
  * **Quick Presets:** `All Dates`, `This Weekend`, `Next 7 Days`, `Next 30 Days`.
  * **Custom Date Range Pickers:** `From` (`startDate`) and `To` (`endDate`) HTML5 `<input type="date">` pickers.
  * **Clear Button:** Resets active filters back to defaults.

### 2.3 User Feedback & Overlays
* **Loading Toast:** Displayed while initial event data is being retrieved.
* **Error Toast:** Displayed with an error message if the API request fails.

---

## 3. Data Flow & Map Behavior

### 3.1 API Request
* On component mount (`onMounted`), the frontend performs an asynchronous `GET` request to `/api/be_fa/events`.
* Expected response schema:
  ```typescript
  interface FestivalEvent {
    lat: number;
    lng: number;
    date?: string;   // ISO format YYYY-MM-DD
    evt_type?: 'balfolk' | 'sagra' | string;
    content: string; // HTML snippet describing the event
  }
  ```

### 3.2 Client-Side Filtering
* A computed property `filteredEvents` reactively filters the full event list by matching:
  1. `selectedType`: matches `balfolk`, `sagra`, or `all`.
  2. `startDate` & `endDate`: matches event date range.
* When filter criteria change, the map automatically clears and redraws marker clusters and calls `map.fitBounds()` to re-center the map on the remaining events.

### 3.3 Distinct Marker Colors & Separate Cluster Groups
* Uses `L.divIcon` with custom CSS pins to visually distinguish event categories:
  * **Balfolk (`evt_type: 'balfolk'`):** Royal Blue gradient pin (`#2563eb`) with a musical note icon (`🎵`).
  * **Sagra (`evt_type: 'sagra'`):** Warm Orange/Amber gradient pin (`#ea580c`) with a food icon (`🥘`).
* **Type-Segregated Clustering:** Uses two independent `L.markerClusterGroup` instances (`balfolkClusterGroup` and `sagraClusterGroup`). Balfolk events and Sagra events are never clustered together:
  * **Balfolk Clusters:** Displayed as blue bubble circles with a `🎵` badge and count.
  * **Sagra Clusters:** Displayed as orange bubble circles with a `🥘` badge and count.
* For each event:
  1. Latitude and longitude are extracted from `lat` and `lng`.
  2. The custom category pin is attached.
  3. HTML popup content from `content` is sanitized using `DOMPurify.sanitize()` before being bound to `marker.bindPopup()`.
  4. The marker is added specifically to `balfolkClusterGroup` or `sagraClusterGroup`.
  5. Clicking a marker or cluster zooms into/opens the event popup with event title, dates, group information, and poster images.

### 3.4 Auto-Fitting Viewport
* Once markers are rendered, `map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })` automatically adjusts the camera to focus on the geographic region containing active events.
