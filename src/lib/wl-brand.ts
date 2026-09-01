/**
 * White-label brand helper — reads window.__WL_BRANDING (set by AppWrapper
 * on load). Returns BizzAuto defaults if no white-label is configured.
 */

interface WLBrand {
  brandName: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
}

const DEFAULTS: WLBrand = {
  brandName: 'BizzAuto AI',
  logoUrl: '/logo.svg',
  faviconUrl: '/favicon.svg',
  primaryColor: '#1B6EF3',
};

export function getWLBrand(): WLBrand {
  const b = typeof window !== 'undefined' ? (window as any).__WL_BRANDING : null;
  if (!b) return DEFAULTS;
  return {
    brandName: b.brandName || DEFAULTS.brandName,
    logoUrl: b.logoUrl || DEFAULTS.logoUrl,
    faviconUrl: b.faviconUrl || DEFAULTS.faviconUrl,
    primaryColor: b.primaryColor || DEFAULTS.primaryColor,
  };
}

/** Short brand name (no " AI" suffix) for tight headers */
export function getWLBrandShort(): string {
  return getWLBrand().brandName.replace(/\s+AI$/i, '');
}
