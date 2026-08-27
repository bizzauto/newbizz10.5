/**
 * Natural-Language → Automation specification generator.
 *
 * Turns a free-text prompt into an AutomationSpec using an LLM (OpenAI or
 * OpenRouter, chosen by which API key is present in the environment). Falls
 * back to a built-in template when no key is configured or the model returns
 * malformed JSON, so the endpoint never throws.
 */
import { AutomationSpec, ActionType, AutomationStep, TriggerType } from './automationBuilder.service.js';
import logger from '../utils/logger.js';

/**
 * Call an LLM to generate raw JSON for an AutomationSpec.
 *
 * Uses fetch directly against the chat completions endpoint. OpenAI is
 * preferred when OPENAI_API_KEY is set; otherwise OPENROUTER_API_KEY is used.
 * Returns an empty string when no provider is configured or the request fails.
 */
async function generate(prompt: string): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (!openaiKey && !openrouterKey) {
    return '';
  }

  const isOpenAi = !!openaiKey;
  const url = isOpenAi
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${isOpenAi ? openaiKey : openrouterKey}`,
  };
  if (!isOpenAi) {
    headers['HTTP-Referer'] = process.env.OPENROUTER_REFERER || '';
    headers['X-Title'] = 'BizzAuto Automation Builder';
  }

  const model = isOpenAi
    ? process.env.OPENAI_MODEL || 'gpt-4o-mini'
    : process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

  const body = {
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You convert natural-language descriptions into automation specs. ' +
          'Respond ONLY with a JSON object of shape: ' +
          '{ "name": string, "trigger": TriggerType, "steps": AutomationStep[] } where ' +
          'TriggerType is one of lead.created, lead.scored, deal.stage_changed, message.received, ' +
          'form.submitted, payment.success, schedule.cron, webhook.received; each step has ' +
          '{ "id": string, "type": "trigger"|"condition"|"action"|"wait"|"branch"|"end", ' +
          '"config": object }. Action steps set config.action to one of create_contact, add_tag, ' +
          'assign_salesperson, send_whatsapp, send_email, create_task, create_deal, notify_manager, ' +
          'create_campaign. Do not include businessId or id.',
      },
      { role: 'user', content: prompt },
    ],
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      logger.warn('nlAutomation LLM request failed', { status: res.status, statusText: res.statusText });
      return '';
    }

    const data: any = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  } catch (err) {
    logger.warn('nlAutomation LLM request errored', { error: (err as Error)?.message });
    return '';
  }
}

/**
 * Default spec used when no LLM is available or the model output cannot be
 * parsed — a safe lead follow-up that requires approval before it messages.
 */
function defaultLeadFollowupSpec(businessId: string): AutomationSpec {
  return {
    name: 'Lead Follow-up',
    businessId,
    trigger: 'lead.created',
    enabled: false,
    steps: [
      {
        id: 's1',
        type: 'action',
        config: { action: 'add_tag' as ActionType, tag: 'new-lead' },
      },
      {
        id: 's2',
        type: 'action',
        config: {
          action: 'send_whatsapp' as ActionType,
          message: 'Hi! Thanks for your interest — our team will reach out shortly.',
        },
      },
      {
        id: 's3',
        type: 'action',
        config: { action: 'create_task' as ActionType, title: 'Call new lead' },
      },
    ],
  };
}

function hasApprovalAction(spec: AutomationSpec): boolean {
  return spec.steps.some((step: AutomationStep) => {
    if (step.type !== 'action') return false;
    const action = step.config?.action;
    const isBulk = step.config?.bulk === true || step.config?.social === true;
    return action === 'send_whatsapp' || action === 'create_campaign' || isBulk;
  });
}

function buildPreview(spec: AutomationSpec): string {
  const lines: string[] = [];
  lines.push(`Automation: ${spec.name}`);
  lines.push(`Trigger: ${spec.trigger}`);
  lines.push('Steps:');
  spec.steps.forEach((step, i) => {
    const detail =
      step.type === 'action' && step.config?.action
        ? step.config.action
        : step.config?.message
          ? `"${step.config.message}"`
          : '';
    lines.push(`  ${i + 1}. [${step.type}] ${detail}`.trim());
  });
  return lines.join('\n');
}

/**
 * Convert natural-language text into an AutomationSpec plus a human-readable
 * preview and an approval flag. Never throws.
 */
export async function nlToAutomation(
  businessId: string,
  naturalLanguage: string
): Promise<{ spec: AutomationSpec; preview: string; needsApproval: boolean }> {
  let spec: AutomationSpec;

  const raw = await generate(naturalLanguage || '');

  if (!raw) {
    spec = defaultLeadFollowupSpec(businessId);
  } else {
    try {
      const parsed = JSON.parse(raw);
      spec = {
        name: typeof parsed.name === 'string' ? parsed.name : 'Generated Automation',
        businessId,
        trigger: (parsed.trigger as TriggerType) || 'lead.created',
        enabled: false,
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      };

      if (spec.steps.length === 0) {
        // LLM returned a valid object but no steps — fall back.
        spec = defaultLeadFollowupSpec(businessId);
      }
    } catch {
      spec = defaultLeadFollowupSpec(businessId);
    }
  }

  const needsApproval = hasApprovalAction(spec);
  const preview = buildPreview(spec);

  return { spec, preview, needsApproval };
}
