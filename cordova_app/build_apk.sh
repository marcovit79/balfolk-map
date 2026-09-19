#!/usr/bin/env bash
set -e

# ==============================================================================
# Festival Maps - Android APK Build Pipeline
# ==============================================================================

# Text colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"
CORDOVA_DIR="${SCRIPT_DIR}"
OUTPUT_DIR="${CORDOVA_DIR}/output"

# Default parameters (aligned with restart.sh)
DEFAULT_API_BASE="http://10.0.2.2:8080"
API_BASE="${DEFAULT_API_BASE}"
PREFERRED_TOOL="podman"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --api)
            API_BASE="$2"
            shift 2
            ;;
        --docker)
            PREFERRED_TOOL="docker"
            shift
            ;;
        --podman)
            PREFERRED_TOOL="podman"
            shift
            ;;
        --help|-h)
            echo "Festival Maps - Android APK Build Pipeline"
            echo ""
            echo "Usage: ./build_apk.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --api <URL>     Set API Gateway base URL for APK (default: http://10.0.2.2:8080)"
            echo "  --podman        Explicitly use Podman (default)"
            echo "  --docker        Explicitly use Docker"
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

    if command -v podman >/dev/null 2>&1; then
        echo "podman"
    elif command -v docker >/dev/null 2>&1; then
        echo "docker"
    else
        echo -e "${RED}[ERROR] Neither podman nor docker could be found.${NC}" >&2
        exit 1
    fi
}

CONTAINER_CMD=$(detect_container_engine)

echo -e "${CYAN}======================================================================${NC}"
echo -e "${CYAN}  Festival Maps - Android APK Build Pipeline${NC}"
echo -e "${CYAN}======================================================================${NC}"
echo -e "API Base URL: ${YELLOW}${API_BASE}${NC}"
echo -e "Frontend:     ${FRONTEND_DIR}"
echo -e "Cordova:      ${CORDOVA_DIR}"
echo -e "Output:       ${OUTPUT_DIR}"
echo -e "Container:    ${YELLOW}${CONTAINER_CMD}${NC}"
echo -e "${CYAN}======================================================================${NC}"

# 1. Build Vue Frontend
echo -e "${CYAN}▶ [1/4] Building Frontend assets...${NC}"
if command -v npm >/dev/null 2>&1; then
    echo "Using host npm..."
    (cd "${FRONTEND_DIR}" && npm install && npm run build)
else
    echo -e "Host npm not found. Using ${YELLOW}${CONTAINER_CMD} node:20-alpine${NC} container..."
    ${CONTAINER_CMD} run --rm \
        -v "${FRONTEND_DIR}:/app:z" \
        -w /app \
        docker.io/library/node:20-alpine \
        sh -c "npm install && npm run build"
fi

# 2. Sync to Cordova www/
echo -e "${CYAN}▶ [2/4] Syncing compiled assets to Cordova www/...${NC}"
rm -rf "${CORDOVA_DIR}/www"/*
mkdir -p "${CORDOVA_DIR}/www"
cp -r "${FRONTEND_DIR}/dist"/* "${CORDOVA_DIR}/www/"

# Inject cordova.js & runtime configuration if not present
INDEX_HTML="${CORDOVA_DIR}/www/index.html"
if [ -f "${INDEX_HTML}" ]; then
    echo "Injecting cordova.js and runtime API configuration..."
    python3 -c "
import sys
path = sys.argv[1]
api_base = sys.argv[2]
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()
if 'cordova.js' not in html:
    injection = f'<script>if (window.location.protocol === \"file:\" || !!window.cordova || window.location.hostname === \"localhost\") {{ window.API_BASE_URL = window.API_BASE_URL || \"{api_base}\"; }}</script>\\n<script src=\"cordova.js\"></script>\\n</body>'
    html = html.replace('</body>', injection)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(html)
" "${INDEX_HTML}" "${API_BASE}"
fi

# 3. Build/Ensure Cordova Android builder container image
IMAGE_NAME="cordova-android-builder:latest"
echo -e "${CYAN}▶ [3/4] Ensuring build container '${IMAGE_NAME}' is ready...${NC}"
if ! ${CONTAINER_CMD} images | grep -q "cordova-android-builder"; then
    echo "Building Android build image (this may take a few minutes on first run)..."
    ${CONTAINER_CMD} build -t "${IMAGE_NAME}" -f "${CORDOVA_DIR}/Dockerfile.build" "${CORDOVA_DIR}"
else
    echo -e "Build image '${IMAGE_NAME}' is already present."
fi

# 4. Run Build inside container
echo -e "${CYAN}▶ [4/4] Compiling Android APK with Cordova...${NC}"
mkdir -p "${OUTPUT_DIR}"

${CONTAINER_CMD} run --rm \
    -v "${CORDOVA_DIR}:/workspace:z" \
    "${IMAGE_NAME}" \
    /bin/bash /workspace/scripts/docker_build_apk.sh

echo ""
echo -e "${GREEN}======================================================================${NC}"
echo -e "${GREEN}  🎉 APK BUILD FINISHED SUCCESSFULLY!${NC}"
echo -e "${GREEN}======================================================================${NC}"
if [ -f "${OUTPUT_DIR}/app-debug.apk" ]; then
    ls -lh "${OUTPUT_DIR}/app-debug.apk"
    echo ""
    echo "Next steps:"
    echo "  - Run web emulation:     ./run_emulator.sh --web"
    echo "  - Run Android emulator:  ./run_emulator.sh --android"
    echo "  - Install to device:     adb install -r ${OUTPUT_DIR}/app-debug.apk"
fi
echo -e "${GREEN}======================================================================${NC}"
