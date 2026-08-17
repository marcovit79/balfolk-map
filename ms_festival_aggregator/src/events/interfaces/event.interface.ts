export interface EventPopup {
  lat: number;
  lng: number;
  content: string;
  date?: string;
  evt_type?: 'balfolk' | 'sagra' | string;
}

export interface AgendaTradResponse {
  count?: number;
  boundaries?: {
    n: number;
    e: number;
    s: number;
    w: number;
  };
  popups?: Array<{
    lat: number | string;
    lng: number | string;
    content: string;
  }>;
}

export interface TrovaSagreEvent {
  id: string;
  title: string;
  location?: string;
  date?: string;
  date_start?: string;
  date_end?: string;
  lat?: number | string;
  lng?: number | string;
  description?: string;
  flyer_path?: string;
  category?: string;
  slug?: string;
}

export interface TrovaSagreResponse {
  total?: number;
  page?: number;
  limit?: number;
  events?: TrovaSagreEvent[];
}
