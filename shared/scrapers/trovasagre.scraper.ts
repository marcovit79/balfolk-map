import { EventPopup, TrovaSagreResponse } from '../interfaces/event.interface';
import { HttpTransport } from '../transport';
import { parseDateToIso } from '../utils/date.utils';

export async function fetchTrovaSagre(
  transport: HttpTransport,
  logger?: (msg: string) => void,
): Promise<EventPopup[]> {
  const userAgent =
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
  const limit = 100;

  // Step 1: Fetch first page to retrieve initial events and total count
  const firstPageResponse = await transport.get<TrovaSagreResponse>(
    `https://trovasagre.com/api/events?page=1&limit=${limit}`,
    {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json',
      },
      timeout: 10000,
    },
  );

  const firstData = typeof firstPageResponse.data === 'string'
    ? JSON.parse(firstPageResponse.data)
    : firstPageResponse.data;

  if (!firstData || !Array.isArray(firstData.events)) {
    return [];
  }

  const allEvents = [...firstData.events];
  const total = firstData.total || allEvents.length;
  const totalPages = Math.ceil(total / limit);

  // Step 2: Concurrently fetch all remaining pages
  if (totalPages > 1) {
    const pagePromises = [];
    for (let p = 2; p <= totalPages; p++) {
      pagePromises.push(
        transport.get<TrovaSagreResponse>(
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
      if (res.status === 'fulfilled') {
        const pageData = typeof res.value.data === 'string'
          ? JSON.parse(res.value.data)
          : res.value.data;
        if (Array.isArray(pageData?.events)) {
          allEvents.push(...pageData.events);
        }
      }
    }
  }

  logger?.(`Fetched all ${allEvents.length} events across ${totalPages} pages from TrovaSagre.`);

  const results: EventPopup[] = [];

  for (const ev of allEvents) {
    if (ev.lat == null || ev.lng == null) continue;

    const lat = typeof ev.lat === 'string' ? parseFloat(ev.lat) : ev.lat;
    const lng = typeof ev.lng === 'string' ? parseFloat(ev.lng) : ev.lng;
    if (isNaN(lat) || isNaN(lng)) continue;

    const isoStart = ev.date_start ? parseDateToIso(ev.date_start) : undefined;
    const isoEnd =
      (ev.date_end ? parseDateToIso(ev.date_end) : undefined) || isoStart;
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
