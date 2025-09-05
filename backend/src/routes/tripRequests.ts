import express from 'express';
import { z } from 'zod';
import { TripRequestService } from '../services/tripRequestService';
import { authenticate, authorize } from '../middleware/auth';
import { EmailService } from '../services/emailService';
import { HubSpotService } from '../services/hubspotService';
import { logger } from '../utils/logger';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();


const tripRequestSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  destination: z.string().min(1),
  startDate: z.string().transform(str => new Date(str)),
  endDate: z.string().transform(str => new Date(str)),
  adults: z.number().min(1),
  children: z.number().min(0),
  budget: z.string().min(1).optional().default(''),
  interests: z.array(z.string()),
  accommodation: z.string().optional().default(''),
  transport: z.string().optional().default(''),
  specialRequests: z.string().optional()
});

// Create trip request (public)
router.post('/', async (req: TenantRequest, res, next) => {
  try {
    const data = tripRequestSchema.parse(req.body);
    
    const tripRequest = await TripRequestService.createTripRequest(data);

    await EmailService.sendTripRequestConfirmation(tripRequest).catch(console.error);
    await EmailService.sendTripRequestNotification(tripRequest).catch(console.error);
    try {
      const existed = !!(await HubSpotService.getContactByEmail(data.email));
      const contact = await HubSpotService.ensureContact({
        email: data.email,
        name : data.name,
        phone: data.phone,
      });
      const start = data.startDate.toISOString().split('T')[0];
      const end   = data.endDate.toISOString().split('T')[0];
      const dealName = `Trip request – ${data.destination}`;
      await HubSpotService.createDealForContact({
        contactId: contact.id,
        dealName,
        stageLabel: 'Qualified Lead',
        dealType: existed ? 'existingbusiness' : 'newbusiness',
        priorityLabel: 'HIGH',
        properties: {
          destination: data.destination,
          startDate: start,
          endDate: end,
          adults: data.adults,
          children: data.children,
          budget: data.budget,
          interests: data.interests,
          accommodation: data.accommodation,
          transport: data.transport,
          specialRequests: data.specialRequests
        }
      });
    } catch (e) {
      logger.error('HubSpot sync (trip request) failed', { error: (e as Error).message });
    }
    res.status(201).json(tripRequest);
  } catch (error) {
    next(error);
  }
});

// Get all trip requests (Admin/Editor only)
router.get('/', authenticate, authorize(['ADMIN', 'EDITOR', 'VIEWER']), async (req: TenantRequest, res, next) => {
  try {
    const { status, limit, offset } = req.query;
    
    const where: any = {};
    if (status) where.status = status;

    const requests = await TripRequestService.findManyTripRequests({
      where,
      take: limit ? parseInt(limit as string) : undefined,
      skip: offset ? parseInt(offset as string) : undefined,
      orderBy: { createdAt: 'desc' }
    });

    res.json(requests);
  } catch (error) {
    next(error);
  }
});

// Update trip request status (Admin/Editor only)
router.patch('/:id/status', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const { status } = z.object({
      status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED'])
    }).parse(req.body);

    const request = await TripRequestService.updateTripRequest(req.params.id, { status });

    res.json(request);
  } catch (error) {
    next(error);
  }
});

// Export trip requests (Admin/Editor only)
router.get('/export', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const requests = await TripRequestService.findManyTripRequests({
      orderBy: { createdAt: 'desc' }
    });

    // Transform for CSV export
    const csvData = requests.map(request => ({
      ID: request.id,
      Name: request.name,
      Email: request.email,
      Phone: request.phone,
      Destination: request.destination,
      'Start Date': request.startDate.toISOString().split('T')[0],
      'End Date': request.endDate.toISOString().split('T')[0],
      Adults: request.adults,
      Children: request.children,
      Budget: request.budget,
      Interests: request.interests.join(', '),
      Accommodation: request.accommodation,
      Transport: request.transport,
      'Special Requests': request.specialRequests || '',
      Status: request.status,
      'Created At': request.createdAt.toISOString()
    }));

    res.json(csvData);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    const { id } = req.params;
    const request = await TripRequestService.deleteTripRequest(id);
    res.json(request);
  } catch (error) {
    next(error);
  }
});

export default router;