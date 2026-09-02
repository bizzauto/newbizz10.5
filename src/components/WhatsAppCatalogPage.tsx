import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Package, CheckCircle, ArrowUpCircle, Loader2 } from 'lucide-react';
import apiClient from '../lib/api';

interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  availability: string;
  isActive: boolean;
}

const WhatsAppCatalogPage: React.FC = () => {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/whatsapp-catalog');
      setItems(res?.data?.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const syncProducts = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiClient.post('/whatsapp-catalog/sync-from-ecommerce');
      const d = res?.data?.data;
      if (d) setSyncResult(`${d.synced} new, ${d.updated} updated (${d.total} total)`);
      await load();
    } catch (e: any) {
      setSyncResult(e?.response?.data?.error || 'Sync failed');
    }
    setSyncing(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Package size={22} className="text-green-600" /> WhatsApp Catalog</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">E-commerce products synced to WhatsApp catalog</p>
          </div>
          <button onClick={syncProducts} disabled={syncing} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50">
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <ArrowUpCircle size={16} />} Sync Products
          </button>
        </div>

        {syncResult && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-700 dark:text-blue-300">
            {syncResult}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16"><Loader2 size={24} className="animate-spin text-gray-400 mx-auto" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
            <Package size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">No catalog items yet</p>
            <button onClick={syncProducts} disabled={syncing} className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600">
              Sync from E-commerce
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white">{item.name}</p>
                  {item.description && <p className="text-xs text-gray-400 truncate">{item.description}</p>}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm font-bold text-green-600">₹{item.price?.toLocaleString()}</span>
                    {item.category && <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-500">{item.category}</span>}
                  </div>
                </div>
                <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${item.availability === 'in_stock' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {item.availability === 'in_stock' ? <CheckCircle size={12} /> : '⭕'} {item.availability === 'in_stock' ? 'In Stock' : 'Out'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppCatalogPage;
