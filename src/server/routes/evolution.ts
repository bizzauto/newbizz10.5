import { Router } from 'express';
import { EvolutionApiService } from '../services/evolution.service.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

// ==================== CONFIG ====================

// Get Evolution API config status
router.get('/config', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const config = await EvolutionApiService.getPublicConfig(businessId);
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save Evolution API config
router.post('/config', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const { baseUrl, apiKey, instanceName, phone } = req.body;
    if (!baseUrl || !apiKey) {
      return res.status(400).json({ success: false, error: 'baseUrl and apiKey are required' });
    }

    await EvolutionApiService.saveConfig(businessId, { baseUrl, apiKey, instanceName, phone });
    res.json({ success: true, message: 'Evolution API config saved' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ANTI-BAN SETTINGS ====================

// Get anti-ban settings (delay / group delay / jitter / daily cap)
router.get('/antiban-settings', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const settings = await EvolutionApiService.getAntiBanSettings(businessId);
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save anti-ban settings
router.post('/antiban-settings', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const { enabled, messageDelayMs, groupMessageDelayMs, randomDelayMs, maxMessagesPerDay } = req.body ?? {};

    // Validation: clamp sane ranges so a bad UI payload can't set 0s spam delays
    const clamp = (v: unknown, min: number, max: number, fallback: number) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, Math.round(n)));
    };

    const patch: Record<string, any> = {};
    if (enabled !== undefined) patch.enabled = Boolean(enabled);
    if (messageDelayMs !== undefined) patch.messageDelayMs = clamp(messageDelayMs, 500, 600000, 2000);
    if (groupMessageDelayMs !== undefined) patch.groupMessageDelayMs = clamp(groupMessageDelayMs, 1000, 600000, 5000);
    if (randomDelayMs !== undefined) patch.randomDelayMs = clamp(randomDelayMs, 0, 120000, 1000);
    if (maxMessagesPerDay !== undefined) patch.maxMessagesPerDay = clamp(maxMessagesPerDay, 0, 10000, 100);

    await EvolutionApiService.saveAntiBanSettings(businessId, patch);
    const settings = await EvolutionApiService.getAntiBanSettings(businessId);
    res.json({ success: true, message: 'Anti-ban settings saved', data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== NUMBER ROTATION (MULTI-ACCOUNT) ====================

// Get rotation settings + primary instance reference
router.get('/rotation-settings', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const [settings, primary] = await Promise.all([
      EvolutionApiService.getRotationSettings(businessId),
      EvolutionApiService.getPublicConfig(businessId).catch(() => null),
    ]);
    res.json({
      success: true,
      data: {
        ...settings,
        primaryInstanceName: primary?.instanceName || '',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save rotation settings — pool of extra instances to round-robin across
router.post('/rotation-settings', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const { enabled, pool } = req.body ?? {};
    const cleanPool = Array.isArray(pool)
      ? pool
          .filter((p: any) => p && typeof p.instanceName === 'string' && p.instanceName.trim())
          .slice(0, 10) // hard cap — each connected instance costs RAM
          .map((p: any) => ({
            instanceName: p.instanceName.trim(),
            baseUrl: typeof p.baseUrl === 'string' && p.baseUrl.trim() ? p.baseUrl.trim() : undefined,
            apiKey: typeof p.apiKey === 'string' && p.apiKey.trim() ? p.apiKey.trim() : undefined,
          }))
      : [];

    await EvolutionApiService.saveRotationSettings(businessId, {
      enabled: Boolean(enabled),
      pool: cleanPool,
    });
    const settings = await EvolutionApiService.getRotationSettings(businessId);
    res.json({ success: true, message: 'Rotation settings saved', data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== INSTANCE ====================

// Create Evolution API instance
router.post('/instance', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const { baseUrl, apiKey, instanceName, webhookUrl, phone } = req.body;
    // baseUrl/apiKey are optional - service falls back to DB config / env vars
    const result = await EvolutionApiService.createInstance(businessId, {
      baseUrl, apiKey, instanceName, webhookUrl, phone,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Connect instance & get QR code
router.post('/connect', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    // Accept instanceName and phone from frontend if provided
    const instanceName = req.body?.instanceName;
    const phone = req.body?.phone;
    const mobile = req.body?.mobile === true;
    const result = await EvolutionApiService.connectInstance(businessId, instanceName, phone, mobile);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get connection status
router.get('/status', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const status = await EvolutionApiService.getConnectionStatus(businessId);
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Disconnect instance
router.post('/disconnect', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    await EvolutionApiService.disconnectInstance(businessId);
    res.json({ success: true, message: 'Disconnected successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete instance
router.delete('/instance', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    await EvolutionApiService.deleteInstance(businessId);
    res.json({ success: true, message: 'Instance deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== MESSAGING ====================

// Send text message
router.post('/send/text', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const { to, message, delay, linkPreview } = req.body;
    if (!to || !message) {
      return res.status(400).json({ success: false, error: 'to and message are required' });
    }

    const result = await EvolutionApiService.sendText(businessId, to, message, {
      delay, linkPreview,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send media message
router.post('/send/media', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const { to, mediaUrl, mediaType, caption, delay } = req.body;
    if (!to || !mediaUrl || !mediaType) {
      return res.status(400).json({ success: false, error: 'to, mediaUrl and mediaType are required' });
    }

    const result = await EvolutionApiService.sendMedia(
      businessId, to, mediaUrl, mediaType, caption, { delay }
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send template message
router.post('/send/template', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const { to, templateData } = req.body;
    if (!to || !templateData) {
      return res.status(400).json({ success: false, error: 'to and templateData are required' });
    }

    const result = await EvolutionApiService.sendTemplate(businessId, to, templateData);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk send messages
router.post('/send/bulk', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const { messages, delayBetween, campaignId } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'messages array is required' });
    }

    const result = await EvolutionApiService.bulkSend(businessId, messages, {
      delayBetween, campaignId,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CHATS ====================

// Fetch all chats
router.get('/chats', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const chats = await EvolutionApiService.fetchChats(businessId);
    res.json({ success: true, data: chats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch messages for a chat
router.post('/messages', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const { remoteJid, limit, offset } = req.body;
    if (!remoteJid) {
      return res.status(400).json({ success: false, error: 'remoteJid is required' });
    }

    const messages = await EvolutionApiService.fetchMessages(businessId, remoteJid, { limit, offset });
    res.json({ success: true, data: messages });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check if number exists on WhatsApp
router.post('/check-number', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ success: false, error: 'number is required' });
    }

    const result = await EvolutionApiService.checkNumber(businessId, number);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== WEBHOOK ====================

// Webhook receiver — validates shared secret before processing
router.post('/webhook/:businessId', async (req: any, res: any) => {
  try {
    const webhookSecret = req.headers['x-webhook-secret'] || req.query.secret;
    if (webhookSecret !== process.env.EVOLUTION_WEBHOOK_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { businessId } = req.params;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID required' });

    await EvolutionApiService.processWebhook(businessId, req.body);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Evolution webhook error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
