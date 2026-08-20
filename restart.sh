#!/usr/bin/env bash

# ==============================================================================
# Festival Map Aggregator - Container Build & (Re)start Script
# ==============================================================================
# Usage:
#   ./restart.sh               # Normal restart with rebuild
#   ./restart.sh --shutdown    # Stop and remove running containers without rebuilding
#   ./restart.sh --no-cache    # Force clean rebuild without Docker/Podman cache
#   ./restart.sh --docker      # Force Docker Compose
#   ./restart.sh --podman      # Force Podman Compose
#   ./restart.sh --logs        # Follow container logs after starting
#   ./restart.sh --help        # Show help
# ==============================================================================

set -euo pipefail

# Text colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Determine project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# Default parameters
SHUTDOWN_ONLY=false
NO_CACHE=false
FOLLOW_LOGS=false
PREFERRED_TOOL="podman"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --shutdown|-s|--down|--stop)
      SHUTDOWN_ONLY=true
      shift
      ;;
    --no-cache|-f)
      NO_CACHE=true
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
    --logs|-l)
      FOLLOW_LOGS=true
      shift
      ;;
    --help|-h)
      echo "Festival Map Aggregator - Container Build & Restart Script"
      echo ""
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  -s, --shutdown    Stop and remove all running containers without rebuilding"
      echo "  -f, --no-cache    Rebuild container images from scratch without using cache"
      echo "  -l, --logs        Follow live logs after containers start"
      echo "      --docker      Explicitly use docker-compose / docker compose"
      echo "      --podman      Explicitly use podman-compose"
      echo "  -h, --help        Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}[ERROR] Unknown option: $1${NC}"
      echo "Use '$0 --help' for usage."
      exit 1
      ;;
  esac
done

# Detect Compose CLI tool
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

COMPOSE_CMD=$(detect_compose)

# Handle --shutdown option
if [[ "${SHUTDOWN_ONLY}" == true ]]; then
  echo -e "${CYAN}======================================================================${NC}"
  echo -e "${CYAN} 🛑 Festival Map Aggregator - Shutting Down Stack${NC}"
  echo -e "${CYAN}======================================================================${NC}"
  echo -e "Using engine: ${YELLOW}${COMPOSE_CMD}${NC}"
  echo -e "Project path: ${SCRIPT_DIR}"
  echo ""
  echo -e "${CYAN}▶ Stopping and removing running containers...${NC}"
  ${COMPOSE_CMD} down
  echo ""
  echo -e "${GREEN}✔ Stack successfully shut down!${NC}"
  exit 0
fi

echo -e "${CYAN}======================================================================${NC}"
echo -e "${CYAN} 🎪 Festival Map Aggregator - (Re)starting Stack${NC}"
echo -e "${CYAN}======================================================================${NC}"
echo -e "Using engine: ${YELLOW}${COMPOSE_CMD}${NC}"
echo -e "Project path: ${SCRIPT_DIR}"
echo ""

# Step 1: Tear down running containers
echo -e "${CYAN}▶ [1/3] Stopping and removing existing containers...${NC}"
${COMPOSE_CMD} down || true

# Step 2: Build and start containers
BUILD_FLAGS=("--build" "-d")
if [[ "${NO_CACHE}" == true ]]; then
  echo -e "${YELLOW}▶ [2/3] Building containers (--no-cache) and starting detached...${NC}"
  ${COMPOSE_CMD} build --no-cache
  ${COMPOSE_CMD} up -d
else
  echo -e "${CYAN}▶ [2/3] Building and starting containers detached...${NC}"
  ${COMPOSE_CMD} up "${BUILD_FLAGS[@]}"
fi

# Step 3: Check container status
echo ""
echo -e "${CYAN}▶ [3/3] Checking service status...${NC}"
${COMPOSE_CMD} ps

echo ""
echo -e "${GREEN}✔ Stack successfully (re)started!${NC}"
echo -e "🌐 Application available at: ${GREEN}http://localhost:8080${NC}"
echo ""

# Optional: Follow logs
if [[ "${FOLLOW_LOGS}" == true ]]; then
  echo -e "${YELLOW}Tailing logs (press Ctrl+C to exit)...${NC}"
  ${COMPOSE_CMD} logs -f
fi
