import React, { useState, useEffect } from 'react';
import { Shield, Clock, Search, Download, RefreshCw } from 'lucide-react';
import { auditLogAPI } from '../lib/api';
import { PageSkeleton } from './Skeleton';
import { useToast } from './Toast';

interface LogEntry {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  description?: string;
  userEmail: string;
  ipAddress?: string;
  createdAt: string;
}

const AuditLogPage: React.FC = () => {
  const { error: showError } = useToast();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await auditLogAPI.list({ search });
      const rawLogs = res.data?.data?.logs || res.data?.data || [];
      setLogs(Array.isArray(rawLogs) ? rawLogs : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await auditLogAPI.export({ search });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'audit-logs.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showError('Export failed. Please try again.');
    }
  };

  const filtered = logs.filter(l => {
    if (search && !l.description?.toLowerCase().includes(search.toLowerCase()) && !l.userEmail?.toLowerCase().includes(search.toLowerCase()) && !l.entity?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const actionLabel = (action: string) => {
    if (action.includes('create') || action.includes('add')) return { color: 'bg-green-100 text-green-700', label: 'Created' };
    if (action.includes('delete') || action.includes('remove')) return { color: 'bg-red-100 text-red-700', label: 'Deleted' };
    if (action.includes('update') || action.includes('edit')) return { color: 'bg-yellow-100 text-yellow-700', label: 'Updated' };
    if (action.includes('login')) return { color: 'bg-blue-100 text-blue-700', label: 'Login' };
    return { color: 'bg-gray-100 text-gray-700', label: action };
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDay = Math.floor(diffHr / 24);
      if (diffDay < 7) return `${diffDay}d ago`;
      return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="p-4 sm:p-5 md:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3"><Shield className="text-blue-600" size={32} />Audit Log</h1>
          <p className="text-gray-600">Track all activities and changes in your account</p>
        </div>
        <button onClick={loadLogs} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Refresh">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-6 flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg" placeholder="Search logs..." />
        </div>
        <div className="flex gap-2">
          {['all', 'info', 'warning', 'error'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"><Download size={16} /> Export</button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {filtered.map(log => {
            const al = actionLabel(log.action);
            return (
              <div key={log.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${al.color}`}>
                    <Shield size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{log.description || log.action}</p>
                    <p className="text-sm text-gray-500">{log.entity}{log.entityId ? ` (${log.entityId.slice(0, 8)}...)` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="text-sm text-gray-500">{log.userEmail || 'System'}</p>
                    <p className="text-xs text-gray-400">{formatTime(log.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{log.ipAddress || '-'}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${al.color}`}>{al.label}</span>
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && <div className="text-center py-12 text-gray-500">No logs found matching your criteria</div>}
      </div>
    </div>
  );
};

export default AuditLogPage;