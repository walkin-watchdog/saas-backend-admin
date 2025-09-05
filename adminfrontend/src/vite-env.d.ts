/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
  readonly VITE_COMPANY_PHONE: string;
  readonly VITE_COMPANY_SUPPORT_EMAIL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}