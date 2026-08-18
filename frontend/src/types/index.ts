export interface FestivalEvent {
  lat: number;
  lng: number;
  content: string;
  start_date?: string;
  end_date?: string;
  evt_type?: 'balfolk' | 'sagra' | string;
}
