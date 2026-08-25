import React from 'react';
import { Sun, Moon, Cloud, Coffee, Star, Heart, Sparkles } from 'lucide-react';

interface SmartGreetingProps {
  userName?: string;
  businessName?: string;
}

/**
 * Smart Greeting component
 * Shows time-based greeting with animation
 */
const SmartGreeting: React.FC<SmartGreetingProps> = ({
  userName = 'User',
  businessName = 'BizzAuto',
}) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return {
        text: 'Good Morning',
        emoji: '🌅',
        icon: <Sun size={24} className="text-yellow-500" />,
        gradient: 'from-yellow-400 to-orange-500',
        bgGradient: 'from-yellow-50 to-orange-50',
        message: 'Start your day with fresh leads!',
        tip: 'Pro tip: Send morning offers to boost sales by 23%',
      };
    } else if (hour >= 12 && hour < 17) {
      return {
        text: 'Good Afternoon',
        emoji: '☀️',
        icon: <Coffee size={24} className="text-amber-500" />,
        gradient: 'from-amber-400 to-orange-500',
        bgGradient: 'from-amber-50 to-orange-50',
        message: 'Peak time for customer engagement!',
        tip: 'Pro tip: Afternoon campaigns get 35% more opens',
      };
    } else if (hour >= 17 && hour < 21) {
      return {
        text: 'Good Evening',
        emoji: '🌆',
        icon: <Star size={24} className="text-purple-500" />,
        gradient: 'from-purple-400 to-pink-500',
        bgGradient: 'from-purple-50 to-pink-50',
        message: 'Evening is perfect for follow-ups!',
        tip: 'Pro tip: Evening messages have 42% higher response rate',
      };
    } else {
      return {
        text: 'Good Night',
        emoji: '🌙',
        icon: <Moon size={24} className="text-indigo-500" />,
        gradient: 'from-indigo-400 to-blue-500',
        bgGradient: 'from-indigo-50 to-blue-50',
        message: 'Plan tomorrow\'s success today!',
        tip: 'Pro tip: Schedule tomorrow\'s messages now for better reach',
      };
    }
  };

  const greeting = getGreeting();

  return (
    <div className={`relative overflow-hidden bg-gradient-to-r ${greeting.bgGradient} rounded-2xl p-4 sm:p-6`}>
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/20 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-white/10 to-transparent rounded-full translate-y-1/2 -translate-x-1/2" />
      
      <div className="relative flex items-start gap-4">
        {/* Icon */}
        <div className={`flex-shrink-0 w-14 h-14 bg-gradient-to-br ${greeting.gradient} rounded-2xl flex items-center justify-center shadow-lg`}>
          <span className="text-2xl">{greeting.emoji}</span>
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              {greeting.text}!
            </h2>
            <Sparkles size={18} className="text-yellow-500 animate-pulse" />
          </div>
          
          <p className="text-sm sm:text-base text-gray-600 font-medium">
            {greeting.message}
          </p>
          
          {/* Tip */}
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <Heart size={12} className="text-red-400" />
            <span>{greeting.tip}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartGreeting;
