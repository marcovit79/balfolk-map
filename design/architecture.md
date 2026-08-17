# Architecture & Deployment Specification

This document defines the system architecture, deployment model, and networking specifications for the Festival Aggregator application.

---

## 1. Definitions

* **Frontend Project:** A single-page application built with [Vue.js 3](https://vuejs.org/) and TypeScript. The production bundle is compiled into static assets and hosted within the API Gateway Nginx container.
* **Backend Project:** A microservice built with the [NestJS](https://docs.nestjs.com/) TypeScript framework, running in its own container on Node.js 20 LTS.
* **API Gateway:** An [Nginx](https://nginx.org/) reverse proxy container acting as the single public entry point for users, serving frontend static files and routing API requests to backend microservices.

---

## 2. Deployment Diagram

```mermaid
architecture-beta
    group vpc(cloud)[Docker Network: vpc]

    service api_gw(server)[API Gateway (Nginx:80)] in vpc
    service fe(disk)[Frontend Static Files] in vpc
    api_gw:B --> T:fe

    service be_cfg(server)[Config Server:3000] in vpc
    service be_fa(server)[Festival Aggregator:3000] in vpc
    
    junction center in vpc
    junction up in vpc
    junction down in vpc
    
    api_gw:R -- L:center
    center:B -- T:down
    center:T -- B:up
    up:R --> L:be_cfg
    down:R --> L:be_fa

    service clients(internet)[Clients / Web Browsers]
    clients:R --> L:api_gw
```

---

## 3. Component Details & Routing Rules

### 3.1 API Gateway (`api_gateway`)
* **Container Name:** `api_gateway`
* **Base Image:** `docker.io/library/nginx:alpine`
* **Exposed Ports:** `80` inside container, mapped to host port `8080` (or `80`).
* **Routing Table:**
  | Path Pattern | Target Destination | Behavior |
  | :--- | :--- | :--- |
  | `/` | `/usr/share/nginx/html` | Serves Vue.js SPA index and static assets (HTML/CSS/JS). |
  | `/api/be_fa/(.*)` | `http://be_fa:3000/$1` | Strips `/api/be_fa/` prefix and forwards request to `be_fa` on port `3000`. |
  | `/api/be_cfg/(.*)` | `http://be_cfg:3000/$1` | Strips `/api/be_cfg/` prefix and forwards request to `be_cfg` on port `3000`. |

### 3.2 Frontend (`frontend`)
* Single Page Application described in [frontend.md](./frontend.md).
* Built via multi-stage Docker build and deployed directly onto the API Gateway filesystem.

### 3.3 Config Server (`be_cfg`)
* **Container Name:** `be_cfg`
* **Internal Port:** `3000`
* NestJS microservice described in [ms_preferences.md](./ms_preferences.md).

### 3.4 Festival Aggregator (`be_fa`)
* **Container Name:** `be_fa`
* **Internal Port:** `3000`
* NestJS microservice described in [ms_festival_aggregator.md](./ms_festival_aggregator.md).

---

## 4. Networking & Orchestration
* All containers run inside an isolated Docker bridge network named `vpc`.
* Orchestrated using `docker-compose.yml` (or Podman Compose) with automatic service discovery via container names.
