import { EventProvider } from './event-provider.interface';
import { FestivalEvent } from '../types';
import { FestivalAggregatorCore } from '@shared/aggregator';
import { CordovaHttpTransport } from '../transport/cordova-http.transport';
import { RemoteEventProvider } from './remote-event-provider';

const CACHE_KEY_EVENTS = 'fm_local_events_cache';
const CACHE_KEY_TIME = 'fm_local_events_time';

export class LocalEventProvider implements EventProvider {
  private aggregator: FestivalAggregatorCore;
  private remoteFallback: RemoteEventProvider;

  constructor() {
    this.aggregator = new FestivalAggregatorCore(
      new CordovaHttpTransport(),
      (msg) => console.log(`[LocalEventProvider] ${msg}`),
    );
    this.remoteFallback = new RemoteEventProvider();

    // Warm up in-memory cache from localStorage if available
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage(): FestivalEvent[] | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const cachedStr = localStorage.getItem(CACHE_KEY_EVENTS);
      if (cachedStr) {
        const parsed = JSON.parse(cachedStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[LocalEventProvider] Failed to read localStorage cache', e);
    }
    return null;
  }

  private saveToLocalStorage(events: FestivalEvent[]): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(CACHE_KEY_EVENTS, JSON.stringify(events));
        localStorage.setItem(CACHE_KEY_TIME, String(Date.now()));
      }
    } catch (e) {
      console.warn('[LocalEventProvider] Failed to save to localStorage cache', e);
    }
  }

  async getEvents(forceRefresh = false): Promise<FestivalEvent[]> {
    try {
      await CordovaHttpTransport.waitForReady();
      const rawPopups = await this.aggregator.getEvents(forceRefresh);

      if (Array.isArray(rawPopups) && rawPopups.length > 0) {
        const events: FestivalEvent[] = rawPopups.map((item, index) => ({
          id: `${item.lat}_${item.lng}_${index}`,
          lat: typeof item.lat === 'string' ? parseFloat(item.lat) : item.lat,
          lng: typeof item.lng === 'string' ? parseFloat(item.lng) : item.lng,
          content: item.content || '',
          evt_type: item.evt_type || 'balfolk',
          start_date: item.start_date,
          end_date: item.end_date,
        }));

        this.saveToLocalStorage(events);
        return events;
      }
    } catch (err) {
      console.warn('[LocalEventProvider] Local aggregation failed, trying remote fallback...', err);
    }

    // Try remote server fallback if local aggregation failed or yielded 0 events
    try {
      console.log('[LocalEventProvider] Attempting remote server fallback...');
      const remoteEvents = await this.remoteFallback.getEvents();
      if (Array.isArray(remoteEvents) && remoteEvents.length > 0) {
        console.log(`[LocalEventProvider] Remote fallback retrieved ${remoteEvents.length} events.`);
        this.saveToLocalStorage(remoteEvents);
        return remoteEvents;
      }
    } catch (err) {
      console.warn('[LocalEventProvider] Remote fallback also failed:', err);
    }

    // Offline fallback from localStorage
    const cached = this.loadFromLocalStorage();
    if (cached && cached.length > 0) {
      console.log(`[LocalEventProvider] Serving ${cached.length} offline cached events.`);
      return cached;
    }

    return [];
  }
}
