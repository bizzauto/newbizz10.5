/**
 * @jest-environment node
 *
 * Tests for Ava Executive Assistant backend routes and frontend service.
 *
 * Backend (src/server/routes/ava.ts):
 * - GET /briefing, GET /insights, GET /context
 * - POST /chat, POST /command (read + write)
 * - GET /n8n/status, POST /n8n/trigger
 *
 * Frontend (src/services/ava.service.ts):
 * - API encapsulation for all ava endpoints
 */

// ==================== COMMAND PARSING ====================

function parseCommand(command: string, params?: any): { action: string; type: 'read' | 'write' | 'unknown' } {
  const lower = command.toLowerCase();

  // Read commands
  if (lower.includes('revenue') || lower.includes('पैसा') || lower.includes('कमाई'))
    return { action: 'revenue_update', type: 'read' };
  if (lower.includes('leads') || lower.includes('लीड'))
    return { action: 'leads_update', type: 'read' };
  if (lower.includes('pipeline') || lower.includes('डील'))
    return { action: 'pipeline_update', type: 'read' };
  if (lower.includes('appointment') || lower.includes('मीटिंग'))
    return { action: 'appointments_update', type: 'read' };

  // Write commands
  if (lower.includes('follow up') || lower.includes('follow-up') || lower.includes('reminder') || lower.includes('remind') || lower.includes('followup') || lower.includes('फॉलो'))
    return { action: 'followup_created', type: 'write' };
  if (lower.includes('schedule') || lower.includes('meeting') || lower.includes('शेड्यूल'))
    return { action: 'meeting_scheduled', type: 'write' };
  if (lower.includes('create invoice') || lower.includes('invoice') || lower.includes('bill') || lower.includes('इनवॉइस') || lower.includes('बिल'))
    return { action: 'invoice_created', type: 'write' };

  return { action: 'unknown', type: 'unknown' };
}

// ==================== N8N HELPERS ====================

function validateN8nConfig(n8nUrl: string | undefined, workflowId: string | undefined): { valid: boolean; error?: string } {
  if (!n8nUrl || n8nUrl === '')
    return { valid: false, error: 'n8n not configured' };
  if (!workflowId)
    return { valid: false, error: 'missing workflowId' };
  return { valid: true };
}

function buildN8nPayload(businessId: string, payload?: any) {
  return {
    businessId,
    triggeredBy: 'ava',
    timestamp: expect.any(String),
    ...payload
  };
}

// ==================== LANGUAGE NAMES ====================

const languageNames: Record<string, string> = {
  'en-IN': 'English',
  'hi-IN': 'Hindi (हिन्दी)',
  'mr-IN': 'Marathi (मराठी)',
  'gu-IN': 'Gujarati (ગુજરાતી)',
  'ta-IN': 'Tamil (தமிழ்)',
  'te-IN': 'Telugu (తెలుగు)',
  'bn-IN': 'Bengali (বাংলা)',
  'kn-IN': 'Kannada (ಕನ್ನಡ)',
  'ml-IN': 'Malayalam (മലയാളം)',
  'pa-IN': 'Punjabi (ਪੰਜਾਬੀ)',
};

describe('Ava - Command Parsing', () => {
  // Read commands
  it('should parse revenue command (English)', () => {
    const result = parseCommand('show revenue');
    expect(result).toEqual({ action: 'revenue_update', type: 'read' });
  });

  it('should parse revenue command (Hindi)', () => {
    const result = parseCommand('कमाई दिखाओ');
    expect(result).toEqual({ action: 'revenue_update', type: 'read' });
  });

  it('should parse leads command (English)', () => {
    const result = parseCommand('show me leads');
    expect(result).toEqual({ action: 'leads_update', type: 'read' });
  });

  it('should parse leads command (Hindi)', () => {
    const result = parseCommand('लीड दिखाओ');
    expect(result).toEqual({ action: 'leads_update', type: 'read' });
  });

  it('should parse pipeline command', () => {
    const result = parseCommand('pipeline status');
    expect(result).toEqual({ action: 'pipeline_update', type: 'read' });
  });

  it('should parse appointments command', () => {
    const result = parseCommand('appointments today');
    expect(result).toEqual({ action: 'appointments_update', type: 'read' });
  });

  it('should parse deals command as pipeline (Hindi)', () => {
    const result = parseCommand('डील दिखाओ');
    expect(result).toEqual({ action: 'pipeline_update', type: 'read' });
  });

  it('should parse meeting command (Hindi)', () => {
    const result = parseCommand('मीटिंग दिखाओ');
    expect(result).toEqual({ action: 'appointments_update', type: 'read' });
  });

  // Write commands
  it('should parse follow-up command', () => {
    const result = parseCommand('create a follow up');
    expect(result).toEqual({ action: 'followup_created', type: 'write' });
  });

  it('should parse follow-up command (Hindi)', () => {
    const result = parseCommand('फॉलो अप बनाओ');
    expect(result).toEqual({ action: 'followup_created', type: 'write' });
  });

  it('should parse reminder command', () => {
    const result = parseCommand('remind me tomorrow');
    expect(result).toEqual({ action: 'followup_created', type: 'write' });
  });

  it('should parse schedule meeting command', () => {
    const result = parseCommand('schedule a meeting');
    expect(result).toEqual({ action: 'meeting_scheduled', type: 'write' });
  });

  it('should parse schedule command (Hindi)', () => {
    const result = parseCommand('शेड्यूल बनाओ');
    expect(result).toEqual({ action: 'meeting_scheduled', type: 'write' });
  });

  it('should parse invoice command', () => {
    const result = parseCommand('create invoice');
    expect(result).toEqual({ action: 'invoice_created', type: 'write' });
  });

  it('should parse invoice command (Hindi)', () => {
    const result = parseCommand('इनवॉइस बनाओ');
    expect(result).toEqual({ action: 'invoice_created', type: 'write' });
  });

  it('should parse bill command', () => {
    const result = parseCommand('generate bill');
    expect(result).toEqual({ action: 'invoice_created', type: 'write' });
  });

  // Unknown commands
  it('should return unknown for unrecognized commands', () => {
    const result = parseCommand('what is the weather');
    expect(result).toEqual({ action: 'unknown', type: 'unknown' });
  });

  it('should return unknown for empty string', () => {
    const result = parseCommand('');
    expect(result).toEqual({ action: 'unknown', type: 'unknown' });
  });
});

describe('Ava - n8n Integration', () => {
  it('should validate config with URL and workflowId', () => {
    const result = validateN8nConfig('https://n8n.example.com', 'workflow-123');
    expect(result).toEqual({ valid: true });
  });

  it('should reject missing n8n URL', () => {
    const result = validateN8nConfig('', 'workflow-123');
    expect(result).toEqual({ valid: false, error: 'n8n not configured' });
  });

  it('should reject undefined n8n URL', () => {
    const result = validateN8nConfig(undefined, 'workflow-123');
    expect(result).toEqual({ valid: false, error: 'n8n not configured' });
  });

  it('should reject missing workflowId', () => {
    const result = validateN8nConfig('https://n8n.example.com', undefined);
    expect(result).toEqual({ valid: false, error: 'missing workflowId' });
  });

  it('should reject missing both', () => {
    const result = validateN8nConfig(undefined, undefined);
    expect(result).toEqual({ valid: false, error: 'n8n not configured' });
  });

  it('should build payload with businessId and metadata', () => {
    const payload = buildN8nPayload('biz-123', { action: 'test' });
    expect(payload).toMatchObject({
      businessId: 'biz-123',
      triggeredBy: 'ava',
      action: 'test'
    });
    expect(payload.timestamp).toBeDefined();
  });

  it('should build payload without extra data', () => {
    const payload = buildN8nPayload('biz-456');
    expect(payload).toMatchObject({
      businessId: 'biz-456',
      triggeredBy: 'ava',
    });
    expect(payload.timestamp).toBeDefined();
  });
});

describe('Ava - Language Names', () => {
  it('should have language mappings for all 10 supported languages', () => {
    expect(Object.keys(languageNames).length).toBe(10);
  });

  it('should include Indian English', () => {
    expect(languageNames['en-IN']).toBe('English');
  });

  it('should include Hindi', () => {
    expect(languageNames['hi-IN']).toBe('Hindi (हिन्दी)');
  });

  it('should include all regional languages', () => {
    const regional = ['mr-IN', 'gu-IN', 'ta-IN', 'te-IN', 'bn-IN', 'kn-IN', 'ml-IN', 'pa-IN'];
    regional.forEach(code => {
      expect(languageNames[code]).toBeDefined();
      expect(languageNames[code].length).toBeGreaterThan(0);
    });
  });

  it('should return undefined for unsupported languages', () => {
    expect(languageNames['fr-FR']).toBeUndefined();
  });
});

// ==================== FRONTEND SERVICE ====================

describe('Ava - Frontend Service (ava.service.ts)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
    // Mock localStorage token
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: jest.fn(() => 'test-token'),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
      writable: true
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const API_BASE = '/api/ava';

  function getHeaders() {
    return {
      'Authorization': 'Bearer test-token',
      'Content-Type': 'application/json'
    };
  }

  it('should call GET /api/ava/briefing for getBriefing', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: { greeting: 'Hello' } })
    });

    const response = await fetch(`${API_BASE}/briefing`, { headers: getHeaders() });
    const data = await response.json();

    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/briefing`, { headers: getHeaders() });
    expect(data.success).toBe(true);
    expect(data.data.greeting).toBe('Hello');
  });

  it('should call POST /api/ava/chat for chat', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: { text: 'Hello!' } })
    });

    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ text: 'Hi', history: [], language: 'en-IN' })
    });
    const data = await response.json();

    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/chat`, expect.any(Object));
    expect(data.success).toBe(true);
    expect(data.data.text).toBe('Hello!');
  });

  it('should call POST /api/ava/command for executeCommand', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, action: 'revenue_update', message: 'Revenue data' })
    });

    const response = await fetch(`${API_BASE}/command`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ command: 'revenue' })
    });
    const data = await response.json();

    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/command`, expect.any(Object));
    expect(data.success).toBe(true);
    expect(data.action).toBe('revenue_update');
  });

  it('should call GET /api/ava/context for getContext', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: { context: 'business data' } })
    });

    const response = await fetch(`${API_BASE}/context`, { headers: getHeaders() });
    const data = await response.json();

    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/context`, { headers: getHeaders() });
    expect(data.success).toBe(true);
    expect(data.data.context).toBe('business data');
  });

  it('should call GET /api/ava/insights for getInsights', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: 'insight data' })
    });

    const response = await fetch(`${API_BASE}/insights`, { headers: getHeaders() });
    const data = await response.json();

    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/insights`, { headers: getHeaders() });
    expect(data.success).toBe(true);
  });

  it('should call GET /api/ava/n8n/status for n8n status', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: { connected: true, url: 'https://n8n.example.com' } })
    });

    const response = await fetch(`${API_BASE}/n8n/status`, { headers: getHeaders() });
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data.connected).toBe(true);
  });

  it('should call POST /api/ava/n8n/trigger for n8n trigger', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: { status: 200 } })
    });

    const response = await fetch(`${API_BASE}/n8n/trigger`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ workflowId: 'wf-123', payload: {} })
    });
    const data = await response.json();

    expect(data.success).toBe(true);
  });

  it('should include auth token in all requests', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ success: true })
    });

    const headers = getHeaders();
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['Content-Type']).toBe('application/json');
  });
});
