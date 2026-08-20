/**
 * @jest-environment node
 *
 * Integration tests for the Integrations API (current ExternalIntegrationService design).
 *
 * Endpoints tested:
 *   GET    /api/integrations                — list integrations
 *   POST   /api/integrations                — create integration
 *   GET    /api/integrations/:id            — get single integration
 *   PUT    /api/integrations/:id            — update integration
 *   DELETE /api/integrations/:id            — delete integration
 *   POST   /api/integrations/:id/test       — test integration connection
 *   GET    /api/integrations/providers/list — list supported providers
 *
 * The route delegates all data access to ExternalIntegrationService, which is
 * mocked here so we isolate the HTTP/middleware layer.
 */

import express from 'express';
import request from 'supertest';

const mockUser = { id: 'user-abc-123', businessId: 'biz-456', role: 'OWNER' };

const mockIntegration = {
  id: 'int-abc-123',
  businessId: 'biz-456',
  provider: 'whatsapp',
  name: 'WhatsApp',
  config: { phoneNumberId: 'pn-1' },
  isActive: true,
  lastTestedAt: null,
  lastTestStatus: null,
  lastTestError: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

// ── Auth middleware mock ──────────────────────────────────────────────────────
jest.mock('../src/server/middleware/auth', () => ({
  authenticate: jest.fn((req: any, res: any, next: any) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }
    const token = auth.replace('Bearer ', '');
    if (token === 'invalid_jwt_token' || token === 'expired_jwt_token') {
      res.status(401).json({ success: false, error: 'Invalid token' });
      return;
    }
    req.user = { ...mockUser };
    next();
  }),
  // Passthrough role guard — role enforcement is covered by the authenticate mock
  requireRole: jest.fn(() => (req: any, res: any, next: any) => next()),
  AuthRequest: class AuthRequest extends Request {},
}));

// ── ExternalIntegrationService mock ───────────────────────────────────────────
jest.mock('../src/server/services/external-integration.service.js', () => ({
  ExternalIntegrationService: {
    listByBusiness: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    testIntegration: jest.fn(),
  },
}));

jest.useFakeTimers();

import integrationsRouter from '../src/server/routes/integrations.js';
import { ExternalIntegrationService } from '../src/server/services/external-integration.service.js';

const mockService = ExternalIntegrationService as jest.Mocked<typeof ExternalIntegrationService>;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/integrations', integrationsRouter);
  return app;
}

function authHeader() {
  return { Authorization: 'Bearer valid_jwt_token' };
}

describe('Integrations API', () => {
  let app: express.Application;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.useRealTimers();
    jest.clearAllTimers();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/integrations
  // ═══════════════════════════════════════════════════════════════════════════
  describe('GET /api/integrations', () => {
    it('should return 200 with the business integrations', async () => {
      mockService.listByBusiness.mockResolvedValue([mockIntegration]);

      const res = await request(app)
        .get('/api/integrations')
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].provider).toBe('whatsapp');
      expect(mockService.listByBusiness).toHaveBeenCalledWith('biz-456');
    });

    it('should return 200 with empty array when none exist', async () => {
      mockService.listByBusiness.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/integrations')
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('should return 401 without authentication', async () => {
      await request(app).get('/api/integrations').expect(401);
    });

    it('should return 500 when the service throws', async () => {
      mockService.listByBusiness.mockRejectedValue(new Error('DB connection failed'));

      const res = await request(app)
        .get('/api/integrations')
        .set(authHeader())
        .expect(500);

      expect(res.body.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/integrations
  // ═══════════════════════════════════════════════════════════════════════════
  describe('POST /api/integrations', () => {
    const validBody = { provider: 'whatsapp', name: 'WhatsApp', apiKey: 'sk-123' };

    it('should return 201 and create the integration', async () => {
      mockService.create.mockResolvedValue(mockIntegration);

      const res = await request(app)
        .post('/api/integrations')
        .set(authHeader())
        .send(validBody)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.provider).toBe('whatsapp');
      expect(mockService.create).toHaveBeenCalledWith({
        businessId: 'biz-456',
        provider: 'whatsapp',
        name: 'WhatsApp',
        apiKey: 'sk-123',
        config: undefined,
      });
    });

    it('should return 400 when provider, name, or apiKey is missing', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set(authHeader())
        .send({ provider: 'whatsapp' }) // missing name + apiKey
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/required/i);
    });

    it('should return 400 for an unsupported provider', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set(authHeader())
        .send({ provider: 'nope', name: 'X', apiKey: 'k' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid provider/i);
    });

    it('should return 401 without authentication', async () => {
      await request(app).post('/api/integrations').send(validBody).expect(401);
    });

    it('should return 500 when the service throws', async () => {
      mockService.create.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .post('/api/integrations')
        .set(authHeader())
        .send(validBody)
        .expect(500);

      expect(res.body.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/integrations/:id
  // ═══════════════════════════════════════════════════════════════════════════
  describe('GET /api/integrations/:id', () => {
    it('should return 200 with the integration', async () => {
      mockService.getById.mockResolvedValue(mockIntegration);

      const res = await request(app)
        .get('/api/integrations/int-abc-123')
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('int-abc-123');
      expect(mockService.getById).toHaveBeenCalledWith('int-abc-123', 'biz-456');
    });

    it('should return 404 when not found', async () => {
      mockService.getById.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/integrations/missing')
        .set(authHeader())
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      await request(app).get('/api/integrations/int-abc-123').expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PUT /api/integrations/:id
  // ═══════════════════════════════════════════════════════════════════════════
  describe('PUT /api/integrations/:id', () => {
    it('should return 200 and update the integration', async () => {
      mockService.update.mockResolvedValue({ ...mockIntegration, name: 'Renamed' });

      const res = await request(app)
        .put('/api/integrations/int-abc-123')
        .set(authHeader())
        .send({ name: 'Renamed', isActive: false })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Renamed');
      expect(mockService.update).toHaveBeenCalledWith('int-abc-123', 'biz-456', {
        name: 'Renamed',
        config: undefined,
        apiKey: undefined,
        isActive: false,
      });
    });

    it('should return 404 when not found', async () => {
      mockService.update.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/integrations/missing')
        .set(authHeader())
        .send({ name: 'X' })
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      await request(app).put('/api/integrations/int-abc-123').send({ name: 'X' }).expect(401);
    });

    it('should return 500 when the service throws', async () => {
      mockService.update.mockRejectedValue(new Error('DB update failed'));

      const res = await request(app)
        .put('/api/integrations/int-abc-123')
        .set(authHeader())
        .send({ name: 'X' })
        .expect(500);

      expect(res.body.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /api/integrations/:id
  // ═══════════════════════════════════════════════════════════════════════════
  describe('DELETE /api/integrations/:id', () => {
    it('should return 200 on success', async () => {
      mockService.delete.mockResolvedValue(true);

      const res = await request(app)
        .delete('/api/integrations/int-abc-123')
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/deleted/i);
      expect(mockService.delete).toHaveBeenCalledWith('int-abc-123', 'biz-456');
    });

    it('should return 401 without authentication', async () => {
      await request(app).delete('/api/integrations/int-abc-123').expect(401);
    });

    it('should return 500 when the service throws', async () => {
      mockService.delete.mockRejectedValue(new Error('DB delete failed'));

      const res = await request(app)
        .delete('/api/integrations/int-abc-123')
        .set(authHeader())
        .expect(500);

      expect(res.body.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/integrations/:id/test
  // ═══════════════════════════════════════════════════════════════════════════
  describe('POST /api/integrations/:id/test', () => {
    it('should return 200 with the test result', async () => {
      mockService.testIntegration.mockResolvedValue({ success: true });

      const res = await request(app)
        .post('/api/integrations/int-abc-123/test')
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.success).toBe(true);
      expect(mockService.testIntegration).toHaveBeenCalledWith('int-abc-123', 'biz-456');
    });

    it('should return 401 without authentication', async () => {
      await request(app).post('/api/integrations/int-abc-123/test').expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/integrations/providers/list
  // ═══════════════════════════════════════════════════════════════════════════
  describe('GET /api/integrations/providers/list', () => {
    it('should return 200 with the provider catalog', async () => {
      const res = await request(app)
        .get('/api/integrations/providers/list')
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      const ids = res.body.data.map((p: any) => p.id);
      expect(ids).toEqual(expect.arrayContaining(['whatsapp', 'shopify', 'razorpay', 'hubspot', 'zoho', 'custom']));
    });

    it('should return 401 without authentication', async () => {
      await request(app).get('/api/integrations/providers/list').expect(401);
    });
  });
});
