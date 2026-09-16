/**
 * @jest-environment node
 *
 * Apify BYOK Service Unit Tests
 * Verifies per-business token loading, actor run lifecycle, dataset import
 * (with dedupe), and that usage never touches another business's key.
 */

import { ApifyService } from '../src/server/services/apify.service';

// ======== Mocks ========
jest.mock('../src/server/db', () => ({
  prisma: {
    externalIntegration: {
      findFirst: jest.fn(),
    },
    contact: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn(),
    },
    aiUsageLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('axios');

jest.mock('../src/server/services/data-encryption.service', () => ({
  decryptData: jest.fn((s: string) => s.replace('enc_', '')),
}));

import axios from 'axios';
import { prisma } from '../src/server/db';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedPrisma = prisma as any;

const BUSINESS_ID = 'test-business-123';
const APIFY_KEY = 'apify_api_testkey123';

const integrationRow = (active = true) => ({
  apiKeyEncrypted: `enc_${APIFY_KEY}`,
  isActive: active,
});

describe('ApifyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.externalIntegration.findFirst.mockResolvedValue(integrationRow());
    mockedPrisma.aiUsageLog.create.mockResolvedValue({ id: 'log-1' });
    mockedPrisma.aiUsageLog.findFirst.mockResolvedValue(null);
    mockedPrisma.contact.count.mockResolvedValue(0);
  });

  // ==================== requireKey ====================

  describe('requireKey', () => {
    it('throws a friendly error when Apify is not connected', async () => {
      mockedPrisma.externalIntegration.findFirst.mockResolvedValue(null);

      await expect(ApifyService.getAccount(BUSINESS_ID)).rejects.toThrow(
        /not connected/i
      );
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('decrypts the stored key before use', async () => {
      mockedAxios.get.mockResolvedValue({ data: { data: { username: 'acme' } } });

      const account = await ApifyService.getAccount(BUSINESS_ID);

      expect(account.username).toBe('acme');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.apify.com/v2/users/me',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${APIFY_KEY}` }),
        })
      );
      expect(mockedPrisma.externalIntegration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ businessId: BUSINESS_ID, provider: 'apify' }),
        })
      );
    });

    it('maps a 401 to an invalid-token message', async () => {
      const err: any = new Error('Unauthorized');
      err.response = { status: 401, data: {} };
      mockedAxios.get.mockRejectedValue(err);

      await expect(ApifyService.getAccount(BUSINESS_ID)).rejects.toThrow(
        /Invalid Apify token/i
      );
    });
  });

  // ==================== startRun ====================

  describe('startRun', () => {
    it('rejects malformed actor ids before any network call', async () => {
      await expect(
        ApifyService.startRun(BUSINESS_ID, { actorId: '../../etc/passwd' })
      ).rejects.toThrow(/Invalid actor id/i);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('rejects non-object input', async () => {
      await expect(
        ApifyService.startRun(BUSINESS_ID, {
          actorId: 'apify/google-maps-scraper',
          input: 'nope' as any,
        })
      ).rejects.toThrow(/JSON object/i);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('posts to the actor runs endpoint and returns run info', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: { id: 'run-1', status: 'RUNNING', defaultDatasetId: 'ds-1' } },
      });

      const run = await ApifyService.startRun(BUSINESS_ID, {
        actorId: 'apify/google-maps-scraper',
        input: { searchStringsArray: ['x'] },
      });

      expect(run).toEqual({ runId: 'run-1', status: 'RUNNING', datasetId: 'ds-1' });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.apify.com/v2/acts/apify/google-maps-scraper/runs',
        expect.objectContaining({ searchStringsArray: ['x'] }),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${APIFY_KEY}` }),
        })
      );
      expect(mockedPrisma.aiUsageLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ provider: 'apify', model: 'apify/google-maps-scraper' }),
        })
      );
    });

    it('maps 402 to a credits-exhausted message', async () => {
      const err: any = new Error('Payment required');
      err.response = { status: 402, data: {} };
      mockedAxios.post.mockRejectedValue(err);

      await expect(
        ApifyService.startRun(BUSINESS_ID, { actorId: 'apify/google-maps-scraper' })
      ).rejects.toThrow(/credits exhausted/i);
    });
  });

  // ==================== getRun ====================

  describe('getRun', () => {
    it('returns mapped run fields', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          data: {
            id: 'run-1', actId: 'apify/google-maps-scraper', status: 'RUNNING',
            defaultDatasetId: 'ds-1', stats: {}, startedAt: 't0', finishedAt: null,
          },
        },
      });

      const run = await ApifyService.getRun(BUSINESS_ID, 'run-1');

      expect(run).toMatchObject({ id: 'run-1', status: 'RUNNING', datasetId: 'ds-1' });
      // Non-terminal: no cost recorded yet
      expect(mockedPrisma.aiUsageLog.findFirst).not.toHaveBeenCalled();
    });

    it('records compute cost exactly once when the run finishes', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          data: {
            id: 'run-1', actId: 'a/b', status: 'SUCCEEDED',
            defaultDatasetId: 'ds-1', stats: { computeUnits: 2 }, startedAt: 't0', finishedAt: 't1',
          },
        },
      });
      // First poll: no existing log → record. Second poll: already recorded → skip.
      mockedPrisma.aiUsageLog.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 'existing' });

      await ApifyService.getRun(BUSINESS_ID, 'run-1');
      await ApifyService.getRun(BUSINESS_ID, 'run-1'); // second poll must not double-log

      const runLogs = mockedPrisma.aiUsageLog.create.mock.calls.filter(
        (c: any) => c[0]?.data?.task === 'apify-run:run-1'
      );
      expect(runLogs).toHaveLength(1);
      expect(runLogs[0][0].data.costUsd).toBeCloseTo(0.5, 4); // 2 CU x $0.25
    });

    it('rejects suspicious run ids', async () => {
      await expect(ApifyService.getRun(BUSINESS_ID, '../x')).rejects.toThrow(/Invalid run id/i);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  // ==================== getRunItems ====================

  describe('getRunItems', () => {
    it('resolves dataset from the run and clamps limits', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({
          data: { data: { id: 'run-1', status: 'SUCCEEDED', defaultDatasetId: 'ds-9' } },
        })
        .mockResolvedValueOnce({ data: [{ title: 'A' }, { title: 'B' }] });

      const items = await ApifyService.getRunItems(BUSINESS_ID, { runId: 'run-1', limit: 5000 });

      expect(items).toEqual([{ title: 'A' }, { title: 'B' }]);
      expect(mockedAxios.get).toHaveBeenLastCalledWith(
        'https://api.apify.com/v2/datasets/ds-9/items',
        expect.objectContaining({
          params: expect.objectContaining({ limit: 1000 }),
        })
      );
    });

    it('requires runId or datasetId', async () => {
      await expect(ApifyService.getRunItems(BUSINESS_ID, {})).rejects.toThrow(/runId or datasetId/i);
    });
  });

  // ==================== mapItemToContact ====================

  describe('mapItemToContact', () => {
    it('picks best-effort fields and validates email', () => {
      const mapped = ApifyService.mapItemToContact({
        title: '  Sharma Traders ',
        phone: '+91 98765 43210',
        email: 'not-an-email',
        website: 'https://example.com',
      });
      expect(mapped).toEqual(
        expect.objectContaining({
          name: 'Sharma Traders',
          phone: '+91 98765 43210',
          website: 'https://example.com',
        })
      );
      expect(mapped.email).toBeUndefined();
    });
  });

  // ==================== importRunItems ====================

  describe('importRunItems', () => {
    const items = [
      { title: 'Shop A', phone: '111', email: 'a@x.com' },
      { title: 'Shop B', phone: '222' },
      { title: 'Dup of A', phone: '111', email: 'a@x.com' }, // intra-batch dup
      { title: 'No contact info at all' },
    ];

    it('dedupes within batch and against existing contacts', async () => {
      mockedPrisma.contact.findMany.mockResolvedValue([{ phone: '222', email: null }]);
      mockedPrisma.contact.createMany.mockResolvedValue({ count: 2 });

      const result = await ApifyService.importRunItems(BUSINESS_ID, {
        items: items as any,
        runId: 'run-9',
      });

      // Shop A + name-only row imported; Shop B skipped (existing phone 222);
      // dup skipped (intra-batch). Name-only rows are valid CRM contacts.
      expect(result).toEqual({ imported: 2, skipped: 2, total: 4 });
      expect(mockedPrisma.contact.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              businessId: BUSINESS_ID,
              name: 'Shop A',
              source: 'apify',
              sourceId: 'run-9',
              tags: expect.arrayContaining(['apify-import']),
              metadata: expect.objectContaining({ apify: expect.anything() }),
            }),
          ]),
        })
      );
      expect(mockedPrisma.contact.createMany.mock.calls[0][0].data).toHaveLength(2);
    });

    it('returns zeros for empty or unmappable items', async () => {
      const result = await ApifyService.importRunItems(BUSINESS_ID, {
        items: [{ title: '' }, {}] as any,
      });
      expect(result).toEqual({ imported: 0, skipped: 2, total: 2 });
      expect(mockedPrisma.contact.createMany).not.toHaveBeenCalled();
    });
  });

  // ==================== getUsage ====================

  describe('getUsage', () => {
    it('aggregates runs, spend and imports', async () => {
      mockedPrisma.aiUsageLog.findMany.mockResolvedValue([
        { task: 'apify-start:run-1', costUsd: 0 },
        { task: 'apify-start:failed', costUsd: 0 },
        { task: 'apify-run:run-1', costUsd: 0.5 },
      ]);
      mockedPrisma.contact.count.mockResolvedValue(7);

      const usage = await ApifyService.getUsage(BUSINESS_ID);

      expect(usage).toEqual({
        runsStarted: 1,
        runsCompleted: 1,
        computeUsd: 0.5,
        contactsImported: 7,
      });
    });
  });
});
