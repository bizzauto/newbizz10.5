import React from 'react';
import { 
  MessageSquare, Users, Phone, Mail, 
  Calendar, FileText, Share2, Bot,
  Zap, ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MobileApp } from '../lib/capacitor-app';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  gradient: string;
  description?: string;
}

interface QuickActionsProps {
  variant?: 'grid' | 'list' | 'compact';
  showLabels?: boolean;
}

/**
 * Quick Actions widget for mobile dashboard
 * Provides fast access to common actions
 */
const QuickActions: React.FC<QuickActionsProps> = ({
  variant = 'grid',
  showLabels = true,
}) => {
  const navigate = useNavigate();

  const actions: QuickAction[] = [
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: <MessageSquare size={22} />,
      path: '/whatsapp',
      gradient: 'from-green-500 to-emerald-600',
      description: 'Send messages',
    },
    {
      id: 'contacts',
      label: 'Contacts',
      icon: <Users size={22} />,
      path: '/crm',
      gradient: 'from-blue-500 to-indigo-600',
      description: 'Manage leads',
    },
    {
      id: 'calls',
      label: 'Call',
      icon: <Phone size={22} />,
      path: '/voice-call',
      gradient: 'from-purple-500 to-violet-600',
      description: 'Make calls',
    },
    {
      id: 'email',
      label: 'Email',
      icon: <Mail size={22} />,
      path: '/email-marketing',
      gradient: 'from-orange-500 to-red-600',
      description: 'Send emails',
    },
    {
      id: 'appointments',
      label: 'Book',
      icon: <Calendar size={22} />,
      path: '/appointments',
      gradient: 'from-cyan-500 to-teal-600',
      description: 'Schedule',
    },
    {
      id: 'documents',
      label: 'Docs',
      icon: <FileText size={22} />,
      path: '/documents',
      gradient: 'from-indigo-500 to-blue-600',
      description: 'Create docs',
    },
    {
      id: 'share',
      label: 'Share',
      icon: <Share2 size={22} />,
      path: '/store-share',
      gradient: 'from-pink-500 to-rose-600',
      description: 'Share store',
    },
    {
      id: 'ai',
      label: 'AI Chat',
      icon: <Bot size={22} />,
      path: '/ai-chatbot',
      gradient: 'from-violet-500 to-purple-600',
      description: 'Ask AI',
    },
  ];

  const handleAction = (action: QuickAction) => {
    MobileApp.hapticLight();
    navigate(action.path);
  };

  if (variant === 'compact') {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => handleAction(action)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
          >
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${action.gradient} flex items-center justify-center text-white`}>
              {action.icon}
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{action.label}</span>
          </button>
        ))}
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div className="space-y-2">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => handleAction(action)}
            className="w-full flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
          >
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center text-white`}>
              {action.icon}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{action.label}</p>
              {action.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{action.description}</p>
              )}
            </div>
            <ArrowRight size={16} className="text-gray-400" />
          </button>
        ))}
      </div>
    );
  }

  // Grid variant (default)
  return (
    <div className="grid grid-cols-4 gap-3">
      {actions.map((action) => (
        <button
          key={action.id}
          onClick={() => handleAction(action)}
          className="flex flex-col items-center gap-2 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 transition-all"
        >
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center text-white shadow-lg`}>
            {action.icon}
          </div>
          {showLabels && (
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center">
              {action.label}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

export default QuickActions;
