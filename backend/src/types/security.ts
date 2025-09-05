export interface CaptchaConfig {
  provider: 'recaptcha' | 'hcaptcha';
  secretKey: string;
  /** Minimum score required when using score-based CAPTCHA providers */
  threshold?: number;
}

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  redirectUri: string;
  scope?: string;
  /** Expected issuer for ID tokens */
  issuer?: string;
  /** JWKS endpoint used to verify ID token signatures */
  jwksUri?: string;
}

export interface OAuthConfig {
  [provider: string]: OAuthProviderConfig;
}
