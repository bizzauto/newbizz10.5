import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { encrypt, decrypt } from '../utils/auth.js';
import axios from 'axios';

// ── Facebook OAuth ──

// Facebook OAuth config
const FB_APP_ID = process.env.FACEBOOK_APP_ID;
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FB_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || 'https://bizzautoai.com/api/social-accounts/facebook/callback';
const FB_SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';

const facebookRouter = Router();

// Generate Facebook OAuth URL
facebookRouter.get('/auth/url', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!FB_APP_ID) {
      return res.status(500).json({ success: false, error: 'Facebook App ID not configured' });
    }

    const state = Buffer.from(JSON.stringify({
      businessId: req.user.businessId,
      timestamp: Date.now(),
    })).toString('base64');

    const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    authUrl.searchParams.set('client_id', FB_APP_ID);
    authUrl.searchParams.set('redirect_uri', FB_REDIRECT_URI);
    authUrl.searchParams.set('scope', FB_SCOPES);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    res.json({ success: true, data: { url: authUrl.toString() } });
  } catch (error: any) {
    console.error('Facebook auth URL error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate Facebook auth URL' });
  }
});

// Facebook OAuth Callback
facebookRouter.get('/auth/callback', async (req: AuthRequest, res: Response) => {
  const frontendBase = process.env.FRONTEND_URL || 'https://bizzautoai.com';
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${frontendBase}/social-media?fb_error=${error}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendBase}/social-media?fb_error=missing_params`);
    }

    // Validate state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch {
      return res.redirect(`${frontendBase}/social-media?fb_error=invalid_state`);
    }

    if (!stateData.businessId || Date.now() - stateData.timestamp > 30 * 60 * 1000) {
      return res.redirect(`${frontendBase}/social-media?fb_error=expired_state`);
    }

    // Exchange code for short-lived token
    const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        redirect_uri: FB_REDIRECT_URI,
        code: code as string,
      },
    });

    const { access_token: shortToken } = tokenResponse.data;
    if (!shortToken) {
      throw new Error('No access token received from Facebook');
    }

    // Exchange for long-lived token (60 days)
    const longTokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        fb_exchange_token: shortToken,
      },
    });

    const { access_token: longToken, expires_in } = longTokenResponse.data;
    if (!longToken) {
      throw new Error('Failed to exchange for long-lived token');
    }

    // Get user's pages
    const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: {
        access_token: longToken,
        fields: 'id,name,access_token,category',
      },
    });

    const pages = pagesResponse.data.data || [];
    if (pages.length === 0) {
      return res.redirect(`${frontendBase}/social-media?fb_error=no_pages`);
    }

    // For now, use the first page. In production, you might want to let the user choose
    const page = pages[0];
    
    // Save page credentials
    await prisma.business.update({
      where: { id: stateData.businessId },
      data: {
        fbPageId: page.id,
        fbAccessToken: encrypt(page.access_token),
      },
    });

    // Also try to get Instagram Business Account if available
    try {
      const igResponse = await axios.get(`https://graph.facebook.com/v18.0/${page.id}`, {
        params: {
          fields: 'instagram_business_account',
          access_token: page.access_token,
        },
      });
      
      if (igResponse.data.instagram_business_account?.id) {
        // Get Instagram access token
        const igTokenResponse = await axios.get(`https://graph.facebook.com/v18.0/${igResponse.data.instagram_business_account.id}`, {
          params: {
            fields: 'id',
            access_token: page.access_token,
          },
        });
        
        await prisma.business.update({
          where: { id: stateData.businessId },
          data: {
            igUserId: igResponse.data.instagram_business_account.id,
            igAccessToken: encrypt(page.access_token),
          },
        });
      }
    } catch (igError) {
      console.warn('Could not link Instagram account:', igError);
    }

    res.redirect(`${frontendBase}/social-media?fb_connected=true`);
  } catch (error: any) {
    console.error('Facebook callback error:', error);
    res.redirect(`${frontendBase}/social-media?fb_error=${encodeURIComponent(error.message)}`);
  }
});

// Get Facebook Pages for selection
facebookRouter.get('/pages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.user.businessId },
      select: { fbAccessToken: true },
    });

    if (!business?.fbAccessToken) {
      return res.status(400).json({ success: false, error: 'Facebook not connected' });
    }

    const accessToken = decrypt(business.fbAccessToken);
    const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: {
        access_token: accessToken,
        fields: 'id,name,access_token,category,picture',
      },
    });

    res.json({ success: true, data: pagesResponse.data.data || [] });
  } catch (error: any) {
    console.error('Facebook pages error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch Facebook pages' });
  }
});

// Select a specific Facebook Page
facebookRouter.post('/select-page', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { pageId, pageAccessToken } = req.body;
    
    if (!pageId || !pageAccessToken) {
      return res.status(400).json({ success: false, error: 'pageId and pageAccessToken are required' });
    }

    await prisma.business.update({
      where: { id: req.user.businessId },
      data: {
        fbPageId: pageId,
        fbAccessToken: encrypt(pageAccessToken),
      },
    });

    res.json({ success: true, message: 'Facebook Page selected successfully!' });
  } catch (error: any) {
    console.error('Facebook select page error:', error);
    res.status(500).json({ success: false, error: 'Failed to select Facebook Page' });
  }
});

export default facebookRouter;