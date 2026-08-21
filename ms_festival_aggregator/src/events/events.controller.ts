import { Controller, Get } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventPopup } from './interfaces/event.interface';

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('events')
  async getEvents(): Promise<EventPopup[]> {
    return this.eventsService.getEvents();
  }

  /**
   * Separate, uncached endpoint for Folkdance.page query.
   * Debug purpose only (to be removed in a future version).
   */
  @Get(['events/folkdance', 'debug/folkdance'])
  async getFolkdanceDebugEvents(): Promise<EventPopup[]> {
    return this.eventsService.fetchFromFolkdancePage();
  }
}

