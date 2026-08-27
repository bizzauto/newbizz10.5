import { Router, Request, Response } from 'express';
import logger from '../utils/logger.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { pipelineSummary, salesRepPerformance } from '../services/revenueIntelligence.service.js';
import { flagAtRisk } from '../services/churnDetection.service.js';
import {
  generateDailyReport,
  dispatchDailyReport,
} from '../services/dailyAutopilot.service.js';

export const businessIntelligenceRouter = Router();

// GET /api/bi/pipeline
businessIntelligenceRouter.get(
  '/pipeline',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) {
        return res.status(403).json({ success: false, error: 'No business associated' });
      }
      const sinceDays = req.query.sinceDays ? Number(req.query.sinceDays) : 30;
      const summary = await pipelineSummary(businessId, sinceDays);
      return res.json({ success: true, data: summary });
    } catch (err: any) {
      logger.error('[bi] pipeline failed', { error: err?.message });
      return res.status(500).json({ success: false, error: err?.message || 'Internal error' });
    }
  }
);

// GET /api/bi/sales-rep-performance
businessIntelligenceRouter.get(
  '/sales-rep-performance',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) {
        return res.status(403).json({ success: false, error: 'No business associated' });
      }
      const data = await salesRepPerformance(businessId);
      return res.json({ success: true, data });
    } catch (err: any) {
      logger.error('[bi] sales-rep-performance failed', { error: err?.message });
      return res.status(500).json({ success: false, error: err?.message || 'Internal error' });
    }
  }
);

// GET /api/bi/churn/flag
businessIntelligenceRouter.get(
  '/churn/flag',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) {
        return res.status(403).json({ success: false, error: 'No business associated' });
      }
      const data = await flagAtRisk(businessId);
      return res.json({ success: true, data });
    } catch (err: any) {
      logger.error('[bi] churn/flag failed', { error: err?.message });
      return res.status(500).json({ success: false, error: err?.message || 'Internal error' });
    }
  }
);

// GET /api/bi/daily-report
businessIntelligenceRouter.get(
  '/daily-report',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) {
        return res.status(403).json({ success: false, error: 'No business associated' });
      }
      const report = await generateDailyReport(businessId);
      return res.json({ success: true, data: report });
    } catch (err: any) {
      logger.error('[bi] daily-report failed', { error: err?.message });
      return res.status(500).json({ success: false, error: err?.message || 'Internal error' });
    }
  }
);

// POST /api/bi/daily-report/dispatch
businessIntelligenceRouter.post(
  '/daily-report/dispatch',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) {
        return res.status(403).json({ success: false, error: 'No business associated' });
      }
      const result = await dispatchDailyReport(businessId);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      logger.error('[bi] daily-report/dispatch failed', { error: err?.message });
      return res.status(500).json({ success: false, error: err?.message || 'Internal error' });
    }
  }
);
