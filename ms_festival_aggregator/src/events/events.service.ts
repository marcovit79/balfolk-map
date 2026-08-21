import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import {
  EventPopup,
  AgendaTradResponse,
  TrovaSagreResponse,
  UmapGeoJsonResponse,
  FolkdanceResponse,
  FolkdanceEvent,
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

      // Concurrently fetch from AgendaTrad, TrovaSagre, uMap (TuttoBalfolk), and Folkdance.page
      const [agendaTradResult, trovaSagreResult, umapResult, folkdanceResult] = await Promise.allSettled([
        this.fetchFromAgendaTrad(),
        this.fetchFromTrovaSagre(),
        this.fetchTuttoBalfolkFromUmap(),
        this.fetchFromFolkdancePage(),
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

      if (umapResult.status === 'fulfilled') {
        this.logger.log(`Fetched ${umapResult.value.length} events from uMap (TuttoBalfolk).`);
        combinedEvents.push(...umapResult.value);
      } else {
        this.logger.error(
          `uMap fetch error: ${umapResult.reason?.message || umapResult.reason}`,
        );
      }

      if (folkdanceResult.status === 'fulfilled') {
        this.logger.log(`Fetched ${folkdanceResult.value.length} events from Folkdance.page.`);
        combinedEvents.push(...folkdanceResult.value);
      } else {
        this.logger.error(
          `Folkdance.page fetch error: ${folkdanceResult.reason?.message || folkdanceResult.reason}`,
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
        ...(isoDate ? { start_date: isoDate, end_date: isoDate } : {}),
      };
    });
  }

  private async fetchFromTrovaSagre(): Promise<EventPopup[]> {
    const userAgent =
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
    const limit = 100;

    // Step 1: Fetch first page to retrieve initial events and total count
    const firstPageResponse = await axios.get<TrovaSagreResponse>(
      `https://trovasagre.com/api/events?page=1&limit=${limit}`,
      {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'application/json',
        },
        timeout: 10000,
      },
    );

    if (!firstPageResponse.data || !Array.isArray(firstPageResponse.data.events)) {
      return [];
    }

    const allEvents = [...firstPageResponse.data.events];
    const total = firstPageResponse.data.total || allEvents.length;
    const totalPages = Math.ceil(total / limit);

    // Step 2: Concurrently fetch all remaining pages
    if (totalPages > 1) {
      const pagePromises = [];
      for (let p = 2; p <= totalPages; p++) {
        pagePromises.push(
          axios.get<TrovaSagreResponse>(
            `https://trovasagre.com/api/events?page=${p}&limit=${limit}`,
            {
              headers: {
                'User-Agent': userAgent,
                'Accept': 'application/json',
              },
              timeout: 10000,
            },
          ),
        );
      }

      const results = await Promise.allSettled(pagePromises);
      for (const res of results) {
        if (res.status === 'fulfilled' && Array.isArray(res.value.data?.events)) {
          allEvents.push(...res.value.data.events);
        }
      }
    }

    this.logger.log(
      `Fetched all ${allEvents.length} events across ${totalPages} pages from TrovaSagre.`,
    );

    const results: EventPopup[] = [];

    for (const ev of allEvents) {
      if (ev.lat == null || ev.lng == null) continue;

      const lat = typeof ev.lat === 'string' ? parseFloat(ev.lat) : ev.lat;
      const lng = typeof ev.lng === 'string' ? parseFloat(ev.lng) : ev.lng;
      if (isNaN(lat) || isNaN(lng)) continue;

      const isoStart = ev.date_start ? this.parseDateToIso(ev.date_start) : undefined;
      const isoEnd =
        (ev.date_end ? this.parseDateToIso(ev.date_end) : undefined) || isoStart;
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
        ...(isoStart ? { start_date: isoStart, end_date: isoEnd || isoStart } : {}),
      });
    }

    return results;
  }

  private async fetchTuttoBalfolkFromUmap(): Promise<EventPopup[]> {
    const userAgent =
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
    const umapUrl =
      'https://umap.openstreetmap.fr/it/datalayer/1379731/c2c6318f-c677-4b24-acce-6e8a49a06bbe/';

    const response = await axios.get<UmapGeoJsonResponse>(umapUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    if (!response.data || !Array.isArray(response.data.features)) {
      return [];
    }

    const results: EventPopup[] = [];

    for (const feature of response.data.features) {
      if (
        !feature.geometry ||
        feature.geometry.type !== 'Point' ||
        !Array.isArray(feature.geometry.coordinates)
      ) {
        continue;
      }

      // GeoJSON Point coordinates standard is [lng, lat]
      const [lngRaw, latRaw] = feature.geometry.coordinates;
      const lng = typeof lngRaw === 'string' ? parseFloat(lngRaw) : lngRaw;
      const lat = typeof latRaw === 'string' ? parseFloat(latRaw) : latRaw;

      if (isNaN(lat) || isNaN(lng)) continue;

      const props = feature.properties || {};
      const title = props.title || props.name || 'Evento Balfolk';
      const description = (props.description || '').trim();

      const lines = description.split('\n').map(l => l.trim()).filter(Boolean);
      const firstLine = lines[0] || '';
      const remainingLines = lines.slice(1);

      let dateDisplay = '';
      let location = '';

      if (firstLine.includes('@')) {
        const atIndex = firstLine.indexOf('@');
        dateDisplay = firstLine.substring(0, atIndex).trim();
        location = firstLine.substring(atIndex + 1).trim();
      } else {
        dateDisplay = firstLine;
      }

      const { startDate, endDate } = this.parseUmapDateRange(dateDisplay);

      // Find primary link if any (e.g. Facebook event or share link)
      let primaryLink: string | undefined;
      for (const line of remainingLines) {
        const linkMatch = line.match(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/);
        if (linkMatch) {
          primaryLink = linkMatch[2];
          break;
        }
      }

      // Convert remaining lines into formatted HTML
      const contentParts: string[] = [];
      for (const line of remainingLines) {
        // Convert markdown links [text](url) -> HTML
        const htmlLine = line.replace(
          /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#2563eb;font-weight:500;">$1</a>',
        );

        if (line.startsWith('+')) {
          contentParts.push(
            `<li style="margin-left: 14px; list-style-type: disc;">${htmlLine.substring(1).trim()}</li>`,
          );
        } else if (line.startsWith('(') && line.endsWith(')')) {
          contentParts.push(
            `<p class="gris" style="font-style: italic; font-size: 13px; margin: 4px 0;">${htmlLine}</p>`,
          );
        } else {
          contentParts.push(`<p style="margin: 4px 0;">${htmlLine}</p>`);
        }
      }

      const formattedLines = contentParts.join('');

      const contentHtml = `
        <h4 style="font-size: 16px;">${dateDisplay || (startDate ? `${startDate}${endDate && endDate !== startDate ? ' – ' + endDate : ''}` : '')}</h4>
        <h5>${primaryLink ? `<a href="${primaryLink}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}</h5>
        <div class="geopopup-item">
          <div class="event_content">
            ${location ? `<p class="event_orgas_bands"><b class="gris">Luogo:</b> ${location}</p>` : ''}
            ${formattedLines}
            <p style="margin-top: 8px;"><span class="badge badge-event_types">Balfolk</span> <span class="badge badge-event_types" style="background:#e0f2fe;color:#0369a1;">TuttoBalfolk</span></p>
          </div>
          <br class="clear" />
        </div>
      `.trim();

      results.push({
        lat,
        lng,
        content: contentHtml,
        evt_type: 'balfolk',
        ...(startDate ? { start_date: startDate, end_date: endDate || startDate } : {}),
      });
    }

    return results;
  }

  private parseUmapDateRange(datePart: string): { startDate?: string; endDate?: string } {
    const cleaned = datePart.trim();

    // 1. Multi-day range: e.g. "5-7 dicembre 2026", "17-29 settembre 2026", "25-29 agosto 2026"
    const rangeMatch = cleaned.match(
      /(\d{1,2})\s*-\s*(\d{1,2})\s+([a-zA-Z\u00C0-\u017F]+)\s+(\d{4})/i,
    );
    if (rangeMatch) {
      const [, d1, d2, monthRaw, y] = rangeMatch;
      const normalizedMonth = this.normalizeText(monthRaw);
      const m = EventsService.MONTH_MAP[normalizedMonth];
      if (m) {
        return {
          startDate: `${y}-${m}-${d1.padStart(2, '0')}`,
          endDate: `${y}-${m}-${d2.padStart(2, '0')}`,
        };
      }
    }

    // 2. Single day with potential weekday: e.g. "14 maggio 2027", "Domenica 17 dicembre 2026", "Martedì 1 settembre 2026"
    const singleMatch = cleaned.match(
      /(\d{1,2})\s+([a-zA-Z\u00C0-\u017F]+)\s+(\d{4})/i,
    );
    if (singleMatch) {
      const [, d, monthRaw, y] = singleMatch;
      const normalizedMonth = this.normalizeText(monthRaw);
      const m = EventsService.MONTH_MAP[normalizedMonth];
      if (m) {
        const iso = `${y}-${m}-${d.padStart(2, '0')}`;
        return { startDate: iso, endDate: iso };
      }
    }

    // 3. Fallback to parseDateToIso
    const fallbackIso = this.parseDateToIso(cleaned);
    if (fallbackIso) {
      return { startDate: fallbackIso, endDate: fallbackIso };
    }

    return {};
  }

  private cityCoordsCache: Record<string, { lat: number; lng: number }> =
    (function () {
      try {
        return require('./city_coords.json');
      } catch {
        return {};
      }
    })();

  private async getCoordinatesForCity(
    city: string,
    country: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const key = `${city}, ${country}`;
    if (this.cityCoordsCache[key]) {
      return this.cityCoordsCache[key];
    }

    try {
      const q = encodeURIComponent(city);
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=5&language=en&format=json`;
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'FestivalAggregator/1.0' },
        timeout: 5000,
      });
      const results = res.data?.results;
      if (Array.isArray(results) && results.length > 0) {
        let matched = results.find(
          (r: any) =>
            country.toLowerCase().includes((r.country || '').toLowerCase()) ||
            (r.country_code || '').toLowerCase().includes(country.toLowerCase()),
        );
        if (!matched) {
          matched = results[0];
        }
        if (matched && matched.latitude && matched.longitude) {
          const coords = {
            lat: Math.round(matched.latitude * 10000) / 10000,
            lng: Math.round(matched.longitude * 10000) / 10000,
          };
          this.cityCoordsCache[key] = coords;
          return coords;
        }
      }
    } catch (err) {
      this.logger.warn(`Dynamic geocoding failed for ${key}: ${err.message}`);
    }

    return null;
  }

  async fetchFromFolkdancePage(): Promise<EventPopup[]> {
    const userAgent =
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
    const folkdanceUrl = 'https://folkdance.page/index.json?styles=balfolk';

    const response = await axios.get<FolkdanceResponse>(folkdanceUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json',
      },
      timeout: 15000,
    });

    if (!response.data || !Array.isArray(response.data.events)) {
      return [];
    }

    const results: EventPopup[] = [];

    for (const ev of response.data.events) {
      const city = (ev.city || '').trim();
      const country = (ev.country || '').trim();
      if (!city || !country) continue;

      const coords = await this.getCoordinatesForCity(city, country);
      if (!coords) continue;

      const startStr = ev.start || ev.start_date;
      const endStr = ev.end || ev.end_date;

      let isoStart: string | undefined;
      let isoEnd: string | undefined;

      if (startStr && startStr.length >= 10) {
        isoStart = startStr.substring(0, 10);
      }
      if (endStr && endStr.length >= 10) {
        isoEnd = endStr.substring(0, 10);
      }
      if (!isoEnd && isoStart) {
        isoEnd = isoStart;
      }

      let dateDisplay = '';
      if (isoStart && isoEnd) {
        dateDisplay = isoStart === isoEnd ? isoStart : `${isoStart} – ${isoEnd}`;
      } else if (isoStart) {
        dateDisplay = isoStart;
      }

      const primaryLink =
        ev.links && ev.links.length > 0 ? ev.links[0] : undefined;
      const title = ev.name || 'Balfolk Event';
      const location = `${city}, ${country}${ev.state ? ` (${ev.state})` : ''}`;
      const bands = ev.bands && ev.bands.length > 0 ? ev.bands.join(', ') : '';
      const organisation = ev.organisation || '';
      const details = ev.details || '';
      const price = ev.price || '';

      const contentHtml = `
        <h4 style="font-size: 16px;">${dateDisplay}</h4>
        <h5>${primaryLink ? `<a href="${primaryLink}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}</h5>
        <div class="geopopup-item">
          <div class="event_content">
            <p class="event_orgas_bands"><b class="gris">Luogo:</b> ${location}</p>
            ${bands ? `<p class="event_orgas_bands"><b class="gris">Artisti:</b> ${bands}</p>` : ''}
            ${organisation ? `<p class="event_orgas_bands"><b class="gris">Organizzazione:</b> ${organisation}</p>` : ''}
            ${details ? `<p style="margin: 4px 0;">${details}</p>` : ''}
            ${price ? `<p class="event_orgas_bands"><b class="gris">Prezzo:</b> ${price}</p>` : ''}
            <p style="margin-top: 8px;">
              <span class="badge badge-event_types">Balfolk</span>
              <span class="badge badge-event_types" style="background:#e0f2fe;color:#0369a1;">Folkdance.page</span>
              ${ev.workshop ? '<span class="badge badge-event_types" style="background:#fef08a;color:#854d0e;">Workshop</span>' : ''}
            </p>
          </div>
          <br class="clear" />
        </div>
      `.trim();

      results.push({
        lat: coords.lat,
        lng: coords.lng,
        content: contentHtml,
        evt_type: 'balfolk',
        ...(isoStart ? { start_date: isoStart, end_date: isoEnd || isoStart } : {}),
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
    return [];
  }
}
