import React from 'react';
import { Trophy, Star, Zap, Target, Award, Medal, Crown, Gem } from 'lucide-react';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  unlocked: boolean;
  progress?: number;
  maxProgress?: number;
}

interface AchievementBadgesProps {
  badges?: Badge[];
  onBadgeClick?: (badge: Badge) => void;
}

/**
 * Achievement Badges component
 * Gamification with unlockable badges
 */
const AchievementBadges: React.FC<AchievementBadgesProps> = ({
  badges = defaultBadges,
  onBadgeClick,
}) => {
  const unlockedCount = badges.filter(b => b.unlocked).length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-400 to-orange-500 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Trophy size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Achievements</h2>
              <p className="text-white/80 text-sm">
                {unlockedCount}/{badges.length} Unlocked
              </p>
            </div>
          </div>
          
          {/* Progress Ring */}
          <div className="relative w-16 h-16">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="6"
                fill="none"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="white"
                strokeWidth="6"
                fill="none"
                strokeDasharray={`${(unlockedCount / badges.length) * 175.93} 175.93`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white font-bold text-sm">
                {Math.round((unlockedCount / badges.length) * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Badges Grid */}
      <div className="p-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
        {badges.map((badge) => (
          <button
            key={badge.id}
            onClick={() => onBadgeClick?.(badge)}
            className={`relative flex flex-col items-center p-3 rounded-xl transition-all ${
              badge.unlocked
                ? `${badge.bgColor} hover:scale-105`
                : 'bg-gray-100 dark:bg-gray-800 opacity-50 grayscale'
            }`}
          >
            {/* Badge Icon */}
            <div className={`w-12 h-12 ${badge.color} rounded-xl flex items-center justify-center mb-2`}>
              {badge.icon}
            </div>
            
            {/* Badge Name */}
            <span className="text-[10px] sm:text-xs font-medium text-center text-gray-700 dark:text-gray-300 leading-tight">
              {badge.name}
            </span>
            
            {/* Progress Bar */}
            {!badge.unlocked && badge.progress !== undefined && badge.maxProgress && (
              <div className="w-full mt-2 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  className="bg-gray-400 h-1.5 rounded-full"
                  style={{ width: `${(badge.progress / badge.maxProgress) * 100}%` }}
                />
              </div>
            )}
            
            {/* Lock Icon */}
            {!badge.unlocked && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-gray-400 rounded-full flex items-center justify-center">
                <span className="text-[10px]">🔒</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

// Default badges
const defaultBadges: Badge[] = [
  {
    id: 'first-sale',
    name: 'First Sale',
    description: 'Made your first sale',
    icon: <Star size={20} className="text-yellow-400" />,
    color: 'bg-yellow-100',
    bgColor: 'bg-yellow-50',
    unlocked: true,
  },
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    description: 'Reply within 5 minutes',
    icon: <Zap size={20} className="text-blue-400" />,
    color: 'bg-blue-100',
    bgColor: 'bg-blue-50',
    unlocked: true,
  },
  {
    id: 'target-hunter',
    name: 'Target Hunter',
    description: 'Hit monthly target',
    icon: <Target size={20} className="text-red-400" />,
    color: 'bg-red-100',
    bgColor: 'bg-red-50',
    unlocked: false,
    progress: 75,
    maxProgress: 100,
  },
  {
    id: 'social-star',
    name: 'Social Star',
    description: 'Share 50 products',
    icon: <Award size={20} className="text-purple-400" />,
    color: 'bg-purple-100',
    bgColor: 'bg-purple-50',
    unlocked: false,
    progress: 30,
    maxProgress: 50,
  },
  {
    id: 'customer-love',
    name: 'Customer Love',
    description: 'Get 5-star reviews',
    icon: <Medal size={20} className="text-green-400" />,
    color: 'bg-green-100',
    bgColor: 'bg-green-50',
    unlocked: true,
  },
  {
    id: 'vip-master',
    name: 'VIP Master',
    description: 'Close 10 VIP deals',
    icon: <Crown size={20} className="text-yellow-500" />,
    color: 'bg-yellow-100',
    bgColor: 'bg-yellow-50',
    unlocked: false,
    progress: 4,
    maxProgress: 10,
  },
  {
    id: 'diamond-seller',
    name: 'Diamond Seller',
    description: 'Earn ₹1 Lakh revenue',
    icon: <Gem size={20} className="text-cyan-400" />,
    color: 'bg-cyan-100',
    bgColor: 'bg-cyan-50',
    unlocked: false,
    progress: 65000,
    maxProgress: 100000,
  },
  {
    id: 'team-player',
    name: 'Team Player',
    description: 'Refer 5 friends',
    icon: <Trophy size={20} className="text-orange-400" />,
    color: 'bg-orange-100',
    bgColor: 'bg-orange-50',
    unlocked: false,
    progress: 2,
    maxProgress: 5,
  },
];

export default AchievementBadges;
