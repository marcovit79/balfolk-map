import { EventPopup, UmapGeoJsonResponse } from '../interfaces/event.interface';
import { HttpTransport } from '../transport';
import { parseUmapDateRange } from '../utils/date.utils';

export async function fetchUmap(
  transport: HttpTransport,
  _logger?: (msg: string) => void,
): Promise<EventPopup[]> {
  const userAgent =
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
  const umapUrl =
    'https://umap.openstreetmap.fr/it/datalayer/1379731/c2c6318f-c677-4b24-acce-6e8a49a06bbe/';

  const response = await transport.get<UmapGeoJsonResponse>(umapUrl, {
    headers: {
      'User-Agent': userAgent,
      'Accept': 'application/json',
    },
    timeout: 10000,
  });

  const data = typeof response.data === 'string'
    ? JSON.parse(response.data)
    : response.data;

  if (!data || !Array.isArray(data.features)) {
    return [];
  }

  const results: EventPopup[] = [];

  for (const feature of data.features) {
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

    const { startDate, endDate } = parseUmapDateRange(dateDisplay);

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
