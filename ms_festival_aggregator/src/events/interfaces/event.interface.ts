export interface EventPopup {
  lat: number;
  lng: number;
  content: string;
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
