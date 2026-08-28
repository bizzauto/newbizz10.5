import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, RefreshCw, Copy, CheckCircle2, AlertCircle, Smartphone, MessageCircle } from 'lucide-react';
import { evolutionAPI } from '../lib/api';
import { useIsMobile } from '../hooks/useViewport';

export interface EvolutionStatus {
  status: 'disconnected' | 'scanning' | 'connected';
  phone?: string;
  profileName?: string;
  profilePicUrl?: string;
}

export interface WhatsAppConnectModalProps {
  open: boolean;
  onClose: () => void;
  onConnected?: (info: EvolutionStatus) => void;
  /** When the business has a prior Evolution integration, auto re-pair on open. */
  everConnected?: boolean;
  /** Configured business WhatsApp number (for display while pairing). */
  phone?: string;
}

const POLL_INTERVAL = 2500;
const BASE64_RE = /^[A-Za-z0-9+/=\r\n]+$/;

function isBase64Like(q: string): boolean {
  if (q.startsWith('iVBOR')) return true;
  if (q.length > 200 && BASE64_RE.test(q.replace(/\s/g, ''))) return true;
  return false;
}

function qrSrc(q: string): string {
  if (q.startsWith('data:')) return q;
  if (isBase64Like(q)) return 'data:image/png;base64,' + q;
  return '';
}

const WhatsAppConnectModal: React.FC<WhatsAppConnectModalProps> = ({
  open,
  onClose,
  onConnected,
  everConnected = false,
  phone = '',
}) => {
  const [qr, setQr] = useState<string>('');
  const [qrText, setQrText] = useState<string>('');
  const [pairing, setPairing] = useState<string>('');
  const [status, setStatus] = useState<EvolutionStatus['status']>('disconnected');
  const [error, setError] = useState<string>('');
  const [connecting, setConnecting] = useState<boolean>(false);
  const [connectedPhone, setConnectedPhone] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef<boolean>(true);
  const autoOpenRef = useRef<boolean>(false);
  const isMobile = useIsMobile();

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handleConnected = useCallback(
    (info: EvolutionStatus) => {
      setStatus('connected');
      setConnecting(false);
      setConnectedPhone(info.phone || '');
      clearPoll();
      if (onConnected) onConnected(info);
    },
    [clearPoll, onConnected]
  );

  const pollStatus = useCallback(async () => {
    try {
      const resp: any = await evolutionAPI.getStatus();
      const data: EvolutionStatus = resp?.data?.data || resp?.data || {};
      if (data.status === 'connected') {
        handleConnected(data);
      } else {
        setStatus(data.status || 'scanning');
      }
    } catch {
      // keep polling; transient errors are fine
    }
  }, [handleConnected]);

  const startPolling = useCallback(() => {
    clearPoll();
    pollRef.current = setInterval(() => {
      if (mountedRef.current) pollStatus();
    }, POLL_INTERVAL);
  }, [clearPoll, pollStatus]);

  const doConnect = useCallback(async () => {
    setConnecting(true);
    setError('');
    try {
      const resp: any = await evolutionAPI.connect({ mobile: isMobile });
      const data = resp?.data?.data || resp?.data || {};
      const pairingCode: string = data.pairingCode || '';
      const q: string = data.qrCode || data.qrCodeBase64 || '';
      if (!pairingCode && !q) {
        setError('No QR or pairing code returned. Evolution may not be configured on the server.');
        setConnecting(false);
        return;
      }
      setPairing(pairingCode);
      const src = qrSrc(q);
      if (src) {
        setQr(src);
        setQrText('');
      } else {
        setQr('');
        setQrText(q);
      }
      setStatus(data.status || 'scanning');
      startPolling();
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        'Failed to start WhatsApp connection. Evolution may not be configured.';
      setError(msg);
    } finally {
      setConnecting(false);
    }
  }, [startPolling, isMobile]);

  // Open effect: kick off connect + polling
  useEffect(() => {
    mountedRef.current = true;
    if (open) {
      doConnect();
    }
    return () => {
      mountedRef.current = false;
      autoOpenRef.current = false;
      clearPoll();
    };
  }, [open, doConnect, clearPoll]);

  // Best-effort: on mobile, launch the WhatsApp app once the pairing code is
  // ready so the user can type it in. WhatsApp requires an in-app action, so
  // we can't fully connect server-side — this removes the manual "open app" step.
  // Uses an anchor click (not window.open) because Capacitor's WebView routes
  // anchor navigations to the external app reliably, while window.open is blocked.
  useEffect(() => {
    if (open && isMobile && pairing && !autoOpenRef.current) {
      autoOpenRef.current = true;
      try {
        const a = document.createElement('a');
        a.href = 'https://wa.me/';
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch {
        /* blocked — the visible "Open WhatsApp" button is the fallback */
      }
    }
  }, [open, isMobile, pairing]);

  // On mobile, auto-copy the pairing code so the user only pastes it in WhatsApp
  // (no manual typing). Shows a "Copied" hint next to the code.
  useEffect(() => {
    if (open && isMobile && pairing) {
      navigator.clipboard?.writeText(pairing).then(() => setCopied(true)).catch(() => {});
    }
  }, [open, isMobile, pairing]);

  // Copy QR text fallback
  const copyText = () => {
    if (!qrText) return;
    navigator.clipboard?.writeText(qrText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Connect WhatsApp"
    >
      <div className="relative w-full max-w-md ai-glass rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-2 hover:bg-white/10 rounded-lg text-slate-300"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-xl ai-aurora flex items-center justify-center">
            <Smartphone size={18} className="text-white" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-white">Connect WhatsApp</h2>
        </div>
        <p className="text-[11px] sm:text-xs text-slate-400 mb-4">
          {isMobile
            ? 'Enter the pairing code below inside WhatsApp → ⋮ Menu → Linked devices → Link a device → Link with phone number'
            : 'Scan this QR with WhatsApp → Linked devices → Link a device'}
        </p>

        {status === 'connected' ? (
          <div className="flex flex-col items-center text-center py-6">
            <CheckCircle2 size={48} className="text-emerald-400 mb-3" />
            <p className="text-white font-bold text-sm sm:text-base">
              ✓ Connected as {connectedPhone || 'WhatsApp'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Your WhatsApp is now linked.</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center text-center py-4">
            <AlertCircle size={40} className="text-amber-400 mb-3" />
            <p className="text-slate-200 text-sm font-semibold mb-1">Couldn't connect</p>
            <p className="text-[11px] text-slate-400 mb-4 px-2">{error}</p>
            <button
              onClick={doConnect}
              disabled={connecting}
              className="ai-btn-primary text-sm px-4 py-2 flex items-center gap-1.5 mb-2"
            >
              <RefreshCw size={14} className={connecting ? 'animate-spin' : ''} /> Retry
            </button>
            <button
              onClick={onClose}
              className="text-[11px] text-indigo-300 underline hover:text-indigo-200"
            >
              Set instance config
            </button>
          </div>
        ) : pairing ? (
          <div className="flex flex-col items-center">
            {phone && (
              <p className="text-[11px] text-indigo-300 mt-1 mb-2">Connecting: {phone}</p>
            )}
            <div className="bg-white rounded-2xl px-6 py-4 text-3xl font-black tracking-[0.35em] text-gray-900 select-all">
              {pairing}
            </div>
            <p className="text-[11px] text-slate-400 mt-3 text-center px-4">
              {isMobile
                ? copied
                  ? 'Code copied — paste it in WhatsApp → ⋮ Menu → Linked devices → Link a device → “Link with phone number”'
                  : 'Open WhatsApp → ⋮ Menu → Linked devices → Link a device → “Link with phone number” → enter this code'
                : 'Open WhatsApp → ⋮ Menu → Linked devices → Link a device → “Link with phone number” → enter this code'}
            </p>
            <a
              href="https://wa.me/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 ai-btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
            >
              <MessageCircle size={14} /> Open WhatsApp
            </a>
            <p className="text-[10px] text-slate-500 mt-2">Waiting for pairing…</p>
          </div>
        ) : qr ? (
          <div className="flex flex-col items-center">
            <div className="bg-white rounded-2xl p-3">
              <img src={qr} alt="WhatsApp QR code" className="w-48 h-48 object-contain" />
            </div>
            <p className="text-[11px] text-slate-400 mt-3">Waiting for scan…</p>
          </div>
        ) : qrText ? (
          <div className="flex flex-col items-center">
            <div className="w-full bg-white/5 rounded-xl p-3 text-[11px] text-slate-200 break-all">
              {qrText}
            </div>
            <button
              onClick={copyText}
              className="mt-2 text-[11px] px-3 py-1.5 ai-glass rounded-md text-slate-200 flex items-center gap-1.5"
            >
              {copied ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy code'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center py-6">
            <RefreshCw size={36} className="text-slate-400 animate-spin mb-3" />
            <p className="text-[11px] text-slate-400">Generating QR code…</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppConnectModal;
