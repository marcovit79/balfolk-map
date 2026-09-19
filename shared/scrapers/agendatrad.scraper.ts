import { EventPopup, AgendaTradResponse } from '../interfaces/event.interface';
import { HttpTransport } from '../transport';
import { parseDateToIso } from '../utils/date.utils';

export async function fetchAgendaTrad(
  transport: HttpTransport,
  logger?: (msg: string) => void,
): Promise<EventPopup[]> {
  const userAgent =
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

  // Step 1: Request the map page to acquire session cookies
  let cookieHeader = '';
  try {
    const mapPageResponse = await transport.get('https://agendatrad.org/calendar/map', {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 10000,
    });

    const rawCookies = mapPageResponse.headers?.['set-cookie'] || mapPageResponse.headers?.['Set-Cookie'];
    if (Array.isArray(rawCookies)) {
      cookieHeader = rawCookies.map((c: string) => c.split(';')[0]).join('; ');
    } else if (typeof rawCookies === 'string') {
      cookieHeader = rawCookies.split(';')[0];
    }
  } catch (err: any) {
    logger?.(`AgendaTrad cookie acquisition warning: ${err.message || err}`);
  }

  // Step 2: Build dynamic dates
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  const dateStartInput = `${day}/${month}/${year}`;
  const dateStart = `${year}-${month}-${day}`;

  // Step 3: Build urlencoded payload object
  const formPayload: Record<string, string> = {
    '_method': 'POST',
    'data[Event][date_startInput]': dateStartInput,
    'data[Event][date_start]': dateStart,
    'data[Event][bounds]': '-10.0,34.0,35.0,60.0', // Europe wide bounds
    'data[Event][zoom]': '5',
    'data[Check][types]': '1',
  };

  const eventTypes = [1, 2, 3, 4, 5, 6, 8, 9, 11, 12];
  eventTypes.forEach((type, idx) => {
    formPayload[`data[EventType][EventType][${idx}]`] = String(type);
  });

  // Step 4: Post request
  const response = await transport.post<AgendaTradResponse>(
    'https://agendatrad.org/calendar/map.json',
    formPayload,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': userAgent,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://agendatrad.org/calendar/map',
        'Origin': 'https://agendatrad.org',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
      },
      timeout: 15000,
    },
  );

  const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  if (!data || !Array.isArray(data.popups)) {
    return [];
  }

  return data.popups.map(item => {
    const rawContent = item.content || '';

    // Extract date text from the starting <h4> tag if present and convert to ISO YYYY-MM-DD
    const dateMatch = rawContent.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    const rawDate = dateMatch ? dateMatch[1].replace(/<[^>]*>/g, '').trim() : undefined;
    const isoDate = parseDateToIso(rawDate);

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
