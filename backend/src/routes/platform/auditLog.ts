import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest } from '../../middleware/platformAuth';
import { AuditService } from '../../services/auditService';

const router = express.Router();

const safeDate = z.coerce.date().refine(d => !isNaN(d.getTime()), { message: 'Invalid date' });
const auditFiltersSchema = z.object({
  platformUserId: z.string().optional(),
  tenantId: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  startDate: safeDate.optional(),
  endDate: safeDate.optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

// Get audit logs
router.get('/', 
  requirePlatformPermissions('audit.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = auditFiltersSchema.parse(req.query);
      
      const [logs, total] = await Promise.all([
        AuditService.findLogs(filters),
        AuditService.countLogs(filters)
      ]);
      
      res.json({
        logs,
        pagination: {
          limit: filters.limit || 50,
          offset: filters.offset || 0,
          total
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get audit log entry
router.get('/:id', 
  requirePlatformPermissions('audit.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const log = await AuditService.findById(req.params.id);
      if (!log) {
        return res.status(404).json({ error: 'Audit log entry not found' });
      }

      res.json(log);
    } catch (error) {
      next(error);
    }
  }
);

// Export audit logs
router.get('/export/csv', 
  requirePlatformPermissions('audit.export'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = auditFiltersSchema.parse(req.query);
      
      const logs = await AuditService.findLogs({
        ...filters,
        limit: 10000 // Large export limit
      });
      
      const headers = [
        'ID',
        'Platform User ID',
        'Tenant ID',
        'Action',
        'Resource',
        'Resource ID',
        'IP Address',
        'User Agent',
        'Reason',
        'Changes',
        'Created At',
      ];
      const escape = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const rows = logs.map(log => {
        const created = new Date((log as any).createdAt as any);
        const createdIso = isNaN(created.getTime()) ? '' : created.toISOString();
        return [
          (log as any).id,
          (log as any).platformUserId || '',
          (log as any).tenantId || '',
          (log as any).action,
          (log as any).resource || '',
          (log as any).resourceId || '',
          (log as any).ipAddress || '',
          (log as any).userAgent || '',
          (log as any).reason || '',
          JSON.stringify((log as any).changes || {}),
          createdIso,
        ].map(escape).join(',');
      });
      const csv = [headers.join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-log-export.csv"');
      res.send(csv);
    } catch (error) {
      next(error);
    }
  }
);

export default router;