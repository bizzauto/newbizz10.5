import { useState, useEffect, useCallback } from 'react';
import {
  Users, MessageSquare, Calendar, FileText, ShoppingBag,
  TrendingUp, Activity, RefreshCw, Loader2, Zap, Package, Bot
} from 'lucide-react';
import apiClient from '../lib/api';

interface WidgetData {
  leads: { today: number; week: number; total: number; daily: { date: string; count: number }[]; bySource: { name: string; value: number }[] };
  whatsapp: { sentToday: number; sentWeek: number; delivered: number; read: number; deliveryRate: number };
  appointments: { today: number; week: number };
  invoices: { pending: number; totalDue: number };
  orders: { today: number; revenueMonth: number };
  business: { activeFlows: number; catalogItems: number; teamMembers: number };
  recentActivity: { type: string; title: string; createdAt: string; contact?: { name: string } }[];
}

function StatCard({ icon, label, value, sub, color }: any) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-green-600 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardWidgets() {
  const [data, setData] = useState<WidgetData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/dashboard-widgets');
      setData(res?.data?.data || null);
    } catch { /* keep old */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Activity size={20} className="text-blue-600" /> Live Overview</h3>
        <button onClick={load} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><RefreshCw size={16} className="text-gray-500" /></button>
      </div>

      {/* Main stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users size={20} className="text-white" />} label="New Leads (Today)" value={data.leads.today} sub={`${data.leads.week} this week`} color="bg-blue-500" />
        <StatCard icon={<MessageSquare size={20} className="text-white" />} label="WA Sent (Today)" value={data.whatsapp.sentToday} sub={`${data.whatsapp.deliveryRate}% delivered`} color="bg-green-500" />
        <StatCard icon={<Calendar size={20} className="text-white" />} label="Appointments (Today)" value={data.appointments.today} sub={`${data.appointments.week} this week`} color="bg-purple-500" />
        <StatCard icon={<ShoppingBag size={20} className="text-white" />} label="Orders (Today)" value={data.orders.today} sub={`₹${(data.orders.revenueMonth || 0).toLocaleString()} MTD`} color="bg-orange-500" />
      </div>

      {/* Secondary grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lead Sources */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2"><TrendingUp size={16} className="text-blue-500" /> Lead Sources</h4>
          <div className="space-y-2">
            {data.leads.bySource.length === 0 ? (
              <p className="text-xs text-gray-400">No leads yet</p>
            ) : data.leads.bySource.map((s) => {
              const max = Math.max(...data.leads.bySource.map((x: any) => x.value), 1);
              return (
                <div key={s.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 dark:text-gray-300 capitalize">{s.name.replace(/_/g, ' ')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{s.value}</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full" style={{ width: `${(s.value / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* WhatsApp Stats */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2"><MessageSquare size={16} className="text-green-500" /> WhatsApp Health</h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Delivery Rate</span>
              <span className="text-lg font-bold text-green-600">{data.whatsapp.deliveryRate}%</span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${data.whatsapp.deliveryRate}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-center pt-2">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2">
                <p className="text-lg font-bold text-blue-600">{data.whatsapp.delivered}</p>
                <p className="text-[10px] text-gray-500">Delivered</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-2">
                <p className="text-lg font-bold text-purple-600">{data.whatsapp.read}</p>
                <p className="text-[10px] text-gray-500">Read</p>
              </div>
            </div>
            <div className="text-xs text-gray-500 pt-1">{data.whatsapp.sentWeek} messages sent this week</div>
          </div>
        </div>

        {/* Business Health */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2"><Bot size={16} className="text-purple-500" /> Automation</h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
              <p className="text-lg font-bold text-purple-600">{data.business.activeFlows}</p>
              <p className="text-[10px] text-gray-500">Active Flows</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
              <p className="text-lg font-bold text-green-600">{data.business.catalogItems}</p>
              <p className="text-[10px] text-gray-500">Catalog</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <p className="text-lg font-bold text-blue-600">{data.business.teamMembers}</p>
              <p className="text-[10px] text-gray-500">Team</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Pending Invoices</span>
              <span className="font-bold text-orange-600">{data.invoices.pending}</span>
            </div>
            <div className="flex justify-between text-xs mt-2">
              <span className="text-gray-500">Total Due</span>
              <span className="font-bold text-orange-600">₹{(data.invoices.totalDue || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2"><Zap size={16} className="text-yellow-500" /> Recent Activity</h4>
        {data.recentActivity.length === 0 ? (
          <p className="text-xs text-gray-400">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {data.recentActivity.map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0" />
                <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{a.title}</p>
                {a.contact?.name && <span className="text-xs text-gray-400">{a.contact.name}</span>}
                <span className="text-[10px] text-gray-400 flex-shrink-0">{new Date(a.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
