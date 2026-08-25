import React from 'react';
import { Lightbulb, TrendingUp, Clock, Users, Star, Zap } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  showTip?: boolean;
  variant?: 'default' | 'pulse' | 'dots' | 'bounce';
}

// Marketing tips to show during loading
const marketingTips = [
  { icon: <TrendingUp size={14} />, text: 'WhatsApp messages have 98% open rate!' },
  { icon: <Clock size={14} />, text: 'Best time to send: 10 AM - 12 PM' },
  { icon: <Users size={14} />, text: 'Personalized messages get 6x more responses' },
  { icon: <Star size={14} />, text: 'Add emojis to boost engagement by 25%' },
  { icon: <Zap size={14} />, text: 'Quick replies increase sales by 40%' },
  { icon: <Lightbulb size={14} />, text: 'Follow up within 24 hours for best results' },
  { icon: <TrendingUp size={14} />, text: 'Video messages get 3x more views' },
  { icon: <Users size={14} />, text: 'Groups build trust faster than broadcasts' },
  { icon: <Clock size={14} />, text: 'Schedule messages for when customers are active' },
  { icon: <Star size={14} />, text: 'Customer testimonials boost conversion by 34%' },
];

/**
 * Loading Spinner component with marketing tips
 */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  message,
  showTip = true,
  variant = 'default',
}) => {
  // Get random tip
  const randomTip = marketingTips[Math.floor(Math.random() * marketingTips.length)];

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  // Spinner variants
  const renderSpinner = () => {
    switch (variant) {
      case 'pulse':
        return (
          <div className={`${sizeClasses[size]} relative`}>
            <div className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-75" />
            <div className="absolute inset-0 bg-green-500 rounded-full animate-pulse" />
          </div>
        );
      case 'dots':
        return (
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        );
      case 'bounce':
        return (
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-2 h-8 bg-green-500 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
        );
      default:
        return (
          <div className={`${sizeClasses[size]} relative`}>
            <div className="absolute inset-0 border-4 border-green-200 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-green-500 rounded-full animate-spin" />
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-6">
      {/* Spinner */}
      <div className="relative">
        {renderSpinner()}
      </div>

      {/* Message */}
      {message && (
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 text-center">
          {message}
        </p>
      )}

      {/* Marketing Tip */}
      {showTip && (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 rounded-full">
          <Lightbulb size={14} className="text-green-600 flex-shrink-0" />
          <span className="text-xs text-green-700 dark:text-green-400">
            {randomTip.text}
          </span>
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner;
