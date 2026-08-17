import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';
import {
  EventPopup,
  AgendaTradResponse,
  TrovaSagreResponse,
} from './interfaces/event.interface';

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
      this.logger.log(
        `Returning ${this.cachedEvents.length} cached events (age: ${Math.round(
          (now - this.lastFetchTime) / 1000,
        )}s)`,
      );
      return this.cachedEvents;
    }

    try {
      this.logger.log('Cache expired or empty. Fetching fresh events from upstream sources...');

      // Concurrently fetch from both AgendaTrad and TrovaSagre
      const [agendaTradResult, trovaSagreResult] = await Promise.allSettled([
        this.fetchFromAgendaTrad(),
        this.fetchFromTrovaSagre(),
      ]);

      const combinedEvents: EventPopup[] = [];

      if (agendaTradResult.status === 'fulfilled') {
        this.logger.log(`Fetched ${agendaTradResult.value.length} events from AgendaTrad.`);
        combinedEvents.push(...agendaTradResult.value);
      } else {
        this.logger.error(
          `AgendaTrad fetch error: ${agendaTradResult.reason?.message || agendaTradResult.reason}`,
        );
      }

      if (trovaSagreResult.status === 'fulfilled') {
        this.logger.log(`Fetched ${trovaSagreResult.value.length} events from TrovaSagre.`);
        combinedEvents.push(...trovaSagreResult.value);
      } else {
        this.logger.error(
          `TrovaSagre fetch error: ${trovaSagreResult.reason?.message || trovaSagreResult.reason}`,
        );
      }

      if (combinedEvents.length > 0) {
        this.cachedEvents = combinedEvents;
        this.lastFetchTime = now;
        this.logger.log(
          `Successfully merged and cached ${combinedEvents.length} total events.`,
        );
      } else if (this.cachedEvents.length === 0) {
        this.cachedEvents = this.getFallbackEvents();
        this.lastFetchTime = now;
      }
    } catch (error) {
      this.logger.error(`Unexpected aggregation error: ${error.message}`);
      if (this.cachedEvents.length === 0) {
        this.cachedEvents = this.getFallbackEvents();
        this.lastFetchTime = now;
      }
    }

    return this.cachedEvents;
  }

  private async fetchFromAgendaTrad(): Promise<EventPopup[]> {
    const userAgent =
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

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
      sanitizedContent = sanitizedContent.replace(
        /href="\/([^"]+)"/g,
        'href="https://agendatrad.org/$1" target="_blank" rel="noopener noreferrer"',
      );
      sanitizedContent = sanitizedContent.replace(
        /src="\/([^"]+)"/g,
        'src="https://agendatrad.org/$1"',
      );

      return {
        lat: typeof item.lat === 'string' ? parseFloat(item.lat) : item.lat,
        lng: typeof item.lng === 'string' ? parseFloat(item.lng) : item.lng,
        content: sanitizedContent,
        evt_type: 'balfolk',
        ...(isoDate ? { date: isoDate } : {}),
      };
    });
  }

  private async fetchFromTrovaSagre(): Promise<EventPopup[]> {
    const userAgent =
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

    const response = await axios.get<TrovaSagreResponse>(
      'https://trovasagre.com/api/events?limit=250&page=1',
      {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'application/json',
        },
        timeout: 10000,
      },
    );

    if (!response.data || !Array.isArray(response.data.events)) {
      return [];
    }

    const results: EventPopup[] = [];

    for (const ev of response.data.events) {
      if (ev.lat == null || ev.lng == null) continue;

      const lat = typeof ev.lat === 'string' ? parseFloat(ev.lat) : ev.lat;
      const lng = typeof ev.lng === 'string' ? parseFloat(ev.lng) : ev.lng;
      if (isNaN(lat) || isNaN(lng)) continue;

      const isoDate = ev.date_start ? this.parseDateToIso(ev.date_start) : undefined;
      const dateDisplay =
        ev.date ||
        (ev.date_start
          ? `${ev.date_start}${ev.date_end ? ' – ' + ev.date_end : ''}`
          : '');
      const eventUrl = ev.slug
        ? `https://trovasagre.com/evento/${ev.slug}`
        : `https://trovasagre.com/app?id=${ev.id}`;
      const flyerUrl = ev.flyer_path ? `https://trovasagre.com${ev.flyer_path}` : '';
      const category = ev.category || 'Sagra';

      const contentHtml = `
        <h4 style="font-size: 16px;">${dateDisplay}</h4>
        <h5><a href="${eventUrl}" target="_blank" rel="noopener noreferrer">${ev.title}</a></h5>
        <div class="geopopup-item">
          ${
            flyerUrl
              ? `<a href="${eventUrl}" target="_blank" rel="noopener noreferrer" class="event__poster-crop-100"><img src="${flyerUrl}" width="100" height="100" alt="${ev.title}" /></a>`
              : ''
          }
          <div class="event_content">
            ${ev.location ? `<p class="event_orgas_bands"><b class="gris">Luogo:</b> ${ev.location}</p>` : ''}
            ${ev.description ? `<p>${ev.description}</p>` : ''}
            <p><span class="badge badge-event_types">${category}</span> <span class="badge badge-event_types" style="background:#dcfce7;color:#15803d;">TrovaSagre</span></p>
          </div>
          <br class="clear" />
        </div>
      `.trim();

      results.push({
        lat,
        lng,
        content: contentHtml,
        evt_type: 'sagra',
        ...(isoDate ? { date: isoDate } : {}),
      });
    }

    return results;
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
        evt_type: 'balfolk',
        content:
          '<h4>Mardi 01 sept. 2026</h4><p>Padova, Italy</p><p>Traditional folk dance & live concert.</p>',
      },
      {
        lat: 45.4602,
        lng: 11.7449,
        date: '2026-08-28',
        evt_type: 'balfolk',
        content:
          '<h4>Vendredi 28 août 2026</h4><p>Veneto, Italy</p><p>Live folk orchestra performance.</p>',
      },
      {
        lat: 43.6047,
        lng: 1.4442,
        date: '2026-09-12',
        evt_type: 'balfolk',
        content:
          '<h4>Samedi 12 sept. 2026</h4><p>Toulouse, France</p><p>Workshops, bals folk, concerts.</p>',
      },
      {
        lat: 48.8566,
        lng: 2.3522,
        date: '2026-09-20',
        evt_type: 'balfolk',
        content:
          '<h4>Dimanche 20 sept. 2026</h4><p>Paris, France</p><p>Live neo-trad band sets.</p>',
      },
    ];
  }
}
