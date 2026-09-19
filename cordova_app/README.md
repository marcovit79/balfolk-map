# 📱 Festival Maps - Apache Cordova Android App & Emulation Environment

This folder contains the complete Apache Cordova hybrid mobile application wrapper for the **Festival Map Aggregator**, along with automated build scripts to produce an Android APK and a local emulation environment.

---

## 🏗 Directory Overview

```
cordova_app/
├── config.xml                  # Apache Cordova project configuration & Android permissions
├── package.json                # Dependencies & npm scripts
├── Dockerfile.build            # Reproducible Android SDK + Cordova build container
├── build_apk.sh                # Automated build pipeline (Frontend -> Cordova -> APK)
├── run_emulator.sh             # Local emulation launcher (Web Simulator, Android OS, ADB)
├── docker-compose.emulator.yml # Containerized Android OS Emulator with web noVNC interface
├── www/                        # Static web assets synced from frontend/
├── emulator/                   # Local Web Mobile Device Simulator
│   ├── index.html              # Responsive mobile simulator UI with device frames
│   ├── server.js               # Simulator server with proxy to API Gateway (:8080)
│   └── cordova-mock.js         # Cordova runtime mock & deviceready events
├── scripts/
│   └── docker_build_apk.sh     # Internal container APK build script
└── output/                     # Generated APK output folder
    └── app-debug.apk           # Final debug APK
```

---

## ⚡ Prerequisites

- **Docker** or **Podman** (already installed and configured on your system).
- *No need to manually install Java, Android SDK, or Node.js on your host system* — the build script handles everything in isolated containers.

---

## 🚀 1. Building the Android APK

To compile the frontend and produce the Android APK:

```bash
cd /home/mvit/Documenti/ai_projects/festival_maps/cordova_app
./build_apk.sh
```

### What `build_apk.sh` does:
1. Compiles the Vue 3 frontend (`frontend/`) using Vite with relative asset paths (`base: './'`).
2. Syncs the compiled assets into `cordova_app/www/`.
3. Injects `cordova.js` and runtime API gateway configurations.
4. Builds/uses the isolated `cordova-android-builder` container with OpenJDK 17, Android SDK 34, and Cordova 13.
5. Emits the compiled `app-debug.apk` into `cordova_app/output/app-debug.apk`.

### Configuring Backend API Host:
By default, the APK points to `http://10.0.2.2:8080` (the standard Android emulator alias for your host machine's `localhost:8080`).

If you want to test on a physical Android device on your local Wi-Fi, pass your host machine's LAN IP:
```bash
./build_apk.sh --api http://192.168.1.50:8080
```

---

## 🎮 2. Local Emulation Environment

We provide three emulation options to fit your workflow:

### Option A: Web Mobile Device Simulator (Fastest & Recommended)
Launches a responsive mobile device simulator right in your browser with realistic device bezels, touch scrolling, and mock Cordova runtime:

```bash
./run_emulator.sh --web
# or simply:
./run_emulator.sh
```

- **URL:** [http://localhost:8000](http://localhost:8000)
- **Features:**
  - Device presets: **Google Pixel 7**, **Samsung Galaxy S22**, **iPhone 14 Pro**, **Tablet**.
  - Orientation toggle (Portrait 🔄 Landscape).
  - Cordova `deviceready` event emulation.
  - Live reverse-proxying of `/api/*` requests directly to your running backend API Gateway at `http://localhost:8080`.
  - Instant hot reload and testing without heavy VM startup times.

### Option B: Full Containerized Android OS Emulator (Virtual Android Device)
Runs a full x86_64 Android OS virtual machine inside Docker using your host's KVM hardware acceleration (`/dev/kvm`), with a browser-based interactive screen via noVNC:

```bash
./run_emulator.sh --android
```

- Automatically requests `sudo` for `/dev/kvm` hardware acceleration.
- Waits for Android OS to finish booting (`sys.boot_completed`).
- Automatically copies the APK into the container, installs it via ADB, and launches the app!
- Opens the interactive screen automatically at **[http://localhost:6080](http://localhost:6080)**.
- To stop the emulator container:
  ```bash
  ./run_emulator.sh --stop
  ```

### Option C: Sideload onto Real Device or Android Studio AVD via ADB
If you have an Android phone connected via USB debugging or a running Android Studio AVD:

```bash
./run_emulator.sh --device
```

This will run `adb install -r output/app-debug.apk` and launch `com.festivalmaps.app/.MainActivity` directly on the device.

---

### 🐳 Container Engine Selection (Aligned with root `restart.sh`)

Both `run_emulator.sh` and `build_apk.sh` support explicit engine flags:
* `--podman`: Explicitly use Podman / podman-compose (default, matching `restart.sh`)
* `--docker`: Explicitly use Docker / docker-compose

Examples:
```bash
./run_emulator.sh --web --podman
./run_emulator.sh --android --docker
```

---

## 🌐 Backend Network Flow

| Environment | Frontend / WebView Base | Target Backend URL |
|---|---|---|
| **Web Browser (Nginx)** | `http://localhost:8080` | `/api/*` (proxied by Nginx) |
| **Web Simulator** | `http://localhost:8000` | `http://localhost:8080/api/*` (proxied by simulator) |
| **Android Emulator** | `file:///android_asset/www/` | `http://10.0.2.2:8080/api/*` |
| **Physical Phone (Wi-Fi)**| `file:///android_asset/www/` | `http://<LAN-IP>:8080/api/*` |
