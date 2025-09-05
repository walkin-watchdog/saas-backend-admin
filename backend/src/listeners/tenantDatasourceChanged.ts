import { eventBus, TENANT_EVENTS } from '../utils/eventBus';
import { AuditService } from '../services/auditService';
import { logger } from '../utils/logger';

eventBus.on(TENANT_EVENTS.DATASOURCE_CHANGED, async (payload: any) => {
  try {
    await AuditService.log({
      tenantId: payload.tenantId,
      action: 'tenant.datasource_changed',
      resource: 'tenant',
      resourceId: payload.tenantId,
      reason: payload.reason,
      changes: {
        before: {
          dedicated: payload?.before?.dedicated,
          hasUrl: !!payload?.before?.datasourceUrl,
        },
        after: {
          dedicated: payload?.after?.dedicated,
          hasUrl: !!payload?.after?.datasourceUrl,
        },
      },
    });
  } catch (e) {
    logger.error('audit.datasource_changed_failed', { error: (e as Error).message });
  }
});