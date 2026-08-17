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
}
