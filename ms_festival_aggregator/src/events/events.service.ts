import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventPopup } from '../../../shared/interfaces/event.interface';
import { FestivalAggregatorCore } from '../../../shared/aggregator';
import { NodeHttpTransport } from '../transport/node-http.transport';

import { folkdanceScraper } from '../../../shared/scrapers/folkdance.scraper';

@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);
  private readonly aggregator: FestivalAggregatorCore;
  private readonly transport = new NodeHttpTransport();

  constructor() {
    this.aggregator = new FestivalAggregatorCore(
      this.transport,
      (msg: string) => this.logger.log(msg),
    );
  }

  async onModuleInit() {
    this.logger.log('Initializing EventsService and warming up cache via shared core...');
    try {
      await this.getEvents();
    } catch (err: any) {
      this.logger.warn(`Initial cache warmup failed: ${err.message}`);
    }
  }

  async getEvents(): Promise<EventPopup[]> {
    return this.aggregator.getEvents();
  }

  async fetchFromFolkdancePage(): Promise<EventPopup[]> {
    return folkdanceScraper.fetchFolkdance(this.transport, (msg) => this.logger.log(msg));
  }
}
