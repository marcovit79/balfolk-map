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
const activePreset = ref<string>('all');
const selectedType = ref<'all' | 'balfolk' | 'sagra'>('all');

let map: L.Map | null = null;
let balfolkClusterGroup: any = null;
let sagraClusterGroup: any = null;

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

const fetchEvents = async () => {
  isLoading.value = true;
  errorMessage.value = null;

  try {
    const response = await fetch('/api/be_fa/events');
    if (!response.ok) {
      throw new Error(`API returned HTTP status ${response.status}`);
    }

    const data: FestivalEvent[] = await response.json();
    events.value = data;
    renderMarkers(filteredEvents.value);
  } catch (error: any) {
    console.error('Failed to load events:', error);
    errorMessage.value = `Error loading events: ${error.message || 'Unable to connect'}`;
  } finally {
    isLoading.value = false;
  }
};

const setPreset = (preset: 'all' | 'weekend' | '7days' | '30days') => {
  activePreset.value = preset;
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

const onCustomDateChange = () => {
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
    // Date Filter
    if (startDate.value && event.date && event.date < startDate.value) return false;
    if (endDate.value && event.date && event.date > endDate.value) return false;
    return true;
  });
});

const renderMarkers = (eventList: FestivalEvent[]) => {
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

  // Fit bounds if markers exist
  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  }
};

watch(filteredEvents, (newList) => {
  renderMarkers(newList);
});

onMounted(() => {
  initMap();
  fetchEvents();
});
</script>

<template>
  <div class="festival-map-wrapper">
    <!-- Floating HUD Control & Filter Panel -->
    <header class="map-overlay-header">
      <!-- Top Row: Title, Counter, Type Selector & Refresh -->
      <div class="header-main-row">
        <div class="map-title">
          <span>🎪</span>
          <span>Festival Aggregator</span>
        </div>

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

        <div class="event-count-badge" v-if="!isLoading">
          {{ filteredEvents.length }} <span v-if="filteredEvents.length !== events.length">of {{ events.length }}</span>
        </div>
        <button class="refresh-btn" @click="fetchEvents" :disabled="isLoading">
          <span v-if="isLoading">⏳</span>
          <span v-else>🔄</span>
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
              @change="onCustomDateChange" 
            />
          </div>
          <div class="date-input-group">
            <label for="end-date">To:</label>
            <input 
              id="end-date"
              type="date" 
              v-model="endDate" 
              @change="onCustomDateChange" 
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
