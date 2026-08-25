import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { encrypt, decrypt } from '../utils/auth.js';
import axios from 'axios';

// ── LinkedIn OAuth ──

// LinkedIn OAuth config
const LI_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LI_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const LI_REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || 'https://bizzautoai.com/api/social-accounts/linkedin/callback';
const LI_SCOPES = 'r_liteprofile,r_emailaddress,w_member_social,rw_organization_admin';

const linkedinRouter = Router();

// Generate LinkedIn OAuth URL
linkedinRouter.get('/auth/url', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!LI_CLIENT_ID) {
      return res.status(500).json({ success: false, error: 'LinkedIn Client ID not configured' });
    }

    const state = Buffer.from(JSON.stringify({
      businessId: req.user.businessId,
      timestamp: Date.now(),
    })).toString('base64');

    const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
    authUrl.searchParams.set('client_id', LI_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', LI_REDIRECT_URI);
    authUrl.searchParams.set('scope', LI_SCOPES);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    res.json({ success: true, data: { url: authUrl.toString() } });
  } catch (error: any) {
    console.error('LinkedIn auth URL error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate LinkedIn auth URL' });
  }
});

// LinkedIn OAuth Callback
linkedinRouter.get('/auth/callback', async (req: AuthRequest, res: Response) => {
  const frontendBase = process.env.FRONTEND_URL || 'https://bizzautoai.com';
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${frontendBase}/social-media?li_error=${error}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendBase}/social-media?li_error=missing_params`);
    }

    // Validate state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch {
      return res.redirect(`${frontendBase}/social-media?li_error=invalid_state`);
    }

    if (!stateData.businessId || Date.now() - stateData.timestamp > 30 * 60 * 1000) {
      return res.redirect(`${frontendBase}/social-media?li_error=expired_state`);
    }

    // Exchange code for access token
    const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        client_id: LI_CLIENT_ID!,
        client_secret: LI_CLIENT_SECRET!,
        redirect_uri: LI_REDIRECT_URI,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const { access_token, expires_in } = tokenResponse.data;
    if (!access_token) {
      throw new Error('No access token received from LinkedIn');
    }

    // Get user's organizations (pages) they can manage
    const orgsResponse = await axios.get('https://api.linkedin.com/v2/organizationAcls', {
      params: {
        q: 'roleAssignee',
        state: 'APPROVED',
      },
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const organizations = orgsResponse.data.elements || [];
    if (organizations.length === 0) {
      return res.redirect(`${frontendBase}/social-media?li_error=no_orgs`);
    }

    // For now, use the first organization. In production, let user choose
    const org = organizations[0];
    const orgUrn = org.organization; // e.g., "urn:li:organization:123456"
    const orgId = orgUrn.replace('urn:li:organization:', '');

    // Get organization details
    const orgDetailsResponse = await axios.get(`https://api.linkedin.com/v2/organizations/${orgId}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    // Save organization credentials
    await prisma.business.update({
      where: { id: stateData.businessId },
      data: {
        linkedinPageId: orgId,
        linkedinAccessToken: encrypt(access_token),
      },
    });

    res.redirect(`${frontendBase}/social-media?li_connected=true`);
  } catch (error: any) {
    console.error('LinkedIn callback error:', error);
    res.redirect(`${frontendBase}/social-media?li_error=${encodeURIComponent(error.message)}`);
  }
});

// Get LinkedIn Organizations for selection
linkedinRouter.get('/organizations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.user.businessId },
      select: { linkedinAccessToken: true },
    });

    if (!business?.linkedinAccessToken) {
      return res.status(400).json({ success: false, error: 'LinkedIn not connected' });
    }

    const accessToken = decrypt(business.linkedinAccessToken);
    const orgsResponse = await axios.get('https://api.linkedin.com/v2/organizationAcls', {
      params: {
        q: 'roleAssignee',
        state: 'APPROVED',
      },
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const organizations = orgsResponse.data.elements || [];
    
    // Fetch details for each organization
    const orgsWithDetails = await Promise.all(
      organizations.map(async (org: any) => {
        const orgUrn = org.organization;
        const orgId = orgUrn.replace('urn:li:organization:', '');
        try {
          const detailsResponse = await axios.get(`https://api.linkedin.com/v2/organizations/${orgId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          return {
            id: orgId,
            urn: orgUrn,
            ...detailsResponse.data,
          };
        } catch {
          return { id: orgId, urn: orgUrn };
        }
      })
    );

    res.json({ success: true, data: orgsWithDetails });
  } catch (error: any) {
    console.error('LinkedIn organizations error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch LinkedIn organizations' });
  }
});

// Select a specific LinkedIn Organization
linkedinRouter.post('/select-organization', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId, accessToken } = req.body;
    
    if (!organizationId || !accessToken) {
      return res.status(400).json({ success: false, error: 'organizationId and accessToken are required' });
    }

    await prisma.business.update({
      where: { id: req.user.businessId },
      data: {
        linkedinPageId: organizationId,
        linkedinAccessToken: encrypt(accessToken),
      },
    });

    res.json({ success: true, message: 'LinkedIn Organization selected successfully!' });
  } catch (error: any) {
    console.error('LinkedIn select organization error:', error);
    res.status(500).json({ success: false, error: 'Failed to select LinkedIn Organization' });
  }
});

export default linkedinRouter;