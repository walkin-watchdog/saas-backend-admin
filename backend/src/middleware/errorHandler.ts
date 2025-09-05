import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

export const errorHandler = (error: any, req: Request, res: Response, _next: NextFunction) => {
  const tenantId = (req as any).tenantId || (req as any).tenant?.id || (res as any)?.locals?.tenant?.id;
  logger.error(error.message, { stack: error.stack, url: req.url, method: req.method, tenantId });

  const preconditionCodes = new Set([
    'SMTP_CONFIG_MISSING',
    'BRANDING_CONFIG_MISSING',
    'CURRENCY_API_KEY_MISSING',
    'CONFIG_MISSING_TENANT',
    'HUBSPOT_CONFIG_MISSING',
    'MAPS_API_KEY_MISSING',
    'WORDPRESS_CONFIG_MISSING',
    'PAYPAL_CONFIG_MISSING',
    'PAYPAL_WEBHOOK_ID_MISSING',
    'CLOUDINARY_CONFIG_MISSING'
  ]);

  if (preconditionCodes.has(error?.code)) {
    return res.status(412).json({ code: error.code, message: error.message });
  }

  // Respect explicit service errors
  if (typeof error?.status === 'number') {
    return res.status(error.status).json({ error: error.message, ...(error.code && { code: error.code }) });
  }

  // Zod validation -> 400
  if (error instanceof ZodError || error?.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation Error', details: (error as ZodError).issues ?? error.message });
  }

  // Prisma duplicate key -> 409
  if (error?.code === 'P2002' || (error?.name === 'PrismaClientKnownRequestError' && error?.code === 'P2002')) {
    return res.status(409).json({ error: 'Duplicate resource' });
  }

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: error.message
    });
  }

  if (error.name === 'PrismaClientKnownRequestError') {
    return res.status(500).json({
      error: 'Database Error',
      message: 'A database error occurred'
    });
  }

  // Fallback
  return res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
};