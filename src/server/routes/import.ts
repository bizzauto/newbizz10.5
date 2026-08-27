import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.js';
import {
  parseFile,
  detectColumns,
  importQueue,
  importProgress,
  ImportMapping,
} from '../services/importEngine.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

export const importRouter = Router();

/**
 * POST /api/import/contacts
 * Upload a file (multipart 'file') and preview its columns + first 5 rows.
 * Does NOT start the import — the client must call /confirm next.
 */
importRouter.post(
  '/contacts',
  authenticate,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const ext = (req.file.originalname.match(/\.[^.]+$/) || ['.csv'])[0];
      const rows = await parseFile(req.file.buffer, ext);
      const columns = await detectColumns(rows);
      const preview = rows.slice(0, 5);

      return res.json({
        success: true,
        columns,
        preview,
        jobToken: crypto.randomBytes(16).toString('hex'),
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({ success: false, error: err?.message || 'Failed to parse file' });
    }
  }
);

/**
 * POST /api/import/contacts/confirm
 * Body: { fileBase64, ext, mapping }
 * Enqueues a background import job and returns its jobId.
 */
importRouter.post(
  '/contacts/confirm',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { fileBase64, ext, mapping } = req.body || {};
      const user = (req as any).user;

      if (!fileBase64 || !ext || !mapping) {
        return res
          .status(400)
          .json({ success: false, error: 'fileBase64, ext and mapping are required' });
      }

      const businessId: string | null = user?.businessId ?? null;
      if (!businessId) {
        return res
          .status(403)
          .json({ success: false, error: 'No business associated with account' });
      }

      const jobId = crypto.randomBytes(16).toString('hex');

      await importQueue.add(
        'import',
        {
          businessId,
          bufferBase64: String(fileBase64),
          ext: String(ext),
          mapping: mapping as ImportMapping,
          jobId,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }
      );

      return res.json({ success: true, jobId });
    } catch (err: any) {
      return res
        .status(500)
        .json({ success: false, error: err?.message || 'Failed to enqueue import' });
    }
  }
);

/**
 * GET /api/import/contacts/:jobId/progress
 * Returns the in-memory progress snapshot for the job.
 */
importRouter.get(
  '/contacts/:jobId/progress',
  authenticate,
  async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const progress = importProgress.get(jobId);

    if (!progress) {
      return res.json({
        success: true,
        status: 'queued',
        jobId,
        created: 0,
        updated: 0,
        skipped: 0,
        total: 0,
        done: false,
      });
    }

    return res.json({ success: true, status: progress.done ? 'done' : 'running', jobId, ...progress });
  }
);
