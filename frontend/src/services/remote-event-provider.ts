import { EventProvider } from './event-provider.interface';
import { FestivalEvent } from '../types';

export class RemoteEventProvider implements EventProvider {
  private workingApiBase: string | null = null;

  private getCandidateApiBases(): string[] {
    const isCordova =
      typeof window !== 'undefined' &&
      (!!(window as any).cordova ||
        window.location.protocol === 'file:' ||
        (typeof window.navigator !== 'undefined' &&
          /android/i.test(window.navigator.userAgent) &&
          window.location.protocol.startsWith('http') &&
          window.location.hostname === 'localhost'));

    const candidates: string[] = [];

    if (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' && window.location.origin !== 'file://') {
      candidates.push(window.location.origin);
    }
    candidates.push('');

    const configured =
      typeof (window as any).API_BASE_URL === 'string' && (window as any).API_BASE_URL.trim() !== ''
        ? (window as any).API_BASE_URL.replace(/\/$/, '')
        : '';

    if (configured) {
      candidates.push(configured);
    }

    if (isCordova) {
      candidates.push('http://10.0.2.2:8080');
      candidates.push('http://localhost:8080');
      candidates.push('http://127.0.0.1:8080');
    }

    return Array.from(new Set(candidates));
  }

  private async probeWorkingBase(): Promise<string> {
    if (this.workingApiBase !== null) {
      return this.workingApiBase;
    }

    const candidates = this.getCandidateApiBases();
    for (const base of candidates) {
      const url = `${base}/api/be_fa/events`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          this.workingApiBase = base;
          return base;
        }
      } catch {
        // Probe next candidate
      }
    }

    return '';
  }

  async getEvents(): Promise<FestivalEvent[]> {
    try {
      const base = await this.probeWorkingBase();
      const url = `${base}/api/be_fa/events`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Invalid response format: expected an array of events');
      }

      const events = data.map((item: any, index: number) => ({
        id: `${item.lat}_${item.lng}_${index}`,
        lat: typeof item.lat === 'string' ? parseFloat(item.lat) : item.lat,
        lng: typeof item.lng === 'string' ? parseFloat(item.lng) : item.lng,
        content: item.content || '',
        evt_type: item.evt_type || 'balfolk',
        start_date: item.start_date,
        end_date: item.end_date,
      }));

      // Cache successful response
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('fm_local_events_cache', JSON.stringify(events));
          localStorage.setItem('fm_local_events_time', String(Date.now()));
        }
      } catch {}

      return events;
    } catch (err) {
      console.warn('[RemoteEventProvider] Remote fetch failed, trying local storage cache...', err);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const cachedStr = localStorage.getItem('fm_local_events_cache');
          if (cachedStr) {
            const parsed = JSON.parse(cachedStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              console.log(`[RemoteEventProvider] Serving ${parsed.length} offline cached events.`);
              return parsed;
            }
          }
        }
      } catch {}
      throw err;
    }
  }
}
