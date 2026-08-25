import { useState, useRef, useCallback, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { MobileApp } from '../lib/capacitor-app';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  threshold?: number;
  disabled?: boolean;
}

/**
 * Pull to Refresh component for mobile
 * Adds native-like pull-to-refresh functionality
 */
const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  threshold = 80,
  disabled = false,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    const scrollTop = containerRef.current?.scrollTop || 0;
    if (scrollTop > 0) return;

    startY.current = e.touches[0].clientY;
    setIsPulling(true);
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || isRefreshing || !isPulling) return;

    const scrollTop = containerRef.current?.scrollTop || 0;
    if (scrollTop > 0) {
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, currentY - startY.current);
    
    // Apply resistance (reduce pull distance as user pulls further)
    const resistance = 0.5;
    const adjustedDistance = Math.min(distance * resistance, threshold * 1.5);
    
    setPullDistance(adjustedDistance);
  }, [disabled, isRefreshing, isPulling, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (disabled || isRefreshing || !isPulling) return;

    if (pullDistance >= threshold) {
      // Trigger refresh
      setIsRefreshing(true);
      MobileApp.hapticMedium();
      
      try {
        await onRefresh();
      } catch (err) {
        console.log('Refresh error:', err);
      } finally {
        setIsRefreshing(false);
        MobileApp.hapticLight();
      }
    }

    setPullDistance(0);
    setIsPulling(false);
  }, [disabled, isRefreshing, isPulling, pullDistance, threshold, onRefresh]);

  const progress = Math.min(pullDistance / threshold, 1);
  const showIndicator = pullDistance > 10 || isRefreshing;

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      {showIndicator && (
        <div
          className="absolute top-0 left-0 right-0 flex justify-center items-center transition-all duration-200 z-10"
          style={{ 
            height: `${Math.max(pullDistance, isRefreshing ? 60 : 0)}px`,
            opacity: progress,
          }}
        >
          <div className={`flex items-center gap-2 text-sm font-medium ${
            isRefreshing 
              ? 'text-blue-600' 
              : progress >= 1 
                ? 'text-green-600' 
                : 'text-gray-500'
          }`}>
            <RefreshCw 
              size={20} 
              className={`${isRefreshing ? 'animate-spin' : ''} transition-transform`}
              style={{ transform: `rotate(${progress * 360}deg)` }}
            />
            <span>
              {isRefreshing 
                ? 'Refreshing...' 
                : progress >= 1 
                  ? 'Release to refresh' 
                  : 'Pull to refresh'
              }
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div
        className="transition-transform duration-200"
        style={{ transform: `translateY(${showIndicator ? pullDistance : 0}px)` }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
