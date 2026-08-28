// Reusable WhatsApp deep-link helpers.
// Uses an anchor click (not window.open) so Capacitor's WebView routes the
// navigation to the WhatsApp app reliably; window.open is blocked in WebViews.

/** Strip to digits and add India's country code for 10-digit local numbers. */
export function normalizePhoneForWhatsApp(phone: string): string {
  const p = (phone || '').replace(/[^\d]/g, '');
  if (!p) return '';
  // Indian mobile numbers are 10 digits starting with 6-9.
  if (p.length === 10 && /^[6-9]/.test(p)) return '91' + p;
  return p;
}

/** Open a WhatsApp chat to the given number (optionally with prefilled text). */
export function openWhatsAppChat(phone: string, text?: string): void {
  const num = normalizePhoneForWhatsApp(phone);
  if (!num) return;
  const url = text
    ? `https://wa.me/${num}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${num}`;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
