import React, { useState } from 'react';
import { 
  Search, Copy, Check, MessageSquare, Mail, Smartphone,
  Filter, ChevronDown, X, Send, Eye
} from 'lucide-react';
import { 
  whatsappTemplates, 
  emailTemplates, 
  smsTemplates, 
  templateCategories,
  renderTemplate,
  type MarketingTemplate 
} from '../lib/marketing-templates';
import { MobileApp } from '../lib/capacitor-app';

interface MarketingTemplatesProps {
  onSelect?: (template: MarketingTemplate) => void;
  channel?: 'whatsapp' | 'email' | 'sms';
}

/**
 * Marketing Templates component
 * Browse and use ready-made marketing templates
 */
const MarketingTemplates: React.FC<MarketingTemplatesProps> = ({
  onSelect,
  channel = 'whatsapp',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState(channel);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<MarketingTemplate | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Get templates based on channel
  const getTemplates = () => {
    switch (selectedChannel) {
      case 'whatsapp':
        return whatsappTemplates;
      case 'email':
        return emailTemplates;
      case 'sms':
        return smsTemplates;
      default:
        return whatsappTemplates;
    }
  };

  // Filter templates
  const filteredTemplates = getTemplates().filter(template => {
    const matchesSearch = searchQuery === '' || 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.body.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || template.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Copy template
  const copyTemplate = async (template: MarketingTemplate) => {
    try {
      await navigator.clipboard.writeText(template.body);
      setCopiedId(template.id);
      MobileApp.hapticLight();
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.log('Copy failed:', err);
    }
  };

  // Channel icons
  const channelIcons = {
    whatsapp: <MessageSquare size={16} />,
    email: <Mail size={16} />,
    sms: <Smartphone size={16} />,
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-4">
        <h2 className="text-lg font-bold text-white mb-1">Marketing Templates</h2>
        <p className="text-white/80 text-sm">Ready-to-use templates for your campaigns</p>
      </div>

      {/* Channel Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {(['whatsapp', 'email', 'sms'] as const).map((ch) => (
          <button
            key={ch}
            onClick={() => setSelectedChannel(ch)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              selectedChannel === ch
                ? 'text-green-600 border-b-2 border-green-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {channelIcons[ch]}
            <span className="capitalize">{ch}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Categories */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {templateCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedCategory === cat.id
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              <span>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Templates List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredTemplates.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-sm">No templates found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-400">
                        {template.category}
                      </span>
                      {template.tags?.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                      {template.name}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                      {template.body.substring(0, 100)}...
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPreviewTemplate(template)}
                      className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Preview"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => copyTemplate(template)}
                      className="p-2 text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                      title="Copy"
                    >
                      {copiedId === template.id ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                    </button>
                    {onSelect && (
                      <button
                        onClick={() => onSelect(template)}
                        className="p-2 text-gray-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                        title="Use template"
                      >
                        <Send size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full max-h-[80vh] overflow-hidden shadow-2xl">
            {/* Preview Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">{previewTemplate.name}</h3>
                <p className="text-xs text-gray-500">{previewTemplate.category}</p>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Preview Content */}
            <div className="p-4 overflow-y-auto max-h-96">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {previewTemplate.body}
                </p>
              </div>

              {/* Variables */}
              {previewTemplate.variables && previewTemplate.variables.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">Variables to replace:</p>
                  <div className="flex flex-wrap gap-2">
                    {previewTemplate.variables.map((v) => (
                      <span key={v} className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg">
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Preview Actions */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              <button
                onClick={() => copyTemplate(previewTemplate)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                {copiedId === previewTemplate.id ? <Check size={16} /> : <Copy size={16} />}
                Copy
              </button>
              {onSelect && (
                <button
                  onClick={() => {
                    onSelect(previewTemplate);
                    setPreviewTemplate(null);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-medium text-sm hover:from-green-600 hover:to-emerald-700 transition-all"
                >
                  <Send size={16} />
                  Use Template
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketingTemplates;
