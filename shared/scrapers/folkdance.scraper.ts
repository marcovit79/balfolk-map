import { EventPopup, FolkdanceResponse } from '../interfaces/event.interface';
import { HttpTransport } from '../transport';
import cityCoordsData from '../data/city_coords.json';

export class FolkdanceScraper {
  private cityCoordsCache: Record<string, { lat: number; lng: number }> = {
    ...(cityCoordsData as Record<string, { lat: number; lng: number }>),
  };

  private async getCoordinatesForCity(
    city: string,
    country: string,
    transport: HttpTransport,
    logger?: (msg: string) => void,
  ): Promise<{ lat: number; lng: number } | null> {
    const key = `${city}, ${country}`;
    if (this.cityCoordsCache[key]) {
      return this.cityCoordsCache[key];
    }

    try {
      const q = encodeURIComponent(city);
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=5&language=en&format=json`;
      const res = await transport.get(url, {
        headers: { 'User-Agent': 'FestivalAggregator/1.0' },
        timeout: 5000,
      });
      const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      const results = data?.results;
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
    } catch (err: any) {
      logger?.(`Dynamic geocoding failed for ${key}: ${err.message || err}`);
    }

    return null;
  }

  async fetchFolkdance(
    transport: HttpTransport,
    logger?: (msg: string) => void,
  ): Promise<EventPopup[]> {
    const userAgent =
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
    const folkdanceUrl = 'https://folkdance.page/index.json?styles=balfolk';

    const response = await transport.get<FolkdanceResponse>(folkdanceUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json',
      },
      timeout: 15000,
    });

    const data = typeof response.data === 'string'
      ? JSON.parse(response.data)
      : response.data;

    if (!data || !Array.isArray(data.events)) {
      return [];
    }

    const results: EventPopup[] = [];

    for (const ev of data.events) {
      const city = (ev.city || '').trim();
      const country = (ev.country || '').trim();
      if (!city || !country) continue;

      const coords = await this.getCoordinatesForCity(city, country, transport, logger);
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
}

export const folkdanceScraper = new FolkdanceScraper();
