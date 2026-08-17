<script setup lang="ts">
import { onMounted, ref } from 'vue';
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
    renderMarkers(data);
  } catch (error: any) {
    console.error('Failed to load events:', error);
    errorMessage.value = `Error loading events: ${error.message || 'Unable to connect'}`;
  } finally {
    isLoading.value = false;
  }
};

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

onMounted(() => {
  initMap();
  fetchEvents();
});
</script>

<template>
  <div class="festival-map-wrapper">
    <!-- Floating HUD Header -->
    <header class="map-overlay-header">
      <div class="map-title">
        <span>🎪</span>
        <span>Festival Aggregator</span>
      </div>
      <div class="event-count-badge" v-if="!isLoading">
        {{ events.length }} events
      </div>
      <button class="refresh-btn" @click="fetchEvents" :disabled="isLoading">
        <span v-if="isLoading">⏳ Loading...</span>
        <span v-else>🔄 Refresh</span>
      </button>
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
