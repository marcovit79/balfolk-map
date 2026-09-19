export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  params?: Record<string, string | number>;
  responseType?: 'json' | 'text';
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  headers?: Record<string, string | string[]>;
}

export interface HttpTransport {
  get<T = any>(url: string, options?: RequestOptions): Promise<HttpResponse<T>>;
  post<T = any>(url: string, data?: any, options?: RequestOptions): Promise<HttpResponse<T>>;
}
