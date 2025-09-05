const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/platform`;

export class PlatformApiError extends Error {
  public status?: number;
  public code?: string;
  
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'PlatformApiError';
    this.status = status;
    this.code = code;
  }
}

interface ApiRequestOptions extends RequestInit {
  idempotencyKey?: string;
}

export async function platformApiRequest<T = any>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { idempotencyKey, ...fetchOptions } = options;
  
  const headers = new Headers(fetchOptions.headers);

  // Attach platform access token if available
  const platformToken = sessionStorage.getItem('platform_access_token');
  if (platformToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${platformToken}`);
  }

  const csrf = sessionStorage.getItem('platform_csrf_token');
  if (csrf && !headers.has('x-csrf-token')) {
    headers.set('x-csrf-token', csrf);
  }
  
  // Add idempotency key for mutating operations
  if (idempotencyKey && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(fetchOptions.method || 'GET')) {
    headers.set('Idempotency-Key', idempotencyKey);
  }
  
  // Ensure content type for JSON requests
  if (fetchOptions.body && typeof fetchOptions.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    let errorCode = response.status.toString();
    
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
      errorCode = errorData.code || errorCode;

      // Global error handling for 401/403
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('platform:unauthorized'));
      } else if (response.status === 403) {
        if (
          errorCode === 'mfa_required' ||
          errorMessage.toLowerCase().includes('mfa')
        ) {
          window.dispatchEvent(new CustomEvent('platform:mfa-required'));
        }
      }
    } catch {
      // If we can't parse error as JSON, fall back to status text
      errorMessage = response.statusText || errorMessage;

      // Global error handling for 401
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('platform:unauthorized'));
      }
      // For other statuses like 403, without a response body we can't
      // reliably determine if MFA is required, so we skip dispatching
      // platform:mfa-required here.
    }
    
    throw new PlatformApiError(errorMessage, response.status, errorCode);
  }

  // Handle 204 No Content responses
  if (response.status === 204) {
    return null as T;
  }

  try {
    return await response.json();
  } catch {
    // If response isn't JSON, return the text
    return (await response.text()) as T;
  }
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

// Helper for pagination parameters
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total?: number;
  };
}