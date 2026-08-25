/**
 * Centralized structured logger for the BizzAuto CRM server.
 *
 * Usage:
 *   import { logger } from '../utils/logger.js';
 *   logger.info('Server started', { port: 3000 });
 *   logger.error('Database connection failed', { error: err.message });
 *   logger.warn('Rate limit exceeded', { ip: req.ip });
 *   logger.debug('Query executed', { sql, duration });
 *
 * In production: JSON format → error.log + combined.log
 * In development: simple format → console
 */

import winston from 'winston';

const NODE_ENV = process.env.NODE_ENV || 'development';

const logger = winston.createLogger({
  level: NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'bizzauto-server' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// In non-production, also log to console
if (NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

/**
 * Create a child logger with a固定 prefix tag.
 * Usage: const log = createLogger('WhatsApp'); log.info('...');
 */
export function createLogger(tag: string): winston.Logger {
  return logger.child({ tag });
}

export default logger;
