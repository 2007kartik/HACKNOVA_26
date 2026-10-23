/**
 * HTTP Client with Error Normalization & File Download Support
 * Adheres strictly to ANTIGRAVITY_FRONTEND_IMPLEMENTATION_BRIEF.md
 */

import { APP_CONFIG } from '../config/app';
import { NormalizedApiError } from '../types/api';

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = APP_CONFIG.apiBaseUrl.replace(/\/+$/, '');
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private async normalizeError(response: Response): Promise<NormalizedApiError> {
    const status = response.status;
    let code = 'API_ERROR';
    let message = `Request failed with status ${status}`;
    let details: Record<string, any> | undefined;

    try {
      const data = await response.json();
      
      // Standard backend error shape: { error: { code, message, details } }
      if (data && data.error) {
        code = data.error.code || code;
        message = data.error.message || message;
        details = data.error.details;
      } 
      // FastAPI default 422 validation shape: { detail: [ { loc, msg, type } ] }
      else if (data && data.detail) {
        code = 'VALIDATION_ERROR';
        if (typeof data.detail === 'string') {
          message = data.detail;
        } else if (Array.isArray(data.detail)) {
          message = data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
          details = { validationErrors: data.detail };
        }
      } else if (data && data.message) {
        message = data.message;
      }
    } catch {
      // Non-JSON response or read error
      message = response.statusText || message;
    }

    return {
      status,
      code,
      message,
      details,
    };
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = this.buildUrl(path, params);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw await this.normalizeError(response);
      }

      if (response.status === 204) {
        return null as unknown as T;
      }

      return await response.json();
    } catch (err: any) {
      if (err.status && err.code) throw err;
      throw {
        status: 0,
        code: 'NETWORK_ERROR',
        message: err.message || 'Cannot connect to backend server. Please verify backend is running on port 8000.',
      } as NormalizedApiError;
    }
  }

  async post<T>(path: string, body?: any, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = this.buildUrl(path, params);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw await this.normalizeError(response);
      }

      if (response.status === 204) {
        return null as unknown as T;
      }

      return await response.json();
    } catch (err: any) {
      if (err.status && err.code) throw err;
      throw {
        status: 0,
        code: 'NETWORK_ERROR',
        message: err.message || 'Network connection failed.',
      } as NormalizedApiError;
    }
  }

  async patch<T>(path: string, body?: any): Promise<T> {
    const url = this.buildUrl(path);
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw await this.normalizeError(response);
      }

      return await response.json();
    } catch (err: any) {
      if (err.status && err.code) throw err;
      throw {
        status: 0,
        code: 'NETWORK_ERROR',
        message: err.message || 'Network connection failed.',
      } as NormalizedApiError;
    }
  }

  async put<T>(path: string, body?: any): Promise<T> {
    const url = this.buildUrl(path);
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw await this.normalizeError(response);
      }

      return await response.json();
    } catch (err: any) {
      if (err.status && err.code) throw err;
      throw {
        status: 0,
        code: 'NETWORK_ERROR',
        message: err.message || 'Network connection failed.',
      } as NormalizedApiError;
    }
  }

  async delete<T = void>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw await this.normalizeError(response);
      }

      if (response.status === 204) {
        return null as unknown as T;
      }

      return await response.json();
    } catch (err: any) {
      if (err.status && err.code) throw err;
      throw {
        status: 0,
        code: 'NETWORK_ERROR',
        message: err.message || 'Network connection failed.',
      } as NormalizedApiError;
    }
  }

  /**
   * Downloads a file (CSV or JSON) safely via blob URL,
   * triggering browser save and revoking the object URL afterwards.
   */
  async downloadFile(path: string, params: Record<string, string>, defaultFilename: string): Promise<void> {
    const url = this.buildUrl(path, params);
    try {
      const response = await fetch(url, {
        method: 'GET',
      });

      if (!response.ok) {
        throw await this.normalizeError(response);
      }

      const blob = await response.blob();
      
      // Determine filename from content-disposition header if present
      let filename = defaultFilename;
      const disposition = response.headers.get('content-disposition');
      if (disposition && disposition.indexOf('filename=') !== -1) {
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      if (err.status && err.code) throw err;
      throw {
        status: 0,
        code: 'DOWNLOAD_FAILED',
        message: err.message || 'File export failed to download.',
      } as NormalizedApiError;
    }
  }
}

export const apiClient = new ApiClient();
