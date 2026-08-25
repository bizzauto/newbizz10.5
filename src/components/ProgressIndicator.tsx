import React from 'react';
import { Check, Circle, ArrowRight } from 'lucide-react';

interface Step {
  id: string;
  label: string;
  description?: string;
  completed: boolean;
  current?: boolean;
}

interface ProgressIndicatorProps {
  steps: Step[];
  variant?: 'horizontal' | 'vertical' | 'dots';
  showLabels?: boolean;
}

/**
 * Progress Indicator component
 * Shows user's progress through onboarding or setup
 */
const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  steps,
  variant = 'horizontal',
  showLabels = true,
}) => {
  const completedCount = steps.filter(s => s.completed).length;
  const progress = (completedCount / steps.length) * 100;

  if (variant === 'dots') {
    return (
      <div className="flex items-center justify-center gap-2">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              step.completed
                ? 'bg-green-500 scale-110'
                : step.current
                ? 'bg-blue-500 scale-125 animate-pulse'
                : 'bg-gray-300 dark:bg-gray-600'
            }`}
          />
        ))}
      </div>
    );
  }

  if (variant === 'vertical') {
    return (
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={step.id} className="flex gap-3">
            {/* Icon */}
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  step.completed
                    ? 'bg-green-500 text-white'
                    : step.current
                    ? 'bg-blue-500 text-white animate-pulse'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                }`}
              >
                {step.completed ? (
                  <Check size={16} />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-0.5 h-8 mt-2 ${
                    step.completed ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                />
              )}
            </div>

            {/* Content */}
            {showLabels && (
              <div className="flex-1 pb-4">
                <p
                  className={`font-medium ${
                    step.completed || step.current
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {step.description}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Horizontal variant (default)
  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="flex justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                step.completed
                  ? 'bg-green-500 text-white'
                  : step.current
                  ? 'bg-blue-500 text-white ring-4 ring-blue-100 dark:ring-blue-900'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}
            >
              {step.completed ? <Check size={16} /> : <Circle size={16} />}
            </div>
            {showLabels && (
              <p
                className={`text-xs mt-2 text-center max-w-[80px] ${
                  step.completed || step.current
                    ? 'font-medium text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {step.label}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Circular Progress component
 */
export const CircularProgress: React.FC<{
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  showValue?: boolean;
}> = ({ value, size = 80, strokeWidth = 8, label, showValue = true }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
      </svg>
      {showValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-gray-900 dark:text-white">{value}%</span>
          {label && <span className="text-[10px] text-gray-500">{label}</span>}
        </div>
      )}
    </div>
  );
};

export default ProgressIndicator;
