import { NextFunction, Request, Response } from 'express';
import { requestContext } from '../utils/logger';
import { httpRequestDuration, hashTenantId } from '../utils/metrics';

export function httpMetrics(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const store = requestContext.getStore();
    const tenant = store?.tenantId ? hashTenantId(store.tenantId) : 'unknown';
    const route =
      (res.locals.routePath as string | undefined) ||
      req.baseUrl + (req.route?.path ?? req.originalUrl.split('?')[0]);
    httpRequestDuration.labels(route, String(res.statusCode), tenant).observe(duration);
  });
  next();
}