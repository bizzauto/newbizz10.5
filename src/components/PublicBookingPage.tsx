import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar, Clock, User, Phone, CheckCircle, Loader2, AlertCircle, Sparkles } from 'lucide-react';

/**
 * Public Booking Page — Calendly-style.
 * URL: /book/:businessId  (no auth required)
 */
export default function PublicBookingPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [step, setStep] = useState<'form' | 'success'>('form');

  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    service: '',
    date: '',
    time: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadBusiness = useCallback(async () => {
    if (!businessId) return;
    try {
      const res = await fetch(`/api/public-booking/${businessId}`);
      const json = await res.json();
      if (json.success) {
        setBusinessName(json.data.businessName);
        setServices(json.data.services || []);
        setForm((p) => ({ ...p, service: json.data.services?.[0] || '' }));
      } else {
        setError(json.error || 'Business not found');
      }
    } catch {
      setError('Could not load booking page');
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => { loadBusiness(); }, [loadBusiness]);

  const submit = async () => {
    if (!form.customerName.trim() || !form.customerPhone.trim() || !form.date || !form.time) {
      setSubmitError('Please fill all required fields');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/public-booking/${businessId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        setStep('success');
      } else {
        setSubmitError(json.error || 'Booking failed');
      }
    } catch {
      setSubmitError('Network error — try again');
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Booking Unavailable</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Appointment Booked!</h1>
          <p className="text-gray-600 mb-1">{businessName} will confirm shortly.</p>
          <p className="text-sm text-gray-400 mb-6">
            {form.service} · {new Date(`${form.date}T${form.time}`).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
          <button onClick={() => { setStep('form'); setForm({ customerName: '', customerPhone: '', service: services[0] || '', date: '', time: '', notes: '' }); }} className="px-6 py-2.5 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600">
            Book Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-center">
            <Sparkles size={28} className="mx-auto text-white/80 mb-2" />
            <h1 className="text-2xl font-bold text-white">{businessName}</h1>
            <p className="text-blue-100 text-sm mt-1">Book an appointment</p>
          </div>

          {/* Form */}
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"><User size={14} className="inline mr-1" />Your Name *</label>
              <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Full name" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"><Phone size={14} className="inline mr-1" />Phone Number *</label>
              <input type="tel" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} placeholder="+91 98765 43210" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            {services.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service</label>
                <select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  {services.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1"><Calendar size={14} className="inline mr-1" />Date *</label>
                <input type="date" min={new Date().toISOString().split('T')[0]} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1"><Clock size={14} className="inline mr-1" />Time *</label>
                <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything we should know?" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
            </div>

            {submitError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                <AlertCircle size={16} /> {submitError}
              </div>
            )}

            <button onClick={submit} disabled={submitting} className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <><Loader2 size={18} className="animate-spin" /> Booking...</> : 'Confirm Booking'}
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">Powered by BizzAuto</p>
      </div>
    </div>
  );
}
