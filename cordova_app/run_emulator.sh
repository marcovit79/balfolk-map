#!/usr/bin/env bash
set -e

# ==============================================================================
# Festival Maps - Mobile Emulation Runner
# ==============================================================================
# Usage:
#   ./run_emulator.sh              # Web mobile simulator (default)
#   ./run_emulator.sh --web        # Web mobile simulator
#   ./run_emulator.sh --android    # Containerized Android OS emulator (noVNC)
#   ./run_emulator.sh --device     # Sideload to connected Android device via ADB
#   ./run_emulator.sh --podman     # Explicitly use Podman
#   ./run_emulator.sh --docker     # Explicitly use Docker
#   ./run_emulator.sh --stop       # Stop all running emulator containers
#   ./run_emulator.sh --help       # Show help
# ==============================================================================

# Text colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/output"
APK_FILE="${OUTPUT_DIR}/app-debug.apk"

# Default parameters (aligned with restart.sh)
MODE="web"
PREFERRED_TOOL="podman"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --web)
            MODE="web"
            shift
            ;;
        --android|--os)
            MODE="android"
            shift
            ;;
        --device|--adb)
            MODE="device"
            shift
            ;;
        --docker)
            PREFERRED_TOOL="docker"
            shift
            ;;
        --podman)
            PREFERRED_TOOL="podman"
            shift
            ;;
        --stop|-s|--down)
            MODE="stop"
            shift
            ;;
        --help|-h)
            echo "Festival Maps - Mobile Emulation Runner"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Modes:"
            echo "  --web           (Default) Launch lightweight Web Mobile Device Simulator on http://localhost:8000"
            echo "  --android       Launch containerized Android OS Emulator (noVNC at http://localhost:6080)"
            echo "  --device        Install APK onto attached Android device / existing AVD via ADB"
            echo "  -s, --stop      Stop all running emulator containers"
            echo ""
            echo "Engine Selection (aligned with restart.sh):"
            echo "      --podman    Explicitly use Podman / podman-compose (default)"
            echo "      --docker    Explicitly use Docker / docker-compose"
            echo ""
            echo "General:"
            echo "  -h, --help      Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}[ERROR] Unknown option: $1${NC}"
            echo "Use '$0 --help' for usage."
            exit 1
            ;;
    esac
done

# Detect container engine (podman / docker)
detect_container_engine() {
    if [[ "${PREFERRED_TOOL}" == "podman" ]]; then
        if command -v podman >/dev/null 2>&1; then
            echo "podman"
            return 0
        else
            echo -e "${RED}[ERROR] Podman was requested but not found.${NC}" >&2
            exit 1
        fi
    elif [[ "${PREFERRED_TOOL}" == "docker" ]]; then
        if command -v docker >/dev/null 2>&1; then
            echo "docker"
            return 0
        else
            echo -e "${RED}[ERROR] Docker was requested but not found.${NC}" >&2
            exit 1
        fi
    fi

    # Auto-detection priority: podman -> docker
    if command -v podman >/dev/null 2>&1; then
        echo "podman"
    elif command -v docker >/dev/null 2>&1; then
        echo "docker"
    else
        echo -e "${RED}[ERROR] Neither podman nor docker could be found.${NC}" >&2
        exit 1
    fi
}

# Detect Compose CLI tool (identical to restart.sh)
detect_compose() {
    if [[ "${PREFERRED_TOOL}" == "podman" ]]; then
        if command -v podman-compose >/dev/null 2>&1; then
            echo "podman-compose"
            return 0
        elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
            echo "podman compose"
            return 0
        else
            echo -e "${RED}[ERROR] Podman Compose was requested but not found.${NC}" >&2
            exit 1
        fi
    elif [[ "${PREFERRED_TOOL}" == "docker" ]]; then
        if command -v docker-compose >/dev/null 2>&1; then
            echo "docker-compose"
            return 0
        elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
            echo "docker compose"
            return 0
        else
            echo -e "${RED}[ERROR] Docker Compose was requested but not found.${NC}" >&2
            exit 1
        fi
    fi

    # Auto-detection priority: podman-compose -> docker-compose -> docker compose -> podman compose
    if command -v podman-compose >/dev/null 2>&1; then
        echo "podman-compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        echo "docker-compose"
    elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        echo "docker compose"
    elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
        echo "podman compose"
    else
        echo -e "${RED}[ERROR] Neither podman-compose nor docker-compose could be found.${NC}" >&2
        exit 1
    fi
}

CONTAINER_CMD=$(detect_container_engine)
COMPOSE_CMD=$(detect_compose)

# Handle --stop
if [[ "${MODE}" == "stop" ]]; then
    echo -e "${CYAN}======================================================================${NC}"
    echo -e "${CYAN} 🛑 Stopping Emulator Containers${NC}"
    echo -e "${CYAN}======================================================================${NC}"
    echo -e "Using engine:  ${YELLOW}${CONTAINER_CMD}${NC}"
    echo -e "Using compose: ${YELLOW}${COMPOSE_CMD}${NC}"
    echo ""
    echo -e "${CYAN}▶ Stopping Android OS emulator stack...${NC}"
    ${COMPOSE_CMD} -f "${SCRIPT_DIR}/docker-compose.emulator.yml" down 2>/dev/null || true
    if command -v sudo >/dev/null 2>&1; then
        sudo ${COMPOSE_CMD} -f "${SCRIPT_DIR}/docker-compose.emulator.yml" down 2>/dev/null || true
        sudo ${CONTAINER_CMD} stop festival_maps_android_emulator 2>/dev/null || true
        sudo ${CONTAINER_CMD} rm -f festival_maps_android_emulator 2>/dev/null || true
    fi

    echo -e "${CYAN}▶ Stopping Web simulator container...${NC}"
    ${CONTAINER_CMD} stop festival_maps_web_emulator 2>/dev/null || true
    ${CONTAINER_CMD} rm -f festival_maps_web_emulator 2>/dev/null || true

    echo -e "${CYAN}▶ Stopping ADB bridge helper...${NC}"
    ${CONTAINER_CMD} stop festival_adb_bridge 2>/dev/null || true
    ${CONTAINER_CMD} rm -f festival_adb_bridge 2>/dev/null || true

    echo -e "${GREEN}✔ All emulator containers stopped.${NC}"
    exit 0
fi

check_backend() {
    echo -e "${CYAN}▶ Checking backend API Gateway status...${NC}"
    if curl -s -f -m 3 http://localhost:8080/api/be_fa/events >/dev/null 2>&1; then
        echo -e "${GREEN}✔ Backend API Gateway is reachable at http://localhost:8080${NC}"
    else
        echo -e "${YELLOW}======================================================================${NC}"
        echo -e "${YELLOW} ⚠️  WARNING: Backend API at http://localhost:8080 is not reachable!${NC}"
        echo -e "${YELLOW}    The mobile app needs the backend microservices to fetch events.${NC}"
        echo -e "${YELLOW}    Please make sure to run: ./restart.sh in another terminal${NC}"
        echo -e "${YELLOW}======================================================================${NC}"
    fi
}

# Ensure www/ has assets
if [ ! -f "${SCRIPT_DIR}/www/index.html" ]; then
    echo -e "${YELLOW}Web assets missing in ${SCRIPT_DIR}/www. Building frontend first...${NC}"
    "${SCRIPT_DIR}/build_apk.sh" --${PREFERRED_TOOL}
fi

if [[ "${MODE}" == "web" ]]; then
    check_backend
    echo -e "${CYAN}======================================================================${NC}"
    echo -e "${CYAN} 🚀 Starting Web Mobile Device Simulator${NC}"
    echo -e "${CYAN}======================================================================${NC}"
    echo -e "URL:            ${GREEN}http://localhost:8000${NC}"
    echo -e "Target Gateway: ${YELLOW}http://localhost:8080${NC}"
    echo -e "Using engine:   ${YELLOW}${CONTAINER_CMD}${NC}"
    echo -e "Press Ctrl+C to stop."
    echo -e "${CYAN}======================================================================${NC}"

    # Open browser in background if display is available
    if [ -n "${DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
        (sleep 2 && xdg-open "http://localhost:8000" >/dev/null 2>&1) &
    fi

    if command -v node >/dev/null 2>&1; then
        exec node "${SCRIPT_DIR}/emulator/server.js"
    else
        echo -e "Using ${YELLOW}${CONTAINER_CMD} node:20-alpine${NC} to serve the simulator..."
        # Clean any existing container
        ${CONTAINER_CMD} rm -f festival_maps_web_emulator 2>/dev/null || true

        # Run container in background so bash can trap SIGINT (Ctrl+C) instantly
        ${CONTAINER_CMD} run --init --rm -i \
            $([ -t 0 ] && echo "-t") \
            --name festival_maps_web_emulator \
            --net=host \
            -v "${SCRIPT_DIR}:/workspace:z" \
            -w /workspace/emulator \
            docker.io/library/node:20-alpine \
            node server.js &
        CONTAINER_PID=$!

        cleanup() {
            echo -e "\n${CYAN}Stopping web emulator...${NC}"
            trap - SIGINT SIGTERM EXIT
            ${CONTAINER_CMD} stop -t 1 festival_maps_web_emulator 2>/dev/null || true
            ${CONTAINER_CMD} rm -f festival_maps_web_emulator 2>/dev/null || true
            wait "$CONTAINER_PID" 2>/dev/null || true
            exit 0
        }
        trap cleanup SIGINT SIGTERM EXIT

        wait "$CONTAINER_PID" 2>/dev/null || true
    fi

elif [[ "${MODE}" == "android" ]]; then
    check_backend
    echo -e "${CYAN}======================================================================${NC}"
    echo -e "${CYAN} 🤖 Starting Containerized Android OS Emulator${NC}"
    echo -e "${CYAN}======================================================================${NC}"
    echo -e "Using engine:  ${YELLOW}${CONTAINER_CMD}${NC}"
    echo -e "Using compose: ${YELLOW}${COMPOSE_CMD}${NC}"

    if [ ! -c /dev/kvm ]; then
        echo -e "${YELLOW}WARNING: /dev/kvm device node not found. Hardware acceleration may not be available.${NC}"
    fi

    # 1. Acquire sudo privileges for hardware acceleration & device access
    echo -e "${CYAN}▶ Acquiring root privileges for KVM hardware acceleration...${NC}"
    sudo -v

    # 2. Ensure APK is built
    if [ ! -f "$APK_FILE" ]; then
        echo -e "${YELLOW}Notice: ${APK_FILE} not found yet. Running build first...${NC}"
        "${SCRIPT_DIR}/build_apk.sh" --${PREFERRED_TOOL}
    fi

    # 3. Launch the Android emulator container via sudo
    echo -e "${CYAN}▶ Launching Android emulator via sudo ${COMPOSE_CMD}...${NC}"
    sudo ${COMPOSE_CMD} -f "${SCRIPT_DIR}/docker-compose.emulator.yml" up -d

    # 4. Wait for Android to boot
    echo ""
    echo -e "${CYAN}▶ Waiting for Android virtual device to finish booting...${NC}"
    echo -e "${YELLOW}  (This usually takes about 60–90 seconds on first boot)${NC}"

    BOOT_COMPLETED=""
    ATTEMPTS=0
    MAX_ATTEMPTS=75 # up to 2.5 minutes (75 * 2s)

    while [[ "$BOOT_COMPLETED" != "1" && $ATTEMPTS -lt $MAX_ATTEMPTS ]]; do
        sleep 2
        ATTEMPTS=$((ATTEMPTS + 1))
        BOOT_COMPLETED=$(sudo ${CONTAINER_CMD} exec festival_maps_android_emulator adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n' || true)
        if (( ATTEMPTS % 5 == 0 )); then
            echo -e "   ⏳ Still booting Android OS... ($((ATTEMPTS * 2))s elapsed)"
        fi
    done

    if [[ "$BOOT_COMPLETED" != "1" ]]; then
        echo -e "${YELLOW}⚠ Android boot check timed out or emulator is still initializing.${NC}"
        echo -e "${YELLOW}  Attempting APK install now...${NC}"
    else
        echo -e "${GREEN}✔ Android OS is fully booted and ready!${NC}"
    fi

    # 5. Copy APK into /tmp
    echo -e "${CYAN}▶ [1/4] Copying APK into container /tmp...${NC}"
    sudo ${CONTAINER_CMD} cp "${APK_FILE}" festival_maps_android_emulator:/tmp/app-debug.apk

    # 6. Install APK via ADB
    echo -e "${CYAN}▶ [2/4] Installing APK via ADB...${NC}"
    sudo ${CONTAINER_CMD} exec festival_maps_android_emulator adb install -r /tmp/app-debug.apk

    # 7. Configure ADB reverse port forwarding (port 8080) from host to emulator
    echo -e "${CYAN}▶ [3/4] Configuring reverse port forwarding for API Gateway (port 8080)...${NC}"
    ${CONTAINER_CMD} rm -f festival_adb_bridge 2>/dev/null || true
    if command -v adb >/dev/null 2>&1; then
        adb connect 127.0.0.1:5555 2>/dev/null || true
        adb -s 127.0.0.1:5555 reverse tcp:8080 tcp:8080 2>/dev/null || true
    else
        ${CONTAINER_CMD} run -d --name festival_adb_bridge --net=host \
            cordova-android-builder \
            /bin/bash -c "adb connect 127.0.0.1:5555 && adb -s 127.0.0.1:5555 reverse tcp:8080 tcp:8080 && tail -f /dev/null" >/dev/null 2>&1 || true
    fi

    # 8. Launch the FestivalMap application
    echo -e "${CYAN}▶ [4/4] Launching FestivalMap application...${NC}"
    sudo ${CONTAINER_CMD} exec festival_maps_android_emulator adb shell am start -n com.festivalmaps.app/.MainActivity

    echo ""
    echo -e "${GREEN}======================================================================${NC}"
    echo -e "${GREEN}  🎉 FestivalMap Android App is Live!${NC}"
    echo -e "${GREEN}======================================================================${NC}"
    echo -e "Interactive Screen: ${GREEN}http://localhost:6080${NC} (Click Connect)"
    echo -e "To view logs:       ${YELLOW}sudo ${CONTAINER_CMD} logs -f festival_maps_android_emulator${NC}"
    echo -e "To stop emulator:   ${YELLOW}./run_emulator.sh --stop${NC}"
    echo -e "${GREEN}======================================================================${NC}"

    # Open web viewer in browser if desktop session is active
    if [ -n "${DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
        (sleep 1 && xdg-open "http://localhost:6080" >/dev/null 2>&1) &
    fi

elif [[ "${MODE}" == "device" ]]; then
    check_backend
    echo -e "${CYAN}======================================================================${NC}"
    echo -e "${CYAN} 📲 Installing APK via ADB${NC}"
    echo -e "${CYAN}======================================================================${NC}"
    if ! command -v adb >/dev/null 2>&1; then
        echo -e "${RED}[ERROR] 'adb' command not found on host. Ensure Android SDK platform-tools are installed and in PATH.${NC}"
        exit 1
    fi

    if [ ! -f "$APK_FILE" ]; then
        echo -e "${YELLOW}APK not found at ${APK_FILE}. Running build first...${NC}"
        "${SCRIPT_DIR}/build_apk.sh" --${PREFERRED_TOOL}
    fi

    echo "Checking connected devices..."
    adb devices
    echo -e "${CYAN}Installing ${APK_FILE}...${NC}"
    adb install -r "${APK_FILE}"
    echo -e "${CYAN}Configuring reverse port forwarding (port 8080)...${NC}"
    adb reverse tcp:8080 tcp:8080 2>/dev/null || true
    echo -e "${CYAN}Launching app...${NC}"
    adb shell am start -n com.festivalmaps.app/.MainActivity
    echo -e "${GREEN}✔ App launched successfully!${NC}"
fi
