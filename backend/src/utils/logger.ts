import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { AsyncLocalStorage } from 'async_hooks';
import { sanitize } from './sanitize';

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'error' : 'info');

const transports = [];

if (process.env.NODE_ENV !== 'test' && process.env.CI !== 'true') {
  transports.push(
    new DailyRotateFile({
      filename: 'logs/%DATE%-error.log',
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
    }),
    new DailyRotateFile({
      filename: 'logs/%DATE%-combined.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
    })
  );
}
export const requestContext = new AsyncLocalStorage<{ requestId: string; tenantId?: string; userId?: string }>();

const contextFormat = winston.format((info) => {
  const store = requestContext.getStore();
  if (store?.requestId) {
    info.requestId = store.requestId;
  }
  if (store?.tenantId) {
    info.tenantId = store.tenantId;
  }
  if (store?.userId) {
    info.userId = store.userId;
  }
  return info;
});

export const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    contextFormat(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    // Sanitize in-place to preserve winston's info object internals
    winston.format((info) => {
      const cleaned = sanitize({ ...info });
      Object.assign(info, cleaned);
      return info;
    })(),
    winston.format.json()
  ),
  defaultMeta: { service: 'saas-backend' },
  transports,
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      level,
      format: winston.format.simple(),
    })
  );
}