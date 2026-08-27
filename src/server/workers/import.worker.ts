import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { parseFile, batchImport } from '../services/importEngine.service.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - type-only dynamic import path for ImportMapping
import type { ImportMapping } from '../services/importEngine.service.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Worker that processes contact-import jobs from the 'contact-import' queue.
 * Instanced here and exported so worker.ts (wired by the coordinator) can
 * start it. We do NOT call .run() here — that happens at worker bootstrap.
 */
export const importWorker = new Worker(
  'contact-import',
  async (job) => {
    const { businessId, bufferBase64, ext, mapping, jobId } = job.data as {
      businessId: string;
      bufferBase64: string;
      ext: string;
      mapping: ImportMapping;
      jobId: string;
    };

    const buf = Buffer.from(bufferBase64, 'base64');
    const rows = await parseFile(buf, ext);
    return await batchImport(businessId, rows, mapping, jobId);
  },
  {
    connection: new IORedis(REDIS_URL, { maxRetriesPerRequest: null }),
    concurrency: 2,
  }
);

importWorker.on('failed', (job, err) => {
  // eslint-disable-next-line no-console
  console.error(`[importWorker] job ${job?.id} failed:`, err?.message);
});

importWorker.on('completed', (job, result) => {
  // eslint-disable-next-line no-console
  console.log(`[importWorker] job ${job?.id} completed:`, result);
});
