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
  const [pairingUnsupported, setPairingUnsupported] = useState<boolean>(false);
  const [phoneInput, setPhoneInput] = useState<string>(phone || '');
  const [phoneError, setPhoneError] = useState<string>('');
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

  const doConnect = useCallback(async (connectPhone?: string) => {
    setConnecting(true);
    setError('');
    try {
      const resp: any = await evolutionAPI.connect({
        mobile: isMobile,
        phone: connectPhone && connectPhone.replace(/\D/g, '').length >= 10 ? connectPhone : '',
      });
      const data = resp?.data?.data || resp?.data || {};
      const pairingCode: string = data.pairingCode || '';
      const q: string = data.qrCode || data.qrCodeBase64 || '';
      if (!pairingCode && !q) {
        setError('No QR or pairing code returned. Evolution may not be configured on the server.');
        setConnecting(false);
        return;
      }
      setPairing(pairingCode);
      setPairingUnsupported(!!data.pairingUnsupported);
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
      const status = e?.response?.status;
      const raw = e?.response?.data?.message || e?.response?.data?.error || e?.message || '';
      const msg =
        `Evolution connect failed${status ? ` (HTTP ${status})` : ''}: ` +
        (raw || 'No response from server. Evolution API may be unreachable or not configured.');
      console.error('[WhatsAppConnectModal] connect error:', status, raw);
      setError(msg);
    } finally {
      setConnecting(false);
    }
  }, [startPolling, isMobile]);

  const startConnect = useCallback(async () => {
    const raw = (phoneInput || phone || '').replace(/\D/g, '');
    if (!/^\d{10,15}$/.test(raw)) {
      setPhoneError('Enter a valid WhatsApp number with country code (10-15 digits, e.g. 919999999999).');
      return;
    }
    setPhoneError('');
    doConnect(raw);
  }, [phoneInput, phone, doConnect]);

  // Open effect: kick off connect + polling
  useEffect(() => {
    mountedRef.current = true;
    if (open) {
      if (!isMobile) {
        // Desktop: plain QR auto-connect (scan from phone).
        doConnect();
      } else if (phone && phone.replace(/\D/g, '').length >= 10) {
        // Mobile + a real configured number: auto-request the pairing code.
        doConnect(phone);
      }
      // Mobile without a configured number: show the number-input form (the
      // open-effect branch below), where the user enters their WhatsApp number
      // and taps "Generate pairing code". A phone cannot scan its own QR, so we
      // must use the pairing-code flow here.
    }
    return () => {
      mountedRef.current = false;
      autoOpenRef.current = false;
      clearPoll();
    };
  }, [open, doConnect, clearPoll, isMobile]);

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

  // Watchdog: if connect hangs (no QR/error after 90s), surface a message
  // so the user isn't stuck on the spinner.
  useEffect(() => {
    if (!connecting) return;
    const t = setTimeout(() => {
      setError((prev) =>
        prev ||
        'Connection is taking too long (>90s). Evolution API may be slow, unreachable, or not configured for this business.'
      );
    }, 90000);
    return () => clearTimeout(t);
  }, [connecting]);

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
            ? 'Scan this QR from WhatsApp on another phone/desktop → ⋮ Menu → Linked devices → Link a device'
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
              onClick={() => doConnect(phoneInput || phone || undefined)}
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
        ) : (isMobile && !qr && !connecting) ? (
          <div className="flex flex-col items-center w-full">
            <p className="text-[11px] text-slate-400 mb-3 text-center px-2">
              Enter the WhatsApp number you want to link (with country code). We'll generate an
              8-character pairing code to type into WhatsApp → Linked devices → Link with phone number.
            </p>
            <input
              type="tel"
              inputMode="numeric"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="919999999999"
              className="w-full ai-glass rounded-xl px-4 py-3 text-center text-lg tracking-wider text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-orange-400/60"
              aria-label="WhatsApp number to link"
            />
            {phoneError && (
              <p className="text-[11px] text-amber-300 mt-2 text-center px-2">{phoneError}</p>
            )}
            <button
              onClick={startConnect}
              className="ai-btn-primary text-sm px-5 py-2.5 mt-3 flex items-center gap-1.5"
            >
              <Smartphone size={14} /> Generate pairing code
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
            {isMobile && pairingUnsupported ? (
              <p className="text-[11px] text-amber-300 mt-3 text-center px-4">
                Your WhatsApp server doesn't support phone-number linking. Scan this QR using
                <span className="font-semibold"> WhatsApp on another phone/desktop</span> → Linked devices → Link a device.
                <br />(Or update Evolution API to ≥2.1.0 for one-tap code linking.)
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 mt-3">Waiting for scan…</p>
            )}
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
