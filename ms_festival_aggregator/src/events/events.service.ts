import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';
import { EventPopup, AgendaTradResponse } from './interfaces/event.interface';

@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);
  private cachedEvents: EventPopup[] = [];
  private lastFetchTime: number = 0;
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  async onModuleInit() {
    this.logger.log('Initializing EventsService and warming up cache...');
    try {
      await this.getEvents();
    } catch (err) {
      this.logger.warn(`Initial cache warmup failed: ${err.message}`);
    }
  }

  async getEvents(): Promise<EventPopup[]> {
    const now = Date.now();
    if (this.cachedEvents.length > 0 && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      this.logger.log(`Returning ${this.cachedEvents.length} cached events (age: ${Math.round((now - this.lastFetchTime) / 1000)}s)`);
      return this.cachedEvents;
    }

    try {
      this.logger.log('Cache expired or empty. Fetching fresh events from agendatrad.org...');
      const freshEvents = await this.fetchFromAgendaTrad();
      if (freshEvents.length > 0) {
        this.cachedEvents = freshEvents;
        this.lastFetchTime = now;
        this.logger.log(`Successfully fetched and cached ${freshEvents.length} events.`);
      } else if (this.cachedEvents.length === 0) {
        this.cachedEvents = this.getFallbackEvents();
        this.lastFetchTime = now;
      }
    } catch (error) {
      this.logger.error(`Error fetching events from agendatrad: ${error.message}`);
      if (this.cachedEvents.length === 0) {
        this.logger.warn('No cached data available; loading fallback sample events.');
        this.cachedEvents = this.getFallbackEvents();
        this.lastFetchTime = now;
      }
    }

    return this.cachedEvents;
  }

  private async fetchFromAgendaTrad(): Promise<EventPopup[]> {
    const userAgent = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

    // Step 1: Request the map page to acquire session cookies
    const mapPageResponse = await axios.get('https://agendatrad.org/calendar/map', {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 10000,
    });

    const rawCookies = mapPageResponse.headers['set-cookie'] || [];
    const cookieHeader = rawCookies.map((c: string) => c.split(';')[0]).join('; ');

    // Step 2: Build dynamic dates
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const dateStartInput = `${day}/${month}/${year}`;
    const dateStart = `${year}-${month}-${day}`;

    // Step 3: Build multipart/form-data payload
    const form = new FormData();
    form.append('_method', 'POST');
    form.append('data[Event][date_startInput]', dateStartInput);
    form.append('data[Event][date_start]', dateStart);
    form.append('data[Event][bounds]', '-10.0,34.0,35.0,60.0'); // Europe wide bounds
    form.append('data[Event][zoom]', '5');
    form.append('data[Check][types]', '1');

    const eventTypes = [1, 2, 3, 4, 5, 6, 8, 9, 11, 12];
    eventTypes.forEach(type => {
      form.append('data[EventType][EventType][]', String(type));
    });

    // Step 4: Post request
    const response = await axios.post<AgendaTradResponse>(
      'https://agendatrad.org/calendar/map.json',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'User-Agent': userAgent,
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://agendatrad.org/calendar/map',
          'Origin': 'https://agendatrad.org',
          'Cookie': cookieHeader,
        },
        timeout: 15000,
      },
    );

    if (!response.data || !Array.isArray(response.data.popups)) {
      return [];
    }

    return response.data.popups.map(item => {
      const rawContent = item.content || '';

      // Extract date text from the starting <h4> tag if present and convert to ISO YYYY-MM-DD
      const dateMatch = rawContent.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
      const rawDate = dateMatch ? dateMatch[1].replace(/<[^>]*>/g, '').trim() : undefined;
      const isoDate = this.parseDateToIso(rawDate);

      // Fix relative links & images
      let sanitizedContent = rawContent;
      sanitizedContent = sanitizedContent.replace(/href="\/([^"]+)"/g, 'href="https://agendatrad.org/$1" target="_blank" rel="noopener noreferrer"');
      sanitizedContent = sanitizedContent.replace(/src="\/([^"]+)"/g, 'src="https://agendatrad.org/$1"');

      return {
        lat: typeof item.lat === 'string' ? parseFloat(item.lat) : item.lat,
        lng: typeof item.lng === 'string' ? parseFloat(item.lng) : item.lng,
        content: sanitizedContent,
        ...(isoDate ? { date: isoDate } : {}),
      };
    });
  }

  private static readonly MONTH_MAP: Record<string, string> = {
    'janvier': '01', 'janv': '01', 'jan': '01', 'gennaio': '01', 'gen': '01',
    'fevrier': '02', 'fevr': '02', 'fev': '02', 'febbraio': '02', 'feb': '02',
    'mars': '03', 'marzo': '03', 'mar': '03',
    'avril': '04', 'avr': '04', 'aprile': '04', 'apr': '04',
    'mai': '05', 'maggio': '05', 'mag': '05',
    'juin': '06', 'giugno': '06', 'giu': '06',
    'juillet': '07', 'juil': '07', 'jul': '07', 'luglio': '07', 'lug': '07',
    'aout': '08', 'aou': '08', 'agosto': '08', 'ago': '08',
    'septembre': '09', 'sept': '09', 'sep': '09', 'settembre': '09', 'sett': '09', 'set': '09',
    'octobre': '10', 'oct': '10', 'ottobre': '10', 'ott': '10',
    'novembre': '11', 'nov': '11',
    'decembre': '12', 'dec': '12', 'dicembre': '12', 'dic': '12',
  };

  private normalizeText(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private parseDateToIso(rawDate?: string): string | undefined {
    if (!rawDate) return undefined;

    const cleaned = rawDate.trim().replace(/\./g, '');

    // 1. Direct match YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      return cleaned;
    }

    // 2. Direct match DD/MM/YYYY
    const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const [, d, m, y] = slashMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // 3. Textual date parsing (French / Italian) e.g. "vendredi 28 août 2026", "martedì 1 settembre 2026"
    const tokens = cleaned.split(/\s+/);
    let year: string | undefined;
    let month: string | undefined;
    let day: string | undefined;

    for (const token of tokens) {
      if (/^\d{4}$/.test(token)) {
        year = token;
      } else if (/^\d{1,2}$/.test(token) && !day) {
        day = token.padStart(2, '0');
      } else {
        const normalizedToken = this.normalizeText(token);
        if (EventsService.MONTH_MAP[normalizedToken]) {
          month = EventsService.MONTH_MAP[normalizedToken];
        }
      }
    }

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }

    return rawDate;
  }

  private getFallbackEvents(): EventPopup[] {
    return [
      {
        lat: 45.5422,
        lng: 11.7861,
        date: '2026-09-01',
        content: '<h4>Mardi 01 sept. 2026</h4><p>Padova, Italy</p><p>Traditional folk dance & live concert.</p>',
      },
      {
        lat: 45.4602,
        lng: 11.7449,
        date: '2026-08-28',
        content: '<h4>Vendredi 28 août 2026</h4><p>Veneto, Italy</p><p>Live folk orchestra performance.</p>',
      },
      {
        lat: 43.6047,
        lng: 1.4442,
        date: '2026-09-12',
        content: '<h4>Samedi 12 sept. 2026</h4><p>Toulouse, France</p><p>Workshops, bals folk, concerts.</p>',
      },
      {
        lat: 48.8566,
        lng: 2.3522,
        date: '2026-09-20',
        content: '<h4>Dimanche 20 sept. 2026</h4><p>Paris, France</p><p>Live neo-trad band sets.</p>',
      },
    ];
  }
}
