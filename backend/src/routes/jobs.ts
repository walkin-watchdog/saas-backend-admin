import express from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { GenericService } from '../services/genericService';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

const jobPostingSchema = z.object({
  title: z.string().min(1),
  department: z.string().min(1),
  location: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
  responsibilities: z.array(z.string().min(1)),
  requirements: z.array(z.string().min(1)),
  benefits: z.array(z.string().min(1))
});

// Get all job postings
router.get('/', async (req: TenantRequest, res, next) => {
  try {
    const jobs = await GenericService.findManyJobPostings({
      orderBy: { createdAt: 'desc' }
    });
    res.json(jobs);
  } catch (error) {
    next(error);
  }
});

// Get job posting by ID
router.get('/:id', async (req: TenantRequest, res, next) => {
  try {
    const job = await GenericService.findJobPosting(req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job posting not found' });
    }
    
    res.json(job);
  } catch (error) {
    next(error);
  }
});

// Create job posting (Admin only)
router.post('/', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const data = jobPostingSchema.parse(req.body);
    
    const job = await GenericService.createJobPosting(data);
    
    res.status(201).json(job);
  } catch (error) {
    next(error);
  }
});

// Update job posting (Admin only)
router.put('/:id', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const data = jobPostingSchema.parse(req.body);
    
    const job = await GenericService.updateJobPosting(req.params.id, data);
    
    res.json(job);
  } catch (error) {
    next(error);
  }
});

// Delete job posting (Admin only)
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    await GenericService.deleteJobPosting(req.params.id);
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;