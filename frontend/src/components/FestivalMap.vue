<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import L from 'leaflet';
import 'leaflet.markercluster';
import DOMPurify from 'dompurify';
import { FestivalEvent } from '../types';

// Fix default Leaflet icon paths in Vite
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const mapContainer = ref<HTMLElement | null>(null);
const events = ref<FestivalEvent[]>([]);
const isLoading = ref<boolean>(false);
const errorMessage = ref<string | null>(null);

// Date Filtering State
const startDate = ref<string>('');
const endDate = ref<string>('');
const activePreset = ref<string>('all');

let map: L.Map | null = null;
let clusterGroup: any = null;

const initMap = () => {
  if (!mapContainer.value) return;

  // Initialize Map centered on Western/Central Europe
  map = L.map(mapContainer.value, {
    center: [46.5, 5.5],
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

  // Marker cluster group for smooth rendering
  if ((L as any).markerClusterGroup) {
    clusterGroup = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
    });
    map.addLayer(clusterGroup);
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
};

const filteredEvents = computed(() => {
  return events.value.filter((event) => {
    if (!event.date) return true;
    if (startDate.value && event.date < startDate.value) return false;
    if (endDate.value && event.date > endDate.value) return false;
    return true;
  });
});

const renderMarkers = (eventList: FestivalEvent[]) => {
  if (!map) return;

  if (clusterGroup) {
    clusterGroup.clearLayers();
  }

  const bounds = L.latLngBounds([]);

  eventList.forEach((event) => {
    if (event.lat != null && event.lng != null) {
      const sanitizedContent = DOMPurify.sanitize(event.content || 'No details provided');
      
      const marker = L.marker([event.lat, event.lng]);
      marker.bindPopup(sanitizedContent, {
        maxWidth: 320,
        className: 'custom-festival-popup',
      });

      if (clusterGroup) {
        clusterGroup.addLayer(marker);
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
      <!-- Top Row: Title, Counter & Actions -->
      <div class="header-main-row">
        <div class="map-title">
          <span>🎪</span>
          <span>Festival Aggregator</span>
        </div>
        <div class="event-count-badge" v-if="!isLoading">
          {{ filteredEvents.length }} <span v-if="filteredEvents.length !== events.length">of {{ events.length }}</span> events
        </div>
        <button class="refresh-btn" @click="fetchEvents" :disabled="isLoading">
          <span v-if="isLoading">⏳</span>
          <span v-else>🔄 Refresh</span>
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
            v-if="startDate || endDate" 
            class="clear-filter-btn" 
            @click="clearFilter"
            title="Clear date filter">
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
