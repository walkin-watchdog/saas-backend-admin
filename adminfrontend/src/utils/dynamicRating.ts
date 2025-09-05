
const RATING_MIN = 4.5;
const RATING_MAX = 4.9;
const REVIEW_START = 200;
const REVIEW_MAX = 500;
const WEEKLY_INCREMENT = 2;

const BASE_DATE = new Date('2025-01-01');

export const generateDynamicRating = (productId: string | number): number => {
  const currentDate = new Date();
  const weeksSinceBase = Math.floor((currentDate.getTime() - BASE_DATE.getTime()) / (7 * 24 * 60 * 60 * 1000));

  const seed = (typeof productId === 'string' ? productId.length : productId) + weeksSinceBase;
  const random = Math.sin(seed) * 10000;
  const normalizedRandom = random - Math.floor(random);

  const rating = RATING_MIN + (normalizedRandom * (RATING_MAX - RATING_MIN));
  
  return Math.round(rating * 10) / 10; 
};

export const generateDynamicReviewCount = (): number => {
  const currentDate = new Date();
  const weeksSinceBase = Math.floor((currentDate.getTime() - BASE_DATE.getTime()) / (7 * 24 * 60 * 60 * 1000));
  
  const reviewCount = REVIEW_START + (weeksSinceBase * WEEKLY_INCREMENT);
  
  return Math.min(reviewCount, REVIEW_MAX);
};

export const formatReviewCount = (count: number): string => {
  return count >= REVIEW_MAX ? `${REVIEW_MAX}+` : count.toString();
};

export const generateWeeklyRandomNumber = (seedId?: string | number): number => {
  const currentDate = new Date();
  const weeksSinceBase = Math.floor((currentDate.getTime() - BASE_DATE.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const seed = (seedId ? seedId.toString().length : 0) + weeksSinceBase;
  const random = Math.abs(Math.sin(seed) * 10000);
  const normalizedRandom = random - Math.floor(random);
  const value = 94 + Math.floor(normalizedRandom * 6); 
  return value;
};

export const getDynamicRatingData = (productId: string | number) => {
  const rating = generateDynamicRating(productId);
  const reviewCount = generateDynamicReviewCount();
  const formattedCount = formatReviewCount(reviewCount);
  const weeklyRandomNumber = generateWeeklyRandomNumber(productId);
  return {
    rating,
    reviewCount,
    formattedCount,
    weeklyRandomNumber
  };
};


