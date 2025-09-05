import express from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { GenericService } from '../services/genericService';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

const teamMemberSchema = z.object({
  name: z.string().min(1),
  jobTitle: z.string().min(1),
  description: z.string().min(1),
  imageUrl: z.string().nullable().optional()
});

// Get all team members
router.get('/', async (req: TenantRequest, res, next) => {
  try {
    const teamMembers = await GenericService.findManyTeamMembers({
      orderBy: { createdAt: 'desc' }
    });
    res.json(teamMembers);
  } catch (error) {
    next(error);
  }
});

// Get single team member
router.get('/:id', async (req: TenantRequest, res, next) => {
  try {
    const teamMember = await GenericService.findTeamMember(req.params.id);
    
    if (!teamMember) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    
    res.json(teamMember);
  } catch (error) {
    next(error);
  }
});

// Create team member (Admin only)
router.post('/', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const data = teamMemberSchema.parse(req.body);
    
    const teamMember = await GenericService.createTeamMember(data);
    
    res.status(201).json(teamMember);
  } catch (error) {
    next(error);
  }
});

// Update team member (Admin only)
router.put('/:id', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const data = teamMemberSchema.parse(req.body);
    
    const teamMember = await GenericService.updateTeamMember(req.params.id, data);
    
    res.json(teamMember);
  } catch (error) {
    next(error);
  }
});

// Delete team member (Admin only)
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    await GenericService.deleteTeamMember(req.params.id);
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;