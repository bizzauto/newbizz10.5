import express, { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import {
  transcribeAudio,
  synthesizeSpeech,
  isVoiceConfigured,
  writeTmpAudio,
} from '../services/voice-ai.service.js';

const router = Router();

/**
 * POST /api/voice/transcribe
 * Body: raw audio (webm/wav/mp3). Returns transcribed text.
 * Self-hosted Whisper if WHISPER_BIN is set; otherwise 501.
 */
router.post(
  '/transcribe',
  authenticate,
  express.raw({ type: () => true, limit: '25mb' }),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isVoiceConfigured()) {
        return res.status(501).json({
          success: false,
          error: 'Voice AI not configured. Set WHISPER_BIN (STT) and/or PIPER_BIN (TTS).',
        });
      }
      const tmp = await writeTmpAudio(req, 'webm');
      const result = await transcribeAudio(tmp);
      res.json({ success: true, text: result.text, source: result.source });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || 'Transcription failed' });
    }
  }
);

/**
 * POST /api/voice/synthesize
 * Body: { text } -> returns audio/wav (self-hosted Piper if PIPER_BIN set).
 */
router.post('/synthesize', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ success: false, error: 'text is required' });

    const out = await synthesizeSpeech(String(text));
    if (!out) {
      return res.status(501).json({
        success: false,
        error: 'TTS not configured. Set PIPER_BIN and PIPER_VOICE.',
      });
    }
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.send(out.audio);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Synthesis failed' });
  }
});

export default router;
