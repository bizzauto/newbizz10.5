import React, { useEffect, useState } from 'react';
import { Check, PartyPopper, Star, Trophy, Zap } from 'lucide-react';
import { MobileApp } from '../lib/capacitor-app';

interface SuccessCelebrationProps {
  type?: 'success' | 'achievement' | 'milestone' | 'streak';
  title: string;
  message?: string;
  points?: number;
  onClose?: () => void;
  autoClose?: number;
}

/**
 * Success Celebration component
 * Shows fun animations when user completes actions
 */
const SuccessCelebration: React.FC<SuccessCelebrationProps> = ({
  type = 'success',
  title,
  message,
  points,
  onClose,
  autoClose = 3000,
}) => {
  const [show, setShow] = useState(true);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);

  useEffect(() => {
    // Create celebration particles
    const newParticles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 0.5,
    }));
    setParticles(newParticles);

    // Haptic feedback
    MobileApp.hapticSuccess();

    // Auto close
    if (autoClose > 0) {
      const timer = setTimeout(() => {
        setShow(false);
        onClose?.();
      }, autoClose);
      return () => clearTimeout(timer);
    }
  }, [autoClose, onClose]);

  if (!show) return null;

  const typeConfig = {
    success: {
      icon: Check,
      gradient: 'from-green-500 to-emerald-600',
      bgGradient: 'from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30',
      emoji: '✅',
    },
    achievement: {
      icon: Trophy,
      gradient: 'from-yellow-500 to-orange-600',
      bgGradient: 'from-yellow-50 to-orange-50 dark:from-yellow-900/30 dark:to-orange-900/30',
      emoji: '🏆',
    },
    milestone: {
      icon: Star,
      gradient: 'from-purple-500 to-pink-600',
      bgGradient: 'from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30',
      emoji: '⭐',
    },
    streak: {
      icon: Zap,
      gradient: 'from-orange-500 to-red-600',
      bgGradient: 'from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30',
      emoji: '🔥',
    },
  };

  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop with particles */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm overflow-hidden">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute w-3 h-3 rounded-full animate-bounce"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              backgroundColor: ['#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#3B82F6'][particle.id % 5],
              animationDelay: `${particle.delay}s`,
              animationDuration: '1s',
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div
        className={`relative bg-gradient-to-br ${config.bgGradient} rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl animate-bounce-in`}
        onClick={() => {
          setShow(false);
          onClose?.();
        }}
      >
        {/* Icon */}
        <div className={`w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-lg animate-pulse`}>
          <Icon size={40} className="text-white" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {title}
        </h2>

        {/* Message */}
        {message && (
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            {message}
          </p>
        )}

        {/* Points */}
        {points && (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 rounded-full mb-4">
            <Zap size={16} className="text-yellow-500" />
            <span className="font-bold text-gray-900 dark:text-white">+{points} points</span>
          </div>
        )}

        {/* Tap to continue */}
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
          Tap anywhere to continue
        </p>
      </div>
    </div>
  );
};

export default SuccessCelebration;
