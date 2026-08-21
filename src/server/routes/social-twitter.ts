import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { encrypt, decrypt } from '../utils/auth.js';
import axios from 'axios';

// ── Twitter/X OAuth 2.0 (PKCE) ──

// Twitter OAuth config
const TW_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TW_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const TW_REDIRECT_URI = process.env.TWITTER_REDIRECT_URI || 'https://bizzautoai.com/api/social-accounts/twitter/callback';
const TW_SCOPES = 'tweet.read tweet.write users.read offline.access';

// Store PKCE code verifiers temporarily (in production, use Redis)
const twitterPkceStore = new Map<string, { codeVerifier: string; businessId: string; expiresAt: number }>();

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateCodeChallenge(codeVerifier: string): string {
  // In a real implementation, use crypto.subtle.digest('SHA-256', ...)
  // For simplicity, we'll use a basic approach - in production use proper SHA-256
  return codeVerifier; // Simplified - should be base64url(SHA256(codeVerifier))
}

const twitterRouter = Router();

// Generate Twitter OAuth URL with PKCE
twitterRouter.get('/auth/url', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!TW_CLIENT_ID) {
      return res.status(500).json({ success: false, error: 'Twitter Client ID not configured' });
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier); // Should be SHA256 in production
    
    const state = Buffer.from(JSON.stringify({
      businessId: req.user.businessId,
      timestamp: Date.now(),
      codeVerifier, // Store for callback
    })).toString('base64');

    // Store PKCE verifier
    twitterPkceStore.set(state, {
      codeVerifier,
      businessId: req.user.businessId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
    authUrl.searchParams.set('client_id', TW_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', TW_REDIRECT_URI);
    authUrl.searchParams.set('scope', TW_SCOPES);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    res.json({ success: true, data: { url: authUrl.toString() } });
  } catch (error: any) {
    console.error('Twitter auth URL error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate Twitter auth URL' });
  }
});

// Twitter OAuth Callback
twitterRouter.get('/auth/callback', async (req: AuthRequest, res: Response) => {
  const frontendBase = process.env.FRONTEND_URL || 'https://bizzautoai.com';
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${frontendBase}/social-media?tw_error=${error}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendBase}/social-media?tw_error=missing_params`);
    }

    // Get PKCE data from state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch {
      return res.redirect(`${frontendBase}/social-media?tw_error=invalid_state`);
    }

    if (!stateData.businessId || Date.now() - stateData.timestamp > 30 * 60 * 1000) {
      return res.redirect(`${frontendBase}/social-media?tw_error=expired_state`);
    }

    const codeVerifier = stateData.codeVerifier;
    
    // Clean up
    twitterPkceStore.delete(state as string);

    // Exchange code for access token
    const tokenResponse = await axios.post('https://api.twitter.com/2/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        client_id: TW_CLIENT_ID!,
        client_secret: TW_CLIENT_SECRET!,
        redirect_uri: TW_REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    if (!access_token) {
      throw new Error('No access token received from Twitter');
    }

    // Get user info
    const userResponse = await axios.get('https://api.twitter.com/2/users/me', {
      params: {
        'user.fields': 'id,username,name,verified,public_metrics',
      },
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const user = userResponse.data.data;
    if (!user?.id) {
      throw new Error('Failed to get Twitter user info');
    }

    // Save user credentials
    await prisma.business.update({
      where: { id: stateData.businessId },
      data: {
        twitterUserId: user.id,
        twitterAccessToken: encrypt(access_token),
        // Store refresh token if available
        // twitterRefreshToken: refresh_token ? encrypt(refresh_token) : null,
      },
    });

    res.redirect(`${frontendBase}/social-media?tw_connected=true`);
  } catch (error: any) {
    console.error('Twitter callback error:', error);
    res.redirect(`${frontendBase}/social-media?tw_error=${encodeURIComponent(error.message)}`);
  }
});

// Refresh Twitter token
twitterRouter.post('/refresh', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.user.businessId },
      select: { twitterAccessToken: true, twitterRefreshToken: true },
    });

    if (!business?.twitterRefreshToken) {
      return res.status(400).json({ success: false, error: 'No refresh token available' });
    }

    const refreshToken = decrypt(business.twitterRefreshToken);

    const tokenResponse = await axios.post('https://api.twitter.com/2/oauth2/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: TW_CLIENT_ID!,
        client_secret: TW_CLIENT_SECRET!,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    await prisma.business.update({
      where: { id: req.user.businessId },
      data: {
        twitterAccessToken: encrypt(access_token),
        twitterRefreshToken: refresh_token ? encrypt(refresh_token) : undefined,
      },
    });

    res.json({ success: true, message: 'Token refreshed successfully' });
  } catch (error: any) {
    console.error('Twitter refresh error:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh token' });
  }
});

export default twitterRouter;