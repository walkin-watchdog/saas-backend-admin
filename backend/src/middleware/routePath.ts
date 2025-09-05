import { Request, Response, NextFunction } from 'express';

export function routePath(req: Request, res: Response, next: NextFunction) {
  if (req.route?.path) {
    res.locals.routePath = req.baseUrl + req.route.path;
  }
  next();
}