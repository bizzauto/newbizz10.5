/**
 * Spintax engine + personalization for WhatsApp anti-ban.
 *
 * Spintax syntax: {option1|option2|option3} — one option is picked at random
 * per message. Nested braces are supported:
 *   {Namaste|Hello {dear|friend}}!  →  "Namaste!" or "Hello dear!" or "Hello friend!"
 *
 * Personalization placeholders (case-insensitive):
 *   {name}   → contact name (first word if multi-word)
 *   {phone}  → contact phone
 *   {business} → business name
 *
 * If a template has NO spintax and NO placeholders it is returned unchanged,
 * so plain messages cost nothing.
 */

const SPIN_RE = /\{([^{}]*)\}/g;

/** Pick one random item from a pipe-separated group, recursively. */
function spinGroup(group: string): string {
  const options = group.split('|');
  if (options.length <= 1) return group;
  const picked = options[Math.floor(Math.random() * options.length)].trim();
  // Recurse — picked value may itself contain nested groups
  return spin(picked);
}

/**
 * Expand spintax in a template. Safe on strings without braces.
 */
export function spin(template: string): string {
  if (!template || !template.includes('{')) return template;
  let previous = '';
  let out = template;
  // Iterate because replacement can reveal nested groups; guard against loops.
  let guard = 0;
  while (out.includes('{') && out !== previous && guard < 10) {
    previous = out;
    out = out.replace(SPIN_RE, (_m, group: string) => spinGroup(group));
    guard++;
  }
  return out;
}

/**
 * Replace personalization placeholders with contact values.
 */
export function personalize(
  text: string,
  vars: { name?: string | null; phone?: string | null; business?: string | null } = {}
): string {
  if (!text || !text.includes('{')) return text;
  const name = (vars.name || '').trim();
  const firstName = name.split(/\s+/)[0] || '';
  return text
    .replace(/\{\s*name\s*\}/gi, firstName || name || 'there')
    .replace(/\{\s*phone\s*\}/gi, vars.phone || '')
    .replace(/\{\s*business\s*\}/gi, vars.business || '')
    // Unknown placeholders are removed rather than shown raw to the user
    .replace(/\{\s*[a-zA-Z_]+\s*\}/g, '');
}

/**
 * One-shot: personalize first (so names don't get spun away), then spin.
 */
export function spinAndPersonalize(
  template: string,
  vars: { name?: string | null; phone?: string | null; business?: string | null } = {}
): string {
  return spin(personalize(template, vars));
}

/**
 * True when a template actually varies — used for logging/stats.
 */
export function hasVariation(template: string): boolean {
  return !!template && (template.includes('{') && /\{[^{}]*\|/.test(template));
}
