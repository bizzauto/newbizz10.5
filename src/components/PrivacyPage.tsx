import React from 'react';
import Footer from './Footer';

const PrivacyPage: React.FC = () => (
  <div className="min-h-screen bg-gray-50">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-8 sm:py-12 md:py-16">
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-sm sm:text-base text-gray-500 mb-6 sm:mb-8">Last updated: September 2, 2026</p>

      <div className="space-y-4 sm:space-y-6">
        {[
          {
            title: '1. Information We Collect',
            content: [
              'Account information: name, email, phone, business details',
              'Usage data: login times, features used, actions taken',
              'Communication data: WhatsApp messages, emails (with your consent)',
              'Payment data: processed securely through Razorpay (we do not store card details)',
              'Device info: IP address, browser, operating system',
              'AI provider keys you voluntarily add (Bring Your Own Key) — see Section 8',
            ],
          },
          {
            title: '2. How We Use Your Information',
            content: [
              'Provide and improve our services',
              'Process payments and send invoices',
              'Send service notifications and updates',
              'Analyze usage patterns to improve features',
              'Detect and prevent fraud or abuse',
              'Comply with legal obligations',
            ],
          },
          {
            title: '3. Data Sharing',
            content: [
              'We do NOT sell your personal data',
              'We share data with service providers (WhatsApp, AI APIs, payment processors) only as needed to deliver the service',
              'We may disclose data if required by law or court order',
              'In case of merger or acquisition, data may be transferred with your consent',
            ],
          },
          {
            title: '4. Data Security',
            content: [
              '256-bit AES-256-GCM encryption for sensitive data (including your AI provider keys)',
              'JWT-based authentication with CSRF protection',
              'Regular security audits and penetration testing',
              'Role-based access control within your organization',
              'Audit logs for all data access and modifications',
            ],
          },
          {
            title: '5. Your Rights',
            content: [
              'Access: Request a copy of your personal data',
              'Correction: Update inaccurate information',
              'Deletion: Request deletion of your data ("Right to be Forgotten")',
              'Export: Download your data in machine-readable format (CSV/JSON)',
              'Opt-out: Unsubscribe from marketing communications anytime',
              'Withdraw consent for optional integrations (including AI keys) at any time',
            ],
          },
          {
            title: '6. Data Retention',
            content: [
              'We retain your data as long as your account is active',
              'After account deletion, data is permanently removed within 30 days',
              'Backups are retained for 90 days before permanent deletion',
            ],
          },
          {
            title: '7. Cookies',
            content: [
              'We use essential cookies for authentication and session management',
              'Analytics cookies to understand usage patterns',
              'You can disable cookies in your browser settings (may affect functionality)',
            ],
          },
          {
            title: '8. Your AI Provider Keys (Bring Your Own Key)',
            content: [
              'You may optionally connect your own API keys from third-party AI providers (e.g., Groq, OpenRouter, NVIDIA, OpenAI)',
              'Keys are encrypted at rest using AES-256-GCM and never displayed in full after saving (only the last 4 characters)',
              'Keys are used solely to process your own AI requests; they are not used for other customers, shared, or sold',
              'Your prompt/content may be transmitted to the selected AI provider to fulfil your request — that provider processes it under its own privacy policy',
              'You may view, deactivate, or permanently delete your keys anytime from Settings; deletion removes the encrypted key from our systems',
              'We store usage metadata (request counts, latency, error summaries) for reliability and billing clarity, but never the key itself',
            ],
          },
          {
            title: '9. Third-Party Services',
            content: [
              'WhatsApp (Meta): Message delivery',
              'AI Providers (Groq, OpenRouter, NVIDIA, OpenAI): Content generation — your prompts and our system prompts are processed by the provider whose key you use, or our platform keys when no BYOK key is active',
              'Razorpay: Payment processing',
              'Google: Email and Sheets integration',
              'Each has their own privacy policies',
            ],
          },
          {
            title: '10. Children\'s Privacy',
            content: [
              'The Service is not directed at individuals under 18',
              'We do not knowingly collect personal data from minors',
              'If you believe a minor has provided data, contact us and we will delete it',
            ],
          },
          {
            title: '11. Compliance',
            content: [
              'We comply with India\'s Digital Personal Data Protection Act (DPDPA) 2023',
              'We follow GDPR principles for EU users',
              'We are WhatsApp Business API Policy compliant',
            ],
          },
          {
            title: '12. Contact Us',
            content: [
              '📧 privacy@bizzauto.in',
              '📍 Mumbai, Maharashtra, India',
            ],
          },
        ].map((section, i) => (
          <section key={i} className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">{section.title}</h2>
            <ul className="text-sm sm:text-base text-gray-600 space-y-1.5 sm:space-y-2">
              {section.content.map((item, j) => (
                <li key={j} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
    <Footer />
  </div>
);

export default PrivacyPage;
