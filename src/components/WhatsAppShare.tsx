import React from 'react';
import { MessageSquare, Share2, Copy, ExternalLink } from 'lucide-react';
import { MobileApp } from '../lib/capacitor-app';

interface WhatsAppShareProps {
  message?: string;
  url?: string;
  phone?: string;
  buttonText?: string;
  variant?: 'primary' | 'secondary' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  showOptions?: boolean;
}

/**
 * WhatsApp Quick Share button for marketing
 * Easy sharing to WhatsApp for customer engagement
 */
const WhatsAppShare: React.FC<WhatsAppShareProps> = ({
  message = 'Check out BizzAuto - All-in-one CRM with WhatsApp Marketing!',
  url,
  phone,
  buttonText = 'Share on WhatsApp',
  variant = 'primary',
  size = 'md',
  showOptions = false,
}) => {
  const shareOnWhatsApp = async () => {
    const shareMessage = url ? `${message}\n\n${url}` : message;
    const encodedMessage = encodeURIComponent(shareMessage);
    
    // WhatsApp URL
    let whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
    if (phone) {
      whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
    }

    // Try native share first (on mobile)
    if (MobileApp.isNative()) {
      await MobileApp.shareContent('BizzAuto', shareMessage, url);
      MobileApp.hapticLight();
      return;
    }

    // Fallback to WhatsApp web
    window.open(whatsappUrl, '_blank');
  };

  const copyToClipboard = async () => {
    const shareMessage = url ? `${message}\n\n${url}` : message;
    try {
      await navigator.clipboard.writeText(shareMessage);
      MobileApp.hapticLight();
      // You could show a toast here
    } catch (err) {
      console.log('Copy failed:', err);
    }
  };

  const shareViaNative = async () => {
    const shareMessage = url ? `${message}\n\n${url}` : message;
    await MobileApp.shareContent('BizzAuto', shareMessage, url);
    MobileApp.hapticLight();
  };

  // Size classes
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2.5',
  };

  // Variant classes
  const variantClasses = {
    primary: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-xl',
    secondary: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50',
    icon: 'bg-green-500 text-white hover:bg-green-600 rounded-full p-2',
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={shareOnWhatsApp}
        className={`inline-flex items-center justify-center ${variantClasses.icon} transition-all hover:scale-110`}
        title="Share on WhatsApp"
      >
        <MessageSquare size={20} />
      </button>
    );
  }

  return (
    <div className="relative inline-flex flex-col gap-2">
      <button
        onClick={shareOnWhatsApp}
        className={`inline-flex items-center justify-center font-semibold rounded-xl transition-all hover:scale-105 ${sizeClasses[size]} ${variantClasses[variant]}`}
      >
        <MessageSquare size={size === 'sm' ? 14 : size === 'md' ? 18 : 20} />
        {buttonText}
      </button>

      {showOptions && (
        <div className="flex gap-2">
          <button
            onClick={copyToClipboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Copy size={12} />
            Copy
          </button>
          <button
            onClick={shareViaNative}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Share2 size={12} />
            More
          </button>
        </div>
      )}
    </div>
  );
};

export default WhatsAppShare;
