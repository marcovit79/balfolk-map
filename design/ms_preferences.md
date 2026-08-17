# Preferences & Config Microservice (`ms_preferences`)

This document specifies the Preferences / Config Server microservice.

---

## 1. Description
* **Framework:** NestJS (TypeScript, Node.js 20 LTS)
* **Internal Port:** `3000`
* **Container Name:** `be_cfg`
* **Purpose:** Serves application-wide configurations, default filters, and user preferences. Acts as a lightweight placeholder service for future preference persistence.

---

## 2. API Specification

### `GET /parameters`
* **Description:** Retrieves the current configuration parameters and preferences.
* **Response Status:** `200 OK`
* **Response Body (JSON):**
  ```json
  {}
  ```

---

## 3. Future Roadmap
* Support user map preferences (default geographic center, default zoom level, preferred festival categories).
* Add persistence layer (e.g. SQLite/PostgreSQL) and parameter update endpoints (`POST/PUT /parameters`).
