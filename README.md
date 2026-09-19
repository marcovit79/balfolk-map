# Festival Map Aggregator Prototype

A microservice-based architecture prototype featuring a Vue 3 + Leaflet frontend, NestJS backend microservices, and an Nginx API Gateway, fully containerized with Docker Compose.

---

## 🏛 Architecture Overview

```
[ Browser / User ]
       │ (Port 8080)
       ▼
┌────────────────────────────────────────────────────────┐
│ Docker Network (`vpc`)                                 │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ API Gateway (`api_gateway`)                      │  │
│  │ - Nginx reverse proxy                            │  │
│  │ - Serves Vue 3 frontend on `/`                   │  │
│  │ - Routes `/api/be_fa/*`  ──► `be_fa:3000/*`       │  │
│  │ - Routes `/api/be_cfg/*` ──► `be_cfg:3000/*`      │  │
│  └──────────────┬──────────────────┬────────────────┘  │
│                 │                  │                   │
│                 ▼                  ▼                   │
│        ┌─────────────────┐ ┌─────────────────┐         │
│        │  `be_fa`        │ │  `be_cfg`       │         │
│        │  Festival       │ │  Preferences    │         │
│        │  Aggregator     │ │  Config Server  │         │
│        │  (NestJS)       │ │  (NestJS)       │         │
│        └────────┬────────┘ └─────────────────┘         │
│                 │                                      │
└─────────────────┼──────────────────────────────────────┘
                  │
  ┌───────────────┼───────────────┬──────────────────┐
  ▼               ▼               ▼                  ▼
[ AgendaTrad ] [ TrovaSagre ]  [ TuttoBalfolk ]  [ Folkdance.page ]
(Balfolk FR/EU)  (Sagre IT)       (uMap IT)         (Balfolk Global)
```


---

## 📦 Project Structure

```
├── api_gateway/                # Nginx API Gateway & Frontend Host
│   ├── Dockerfile
│   └── nginx.conf
├── design/                     # Architecture & Specification Documents
│   ├── architecture.md
│   ├── frontend.md
│   ├── ms_festival_aggregator.md
│   └── ms_preferences.md
├── frontend/                   # Vue 3 + TypeScript + Leaflet Web App
│   ├── src/
│   │   ├── components/FestivalMap.vue
│   │   ├── types/index.ts
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── style.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── ms_festival_aggregator/     # Festival Aggregator Microservice (NestJS)
│   ├── src/
│   │   ├── events/
│   │   │   ├── interfaces/event.interface.ts
│   │   │   ├── events.controller.ts
│   │   │   └── events.service.ts
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── ms_preferences/             # Preferences / Config Microservice (NestJS)
│   ├── src/
│   │   ├── app.controller.ts
│   │   ├── app.service.ts
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── cordova_app/                # Apache Cordova Android App & Emulation Pipeline
│   ├── config.xml              # Cordova configuration & Android permissions
│   ├── build_apk.sh            # Automated APK build script
│   ├── run_emulator.sh         # Local emulation runner (Web simulator / Android VM / ADB)
│   ├── Dockerfile.build        # Android SDK + Cordova build container
│   ├── docker-compose.emulator.yml # Containerized Android OS Emulator (noVNC)
│   └── emulator/               # Web-based mobile device simulator
└── docker-compose.yml          # Stack orchestration
```

---

## 🚀 Running the Prototype

### Prerequisites
- Docker & Docker Compose (or Podman / Podman Compose)

### One-Command Start / Restart / Shutdown
Run the provided helper script:
```bash
# Start or restart stack with rebuild:
./restart.sh

# Stop and tear down all stack containers:
./restart.sh --shutdown

# Additional options:
./restart.sh --no-cache   # Rebuild without cache
./restart.sh --logs       # Follow live logs after start
```
Or manually with compose:
```bash
podman-compose up --build -d
# or: docker-compose up --build -d
```
Once started, open your browser and navigate to:
**`http://localhost:8080`**

---

## 🛠 Useful Commands

### With `podman-compose`:
* **Start all services in background:**
  ```bash
  podman-compose up -d
  ```
* **View status of running services:**
  ```bash
  podman-compose ps
  ```
* **View live logs from all services:**
  ```bash
  podman-compose logs -f
  ```
* **View logs from a specific service (`be_fa`, `be_cfg`, or `api_gateway`):**
  ```bash
  podman-compose logs -f be_fa
  ```
* **Rebuild container images and restart:**
  ```bash
  podman-compose up --build -d
  ```
* **Stop and tear down the stack:**
  ```bash
  podman-compose down
  ```

### With `docker-compose`:
* **Start:** `docker-compose up -d`
* **Status:** `docker-compose ps`
* **Logs:** `docker-compose logs -f`
* **Rebuild:** `docker-compose up --build -d`
* **Stop:** `docker-compose down`

---

## 💡 Educated Guesses & Design Decisions Made

1. **Scraper Session Handling:**
   - The upstream source (`agendatrad.org`) requires valid session cookies. The `EventsService` automatically performs a pre-flight request to `https://agendatrad.org/calendar/map` to acquire session cookies before posting search queries.
2. **Dynamic Date Querying:**
   - Instead of hardcoding a past date, the aggregator uses the current date (`today`) as the start date for festival lookups across Europe.
3. **URL & Asset Rewriting:**
   - Relative links and poster images (`/img/events/...`) in upstream event HTML are automatically rewritten to absolute paths pointing to `https://agendatrad.org` so popups render images and working links correctly.
4. **Caching & Resilience:**
   - 10-minute in-memory cache TTL with automatic warm-up on service start.
   - Graceful fallback: If upstream is unreachable or rate-limits requests, cached data or sample events are returned seamlessly without breaking the UI.
5. **Map Performance & Security:**
   - Integrated `leaflet.markercluster` to handle multiple pins cleanly.
   - Popups are sanitized via `DOMPurify` to ensure security against any unexpected HTML payloads.
   - Automatic `map.fitBounds()` to focus directly on available markers.

---

## 📱 Android Mobile App & Local Emulation

An Apache Cordova-based pipeline is available under `cordova_app/` to build a native Android APK and emulate it locally.

### 1. Build Android APK
```bash
cd cordova_app
./build_apk.sh
```
The compiled APK is placed in `cordova_app/output/app-debug.apk`.

### 2. Run Local Emulation
```bash
cd cordova_app
# Web Mobile Device Simulator (default, port 8000)
./run_emulator.sh --web

# Containerized Android OS Emulator (with noVNC browser interface at port 6080)
./run_emulator.sh --android

# Sideload to connected Android phone / AVD via ADB
./run_emulator.sh --device
```
See [`cordova_app/README.md`](cordova_app/README.md) for full details.

