import React from 'react';
import { 
  Users, MessageSquare, ShoppingCart, FileText, 
  Calendar, Star, Zap, Bot, Phone, Mail,
  Plus, ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface EmptyStateProps {
  type: 'contacts' | 'messages' | 'orders' | 'documents' | 'appointments' | 'reviews' | 'leads' | 'default';
  title?: string;
  description?: string;
  actionLabel?: string;
  actionPath?: string;
  onAction?: () => void;
  showIllustration?: boolean;
}

const emptyStateConfig = {
  contacts: {
    icon: Users,
    title: 'No Contacts Yet',
    description: 'Add your first contact to start building your customer database.',
    actionLabel: 'Add Contact',
    actionPath: '/crm',
    gradient: 'from-blue-500 to-purple-600',
    bgGradient: 'from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20',
  },
  messages: {
    icon: MessageSquare,
    title: 'No Messages',
    description: 'Start a conversation with your customers via WhatsApp.',
    actionLabel: 'Send Message',
    actionPath: '/whatsapp',
    gradient: 'from-green-500 to-emerald-600',
    bgGradient: 'from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20',
  },
  orders: {
    icon: ShoppingCart,
    title: 'No Orders',
    description: 'Your store is ready! Share it to start getting orders.',
    actionLabel: 'Share Store',
    actionPath: '/store-share',
    gradient: 'from-orange-500 to-red-600',
    bgGradient: 'from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20',
  },
  documents: {
    icon: FileText,
    title: 'No Documents',
    description: 'Create invoices, estimates, and proposals for your customers.',
    actionLabel: 'Create Document',
    actionPath: '/documents',
    gradient: 'from-indigo-500 to-blue-600',
    bgGradient: 'from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20',
  },
  appointments: {
    icon: Calendar,
    title: 'No Appointments',
    description: 'Schedule meetings and calls with your leads.',
    actionLabel: 'Book Appointment',
    actionPath: '/appointments',
    gradient: 'from-cyan-500 to-teal-600',
    bgGradient: 'from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20',
  },
  reviews: {
    icon: Star,
    title: 'No Reviews',
    description: 'Ask your happy customers to leave a review.',
    actionLabel: 'Request Review',
    actionPath: '/review-requests',
    gradient: 'from-yellow-500 to-orange-600',
    bgGradient: 'from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20',
  },
  leads: {
    icon: Zap,
    title: 'No Leads',
    description: 'Import leads or use AI to find new prospects.',
    actionLabel: 'Find Leads',
    actionPath: '/lead-finder',
    gradient: 'from-violet-500 to-purple-600',
    bgGradient: 'from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20',
  },
  default: {
    icon: Bot,
    title: 'Nothing Here',
    description: 'Start by adding some data or exploring features.',
    actionLabel: 'Get Started',
    actionPath: '/dashboard',
    gradient: 'from-gray-500 to-gray-600',
    bgGradient: 'from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-800/20',
  },
};

/**
 * Empty State component with illustrations
 * Shows when there's no data to display
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  type,
  title,
  description,
  actionLabel,
  actionPath,
  onAction,
  showIllustration = true,
}) => {
  const navigate = useNavigate();
  const config = emptyStateConfig[type] || emptyStateConfig.default;
  const Icon = config.icon;

  const handleAction = () => {
    if (onAction) {
      onAction();
    } else if (actionPath) {
      navigate(actionPath);
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br ${config.bgGradient} rounded-2xl`}>
      {/* Icon with gradient background */}
      {showIllustration && (
        <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center mb-6 shadow-lg`}>
          <Icon size={36} className="text-white" />
        </div>
      )}

      {/* Title */}
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
        {title || config.title}
      </h3>

      {/* Description */}
      <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm mb-6">
        {description || config.description}
      </p>

      {/* Action Button */}
      <button
        onClick={handleAction}
        className={`inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r ${config.gradient} text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105`}
      >
        <Plus size={18} />
        {actionLabel || config.actionLabel}
        <ArrowRight size={16} />
      </button>

      {/* Quick Tips */}
      <div className="mt-8 text-xs text-gray-500 dark:text-gray-500">
        <p>💡 Tip: You can also import data from CSV files</p>
      </div>
    </div>
  );
};

export default EmptyState;
