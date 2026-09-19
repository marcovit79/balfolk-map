<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import L from 'leaflet';
import 'leaflet.markercluster';
import DOMPurify from 'dompurify';
import { FestivalEvent } from '../types';

const mapContainer = ref<HTMLElement | null>(null);
const events = ref<FestivalEvent[]>([]);
const isLoading = ref<boolean>(false);
const errorMessage = ref<string | null>(null);

// Date & Type Filtering State
const startDate = ref<string>('');
const endDate = ref<string>('');
const isDateBound = ref<boolean>(false);
const activePreset = ref<string>('all');
const selectedType = ref<'all' | 'balfolk' | 'sagra'>('all');
// On mobile devices, default to collapsed so the map is fully visible; on desktop default to expanded
const isFilterCollapsed = ref<boolean>(
  typeof window !== 'undefined' ? window.innerWidth <= 768 : false
);

const toggleFilterPanel = () => {
  isFilterCollapsed.value = !isFilterCollapsed.value;
  setTimeout(() => {
    map?.invalidateSize();
  }, 250);
};

let map: L.Map | null = null;
let balfolkClusterGroup: any = null;
let sagraClusterGroup: any = null;
let isInitialFitDone = false;

// Custom Marker Icons for different event types
const createCustomIcon = (evtType?: string) => {
  const isBalfolk = evtType === 'balfolk';
  const pinClass = isBalfolk ? 'pin-balfolk' : 'pin-sagra';
  const iconEmoji = isBalfolk ? '🎵' : '🥘';

  return L.divIcon({
    className: 'custom-pin-wrapper',
    html: `
      <div class="custom-map-pin ${pinClass}">
        <div class="pin-badge">${iconEmoji}</div>
        <div class="pin-tip"></div>
      </div>
    `,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -36],
  });
};

const initMap = () => {
  if (!mapContainer.value) return;

  // Initialize Map centered on Western/Central Europe
  map = L.map(mapContainer.value, {
    center: [44.5, 11.5],
    zoom: 6,
    zoomControl: false,
  });

  // Add zoom control on bottom-right for clean view
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // OpenStreetMap Layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
  }).addTo(map);

  // Initialize separate Marker Cluster Groups so Balfolk and Sagra are NEVER clustered together
  if ((L as any).markerClusterGroup) {
    // 1. Balfolk cluster group (Royal Blue themed)
    balfolkClusterGroup = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      iconCreateFunction: (cluster: any) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="cluster-bubble cluster-balfolk"><span>🎵 ${count}</span></div>`,
          className: 'custom-cluster-wrapper',
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });
      },
    });
    map.addLayer(balfolkClusterGroup);

    // 2. Sagra cluster group (Warm Orange themed)
    sagraClusterGroup = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      iconCreateFunction: (cluster: any) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="cluster-bubble cluster-sagra"><span>🥘 ${count}</span></div>`,
          className: 'custom-cluster-wrapper',
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });
      },
    });
    map.addLayer(sagraClusterGroup);
  }
};

let workingApiBase: string | null = null;

const getCandidateApiBases = (): string[] => {
  const isCordova = typeof window !== 'undefined' && (
    !!(window as any).cordova ||
    window.location.protocol === 'file:' ||
    (typeof window.navigator !== 'undefined' && /android/i.test(window.navigator.userAgent) && window.location.protocol.startsWith('http') && window.location.hostname === 'localhost')
  );

  const candidates: string[] = [];

  const configured = typeof (window as any).API_BASE_URL === 'string' && (window as any).API_BASE_URL.trim() !== ''
    ? (window as any).API_BASE_URL.replace(/\/$/, '')
    : null;

  const envBase = import.meta.env.VITE_API_BASE_URL
    ? ((import.meta.env.VITE_API_BASE_URL as string) || '').replace(/\/$/, '')
    : null;

  if (isCordova) {
    if (configured) candidates.push(configured);
    if (envBase) candidates.push(envBase);
    candidates.push('http://10.0.2.2:8080');
    candidates.push('http://localhost:8080');
    candidates.push('http://127.0.0.1:8080');
    candidates.push('');
  } else {
    if (configured && !configured.includes('10.0.2.2')) candidates.push(configured);
    if (envBase && !envBase.includes('10.0.2.2')) candidates.push(envBase);
    candidates.push('');
    candidates.push('http://localhost:8080');
  }

  return [...new Set(candidates.filter(c => c !== null))];
};

const fetchEvents = async () => {
  isLoading.value = true;
  errorMessage.value = null;

  const candidates = workingApiBase !== null ? [workingApiBase] : getCandidateApiBases();
  let lastError: any = null;
  let success = false;

  for (const base of candidates) {
    try {
      const url = `${base}/api/be_fa/events`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API returned HTTP status ${response.status}`);
      }

      const data: FestivalEvent[] = await response.json();
      events.value = data;
      workingApiBase = base;
      success = true;

      if (!isInitialFitDone) {
        renderMarkers(filteredEvents.value, true);
        isInitialFitDone = true;
      } else {
        renderMarkers(filteredEvents.value, false);
      }
      break;
    } catch (err: any) {
      lastError = err;
      console.warn(`[FestivalMap] Probe failed for '${base}/api/be_fa/events':`, err.message || err);
    }
  }

  if (!success) {
    console.error('[FestivalMap] All backend API candidate URLs failed:', lastError);
    const attempted = candidates.map(c => c || '(relative /)').join(', ');
    errorMessage.value = `Unable to connect to events API (probed: ${attempted}). Ensure backend stack is running: ./restart.sh`;
  }

  isLoading.value = false;
};

const reloadEvents = () => {
  workingApiBase = null;
  fetchEvents();
};

const setPreset = (preset: 'all' | 'weekend' | '7days' | '30days') => {
  activePreset.value = preset;
  if (preset !== 'all') {
    isDateBound.value = false;
  }
  const now = new Date();
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  if (preset === 'all') {
    startDate.value = '';
    endDate.value = '';
  } else if (preset === '7days') {
    startDate.value = formatDate(now);
    const next7 = new Date(now);
    next7.setDate(next7.getDate() + 7);
    endDate.value = formatDate(next7);
  } else if (preset === '30days') {
    startDate.value = formatDate(now);
    const next30 = new Date(now);
    next30.setDate(next30.getDate() + 30);
    endDate.value = formatDate(next30);
  } else if (preset === 'weekend') {
    const day = now.getDay();
    const distToFriday = (5 - day + 7) % 7;
    const friday = new Date(now);
    friday.setDate(friday.getDate() + distToFriday);
    const sunday = new Date(friday);
    sunday.setDate(sunday.getDate() + 2);
    startDate.value = formatDate(friday);
    endDate.value = formatDate(sunday);
  }
};

const toggleDateBind = () => {
  isDateBound.value = !isDateBound.value;
  if (isDateBound.value) {
    if (startDate.value) {
      endDate.value = startDate.value;
    } else if (endDate.value) {
      startDate.value = endDate.value;
    }
  }
};

const onStartDateChange = () => {
  if (isDateBound.value) {
    endDate.value = startDate.value;
  }
  activePreset.value = 'custom';
};

const onEndDateChange = () => {
  if (isDateBound.value) {
    startDate.value = endDate.value;
  }
  activePreset.value = 'custom';
};

const clearFilter = () => {
  setPreset('all');
  selectedType.value = 'all';
};

const balfolkCount = computed(() => events.value.filter(e => e.evt_type === 'balfolk').length);
const sagraCount = computed(() => events.value.filter(e => e.evt_type === 'sagra').length);

const filteredEvents = computed(() => {
  return events.value.filter((event) => {
    // Type Filter
    if (selectedType.value !== 'all' && event.evt_type !== selectedType.value) {
      return false;
    }
    // Date Filter (Range overlap)
    const evStart = event.start_date || event.end_date;
    const evEnd = event.end_date || event.start_date;

    if (startDate.value && evEnd && evEnd < startDate.value) return false;
    if (endDate.value && evStart && evStart > endDate.value) return false;
    return true;
  });
});

const renderMarkers = (eventList: FestivalEvent[], fitView: boolean = false) => {
  if (!map) return;

  if (balfolkClusterGroup) {
    balfolkClusterGroup.clearLayers();
  }
  if (sagraClusterGroup) {
    sagraClusterGroup.clearLayers();
  }

  const bounds = L.latLngBounds([]);

  eventList.forEach((event) => {
    if (event.lat != null && event.lng != null) {
      const sanitizedContent = DOMPurify.sanitize(event.content || 'No details provided');
      
      const customIcon = createCustomIcon(event.evt_type);
      const marker = L.marker([event.lat, event.lng], { icon: customIcon });
      
      marker.bindPopup(sanitizedContent, {
        maxWidth: 320,
        className: `custom-festival-popup popup-${event.evt_type || 'default'}`,
      });

      // Add marker to its respective type-specific cluster group
      if (event.evt_type === 'balfolk' && balfolkClusterGroup) {
        balfolkClusterGroup.addLayer(marker);
      } else if (event.evt_type === 'sagra' && sagraClusterGroup) {
        sagraClusterGroup.addLayer(marker);
      } else {
        marker.addTo(map!);
      }

      bounds.extend([event.lat, event.lng]);
    }
  });

  // Only fit bounds if explicitly requested (e.g. initial load) to preserve user zoom/pan
  if (fitView && bounds.isValid() && map) {
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  }
};

watch(filteredEvents, (newList) => {
  renderMarkers(newList, false);
});

onMounted(() => {
  initMap();
  setTimeout(() => {
    map?.invalidateSize();
  }, 250);
  setTimeout(() => {
    map?.invalidateSize();
  }, 750);
  window.addEventListener('resize', () => {
    map?.invalidateSize();
  });
  fetchEvents();
});
</script>

<template>
  <div class="festival-map-wrapper">
    <!-- Floating HUD Control & Filter Panel -->
    <header class="map-overlay-header" :class="{ 'is-collapsed': isFilterCollapsed }">
      <!-- Top Row: Title, Counter, Active Filter Summary & Hide/Show Widget -->
      <div class="header-main-row">
        <div 
          class="map-title" 
          @click="toggleFilterPanel" 
          role="button" 
          tabindex="0"
          :title="isFilterCollapsed ? 'Click to show filters' : 'Click to hide filters'"
        >
          <span class="map-logo">🎪</span>
          <span class="title-text-full">Festival Aggregator</span>
          <span class="title-text-short">Festivals</span>
        </div>

        <div class="header-actions">
          <!-- Active filter preview indicator when panel is collapsed -->
          <div v-if="isFilterCollapsed && (selectedType !== 'all' || activePreset !== 'all' || startDate || endDate)" class="active-filter-summary">
            <span v-if="selectedType !== 'all'" class="summary-pill" :class="'pill-' + selectedType">
              {{ selectedType === 'balfolk' ? '🎵 Balfolk' : '🥘 Sagra' }}
            </span>
            <span v-if="activePreset !== 'all'" class="summary-pill">
              📅 {{ activePreset === 'weekend' ? 'Weekend' : activePreset }}
            </span>
          </div>

          <!-- Event Count Badge -->
          <div class="event-count-badge" v-if="!isLoading">
            {{ filteredEvents.length }} <span class="count-total" v-if="filteredEvents.length !== events.length">/ {{ events.length }}</span>
          </div>

          <!-- Quick Refresh Button -->
          <button class="refresh-btn" @click="reloadEvents" :disabled="isLoading" title="Refresh events">
            <span v-if="isLoading">⏳</span>
            <span v-else>🔄</span>
          </button>

          <!-- Hide/Show Filter Widget Toggle Button -->
          <button 
            type="button" 
            class="filter-toggle-btn"
            :class="{ active: !isFilterCollapsed }"
            @click="toggleFilterPanel"
            :aria-expanded="!isFilterCollapsed"
            :title="isFilterCollapsed ? 'Show filters panel' : 'Hide filters panel'"
          >
            <span class="toggle-icon">🎛️</span>
            <span class="toggle-label">{{ isFilterCollapsed ? 'Filters' : 'Hide' }}</span>
            <svg class="chevron-icon" :class="{ rotated: !isFilterCollapsed }" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>

      <!-- Collapsible Body: Event Types, Date Presets & Custom Pickers -->
      <div class="collapsible-filters" v-show="!isFilterCollapsed">
        <!-- Event Type Filters -->
        <div class="type-filter-group">
          <button 
            class="type-pill" 
            :class="{ active: selectedType === 'all' }" 
            @click="selectedType = 'all'">
            All
          </button>
          <button 
            class="type-pill pill-balfolk" 
            :class="{ active: selectedType === 'balfolk' }" 
            @click="selectedType = 'balfolk'">
            <span class="color-dot dot-balfolk"></span>
            🎵 Balfolk ({{ balfolkCount }})
          </button>
          <button 
            class="type-pill pill-sagra" 
            :class="{ active: selectedType === 'sagra' }" 
            @click="selectedType = 'sagra'">
            <span class="color-dot dot-sagra"></span>
            🥘 Sagra ({{ sagraCount }})
          </button>
        </div>

        <!-- Filter Row: Date Presets & Pickers -->
        <div class="header-filter-row">
          <div class="filter-presets">
            <button 
              class="preset-pill" 
              :class="{ active: activePreset === 'all' }" 
              @click="setPreset('all')">
              All Dates
            </button>
            <button 
              class="preset-pill" 
              :class="{ active: activePreset === 'weekend' }" 
              @click="setPreset('weekend')">
              This Weekend
            </button>
            <button 
              class="preset-pill" 
              :class="{ active: activePreset === '7days' }" 
              @click="setPreset('7days')">
              Next 7 Days
            </button>
            <button 
              class="preset-pill" 
              :class="{ active: activePreset === '30days' }" 
              @click="setPreset('30days')">
              Next 30 Days
            </button>
          </div>

          <div class="custom-date-inputs">
            <div class="date-input-group">
              <label for="start-date">From:</label>
              <input 
                id="start-date"
                type="date" 
                v-model="startDate" 
                @input="onStartDateChange"
                @change="onStartDateChange" 
              />
            </div>

            <!-- Bind / Link Toggle Button -->
            <button 
              type="button"
              class="bind-toggle-btn" 
              :class="{ active: isDateBound }" 
              @click="toggleDateBind"
              :title="isDateBound ? 'Dates linked: changes reflect in both (click to unbind)' : 'Link From and To dates (click to bind)'"
              aria-label="Toggle date binding"
            >
              <svg v-if="isDateBound" class="bind-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
              <svg v-else class="bind-svg unlinked" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                <line x1="2" y1="2" x2="22" y2="22"></line>
              </svg>
              <span class="bind-btn-text">{{ isDateBound ? 'Bound' : 'Bind' }}</span>
            </button>

            <div class="date-input-group">
              <label for="end-date">To:</label>
              <input 
                id="end-date"
                type="date" 
                v-model="endDate" 
                @input="onEndDateChange"
                @change="onEndDateChange" 
              />
            </div>
            <button 
              v-if="startDate || endDate || selectedType !== 'all'" 
              class="clear-filter-btn" 
              @click="clearFilter"
              title="Clear all filters">
              ✕ Clear
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Map Fullscreen Container -->
    <div id="map-container" ref="mapContainer"></div>

    <!-- Error Toast -->
    <div v-if="errorMessage" class="status-toast error">
      <span>⚠️</span>
      <span>{{ errorMessage }}</span>
    </div>

    <!-- Loading Toast -->
    <div v-if="isLoading && events.length === 0" class="status-toast loading">
      <span>🌐</span>
      <span>Fetching festival events...</span>
    </div>
  </div>
</template>
