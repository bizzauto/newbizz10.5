// Common Marketing Templates for WhatsApp, Email, and SMS
// Ready-to-use templates for business marketing

export interface MarketingTemplate {
  id: string;
  name: string;
  category: string;
  channel: 'whatsapp' | 'email' | 'sms' | 'all';
  subject?: string;
  body: string;
  variables?: string[];
  tags?: string[];
}

// ==================== WHATSAPP TEMPLATES ====================

export const whatsappTemplates: MarketingTemplate[] = [
  // Welcome Templates
  {
    id: 'wa-welcome-1',
    name: 'Welcome New Customer',
    category: 'Welcome',
    channel: 'whatsapp',
    body: `Hi {{name}}! 👋

Welcome to {{business}}! We're thrilled to have you.

Here's what you can expect:
✅ Exclusive offers & discounts
✅ Priority customer support
✅ Early access to new products

Reply HELP if you need assistance. We're here for you! 😊`,
    variables: ['name', 'business'],
    tags: ['welcome', 'onboarding'],
  },
  {
    id: 'wa-welcome-2',
    name: 'Welcome with Offer',
    category: 'Welcome',
    channel: 'whatsapp',
    body: `Hey {{name}}! 🎉

Welcome to {{business}}!

As a thank you for joining, here's a special offer:
🎁 Get {{discount}}% OFF on your first order!
Use code: {{code}}

Shop now: {{link}}

Valid for 7 days only!`,
    variables: ['name', 'business', 'discount', 'code', 'link'],
    tags: ['welcome', 'discount', 'offer'],
  },

  // Promotion Templates
  {
    id: 'wa-promo-1',
    name: 'Flash Sale',
    category: 'Promotion',
    channel: 'whatsapp',
    body: `🔥 FLASH SALE - TODAY ONLY! 🔥

Hey {{name}}!

{{product}} is now at {{price}} (Was {{old_price}})

⏰ Ends at midnight!
🛒 Shop: {{link}}

Don't miss out! 🏃‍♂️`,
    variables: ['name', 'product', 'price', 'old_price', 'link'],
    tags: ['sale', 'flash', 'urgent'],
  },
  {
    id: 'wa-promo-2',
    name: 'Seasonal Offer',
    category: 'Promotion',
    channel: 'whatsapp',
    body: `🎄 {{season}} Special! 🎄

Hi {{name}},

Celebrate {{season}} with us!
Flat {{discount}}% OFF on all {{category}}.

Use code: {{code}}
Valid: {{start_date}} to {{end_date}}

Shop now: {{link}}`,
    variables: ['season', 'name', 'discount', 'category', 'code', 'start_date', 'end_date', 'link'],
    tags: ['seasonal', 'festival', 'holiday'],
  },
  {
    id: 'wa-promo-3',
    name: 'Buy One Get One',
    category: 'Promotion',
    channel: 'whatsapp',
    body: `BOGO Alert! 🎁

Hey {{name}}!

Buy 1 {{product}} & get 1 FREE!

Yes, you read that right! 🤩

Limited stock - Order now: {{link}}

Offer ends {{date}}!`,
    variables: ['name', 'product', 'link', 'date'],
    tags: ['bogo', 'free', 'offer'],
  },

  // Abandoned Cart Templates
  {
    id: 'wa-cart-1',
    name: 'Cart Reminder',
    category: 'Cart Recovery',
    channel: 'whatsapp',
    body: `Hey {{name}}! 👋

You left something in your cart:
🛒 {{product}} - {{price}}

Still interested? Complete your order now:
{{link}}

Need help? Reply to this message!`,
    variables: ['name', 'product', 'price', 'link'],
    tags: ['cart', 'abandoned', 'reminder'],
  },
  {
    id: 'wa-cart-2',
    name: 'Cart with Discount',
    category: 'Cart Recovery',
    channel: 'whatsapp',
    body: `Hey {{name}}! 🛒

Your cart is waiting:
{{product}} - {{price}}

Complete your order in the next 24 hours and get {{discount}}% OFF!

Use code: {{code}}
Order now: {{link}}

This offer won't last! ⏰`,
    variables: ['name', 'product', 'price', 'discount', 'code', 'link'],
    tags: ['cart', 'discount', 'urgent'],
  },

  // Follow-up Templates
  {
    id: 'wa-followup-1',
    name: 'Post Purchase Follow-up',
    category: 'Follow-up',
    channel: 'whatsapp',
    body: `Hi {{name}}! 🙏

Thank you for your recent purchase of {{product}}!

We hope you're loving it. If you have any questions, we're here to help.

Would you mind rating your experience? ⭐
{{review_link}}

Your feedback means the world to us! ❤️`,
    variables: ['name', 'product', 'review_link'],
    tags: ['followup', 'review', 'feedback'],
  },
  {
    id: 'wa-followup-2',
    name: 'Check-in Message',
    category: 'Follow-up',
    channel: 'whatsapp',
    body: `Hey {{name}}! 😊

Just checking in - how's everything going with {{product/service}}?

If you need any help or have questions, just reply here. We're always happy to help!

Have a great day! 🌟`,
    variables: ['name', 'product/service'],
    tags: ['followup', 'checkin', 'care'],
  },

  // Referral Templates
  {
    id: 'wa-referral-1',
    name: 'Referral Request',
    category: 'Referral',
    channel: 'whatsapp',
    body: `Hey {{name}}! 🌟

Loving {{business}}? Share the love with your friends!

Refer a friend and you BOTH get {{reward}}:
🎁 Your friend gets: {{friend_reward}}
🎁 You get: {{your_reward}}

Your referral code: {{code}}
Share this link: {{referral_link}}

It's a win-win! 🤝`,
    variables: ['name', 'business', 'reward', 'friend_reward', 'your_reward', 'code', 'referral_link'],
    tags: ['referral', 'share', 'reward'],
  },

  // Re-engagement Templates
  {
    id: 'wa-reengage-1',
    name: 'We Miss You',
    category: 'Re-engagement',
    channel: 'whatsapp',
    body: `Hey {{name}}! 👋

It's been a while since we last saw you. We miss you! 😢

Here's a special comeback offer:
🎁 {{discount}}% OFF your next order!
Use code: {{code}}

Come back and see what's new!
Shop: {{link}}

See you soon! ❤️`,
    variables: ['name', 'discount', 'code', 'link'],
    tags: ['reengagement', 'winback', 'offer'],
  },

  // Appointment Templates
  {
    id: 'wa-appointment-1',
    name: 'Appointment Reminder',
    category: 'Appointment',
    channel: 'whatsapp',
    body: `Hi {{name}}! 📅

This is a reminder about your appointment:

🗓️ Date: {{date}}
🕐 Time: {{time}}
📍 Location: {{location}}
👤 With: {{staff}}

Please arrive 10 minutes early. Need to reschedule? Reply here.

See you soon! 👋`,
    variables: ['name', 'date', 'time', 'location', 'staff'],
    tags: ['appointment', 'reminder', 'booking'],
  },

  // Thank You Templates
  {
    id: 'wa-thankyou-1',
    name: 'Thank You',
    category: 'Thank You',
    channel: 'whatsapp',
    body: `Thank you, {{name}}! 🙏

We truly appreciate your support. Your trust means everything to us.

If you ever need anything, don't hesitate to reach out. We're always here for you!

Have an amazing day! 🌟

- The {{business}} Team`,
    variables: ['name', 'business'],
    tags: ['thankyou', 'appreciation', 'gratitude'],
  },
];

// ==================== EMAIL TEMPLATES ====================

export const emailTemplates: MarketingTemplate[] = [
  {
    id: 'email-welcome-1',
    name: 'Welcome Email',
    category: 'Welcome',
    channel: 'email',
    subject: 'Welcome to {{business}}, {{name}}! 🎉',
    body: `Hi {{name}},

Welcome to {{business}}! We're excited to have you on board.

Here's what you can expect:
✅ {{benefit_1}}
✅ {{benefit_2}}
✅ {{benefit_3}}

As a welcome gift, here's {{discount}}% OFF your first order:
Code: {{code}}

Start exploring: {{link}}

Best regards,
The {{business}} Team`,
    variables: ['business', 'name', 'benefit_1', 'benefit_2', 'benefit_3', 'discount', 'code', 'link'],
    tags: ['welcome', 'onboarding'],
  },
  {
    id: 'email-promo-1',
    name: 'Promotional Email',
    category: 'Promotion',
    channel: 'email',
    subject: '🔥 {{discount}}% OFF - Limited Time Offer!',
    body: `Hi {{name}},

Don't miss out on our biggest sale of the season!

🎉 Get {{discount}}% OFF on {{category}}
🗓️ Valid: {{start_date}} to {{end_date}}
🎁 Use code: {{code}}

Shop now: {{link}}

Hurry, this offer ends soon!

Best,
The {{business}} Team`,
    variables: ['name', 'discount', 'category', 'start_date', 'end_date', 'code', 'business', 'link'],
    tags: ['promotion', 'sale', 'discount'],
  },
  {
    id: 'email-newsletter-1',
    name: 'Newsletter',
    category: 'Newsletter',
    channel: 'email',
    subject: '{{month}} Update - What\'s New at {{business}}',
    body: `Hi {{name}},

Here's what's happening at {{business}} this {{month}}:

📰 Featured Story:
{{story_title}}
{{story_summary}}

🆕 New Products:
{{new_products}}

📅 Upcoming Events:
{{events}}

💡 Tip of the Month:
{{tip}}

Stay connected with us on social media!

Best,
The {{business}} Team`,
    variables: ['month', 'business', 'name', 'story_title', 'story_summary', 'new_products', 'events', 'tip'],
    tags: ['newsletter', 'update', 'monthly'],
  },
  {
    id: 'email-reengagement-1',
    name: 'Re-engagement Email',
    category: 'Re-engagement',
    channel: 'email',
    subject: 'We miss you, {{name}}! Come back for {{discount}}% OFF 🎁',
    body: `Hi {{name}},

It's been a while since we last saw you, and we miss you!

Here's a special welcome back offer:
🎁 {{discount}}% OFF your next purchase
🎁 Use code: {{code}}
🎁 Valid for 7 days

What's new since you've been away:
✅ {{new_feature_1}}
✅ {{new_feature_2}}
✅ {{new_feature_3}}

Come back and see what's changed!

Shop now: {{link}}

Best,
The {{business}} Team`,
    variables: ['name', 'discount', 'code', 'new_feature_1', 'new_feature_2', 'new_feature_3', 'business', 'link'],
    tags: ['reengagement', 'winback', 'offer'],
  },
];

// ==================== SMS TEMPLATES ====================

export const smsTemplates: MarketingTemplate[] = [
  {
    id: 'sms-promo-1',
    name: 'SMS Promotion',
    category: 'Promotion',
    channel: 'sms',
    body: `{{business}}: {{name}}, get {{discount}}% OFF! Use code {{code}}. Shop: {{link}}. Ends {{date}}. Reply STOP to opt out.`,
    variables: ['business', 'name', 'discount', 'code', 'link', 'date'],
    tags: ['promotion', 'sms', 'short'],
  },
  {
    id: 'sms-cart-1',
    name: 'SMS Cart Reminder',
    category: 'Cart Recovery',
    channel: 'sms',
    body: `{{business}}: {{name}}, you left items in your cart! Complete now: {{link}}. Need help? Reply HELP.`,
    variables: ['business', 'name', 'link'],
    tags: ['cart', 'sms', 'reminder'],
  },
  {
    id: 'sms-appointment-1',
    name: 'SMS Appointment Reminder',
    category: 'Appointment',
    channel: 'sms',
    body: `{{business}}: Reminder - {{name}}, your appointment is on {{date}} at {{time}}. Location: {{location}}. Reply CONFIRM or CANCEL.`,
    variables: ['business', 'name', 'date', 'time', 'location'],
    tags: ['appointment', 'sms', 'reminder'],
  },
  {
    id: 'sms-order-1',
    name: 'SMS Order Confirmation',
    category: 'Order',
    channel: 'sms',
    body: `{{business}}: {{name}}, your order #{{order_id}} is confirmed! Track: {{tracking_link}}. Thank you!`,
    variables: ['business', 'name', 'order_id', 'tracking_link'],
    tags: ['order', 'sms', 'confirmation'],
  },
];

// ==================== TEMPLATE CATEGORIES ====================

export const templateCategories = [
  { id: 'welcome', name: 'Welcome', icon: '👋', color: 'green' },
  { id: 'promotion', name: 'Promotions', icon: '🎯', color: 'blue' },
  { id: 'cart', name: 'Cart Recovery', icon: '🛒', color: 'orange' },
  { id: 'followup', name: 'Follow-up', icon: '💬', color: 'purple' },
  { id: 'referral', name: 'Referral', icon: '🤝', color: 'pink' },
  { id: 'reengagement', name: 'Re-engagement', icon: '🔄', color: 'cyan' },
  { id: 'appointment', name: 'Appointments', icon: '📅', color: 'indigo' },
  { id: 'thankyou', name: 'Thank You', icon: '🙏', color: 'yellow' },
  { id: 'newsletter', name: 'Newsletter', icon: '📰', color: 'gray' },
  { id: 'order', name: 'Orders', icon: '📦', color: 'teal' },
];

// ==================== HELPER FUNCTIONS ====================

/**
 * Replace template variables with actual values
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    rendered = rendered.replace(regex, value);
  }
  return rendered;
}

/**
 * Get templates by channel
 */
export function getTemplatesByChannel(channel: 'whatsapp' | 'email' | 'sms'): MarketingTemplate[] {
  switch (channel) {
    case 'whatsapp':
      return whatsappTemplates;
    case 'email':
      return emailTemplates;
    case 'sms':
      return smsTemplates;
    default:
      return [...whatsappTemplates, ...emailTemplates, ...smsTemplates];
  }
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): MarketingTemplate[] {
  const allTemplates = [...whatsappTemplates, ...emailTemplates, ...smsTemplates];
  return allTemplates.filter(t => t.category.toLowerCase() === category.toLowerCase());
}

/**
 * Search templates
 */
export function searchTemplates(query: string): MarketingTemplate[] {
  const allTemplates = [...whatsappTemplates, ...emailTemplates, ...smsTemplates];
  const lowerQuery = query.toLowerCase();
  return allTemplates.filter(
    t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.body.toLowerCase().includes(lowerQuery) ||
      t.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}
