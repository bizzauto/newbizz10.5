import axios from 'axios';

const DEFAULT_BASE = process.env.N8N_BASE_URL || '';
const DEFAULT_KEY = process.env.N8N_API_KEY || '';

export interface N8nWorkflowSummary {
  id: string;
  name: string;
  active: boolean;
}

async function n8nRequest(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
  baseUrl?: string,
  apiKey?: string
): Promise<any> {
  const base = baseUrl || DEFAULT_BASE;
  const key = apiKey || DEFAULT_KEY;
  if (!base) throw new Error('N8N_BASE_URL is not configured');
  const { data } = await axios.request({
    url: `${base.replace(/\/$/, '')}/api/v1/${path}`,
    method,
    headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
    data: body,
  });
  return data;
}

export function isN8nConfigured(): boolean {
  return Boolean(DEFAULT_BASE && DEFAULT_KEY);
}

export async function listWorkflows(
  baseUrl?: string,
  apiKey?: string
): Promise<N8nWorkflowSummary[]> {
  const data = await n8nRequest('workflows', 'GET', undefined, baseUrl, apiKey);
  return (data.data || []).map((w: any) => ({
    id: String(w.id),
    name: w.name,
    active: !!w.active,
  }));
}

export async function getWorkflow(id: string, baseUrl?: string, apiKey?: string): Promise<any> {
  return n8nRequest(`workflows/${id}`, 'GET', undefined, baseUrl, apiKey);
}

export async function executeWorkflow(
  id: string,
  workflowData: any = {},
  baseUrl?: string,
  apiKey?: string
): Promise<any> {
  return n8nRequest(`workflows/${id}/execute`, 'POST', { workflowData }, baseUrl, apiKey);
}

export async function triggerWebhook(
  path: string,
  method: 'GET' | 'POST' = 'POST',
  body?: unknown,
  baseUrl?: string
): Promise<any> {
  const base = baseUrl || DEFAULT_BASE;
  if (!base) throw new Error('N8N_BASE_URL is not configured');
  const { data } = await axios.request({
    url: `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`,
    method,
    headers: { 'Content-Type': 'application/json' },
    data: body,
  });
  return data;
}

export default { isN8nConfigured, listWorkflows, getWorkflow, executeWorkflow, triggerWebhook };
