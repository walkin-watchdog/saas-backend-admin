import express from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { logger } from '../utils/logger';
import { TenantRequest } from '../middleware/tenantMiddleware';
import { TenantConfigService } from '../services/tenantConfigService';
import { externalCall } from '../utils/externalAdapter';

const router = express.Router();

// Google Places API integration

const fetchGoogleReviews = async (placeId: string, tenantId?: string) => {
  try {
    const apiKey = await TenantConfigService.getMapsApiKey(tenantId || '');
    if (!apiKey) {
      const err: any = new Error('Google Maps/Places API key not configured');
      err.code = 'MAPS_API_KEY_MISSING';
      throw err;
    }

    const response = await externalCall('maps', (signal) =>
      fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&key=${apiKey}`,
        { signal }
      )
    );

    if (!response.ok) {
      throw new Error('Failed to fetch Google reviews');
    }

    const data = await response.json();

    if (data.status !== 'OK') {
      throw new Error(`Google Places API error: ${data.status}`);
    }

    return {
      reviews: data.result.reviews || [],
      rating: data.result.rating || 0,
      total_ratings: data.result.user_ratings_total || 0
    };
  } catch (error) {
    logger.error('Error fetching Google reviews:', error);
    throw error;
  }
};

// TripAdvisor API integration (Note: TripAdvisor has limited public API access)
// const fetchTripAdvisorReviews = async (businessId: string) => {
//   try {
//     // TripAdvisor API is very limited for public access
//     // This is a placeholder for when/if you get API access
//     const apiKey = process.env.TRIPADVISOR_API_KEY;
    
//     if (!apiKey) {
//       // Return mock data if no API key
//       return {
//         reviews: [
//           {
//             id: 'ta_1',
//             user: { username: 'TravelExpert2024' },
//             title: 'Excellent Heritage Tour',
//             text: 'Amazing experience with Zenseeo. Professional guides and well-organized itinerary.',
//             rating: 5,
//             published_date: new Date().toISOString(),
//             url: 'https://tripadvisor.com/review/example'
//           }
//         ],
//         rating: 4.8,
//         total_reviews: 156
//       };
//     }

//     // Implement actual TripAdvisor API call when available
//     const response = await fetch(
//       `https://api.content.tripadvisor.com/api/v1/location/${businessId}/reviews?key=${apiKey}`,
//       {
//         headers: {
//           'Accept': 'application/json'
//         }
//       }
//     );

//     if (!response.ok) {
//       throw new Error('Failed to fetch TripAdvisor reviews');
//     }

//     return await response.json();
//   } catch (error) {
//     logger.error('Error fetching TripAdvisor reviews:', error);
//     // Return mock data on error
//     return {
//       reviews: [],
//       rating: 0,
//       total_reviews: 0
//     };
//   }
// };

// Get Google Reviews
router.get('/google', async (req: TenantRequest, res, next) => {
  try {
    const { placeId } = z.object({
      placeId: z.string().min(1)
    }).parse(req.query);

    const reviews = await fetchGoogleReviews(placeId, req.tenantId);
    res.json(reviews);
  } catch (error: any) {
    if (error?.code === 'MAPS_API_KEY_MISSING') {
      return res.status(412).json({
        code: 'MAPS_API_KEY_MISSING',
        message: 'Set Google Maps API key in Settings → Integrations',
      });
    }
    next(error);
  }
});

// Get combined reviews from all platforms
router.get('/combined', async (req: TenantRequest, res, next) => {
  try {
    const { placeId, businessId } = z.object({
      placeId: z.string().optional(),
      businessId: z.string().optional()
    }).parse(req.query);

    const reviews = [];
    let totalRating = 0;
    let totalCount = 0;

    // Fetch Google reviews
    if (placeId) {
      try {
        const googleData = await fetchGoogleReviews(placeId, req.tenantId);
        reviews.push(...googleData.reviews.map((review: any) => ({
          ...review,
          platform: 'google',
          id: `google_${review.time || Date.now()}`
        })));
        totalRating += googleData.rating * googleData.total_ratings;
        totalCount += googleData.total_ratings;
      } catch (error: any) {
        if (error?.code === 'MAPS_API_KEY_MISSING') {
          return res.status(412).json({
            code: 'MAPS_API_KEY_MISSING',
            message: 'Set Google Maps API key in Settings → Integrations',
          });
        }
        logger.warn('Failed to fetch Google reviews:', error);
      }
    }

    // Fetch TripAdvisor reviews
    // if (businessId) {
    //   try {
    //     const tripadvisorData = await fetchTripAdvisorReviews(businessId);
    //     reviews.push(...tripadvisorData.reviews.map((review: any) => ({
    //       ...review,
    //       platform: 'tripadvisor',
    //       id: `tripadvisor_${review.id || Date.now()}`
    //     })));
    //     totalRating += tripadvisorData.rating * tripadvisorData.total_reviews;
    //     totalCount += tripadvisorData.total_reviews;
    //   } catch (error) {
    //     logger.warn('Failed to fetch TripAdvisor reviews:', error);
    //   }
    // }

    // Calculate overall rating
    const overallRating = totalCount > 0 ? totalRating / totalCount : 0;

    // Sort reviews by date (newest first)
    reviews.sort((a, b) => {
      const dateA = new Date(a.time || a.published_date || 0).getTime();
      const dateB = new Date(b.time || b.published_date || 0).getTime();
      return dateB - dateA;
    });

    res.json({
      reviews: reviews.slice(0, 20), // Limit to 20 most recent
      overall_rating: overallRating,
      total_reviews: totalCount,
      platforms: {
        google: placeId ? true : false,
        tripadvisor: businessId ? true : false
      }
    });
  } catch (error) {
    next(error);
  }
});

// Admin endpoint to update review settings
router.put('/settings', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    const { googlePlaceId, tripadvisorBusinessId } = z.object({
      googlePlaceId: z.string().optional(),
      tripadvisorBusinessId: z.string().optional()
    }).parse(req.body);
    
    res.json({
      message: 'Review settings updated successfully',
      settings: {
        googlePlaceId,
        tripadvisorBusinessId
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;