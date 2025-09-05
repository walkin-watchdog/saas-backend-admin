import { Request, Response, NextFunction } from 'express';
import { PlatformConfigService } from '../services/platformConfigService';
import { logger } from '../utils/logger';

/**
 * Middleware to check for maintenance mode and block requests accordingly
 */
export const checkMaintenanceMode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip maintenance check for:
    // - Health checks
    // - Platform admin routes (so admins can manage during maintenance)
    // - Webhook endpoints
    if (
      req.path === '/api/health' ||
      req.path.startsWith('/api/platform') ||
      req.path.startsWith('/api/payments/webhooks') ||
      req.path.startsWith('/api/webhooks') ||
      req.path === '/metrics' ||
      req.path.startsWith('/ops') ||
      req.method === 'OPTIONS'
    ) {
      return next();
    }

    const maintenanceMode = await PlatformConfigService.getMaintenanceMode();
    
    if (maintenanceMode.enabled) {
      // Check if we're in a scheduled maintenance window
      const now = new Date();
      const inScheduledWindow = (!maintenanceMode.scheduledStart || now >= maintenanceMode.scheduledStart) &&
                               (!maintenanceMode.scheduledEnd || now <= maintenanceMode.scheduledEnd);
      
      if (inScheduledWindow) {
        logger.info('Request blocked due to maintenance mode', {
          path: req.path,
          method: req.method,
          ip: req.ip
        });

        return res.status(503).json({
          error: 'Service temporarily unavailable',
          message: maintenanceMode.message || 'The platform is currently under maintenance. Please try again later.',
          maintenanceMode: {
            enabled: true,
            scheduledStart: maintenanceMode.scheduledStart,
            scheduledEnd: maintenanceMode.scheduledEnd
          }
        });
      }
    }

    next();
  } catch (error) {
    // If we can't check maintenance mode (e.g., DB issues), let the request through
    // to avoid blocking all traffic due to config service failures
    logger.warn('Failed to check maintenance mode, allowing request through', {
      error: (error as Error).message,
      path: req.path
    });
    next();
  }
};