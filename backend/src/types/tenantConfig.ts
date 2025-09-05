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

export type ImageKey = 'imageRules';

export type TenantConfigKey = IntegrationKey | BrandingKey | ImageKey;

export interface MaskedSecretItem {
  secretSet: boolean;
  // secretMasked?: string // optionally add later if for adding preview
}


export interface TenantConfigValue {
  id: string;
  tenantId: string;
  key: TenantConfigKey;
  value?: any;
  secret?: string;
  dek?: string;
  createdAt: Date;
  updatedAt: Date;
}

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

export type ImageType =
  | 'destinations'
  | 'logos'
  | 'slides'
  | 'partners'
  | 'products'
  | string;

export interface ImageResolutionRule {
  imageType: ImageType;
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
  format?: 'webp' | 'jpg' | 'png';
  quality?: number | 'auto';
  minSource?: { width: number; height: number } | null;
  thumbnails?: number[];
  allowedTypes?: string[];
  maxUploadBytes?: number;
}

export interface TenantImageConfig {
  tenantId: string;
  rules: Record<ImageType, ImageResolutionRule>;
  updatedAt: string;
}

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
  /** New — theme colors used in admin UI */
  primaryColor?: string;
  secondaryColor?: string;
  tertiaryColor?: string;
  /** Feature flag to enable host-based white labeling */
  whiteLabelBranding?: boolean;
}

export type BrandingScope = 'platform' | 'tenant';

export interface CacheEventData {
  tenantId: string;
  key: TenantConfigKey;
  value: any;
}

export type ConfigData =
  | SMTPConfig
  | CloudinaryConfig
  | WordpressConfig
  | RazorpayConfig
  | PayPalConfig
  | MapsConfig
  | HubSpotConfig
  | CurrencyApiConfig
  | TenantImageConfig
  | BrandingConfig
  | TaxConfig
  | string
  | number
  | boolean;

export interface TaxConfig {
  percent: number;
  jurisdiction: string;
}