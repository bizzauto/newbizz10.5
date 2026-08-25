import React, { useState } from 'react';
import { 
  Gift, Copy, Share2, MessageSquare, Mail, 
  Link, Check, Users, TrendingUp 
} from 'lucide-react';
import { MobileApp } from '../lib/capacitor-app';

interface ReferralShareProps {
  referralCode?: string;
  referralLink?: string;
  referralCount?: number;
  reward?: string;
}

/**
 * Referral Share component for marketing
 * Encourages users to refer friends and earn rewards
 */
const ReferralShare: React.FC<ReferralShareProps> = ({
  referralCode = 'BIZZ2024',
  referralLink = 'https://bizzauto.app/ref/BIZZ2024',
  referralCount = 0,
  reward = '1 month free',
}) => {
  const [copied, setCopied] = useState(false);

  const copyReferralCode = async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      MobileApp.hapticLight();
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.log('Copy failed:', err);
    }
  };

  const copyReferralLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      MobileApp.hapticLight();
    } catch (err) {
      console.log('Copy failed:', err);
    }
  };

  const shareReferral = async () => {
    const message = `🚀 Join me on BizzAuto - the all-in-one CRM with WhatsApp Marketing!\n\nUse my referral code: ${referralCode}\n\nYou'll get: ${reward}\n\nSign up here: ${referralLink}`;
    
    if (MobileApp.isNative()) {
      await MobileApp.shareContent('BizzAuto Referral', message, referralLink);
    } else {
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
    }
    MobileApp.hapticMedium();
  };

  return (
    <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-6 text-white shadow-xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
          <Gift size={24} />
        </div>
        <div>
          <h3 className="font-bold text-lg">Refer & Earn</h3>
          <p className="text-white/80 text-sm">Share with friends, earn rewards</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white/10 rounded-xl p-3">
          <div className="flex items-center gap-2 text-white/80 text-xs mb-1">
            <Users size={14} />
            <span>Total Referrals</span>
          </div>
          <p className="text-2xl font-bold">{referralCount}</p>
        </div>
        <div className="bg-white/10 rounded-xl p-3">
          <div className="flex items-center gap-2 text-white/80 text-xs mb-1">
            <TrendingUp size={14} />
            <span>Your Reward</span>
          </div>
          <p className="text-lg font-bold">{reward}</p>
        </div>
      </div>

      {/* Referral Code */}
      <div className="bg-white/10 rounded-xl p-4 mb-4">
        <p className="text-white/80 text-xs mb-2">Your Referral Code</p>
        <div className="flex items-center gap-2">
          <code className="text-2xl font-mono font-bold flex-1">{referralCode}</code>
          <button
            onClick={copyReferralCode}
            className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
      </div>

      {/* Share Buttons */}
      <div className="flex gap-2">
        <button
          onClick={shareReferral}
          className="flex-1 flex items-center justify-center gap-2 bg-white text-purple-600 font-semibold py-3 rounded-xl hover:bg-white/90 transition-colors"
        >
          <MessageSquare size={18} />
          WhatsApp
        </button>
        <button
          onClick={copyReferralLink}
          className="flex items-center justify-center gap-2 bg-white/20 text-white font-semibold px-4 py-3 rounded-xl hover:bg-white/30 transition-colors"
        >
          <Link size={18} />
          Copy Link
        </button>
        <button
          onClick={shareReferral}
          className="flex items-center justify-center gap-2 bg-white/20 text-white font-semibold px-4 py-3 rounded-xl hover:bg-white/30 transition-colors"
        >
          <Share2 size={18} />
        </button>
      </div>

      {/* How it works */}
      <div className="mt-5 pt-4 border-t border-white/20">
        <p className="text-white/80 text-xs font-medium mb-2">How it works:</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-white/90 text-xs">
            <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold">1</div>
            <span>Share your referral code with friends</span>
          </div>
          <div className="flex items-center gap-2 text-white/90 text-xs">
            <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold">2</div>
            <span>They sign up using your code</span>
          </div>
          <div className="flex items-center gap-2 text-white/90 text-xs">
            <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold">3</div>
            <span>Both of you get rewards!</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReferralShare;
