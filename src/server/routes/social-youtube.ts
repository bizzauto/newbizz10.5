import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { encrypt, decrypt } from '../utils/auth.js';
import axios from 'axios';

// ── YouTube OAuth (uses Google OAuth) ──

// YouTube/Google OAuth config
const YT_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const YT_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const YT_REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'https://bizzautoai.com/api/social-accounts/youtube/callback';
const YT_SCOPES = 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

const youtubeRouter = Router();

// Generate YouTube OAuth URL
youtubeRouter.get('/auth/url', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!YT_CLIENT_ID) {
      return res.status(500).json({ success: false, error: 'Google Client ID not configured' });
    }

    const state = Buffer.from(JSON.stringify({
      businessId: req.user.businessId,
      timestamp: Date.now(),
    })).toString('base64');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', YT_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', YT_REDIRECT_URI);
    authUrl.searchParams.set('scope', YT_SCOPES);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    res.json({ success: true, data: { url: authUrl.toString() } });
  } catch (error: any) {
    console.error('YouTube auth URL error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate YouTube auth URL' });
  }
});

// YouTube OAuth Callback
youtubeRouter.get('/auth/callback', async (req: AuthRequest, res: Response) => {
  const frontendBase = process.env.FRONTEND_URL || 'https://bizzautoai.com';
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${frontendBase}/social-media?yt_error=${error}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendBase}/social-media?yt_error=missing_params`);
    }

    // Validate state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch {
      return res.redirect(`${frontendBase}/social-media?yt_error=invalid_state`);
    }

    if (!stateData.businessId || Date.now() - stateData.timestamp > 30 * 60 * 1000) {
      return res.redirect(`${frontendBase}/social-media?yt_error=expired_state`);
    }

    // Exchange code for tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        client_id: YT_CLIENT_ID!,
        client_secret: YT_CLIENT_SECRET!,
        redirect_uri: YT_REDIRECT_URI,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    if (!access_token) {
      throw new Error('No access token received from Google');
    }

    // Get user's YouTube channel
    const channelResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: {
        part: 'snippet,contentDetails,statistics',
        mine: 'true',
      },
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const channels = channelResponse.data.items || [];
    if (channels.length === 0) {
      return res.redirect(`${frontendBase}/social-media?yt_error=no_channel`);
    }

    // For now, use the first channel. In production, let user choose
    const channel = channels[0];

    // Save channel credentials
    await prisma.business.update({
      where: { id: stateData.businessId },
      data: {
        youtubeChannelId: channel.id,
        youtubeAccessToken: encrypt(access_token),
        youtubeRefreshToken: refresh_token ? encrypt(refresh_token) : undefined,
      },
    });

    res.redirect(`${frontendBase}/social-media?yt_connected=true`);
  } catch (error: any) {
    console.error('YouTube callback error:', error);
    res.redirect(`${frontendBase}/social-media?yt_error=${encodeURIComponent(error.message)}`);
  }
});

// Get YouTube Channels for selection
youtubeRouter.get('/channels', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.user.businessId },
      select: { youtubeAccessToken: true },
    });

    if (!business?.youtubeAccessToken) {
      return res.status(400).json({ success: false, error: 'YouTube not connected' });
    }

    const accessToken = decrypt(business.youtubeAccessToken);
    const channelResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: {
        part: 'snippet,contentDetails,statistics',
        mine: 'true',
      },
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    res.json({ success: true, data: channelResponse.data.items || [] });
  } catch (error: any) {
    console.error('YouTube channels error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch YouTube channels' });
  }
});

// Select a specific YouTube Channel
youtubeRouter.post('/select-channel', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { channelId, accessToken, refreshToken } = req.body;
    
    if (!channelId || !accessToken) {
      return res.status(400).json({ success: false, error: 'channelId and accessToken are required' });
    }

    await prisma.business.update({
      where: { id: req.user.businessId },
      data: {
        youtubeChannelId: channelId,
        youtubeAccessToken: encrypt(accessToken),
        youtubeRefreshToken: refreshToken ? encrypt(refreshToken) : undefined,
      },
    });

    res.json({ success: true, message: 'YouTube Channel selected successfully!' });
  } catch (error: any) {
    console.error('YouTube select channel error:', error);
    res.status(500).json({ success: false, error: 'Failed to select YouTube Channel' });
  }
});

// Refresh YouTube/Google token
youtubeRouter.post('/refresh', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.user.businessId },
      select: { youtubeRefreshToken: true },
    });

    if (!business?.youtubeRefreshToken) {
      return res.status(400).json({ success: false, error: 'No refresh token available' });
    }

    const refreshToken = decrypt(business.youtubeRefreshToken);

    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: YT_CLIENT_ID!,
        client_secret: YT_CLIENT_SECRET!,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    await prisma.business.update({
      where: { id: req.user.businessId },
      data: {
        youtubeAccessToken: encrypt(access_token),
        youtubeRefreshToken: refresh_token ? encrypt(refresh_token) : undefined,
      },
    });

    res.json({ success: true, message: 'Token refreshed successfully' });
  } catch (error: any) {
    console.error('YouTube refresh error:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh token' });
  }
});

export default youtubeRouter;