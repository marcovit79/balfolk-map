import axios from 'axios';
import { HttpTransport, RequestOptions, HttpResponse } from '../../../shared/transport';

export class NodeHttpTransport implements HttpTransport {
  async get<T = any>(url: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    const res = await axios.get<T>(url, {
      headers: options?.headers,
      timeout: options?.timeout,
      params: options?.params,
      responseType: options?.responseType,
    });
    return {
      data: res.data,
      status: res.status,
      headers: res.headers as Record<string, string | string[]>,
    };
  }

  async post<T = any>(url: string, data?: any, options?: RequestOptions): Promise<HttpResponse<T>> {
    let postData = data;
    const contentType = (
      options?.headers?.['Content-Type'] ||
      options?.headers?.['content-type'] ||
      ''
    ).toString().toLowerCase();

    if (
      contentType.includes('application/x-www-form-urlencoded') &&
      typeof data === 'object' &&
      data !== null &&
      !(data instanceof URLSearchParams)
    ) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(data)) {
        sp.append(k, String(v));
      }
      postData = sp.toString();
    }

    const res = await axios.post<T>(url, postData, {
      headers: options?.headers,
      timeout: options?.timeout,
      params: options?.params,
      responseType: options?.responseType,
    });
    return {
      data: res.data,
      status: res.status,
      headers: res.headers as Record<string, string | string[]>,
    };
  }
}
