import { HttpTransport, RequestOptions, HttpResponse } from '@shared/transport';

export class CordovaHttpTransport implements HttpTransport {
  private static readyPromise: Promise<void> | null = null;

  public static waitForReady(): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.resolve();
    }

    if ((window as any)._cordovaDeviceReady || (window as any).cordova?.plugin?.http) {
      return Promise.resolve();
    }

    if (!(window as any).cordova && window.location.protocol !== 'file:') {
      return Promise.resolve();
    }

    if (!CordovaHttpTransport.readyPromise) {
      CordovaHttpTransport.readyPromise = new Promise<void>((resolve) => {
        let resolved = false;
        const handler = () => {
          if (!resolved) {
            resolved = true;
            (window as any)._cordovaDeviceReady = true;
            document.removeEventListener('deviceready', handler);
            console.log('[CordovaHttpTransport] Cordova deviceready fired, native HTTP ready.');
            resolve();
          }
        };

        document.addEventListener('deviceready', handler, false);

        // Safety fallback timeout: if deviceready is not fired within 2.5s, continue anyway
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            document.removeEventListener('deviceready', handler);
            console.log('[CordovaHttpTransport] deviceready wait timed out, continuing.');
            resolve();
          }
        }, 2500);
      });
    }

    return CordovaHttpTransport.readyPromise;
  }

  private get cordovaHttp(): any {
    return typeof window !== 'undefined' ? (window as any).cordova?.plugin?.http : undefined;
  }

  async get<T = any>(url: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    await CordovaHttpTransport.waitForReady();

    const http = this.cordovaHttp;
    if (http) {
      return new Promise((resolve, reject) => {
        http.sendRequest(
          url,
          {
            method: 'get',
            headers: options?.headers || {},
            timeout: (options?.timeout || 15000) / 1000,
            params: options?.params || {},
            responseType: options?.responseType || 'text',
          },
          (response: any) => {
            let data = response.data;
            if (
              typeof data === 'string' &&
              (response.headers?.['content-type']?.includes('json') ||
                data.trim().startsWith('{') ||
                data.trim().startsWith('['))
            ) {
              try {
                data = JSON.parse(data);
              } catch {}
            }
            resolve({
              data,
              status: response.status,
              headers: response.headers,
            });
          },
          (error: any) => {
            reject(new Error(error.error || error.message || `HTTP ${error.status}`));
          },
        );
      });
    }

    // Standard web browser fallback
    const fetchHeaders: Record<string, string> = { ...(options?.headers || {}) };
    delete fetchHeaders['User-Agent'];
    delete fetchHeaders['Cookie'];
    delete fetchHeaders['Referer'];
    delete fetchHeaders['Origin'];

    let fullUrl = url;
    if (options?.params) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(options.params)) {
        sp.append(k, String(v));
      }
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + sp.toString();
    }

    const res = await fetch(fullUrl, {
      method: 'GET',
      headers: fetchHeaders,
      signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    });

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {}

    return {
      data,
      status: res.status,
      headers,
    };
  }

  async post<T = any>(url: string, data?: any, options?: RequestOptions): Promise<HttpResponse<T>> {
    await CordovaHttpTransport.waitForReady();

    const http = this.cordovaHttp;
    const contentType = (
      options?.headers?.['Content-Type'] ||
      options?.headers?.['content-type'] ||
      ''
    ).toString().toLowerCase();

    if (http) {
      return new Promise((resolve, reject) => {
        let serializer: string = 'utf8';
        let payload = data;

        if (contentType.includes('application/x-www-form-urlencoded')) {
          serializer = 'urlencoded';
          if (typeof data === 'string') {
            const parsed: Record<string, string> = {};
            const sp = new URLSearchParams(data);
            sp.forEach((v, k) => {
              parsed[k] = v;
            });
            payload = parsed;
          } else if (typeof data === 'object' && data !== null) {
            payload = data;
          }
        } else if (typeof data === 'object' && data !== null) {
          serializer = 'json';
          payload = data;
        } else if (typeof data === 'string') {
          serializer = 'utf8';
          payload = data;
        }

        http.sendRequest(
          url,
          {
            method: 'post',
            data: payload,
            headers: options?.headers || {},
            timeout: (options?.timeout || 15000) / 1000,
            serializer,
          },
          (response: any) => {
            let resData = response.data;
            if (
              typeof resData === 'string' &&
              (response.headers?.['content-type']?.includes('json') ||
                resData.trim().startsWith('{') ||
                resData.trim().startsWith('['))
            ) {
              try {
                resData = JSON.parse(resData);
              } catch {}
            }
            resolve({
              data: resData,
              status: response.status,
              headers: response.headers,
            });
          },
          (error: any) => {
            reject(new Error(error.error || error.message || `HTTP ${error.status}`));
          },
        );
      });
    }

    // Standard web browser fallback
    const fetchHeaders: Record<string, string> = { ...(options?.headers || {}) };
    delete fetchHeaders['User-Agent'];
    delete fetchHeaders['Cookie'];
    delete fetchHeaders['Referer'];
    delete fetchHeaders['Origin'];

    let body = data;
    if (contentType.includes('application/x-www-form-urlencoded')) {
      if (typeof data === 'object' && !(data instanceof URLSearchParams)) {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(data)) {
          sp.append(k, String(v));
        }
        body = sp.toString();
      }
    } else if (typeof data === 'object' && !(data instanceof URLSearchParams) && typeof data !== 'string') {
      body = JSON.stringify(data);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: fetchHeaders,
      body,
      signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    });

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    const text = await res.text();
    let resData: any = text;
    try {
      resData = JSON.parse(text);
    } catch {}

    return {
      data: resData,
      status: res.status,
      headers,
    };
  }
}
