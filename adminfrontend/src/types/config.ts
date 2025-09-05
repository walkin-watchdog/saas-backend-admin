// Configuration types mirroring backend schemas

export type IntegrationKey = 
  | 'smtp' 
  | 'cloudinary' 
  | 'wordpress' 
  | 'currencyApi' 
  | 'razorpay' 
  | 'paypal'
  | 'maps'
  | 'hubspot'
  | 'tax';

export type BrandingKey = 
  | 'companyName' 
  | 'companyEmail' 
  | 'companyPhone' 
  | 'companyAddress' 
  | 'whatsappNumber' 
  | 'facebookUrl' 
  | 'linkedinUrl' 
  | 'xUrl' 
  | 'instagramUrl' 
  | 'logoUrl' 
  | 'footerHtml' 
  | 'primaryColor' 
  | 'secondaryColor' 
  | 'tertiaryColor' 
  | 'whiteLabelBranding';

export type TenantConfigKey = IntegrationKey | BrandingKey | 'imageRules';

export interface SecretMetadata {
  secretSet: boolean;
}

// Integration schemas
export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export interface WordpressConfig {
  baseUrl: string;
  username: string;
  appPassword: string;
}

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  baseUrl: string;
  redirectUrl: string;
}

export interface MapsConfig {
  provider?: 'google';
  googleApiKey: string;
}

export interface HubSpotConfig {
  accessToken: string;
  defaultOwnerId?: string;
  contactSourceProperty?: string;
  dealsPipelineId?: string;
  dealsPipelineName?: string;
}

export interface CurrencyApiConfig {
  apiKey: string;
}

export interface TaxConfig {
  percent: number; // 0-100
  jurisdiction: string;
}

// Branding config
export interface BrandingConfig {
  companyName?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyAddress?: string;
  whatsappNumber?: string;
  facebookUrl?: string;
  linkedinUrl?: string;
  xUrl?: string;
  instagramUrl?: string;
  logoUrl?: string;
  footerHtml?: string;
  primaryColor?: string;
  secondaryColor?: string;
  tertiaryColor?: string;
  whiteLabelBranding?: boolean;
  defaultsUsed?: boolean;
}

// Theme resolution
export interface ThemeConfig {
  logoUrl?: string;
  colors: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  scope: 'platform' | 'tenant';
  defaultsUsed?: boolean;
}

// Domain management
export interface TenantDomain {
  id: string;
  tenantId: string;
  domain: string;
  isActive: boolean;
  isAdminHost: boolean;
  verificationToken?: string;
  verifiedAt?: string;
  createdAt: string;
}

export interface DomainVerificationInfo {
  domain: string;
  token: string;
  dnsRecord: {
    host: string;
    type: string;
    value: string;
  };
}

// API response types
export interface ConfigListResponse {
  [key: string]: any | SecretMetadata;
  defaultsUsed?: boolean;
}

export interface SecretConfigResponse {
  key: string;
  secret: any;
  isEncrypted: boolean;
  hasValue: boolean;
}

export interface NonSecretConfigResponse {
  key: string;
  value: any;
  isEncrypted: boolean;
  hasValue: boolean;
}

export interface CloudinaryCloudNameResponse {
  cloudName: string | null;
  configured: boolean;
}

// Completion tracking
export interface SetupCompletionStatus {
  branding: boolean;
  cloudinary: boolean;
  smtp: boolean;
  currencyApi: boolean;
  maps: boolean;
  paymentGateway: boolean;
  hubspot?: boolean;
  wordpress?: boolean;
}

export interface CompletionProgress {
  percentage: number;
  completed: number;
  total: number;
  items: Array<{
    iconName: string;
    key: string;
    label: string;
    completed: boolean;
    link: string;
    required: boolean;
  }>;
}

// 412 error codes
export const PRECONDITION_CODES = {
  SMTP_CONFIG_MISSING: 'smtp',
  BRANDING_CONFIG_MISSING: 'brand',
  CURRENCY_API_KEY_MISSING: 'currencyApi',
  CONFIG_MISSING_TENANT: 'gateway',
  HUBSPOT_CONFIG_MISSING: 'hubspot',
  MAPS_API_KEY_MISSING: 'maps',
  WORDPRESS_CONFIG_MISSING: 'wordpress',
  PAYPAL_CONFIG_MISSING: 'paypal',
  PAYPAL_WEBHOOK_ID_MISSING: 'paypal_webhook',
  CLOUDINARY_CONFIG_MISSING: 'cloudinary',
} as const;