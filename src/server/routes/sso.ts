import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { encrypt } from '../utils/auth.js';
import crypto from 'crypto';

const router = Router();

// OAuth callback — public (hit by Google/GitHub/Microsoft, not by authenticated user)
router.get('/callback/:provider', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ success: false, error: 'Authorization code not received' });
    res.json({ success: true, message: 'SSO authentication successful', provider: req.params.provider, code: String(code).substring(0, 10) + '...' });
  } catch (err) {
    console.error('SSO callback error:', err);
    res.status(500).json({ success: false, error: 'SSO callback failed' });
  }
});

// Everything below requires authentication
router.use(authenticate);

// GET /api/sso - List SSO configs
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    const configs = await (prisma as any).sSOConfig.findMany({
      where: { businessId },
      select: { id: true, provider: true, clientId: true, domain: true, enabled: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: { configs } });
  } catch (err) {
    console.error('Get SSO configs error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch SSO configs' });
  }
});

// POST /api/sso - Create SSO config
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    const { provider, clientId, clientSecret, domain } = req.body;

    if (!provider) return res.status(400).json({ success: false, error: 'Provider is required' });
    if (!clientId) return res.status(400).json({ success: false, error: 'Client ID is required' });
    if (!clientSecret) return res.status(400).json({ success: false, error: 'Client Secret is required' });

    const validProviders = ['google', 'github', 'microsoft', 'okta', 'auth0'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ success: false, error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` });
    }

    // Check if already exists for this provider
    const existing = await (prisma as any).sSOConfig.findFirst({ where: { businessId, provider } });
    if (existing) return res.status(409).json({ success: false, error: `${provider} SSO already configured. Update or delete it.` });

    const config = await (prisma as any).sSOConfig.create({
      data: {
        businessId,
        provider,
        clientId,
        // SECURITY: encrypt clientSecret at rest (AES-256-CBC via utils/auth.ts)
        clientSecret: encrypt(clientSecret),
        domain: domain || null,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        config: { id: config.id, provider: config.provider, clientId: config.clientId, domain: config.domain, enabled: config.enabled },
      },
    });
  } catch (err) {
    console.error('Create SSO config error:', err);
    res.status(500).json({ success: false, error: 'Failed to create SSO config' });
  }
});

// PUT /api/sso/:id - Update SSO config
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    const { clientId, clientSecret, domain, enabled } = req.body;

    const existing = await (prisma as any).sSOConfig.findFirst({ where: { id: req.params.id, businessId } });
    if (!existing) return res.status(404).json({ success: false, error: 'SSO config not found' });

    const config = await (prisma as any).sSOConfig.update({
      where: { id: req.params.id },
      data: {
        ...(clientId !== undefined && { clientId }),
        // SECURITY: re-encrypt the clientSecret on update
        ...(clientSecret !== undefined && { clientSecret: encrypt(clientSecret) }),
        ...(domain !== undefined && { domain }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    res.json({
      success: true,
      data: {
        config: { id: config.id, provider: config.provider, clientId: config.clientId, domain: config.domain, enabled: config.enabled },
      },
    });
  } catch (err) {
    console.error('Update SSO config error:', err);
    res.status(500).json({ success: false, error: 'Failed to update SSO config' });
  }
});

// DELETE /api/sso/:id - Delete SSO config
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    const existing = await (prisma as any).sSOConfig.findFirst({ where: { id: req.params.id, businessId } });
    if (!existing) return res.status(404).json({ success: false, error: 'SSO config not found' });

    await (prisma as any).sSOConfig.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'SSO config deleted' });
  } catch (err) {
    console.error('Delete SSO config error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete SSO config' });
  }
});

// GET /api/sso/auth/:provider - Initiate SSO login (generates redirect URL)
router.get('/auth/:provider', async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    const { provider } = req.params;

    const config = await (prisma as any).sSOConfig.findFirst({
      where: { businessId, provider, enabled: true },
    });
    if (!config) return res.status(404).json({ success: false, error: `${provider} SSO not configured or disabled` });

    const state = crypto.randomBytes(32).toString('hex');
    const appBaseUrl = process.env.APP_BASE_URL || process.env.FRONTEND_URL;
    if (!appBaseUrl) {
      throw new Error('APP_BASE_URL/FRONTEND_URL must be set');
    }
    const redirectUri = `${appBaseUrl.replace(/\/$/, '')}/api/sso/callback/${provider}`;

    let authUrl = '';
    switch (provider) {
      case 'google':
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&state=${state}`;
        break;
      case 'github':
        authUrl = `https://github.com/login/oauth/authorize?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email&state=${state}`;
        break;
      case 'microsoft':
        authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&state=${state}`;
        break;
      default:
        return res.status(400).json({ success: false, error: `OAuth flow not implemented for ${provider}` });
    }

    res.json({ success: true, data: { authUrl, state } });
  } catch (err) {
    console.error('SSO auth error:', err);
    res.status(500).json({ success: false, error: 'Failed to initiate SSO' });
  }
});

export default router;
