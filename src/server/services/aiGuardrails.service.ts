/**
 * AI Guardrails service.
 *
 * Lightweight, dependency-free checks that protect AI-driven automation in
 * BIZZ CRM from prompt injection, PII leakage, forbidden actions, and
 * accidental secret exfiltration in tool outputs.
 *
 * All functions are pure (no IO) except where noted, so they are safe to call
 * on every AI request/response without side effects.
 */

import logger from '../utils/logger.js';

/**
 * Detect likely prompt-injection / jailbreak attempts in untrusted text
 * (e.g. customer messages, webhook payloads, lead notes).
 *
 * Returns a normalized risk score in [0, 1] plus the matched reasons so
 * callers can decide on a threshold and surface an explanation.
 */
export function detectPromptInjection(text: string): {
  risky: boolean;
  score: number;
  reasons: string[];
} {
  if (!text || typeof text !== 'string') {
    return { risky: false, score: 0, reasons: [] };
  }

  const lower = text.toLowerCase();
  const reasons: string[] = [];

  // Direct instruction-override phrases
  const overridePatterns: Array<{ re: RegExp; label: string }> = [
    { re: /ignore (all |any |previous |prior |above )?instructions?/i, label: 'instruction-override:ignore' },
    { re: /disregard (all |any |previous |prior |above )?(instructions?|rules?|guidelines?)/i, label: 'instruction-override:disregard' },
    { re: /forget (everything|all|your|the) (instructions?|rules?|prior)/i, label: 'instruction-override:forget' },
    { re: /you are now /i, label: 'role-hijack:you-are-now' },
    { re: /new (instructions?|rules?|role|system)[:=]/i, label: 'role-hijack:new-role' },
    { re: /system (prompt|message|instruction)/i, label: 'system-leak:system-prompt' },
    { re: /<\s*system\s*>/i, label: 'system-leak:system-tag' },
    { re: /```\s*system/i, label: 'system-leak:system-fence' },
  ];

  for (const p of overridePatterns) {
    if (p.re.test(text)) {
      reasons.push(p.label);
    }
  }

  // Role-play / jailbreak framing
  const jailbreakPatterns: Array<{ re: RegExp; label: string }> = [
    { re: /(act|pretend|roleplay|role-play|imagine) (as|like|you are) (a|an|the) /i, label: 'jailbreak:roleplay' },
    { re: /(developer mode|d[a-n]n mode|jailbreak|unfiltered|no (restrictions|limits|constraints))/i, label: 'jailbreak:unfiltered' },
    { re: /\bDAN\b/i, label: 'jailbreak:dan' },
    { re: /repeat (your|the) (instructions?|system prompt|initial)/i, label: 'jailbreak:extract-prompt' },
    { re: /reveal (your|the) (instructions?|system prompt|prompt)/i, label: 'jailbreak:reveal-prompt' },
  ];

  for (const p of jailbreakPatterns) {
    if (p.re.test(text)) {
      reasons.push(p.label);
    }
  }

  // Exfiltration attempts
  const exfilPatterns: Array<{ re: RegExp; label: string }> = [
    { re: /(send|post|forward|email|exfiltrate|exfil) .{0,40}(api[ _-]?key|secret|token|password|credential)/i, label: 'exfil:credentials' },
    { re: /(base64|encode) .{0,40}(password|secret|token|api[ _-]?key)/i, label: 'exfil:encode-secret' },
    { re: /https?:\/\/\S*(webhook|discord|telegram|ngrok|requestbin|pipedream)/i, label: 'exfil:external-endpoint' },
  ];

  for (const p of exfilPatterns) {
    if (p.re.test(text)) {
      reasons.push(p.label);
    }
  }

  // Markdown/fenced control tokens that may attempt to smuggle instructions
  if (/>:\s*\S/i.test(text)) {
    reasons.push('control-token:prompt-colon');
  }

  // Score: each distinct reason adds weight, capped at 1.
  // Override + jailbreak combos escalate faster than a single weak signal.
  let score = 0;
  if (reasons.length > 0) {
    score = Math.min(1, 0.35 + reasons.length * 0.2);
  }

  const risky = score >= 0.5;

  return { risky, score: Number(score.toFixed(2)), reasons };
}

/**
 * Detect whether text contains PII that should not be surfaced in AI outputs
 * (e.g. customer-facing drafts, logs, or external posts).
 *
 * Patterns: email, phone (IN + international), Aadhaar (12-digit),
 * PAN (5 letters + 4 digits + 1 letter).
 */
export function assertNoPIILeak(text: string): {
  leak: boolean;
  findings: string[];
} {
  if (!text || typeof text !== 'string') {
    return { leak: false, findings: [] };
  }

  const findings: string[] = [];

  // Email
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) {
    findings.push('email');
  }

  // Phone: +91 / 0-prefixed / 10-digit IN mobile
  if (/(?:\+?91[\s-]?)?(?:\b\d{10}\b|\b[6-9]\d{9}\b)/.test(text)) {
    findings.push('phone');
  }

  // Aadhaar: 12 digits, optional spaces/dashes
  if (/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/.test(text)) {
    findings.push('aadhaar');
  }

  // PAN: AAAAA9999A
  if (/\b[A-Z]{5}[0-9]{4}[A-Z]\b/.test(text)) {
    findings.push('pan');
  }

  return { leak: findings.length > 0, findings };
}

/**
 * Forbidden-action guard for tool execution.
 *
 * Returns true if the action is in the forbidden set and must NOT execute
 * without an explicit, separately-approved path.
 */
const FORBIDDEN_ACTIONS = new Set<string>([
  'DELETE_ACCOUNT',
  'MASS_DELETE',
  'MASS_DELETE_CONTACTS',
  'MASS_DELETE_LEADS',
  'REFUND_WITHOUT_APPROVAL',
  'CHANGE_PRICING',
  'CHANGE_PLAN_PRICING',
  'EXPORT_ALL_PII',
  'GRANT_ADMIN',
]);

export function forbiddenActionCheck(action: string): boolean {
  if (!action || typeof action !== 'string') return false;
  const normalized = action.trim().toUpperCase();
  return FORBIDDEN_ACTIONS.has(normalized);
}

/**
 * Sanitize a tool result / AI output before it is persisted or returned to a
 * client, stripping obvious secret/key material.
 */
export function sanitizeToolResult(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let out = text;

  // API keys (sk-, pk-, AKIA, generic key=)
  out = out.replace(/(\b(?:sk|pk|rk)_[a-z0-9]{16,})/gi, '[REDACTED_API_KEY]');
  out = out.replace(/\b(AKIA[0-9A-Z]{16})/g, '[REDACTED_AWS_KEY]');
  out = out.replace(/(api[_-]?key\s*[=:]\s*")[^"]+(")/gi, '$1[REDACTED]$2');
  out = out.replace(/(secret[_-]?key\s*[=:]\s*")[^"]+(")/gi, '$1[REDACTED]$2');

  // Bearer tokens
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');

  // Passwords in common assignment shapes
  out = out.replace(/(password\s*[=:]\s*")[^"]+(")/gi, '$1[REDACTED]$2');

  // Generic long hex secrets / tokens (>= 32 hex chars)
  out = out.replace(/\b[0-9a-f]{32,}\b/gi, '[REDACTED_HEX]');

  // Private keys
  out = out.replace(/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');

  return out;
}

/** Convenience guard: returns true if any guardrail flags the input. */
export function isUnsafeInput(text: string): boolean {
  const inj = detectPromptInjection(text);
  const pii = assertNoPIILeak(text);
  if (inj.risky || pii.leak) {
    logger.warn('ai.guardrail.flagged', {
      injection: inj.risky ? inj.reasons : [],
      pii: pii.leak ? pii.findings : [],
    });
    return true;
  }
  return false;
}
