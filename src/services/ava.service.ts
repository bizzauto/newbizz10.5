const API_BASE = '/api/ava';

function getHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

export interface BriefingData {
  greeting: string;
  date: string;
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    growth: number;
    topDeals: { contact: string; value: number; stage: string }[];
  };
  sales: {
    dealsWonToday: number;
    dealsWonWeek: number;
    totalPipelineValue: number;
    conversionRate: number;
  };
  leads: {
    newToday: number;
    totalActive: number;
    hotLeads: { name: string; score: number }[];
    needsFollowUp: { name: string; daysSince: number }[];
  };
  pipeline: {
    totalValue: number;
    stuckDeals: { contact: string; daysInStage: number }[];
  };
  appointments: {
    today: number;
    tomorrow: number;
    missed: number;
  };
  support: {
    openTickets: number;
    urgentTickets: number;
  };
  alerts: { type: string; message: string }[];
  recommendations: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const avaService = {
  async getBriefing(): Promise<{ success: boolean; data: BriefingData }> {
    const res = await fetch(`${API_BASE}/briefing`, { headers: getHeaders() });
    return res.json();
  },

  async chat(text: string, history: ChatMessage[], language: string): Promise<{ success: boolean; data: { text: string } }> {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ text, history, language })
    });
    return res.json();
  },

  async executeCommand(command: string, params?: any): Promise<{ success: boolean; message: string; data?: any }> {
    const res = await fetch(`${API_BASE}/command`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ command, params })
    });
    return res.json();
  },

  async getContext(): Promise<{ success: boolean; data: string }> {
    const res = await fetch(`${API_BASE}/context`, { headers: getHeaders() });
    return res.json();
  },

  async getInsights(): Promise<{ success: boolean; data: string }> {
    const res = await fetch(`${API_BASE}/insights`, { headers: getHeaders() });
    return res.json();
  }
};
