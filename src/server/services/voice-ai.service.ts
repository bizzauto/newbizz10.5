import { spawn, execFile } from 'child_process';
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

/**
 * Self-hosted Voice AI
 * --------------------
 * Local-first STT (Whisper) and TTS (Piper). No audio ever leaves the server
 * unless an explicit cloud fallback is configured.
 *
 * Environment:
 *   WHISPER_BIN   path to whisper-cli/whisper.cpp binary (optional)
 *   WHISPER_MODEL path to the .bin model (optional, default: models/ggml-base.bin)
 *   PIPER_BIN     path to piper binary (optional)
 *   PIPER_VOICE   path to piper voice .onnx (optional)
 *
 * If the binaries are absent, the functions throw a clear "not configured"
 * error instead of silently calling the cloud.
 */

function whisperBin(): string | null {
  return process.env.WHISPER_BIN || null;
}
function piperBin(): string | null {
  return process.env.PIPER_BIN || null;
}

export interface TranscribeResult {
  text: string;
  source: 'local-whisper' | 'unavailable';
}

export async function transcribeAudio(audioPath: string): Promise<TranscribeResult> {
  const bin = whisperBin();
  if (!bin) {
    return { text: '', source: 'unavailable' };
  }
  const model = process.env.WHISPER_MODEL || 'models/ggml-base.bin';
  const outFile = `${audioPath}.txt`;

  await new Promise<void>((resolve, reject) => {
    execFile(
      bin,
      ['-m', model, '-f', audioPath, '-otxt', '-of', outFile.replace(/\.txt$/, '')],
      { timeout: 120000, maxBuffer: 1024 * 1024 * 64 },
      (err) => (err ? reject(err) : resolve())
    );
  });

  const text = (await fs.readFile(outFile, 'utf8')).trim();
  return { text, source: 'local-whisper' };
}

export async function synthesizeSpeech(text: string): Promise<{ audio: Buffer; source: string } | null> {
  const bin = piperBin();
  if (!bin) return null;

  const voice = process.env.PIPER_VOICE || 'models/voice-en.onnx';
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, [voice, '--output-raw'], { timeout: 60000 });
    child.stdin.write(text);
    child.stdin.end();
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.on('error', reject);
    child.on('close', (code: number) => (code === 0 ? resolve() : reject(new Error(`piper exited ${code}`))));
  });

  const audio = Buffer.concat(chunks);
  // Wrap raw PCM into a minimal WAV (16kHz, 16-bit mono) so clients can play it.
  return { audio: toWav(audio, 16000, 1, 16), source: 'local-piper' };
}

/** Wrap raw PCM bytes into a WAV container. */
function toWav(pcm: Buffer, sampleRate: number, channels: number, bits: number): Buffer {
  const byteRate = (sampleRate * channels * bits) / 8;
  const blockAlign = (channels * bits) / 8;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

export function isVoiceConfigured(): boolean {
  return Boolean(whisperBin() || piperBin());
}

/** Helper: stream a readable (e.g. req) to a temp file and return the path. */
export async function writeTmpAudio(stream: Readable, ext = 'webm'): Promise<string> {
  const tmp = `${process.env.TMPDIR || '/tmp'}/voice-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const out = createWriteStream(tmp);
  await pipeline(stream, out);
  return tmp;
}

export default { transcribeAudio, synthesizeSpeech, isVoiceConfigured, writeTmpAudio };
