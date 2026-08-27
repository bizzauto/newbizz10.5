import { prisma } from '../db.js';

export type FlagScope = 'GLOBAL' | 'PLAN' | 'TENANT' | 'USER';

/**
 * Plan-level default feature availability.
 *
 * Higher paid tiers (GROWTH, PRO, ENTERPRISE, AGENCY) get the premium
 * automation/AI features enabled by default; FREE and STARTER do not.
 * Used as the final fallback in isEnabled when neither a FeatureFlag row
 * nor a scoping override exists.
 */
export const PLAN_DEFAULTS: Record<string, Record<string, boolean>> = {
  FREE: {
    AI_AUTOPILOT: false,
    WHATSAPP_AUTOMATION: false,
    AI_AGENT: false,
    N8N_AUTOMATION: false,
    SOCIAL_AUTOMATION: false,
    ADVANCED_ANALYTICS: false,
    AUTO_FOLLOWUP: false,
    CHURN_DETECTION: false,
    AI_SEARCH: false,
  },
  STARTER: {
    AI_AUTOPILOT: false,
    WHATSAPP_AUTOMATION: false,
    AI_AGENT: false,
    N8N_AUTOMATION: false,
    SOCIAL_AUTOMATION: false,
    ADVANCED_ANALYTICS: false,
    AUTO_FOLLOWUP: false,
    CHURN_DETECTION: false,
    AI_SEARCH: false,
  },
  GROWTH: {
    AI_AUTOPILOT: true,
    WHATSAPP_AUTOMATION: true,
    AI_AGENT: true,
    N8N_AUTOMATION: true,
    SOCIAL_AUTOMATION: true,
    ADVANCED_ANALYTICS: true,
    AUTO_FOLLOWUP: true,
    CHURN_DETECTION: true,
    AI_SEARCH: true,
  },
  PRO: {
    AI_AUTOPILOT: true,
    WHATSAPP_AUTOMATION: true,
    AI_AGENT: true,
    N8N_AUTOMATION: true,
    SOCIAL_AUTOMATION: true,
    ADVANCED_ANALYTICS: true,
    AUTO_FOLLOWUP: true,
    CHURN_DETECTION: true,
    AI_SEARCH: true,
  },
  ENTERPRISE: {
    AI_AUTOPILOT: true,
    WHATSAPP_AUTOMATION: true,
    AI_AGENT: true,
    N8N_AUTOMATION: true,
    SOCIAL_AUTOMATION: true,
    ADVANCED_ANALYTICS: true,
    AUTO_FOLLOWUP: true,
    CHURN_DETECTION: true,
    AI_SEARCH: true,
  },
  AGENCY: {
    AI_AUTOPILOT: true,
    WHATSAPP_AUTOMATION: true,
    AI_AGENT: true,
    N8N_AUTOMATION: true,
    SOCIAL_AUTOMATION: true,
    ADVANCED_ANALYTICS: true,
    AUTO_FOLLOWUP: true,
    CHURN_DETECTION: true,
    AI_SEARCH: true,
  },
};

/**
 * Resolve whether a feature flag is enabled for the given context.
 *
 * Precedence (most specific wins):
 *   USER override > TENANT override > PLAN override > GLOBAL FeatureFlag.enabled
 *   > PLAN_DEFAULTS[plan][key] ?? true
 *
 * If the global FeatureFlag row does not exist, we fall back to the plan
 * defaults; if no default is configured for the plan we default to true
 * (fail-open so new flags do not silently break existing tenants).
 */
export async function isEnabled(
  key: string,
  ctx?: { plan?: string; tenantId?: string; userId?: string }
): Promise<boolean> {
  // 1. USER override (most specific)
  if (ctx?.userId) {
    const userOverride = await prisma.featureFlagOverride.findFirst({
      where: { key, scope: 'USER', userId: ctx.userId, plan: null, tenantId: null },
    });
    if (userOverride) return userOverride.enabled;
  }

  // 2. TENANT override
  if (ctx?.tenantId) {
    const tenantOverride = await prisma.featureFlagOverride.findFirst({
      where: { key, scope: 'TENANT', tenantId: ctx.tenantId, plan: null, userId: null },
    });
    if (tenantOverride) return tenantOverride.enabled;
  }

  // 3. PLAN override
  if (ctx?.plan) {
    const planOverride = await prisma.featureFlagOverride.findFirst({
      where: { key, scope: 'PLAN', plan: ctx.plan, tenantId: null, userId: null },
    });
    if (planOverride) return planOverride.enabled;
  }

  // 4. GLOBAL FeatureFlag row
  const globalFlag = await prisma.featureFlag.findUnique({ where: { key } });
  if (globalFlag) return globalFlag.enabled;

  // 5. Plan-level default fallback
  return PLAN_DEFAULTS[ctx?.plan ?? '']?.[key] ?? true;
}

/**
 * Upsert a global feature flag by its key.
 */
export async function setGlobalFlag(key: string, enabled: boolean) {
  return prisma.featureFlag.upsert({
    where: { key },
    update: { enabled },
    create: { key, enabled },
  });
}

export interface SetOverrideOptions {
  key: string;
  scope: FlagScope;
  plan?: string;
  tenantId?: string;
  userId?: string;
  enabled: boolean;
}

/**
 * Upsert a scoped feature-flag override.
 *
 * The compound unique key is (key, scope, plan, tenantId, userId). Nullable
 * scope dimensions are normalized to null so overrides are matched exactly on
 * the dimensions they actually use (e.g. a USER override has plan/tenant null).
 */
export async function setOverride(opts: SetOverrideOptions) {
  const { key, scope, plan, tenantId, userId, enabled } = opts;
  const whereKey = {
    key,
    scope,
    plan: plan ?? null,
    tenantId: tenantId ?? null,
    userId: userId ?? null,
  };

  return prisma.featureFlagOverride.upsert({
    where: { key_scope_plan_tenantId_userId: whereKey },
    update: { enabled },
    create: { key, scope, plan: plan ?? null, tenantId: tenantId ?? null, userId: userId ?? null, enabled },
  });
}

/**
 * List all global flags and all scoped overrides.
 *
 * `businessId` is an optional passthrough for callers that want to know which
 * tenant the listing was requested for; overrides are not filtered by it
 * (admins see the full override matrix).
 */
export async function listFlags(businessId?: string) {
  const globalFlags = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  const overrides = await prisma.featureFlagOverride.findMany({ orderBy: { key: 'asc' } });

  return {
    globalFlags,
    overrides,
    planDefaults: PLAN_DEFAULTS,
    businessId: businessId ?? null,
  };
}
