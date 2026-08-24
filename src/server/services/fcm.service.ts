import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { Prisma } from '@prisma/client';

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

interface FcmMessage {
  token: string;
  title: string;
  body: string;
  url?: string;
  imageUrl?: string;
}

// ── token cache ──
let cached: { token: string; exp: number } | null = null;

async function getServiceAccount(
  businessId?: string | null
): Promise<ServiceAccount | null> {
  if (businessId) {
    const i = await prisma.integration.findUnique({
      where: { businessId_type: { businessId, type: 'fcm' } },
    });
    if (i?.isActive) return (i.config as any) as ServiceAccount;
  }
  const g = await prisma.integration.findFirst({
    where: { type: 'fcm', isActive: true },
  });
  return g ? ((g.config as any) as ServiceAccount) : null;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > now + 60) return cached.token;
  const jwtClient = jwt.sign(
    {
      iss: sa.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    sa.privateKey,
    { algorithm: 'RS256' }
  );
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwtClient,
    }),
  });
  const json: any = await resp.json();
  if (!json.access_token) throw new Error(json.error_description || 'token fail');
  cached = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return cached.token;
}

async function sendOne(sa: ServiceAccount, msg: FcmMessage): Promise<any> {
  const token = await getAccessToken(sa);
  const payload: any = {
    message: {
      token: msg.token,
      notification: { title: msg.title, body: msg.body },
      data: { url: msg.url || '', click_action: msg.url || '' },
    },
  };
  if (msg.imageUrl) payload.message.android = { notification: { image: msg.imageUrl } };
  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
  return resp.json();
}

export class FcmService {
  static async isConfigured(businessId?: string | null): Promise<boolean> {
    return (await getServiceAccount(businessId)) !== null;
  }

  static async send(
    msg: FcmMessage,
    businessId?: string | null
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      const sa = await getServiceAccount(businessId);
      if (!sa) return { success: false, error: 'FCM not configured' };
      const result = await sendOne(sa, msg);
      if (result.error) return { success: false, error: result.error.message };
      return { success: true, result };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  static async sendToUser(
    userId: string,
    title: string,
    body: string,
    extra?: { url?: string; imageUrl?: string }
  ): Promise<{ sent: number; errors: string[] }> {
    const devices = await prisma.deviceToken.findMany({
      where: { userId, isActive: true },
    });
    const errors: string[] = [];
    let sent = 0;
    for (const d of devices) {
      const r = await this.send({
        token: d.token,
        title,
        body,
        ...(extra || {}),
      });
      if (r.success) sent++;
      else errors.push(r.error || 'err');
    }
    return { sent, errors };
  }

  static async saveConfig(
    businessId: string,
    cfg: ServiceAccount
  ): Promise<void> {
    await prisma.integration.upsert({
      where: { businessId_type: { businessId, type: 'fcm' } },
      create: { businessId, type: 'fcm', isActive: true, config: cfg as any },
      update: { isActive: true, config: cfg as Prisma.InputJsonValue },
    });
  }
}
