import { useState, useCallback } from 'react';
import { Loader2, CreditCard } from 'lucide-react';
import apiClient from '../lib/api';
import { useToast } from './Toast';

interface RazorpayCheckoutButtonProps {
  amount: number;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess?: (data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  onError?: (error: string) => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function RazorpayCheckoutButton({
  amount,
  description,
  prefill,
  onSuccess,
  onError,
  children,
  className = '',
  disabled = false,
}: RazorpayCheckoutButtonProps) {
  const [processing, setProcessing] = useState(false);
  const toast = useToast();

  const loadScript = (): Promise<boolean> =>
    new Promise((resolve) => {
      if (window.Razorpay) { resolve(true); return; }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const handleClick = useCallback(async () => {
    setProcessing(true);
    try {
      const loaded = await loadScript();
      if (!loaded) {
        toast.error('Failed to load payment gateway');
        onError?.('Failed to load payment gateway');
        setProcessing(false);
        return;
      }

      const res = await apiClient.post('/razorpay/create-order', {
        amount,
        currency: 'INR',
        receipt: `rcpt_${Date.now()}`,
      });

      if (!res.data.success) {
        throw new Error(res.data.error || 'Failed to create order');
      }

      const { order_id, key } = res.data.data;

      const rzp = new window.Razorpay({
        key,
        amount,
        currency: 'INR',
        name: 'BizzAuto',
        description: description || `Payment of ₹${(amount / 100).toLocaleString()}`,
        order_id,
        prefill: {
          name: prefill?.name || '',
          email: prefill?.email || '',
          contact: prefill?.contact || '',
        },
        theme: { color: '#6366F1' },
        handler: (response: any) => {
          onSuccess?.({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          setProcessing(false);
        },
        modal: {
          ondismiss: () => {
            toast.info('Payment cancelled');
            setProcessing(false);
          },
        },
      });

      rzp.open();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Payment failed';
      toast.error(msg);
      onError?.(msg);
      setProcessing(false);
    }
  }, [amount, description, prefill, onSuccess, onError, toast]);

  return (
    <button
      onClick={handleClick}
      disabled={disabled || processing}
      className={className || 'w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2'}
    >
      {processing ? (
        <><Loader2 size={18} className="animate-spin" /> Processing...</>
      ) : children || (
        <><CreditCard size={18} /> Pay ₹{(amount / 100).toLocaleString()}</>
      )}
    </button>
  );
}
