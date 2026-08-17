export interface FestivalEvent {
  lat: number;
  lng: number;
  content: string;
  date?: string;
  evt_type?: 'balfolk' | 'sagra' | string;
}
