import { FestivalEvent } from '../types';

export interface EventProvider {
  getEvents(forceRefresh?: boolean): Promise<FestivalEvent[]>;
}
