export interface Product {
  id: string;
  title: string;
  productCode: string;
  location: string;
  duration: string;
  packages: any[];
}

export interface PricingTier {
  min: number;
  max: number;
  price: number;
}