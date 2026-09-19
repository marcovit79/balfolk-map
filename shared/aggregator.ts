import { EventPopup } from './interfaces/event.interface';
import { HttpTransport } from './transport';
import { fetchAgendaTrad } from './scrapers/agendatrad.scraper';
import { fetchTrovaSagre } from './scrapers/trovasagre.scraper';
import { fetchUmap } from './scrapers/umap.scraper';
import { folkdanceScraper } from './scrapers/folkdance.scraper';

export class FestivalAggregatorCore {
  private cachedEvents: EventPopup[] = [];
  private lastFetchTime: number = 0;
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(
    private readonly transport: HttpTransport,
    private readonly logger: (msg: string) => void = (msg) => console.log(`[FestivalAggregatorCore] ${msg}`),
  ) {}

  async getEvents(forceRefresh = false): Promise<EventPopup[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedEvents.length > 0 && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      this.logger(
        `Returning ${this.cachedEvents.length} cached events (age: ${Math.round(
          (now - this.lastFetchTime) / 1000,
        )}s)`,
      );
      return this.cachedEvents;
    }

    try {
      this.logger('Cache expired or empty. Fetching fresh events from upstream sources...');

      // Concurrently fetch from AgendaTrad, TrovaSagre, uMap (TuttoBalfolk), and Folkdance.page
      const [agendaTradResult, trovaSagreResult, umapResult, folkdanceResult] = await Promise.allSettled([
        fetchAgendaTrad(this.transport, this.logger),
        fetchTrovaSagre(this.transport, this.logger),
        fetchUmap(this.transport, this.logger),
        folkdanceScraper.fetchFolkdance(this.transport, this.logger),
      ]);

      const combinedEvents: EventPopup[] = [];

      if (agendaTradResult.status === 'fulfilled') {
        this.logger(`Fetched ${agendaTradResult.value.length} events from AgendaTrad.`);
        combinedEvents.push(...agendaTradResult.value);
      } else {
        this.logger(`AgendaTrad fetch error: ${agendaTradResult.reason?.message || agendaTradResult.reason}`);
      }

      if (trovaSagreResult.status === 'fulfilled') {
        this.logger(`Fetched ${trovaSagreResult.value.length} events from TrovaSagre.`);
        combinedEvents.push(...trovaSagreResult.value);
      } else {
        this.logger(`TrovaSagre fetch error: ${trovaSagreResult.reason?.message || trovaSagreResult.reason}`);
      }

      if (umapResult.status === 'fulfilled') {
        this.logger(`Fetched ${umapResult.value.length} events from uMap (TuttoBalfolk).`);
        combinedEvents.push(...umapResult.value);
      } else {
        this.logger(`uMap fetch error: ${umapResult.reason?.message || umapResult.reason}`);
      }

      if (folkdanceResult.status === 'fulfilled') {
        this.logger(`Fetched ${folkdanceResult.value.length} events from Folkdance.page.`);
        combinedEvents.push(...folkdanceResult.value);
      } else {
        this.logger(`Folkdance.page fetch error: ${folkdanceResult.reason?.message || folkdanceResult.reason}`);
      }

      if (combinedEvents.length > 0) {
        this.cachedEvents = combinedEvents;
        this.lastFetchTime = now;
        this.logger(`Successfully merged and cached ${combinedEvents.length} total events.`);
      } else if (this.cachedEvents.length === 0) {
        this.cachedEvents = this.getFallbackEvents();
        this.lastFetchTime = now;
      }
    } catch (error: any) {
      this.logger(`Unexpected aggregation error: ${error.message || error}`);
      if (this.cachedEvents.length === 0) {
        this.cachedEvents = this.getFallbackEvents();
        this.lastFetchTime = now;
      }
    }

    return this.cachedEvents;
  }

  setCachedEvents(events: EventPopup[]): void {
    this.cachedEvents = events;
    this.lastFetchTime = Date.now();
  }

  getCachedEvents(): EventPopup[] {
    return this.cachedEvents;
  }

  private getFallbackEvents(): EventPopup[] {
    return [];
  }
}
