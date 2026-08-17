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
  * **Event Counter Badge:** Displays the count of currently filtered events vs total loaded events (`X of Y events`).
  * **Refresh Button:** Allows manually triggering a re-fetch of event data from the backend.
* **Date Filter Bar:**
  * **Quick Presets:** `All Dates`, `This Weekend`, `Next 7 Days`, `Next 30 Days`.
  * **Custom Date Range Pickers:** `From` (`startDate`) and `To` (`endDate`) HTML5 `<input type="date">` pickers.
  * **Clear Button:** Resets active filters back to `All Dates`.

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
    content: string; // HTML snippet describing the event
  }
  ```

### 3.2 Client-Side Date Filtering
* A computed property `filteredEvents` reactively filters the full event list by matching `event.date >= startDate` and `event.date <= endDate`.
* When the filter criteria change, the map automatically clears and redraws marker clusters and calls `map.fitBounds()` to re-center the map on the remaining events.

### 3.3 Marker & Cluster Rendering
* Uses `L.markerClusterGroup` to cluster markers at higher zoom levels, preventing map lag when displaying hundreds of events across Europe.
* Configures default Leaflet pin icons to avoid missing bundler asset paths.
* For each event:
  1. Latitude and longitude are extracted from `lat` and `lng`.
  2. HTML popup content from `content` is sanitized using `DOMPurify.sanitize()` before being bound to `marker.bindPopup()`.
  3. Clicking a marker or cluster zooms into/opens the event popup with event title, dates, group information, and poster images.

### 3.4 Auto-Fitting Viewport
* Once markers are rendered, `map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })` automatically adjusts the camera to focus on the geographic region containing active events.
