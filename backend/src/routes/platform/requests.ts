import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest } from '../../middleware/platformAuth';
import { RequestService } from '../../services/requestService';

const router = express.Router();

const requestFiltersSchema = z.object({
  status: z.enum(['new', 'in_review', 'converted', 'rejected']).optional(),
  kind: z.enum(['contact', 'trial', 'enterprise']).optional(),
  assignedToId: z.string().optional(),
  email: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const assignRequestSchema = z.object({
  assignedToId: z.string(),
});

const convertRequestSchema = z.object({
  companyName: z.string().min(1),
  planId: z.string(),
  ownerPassword: z.string().min(6),
});

const rejectRequestSchema = z.object({
  reason: z.string().min(1),
});

const updateStatusSchema = z.object({
  status: z.enum(['new', 'in_review', 'converted', 'rejected']),
});

// Get all requests
router.get('/', 
  requirePlatformPermissions('requests.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = requestFiltersSchema.parse(req.query);
      const requests = await RequestService.findRequests(filters);
      
      res.json({
        requests,
        pagination: {
          limit: filters.limit || 50,
          offset: filters.offset || 0,
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get single request
router.get('/:id', 
  requirePlatformPermissions('requests.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const request = await RequestService.findRequestById(req.params.id);
      
      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }

      res.json(request);
    } catch (error) {
      next(error);
    }
  }
);

// Assign request
router.post('/:id/assign', 
  requirePlatformPermissions('requests.assign'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { assignedToId } = assignRequestSchema.parse(req.body);
      
      const request = await RequestService.assignRequest(
        req.params.id,
        assignedToId,
        req.platformUser!.id
      );
      
      res.json(request);
    } catch (error) {
      // Normalize service error to HTTP 404 for missing assignee
      if (error instanceof Error && /assignee not found/i.test(error.message)) {
        return res.status(404).json({ error: 'Assignee not found' });
      }
      next(error);
    }
  }
);

// Convert request to tenant
router.post('/:id/convert', 
  requirePlatformPermissions('requests.convert'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const conversionData = convertRequestSchema.parse(req.body);
      
      const result = await RequestService.convertRequest(
        req.params.id,
        conversionData,
        req.platformUser!.id
      );
      
      res.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (/already converted/i.test(error.message)) {
          return res.status(409).json({ error: 'Request already converted' });
        }
        if (/request not found/i.test(error.message)) {
          return res.status(404).json({ error: 'Request not found' });
        }
      }
      next(error);
    }
  }
);

// Reject request
router.post('/:id/reject', 
  requirePlatformPermissions('requests.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { reason } = rejectRequestSchema.parse(req.body);
      
      const request = await RequestService.rejectRequest(
        req.params.id,
        reason,
        req.platformUser!.id
      );
      
      res.json(request);
    } catch (error) {
      if (error instanceof Error) {
        if (/already converted/i.test(error.message)) {
          return res.status(409).json({ error: 'Request already converted' });
        }
        if (/request not found/i.test(error.message)) {
          return res.status(404).json({ error: 'Request not found' });
        }
      }
      next(error);
    }
  }
);

// Update request status
router.patch('/:id/status', 
  requirePlatformPermissions('requests.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { status } = updateStatusSchema.parse(req.body);
      
      const request = await RequestService.updateRequestStatus(
        req.params.id,
        status,
        req.platformUser!.id
      );
      
      res.json(request);
    } catch (error) {
      next(error);
    }
  }
);

export default router;