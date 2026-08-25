import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, CreditCard, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import apiClient from '../lib/api';

interface PaymentLinkData {
  id: string;
  name: string;
  description?: string;
  amount: number;
  currency: string;
  type: string;
  minAmount?: number;
  isActive: boolean;
  business?: { name: string; logo?: string };
}

export default function PayPage() {
  const { shortCode } = useParams<{ shortCode: string }>();
  const navigate = useNavigate();
  const [link, setLink] = useState<PaymentLinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [step, setStep] = useState<'details' | 'payment' | 'success'>('details');
  const [razorpayOrder, setRazorpayOrder] = useState<any>(null);

  useEffect(() => {
    if (!shortCode) return;
    loadLink();
  }, [shortCode]);

  const loadLink = async () => {
    try {
      const res = await apiClient.get(`/payment-links/s/${shortCode}`);
      if (res.data.success) {
        setLink(res.data.data);
      } else {
        setError(res.data.error || 'Payment link not found');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Payment link not found or expired');
    } finally {
      setLoading(false);
    }
  };

  const loadRazorpay = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) { resolve(true); return; }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePay = async () => {
    if (!link) return;
    const amount = link.type === 'flexible' ? parseFloat(customAmount) : link.amount;
    if (!amount || amount <= 0) { setError('Invalid amount'); return; }
    if (link.type === 'flexible' && link.minAmount && amount < link.minAmount) {
      setError(`Minimum amount is ₹${link.minAmount}`); return;
    }

    setProcessing(true);
    setError('');
    try {
      // Create Razorpay order via payment-links pay endpoint
      const res = await apiClient.post(`/payment-links/s/${shortCode}/pay`, {
        amount,
        contactName: contactName || undefined,
        contactPhone: contactPhone || undefined,
        contactEmail: contactEmail || undefined,
      });

      const transaction = res.data?.data;
      if (!transaction) { setError('Failed to initiate payment'); setProcessing(false); return; }

      // For COD or pending payments, show success
      if (!transaction.razorpayPaymentId) {
        setStep('success');
        setProcessing(false);
        return;
      }

      setStep('payment');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Payment failed. Please try again.');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="animate-spin h-12 w-12 text-blue-600" />
      </div>
    );
  }

  if (error && !link) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Payment Link Error</h1>
          <p className="text-gray-500 dark:text-gray-400">{error}</p>
          <button onClick={() => navigate(-1)} className="mt-6 px-6 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Payment Submitted!</h1>
          <p className="text-gray-500 dark:text-gray-400">Your payment request has been recorded. Thank you!</p>
          <button onClick={() => navigate('/')} className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <ArrowLeft size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Make Payment</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          {/* Business info */}
          {link?.business && (
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
               {link.business.logo && <img src={link.business.logo} alt={link.business.name || "Business logo"} className="w-10 h-10 rounded-lg object-cover" />}
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{link.business.name}</p>
                <p className="text-sm text-gray-500">{link.name}</p>
              </div>
            </div>
          )}

          {!link?.business && (
            <div className="mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
              <p className="font-semibold text-gray-900 dark:text-white">{link?.name}</p>
            </div>
          )}

          {/* Description */}
          {link?.description && (
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">{link.description}</p>
          )}

          {/* Amount */}
          {link?.type === 'flexible' ? (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enter Amount (₹)</label>
              <input
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder={link.minAmount ? `Min ₹${link.minAmount}` : 'Enter amount'}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-semibold focus:ring-2 focus:ring-blue-500"
              />
              {link.minAmount && <p className="text-xs text-gray-500 mt-1">Minimum: ₹{link.minAmount}</p>}
            </div>
          ) : (
            <div className="mb-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">Amount to pay</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">₹{link?.amount}</p>
            </div>
          )}

          {/* Contact info */}
          <div className="space-y-3 mb-6">
            <input
              type="text" placeholder="Your Name (optional)"
              value={contactName} onChange={(e) => setContactName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <input
              type="tel" placeholder="Phone (optional)"
              value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <input
              type="email" placeholder="Email (optional)"
              value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          <button
            onClick={handlePay}
            disabled={processing || (link?.type === 'flexible' && !customAmount)}
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {processing ? <Loader2 className="animate-spin" size={20} /> : <CreditCard size={20} />}
            {processing ? 'Processing...' : `Pay ₹${link?.type === 'flexible' ? (customAmount || '0') : link?.amount}`}
          </button>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
            <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
            Secured by Razorpay | 256-bit SSL
          </div>
        </div>
      </div>
    </div>
  );
}
