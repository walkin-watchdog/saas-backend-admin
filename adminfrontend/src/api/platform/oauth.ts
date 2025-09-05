import { platformApiRequest } from './base';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface OAuthCallbackData {
  totp?: string;
  recoveryCode?: string;
}

export interface OAuthCallbackResponse {
  access: string;
  csrfToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    roles: string[];
    permissions?: string[];
  };
}

export const oauthApi = {
  authorize(provider: string): void {
    window.location.href = `${API_BASE}/platform/auth/oauth/${provider}`;
  },

  async getProviders(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/platform/auth/oauth/providers`, {
      credentials: 'include',
    });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return data.providers || [];
  },

  async complete(
    provider: string,
    data: OAuthCallbackData = {},
  ): Promise<OAuthCallbackResponse> {
    const csrf =
      document.cookie
        .split('; ')
        .find(c => c.startsWith('oauth_csrf='))?.split('=')[1] || '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (csrf) {
      headers['x-csrf-token'] = csrf;
    }

    return platformApiRequest<OAuthCallbackResponse>(
      `/auth/oauth/${provider}/complete`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      },
    );
  },
};

export default oauthApi;
