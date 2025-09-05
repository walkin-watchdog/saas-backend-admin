import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { requestContext } from '../utils/logger';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('X-Request-Id');
  const id = incoming && incoming.trim() !== '' ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  (req as any).requestId = id;
  requestContext.run({ requestId: id, tenantId: 'platform' }, () => next());
}