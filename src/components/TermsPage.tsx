import React from 'react';
import Footer from './Footer';

const TermsPage: React.FC = () => (
  <div className="min-h-screen bg-gray-50">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-8 sm:py-12 md:py-16">
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Terms of Service</h1>
      <p className="text-sm sm:text-base text-gray-500 mb-6 sm:mb-8">Last updated: September 2, 2026</p>

      <div className="prose prose-sm sm:prose-base lg:prose-lg max-w-none">
        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">1. Acceptance of Terms</h2>
          <p className="text-sm sm:text-base text-gray-600">By accessing, registering for, or using BizzAuto Solutions ("BizzAuto", "the Service", "we", "us"), you ("you", "User", "Customer") agree to be bound by these Terms of Service ("Terms") and our Privacy Policy. If you do not agree to all of these Terms, you must not use the Service.</p>
          <p className="text-sm sm:text-base text-gray-600 mt-2">If you use the Service on behalf of a business entity, you represent that you have authority to bind that entity to these Terms.</p>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">2. Description of Service</h2>
          <p className="text-sm sm:text-base text-gray-600">BizzAuto is a business automation platform providing WhatsApp Business API integration, CRM, marketing automation, AI-powered content generation, e-commerce, and related business tools.</p>
          <p className="text-sm sm:text-base text-gray-600 mt-2">We may add, modify, suspend, or discontinue any feature at any time. Material changes affecting paid features will be communicated where reasonably practicable.</p>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">3. Eligibility & Accounts</h2>
          <ul className="text-sm sm:text-base text-gray-600 space-y-1.5 sm:space-y-2">
            <li>You must be at least 18 years of age to use the Service.</li>
            <li>You must provide accurate, current, and complete registration information and keep it updated.</li>
            <li>You are solely responsible for safeguarding your account credentials and all activity under your account.</li>
            <li>One account per business/entity unless a multi-brand plan is purchased.</li>
            <li>We may suspend or terminate accounts that violate these Terms, applicable law, or platform policies (e.g., Meta/WhatsApp Business policies), with or without notice where required to prevent harm.</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">4. Acceptable Use</h2>
          <p className="text-sm sm:text-base text-gray-600 mb-2">You agree NOT to use the Service to:</p>
          <ul className="text-sm sm:text-base text-gray-600 space-y-1.5 sm:space-y-2">
            <li>Send spam, bulk unsolicited messages, or messages without a lawful basis for contacting recipients.</li>
            <li>Violate WhatsApp Business/Meta Business Messaging policies or any third-party platform's terms.</li>
            <li>Distribute malware, phishing links, or unlawful, defamatory, obscene, or infringing content.</li>
            <li>Impersonate any person or misrepresent your identity or affiliation.</li>
            <li>Access, scrape, or interfere with other users' data or the Service's infrastructure.</li>
            <li>Circumvent rate limits, usage quotas, security controls, or reverse engineer the Service.</li>
            <li>Use the Service in violation of applicable Indian law (including IT Act 2000 and rules thereunder) or any other applicable law.</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-blue-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">5. Bring Your Own Key (BYOK) — Third-Party AI Keys</h2>
          <p className="text-sm sm:text-base text-gray-600 mb-2">The Service allows you to connect your own API keys from third-party AI providers ("BYOK Keys") such as Groq, OpenRouter, NVIDIA, OpenAI, or any OpenAI-compatible endpoint.</p>
          <ul className="text-sm sm:text-base text-gray-600 space-y-1.5 sm:space-y-2">
            <li><strong>Ownership:</strong> BYOK Keys are obtained directly by you from the third-party provider. We are not a party to any agreement between you and that provider, and we do not receive any payment from them on your behalf.</li>
            <li><strong>Your responsibility:</strong> You are solely responsible for: (a) complying with each provider's Terms of Service, usage policies, and rate limits; (b) the validity, billing, and quota of your keys; (c) any charges, suspension, or termination imposed by the provider.</li>
            <li><strong>Storage & security:</strong> BYOK Keys are encrypted at rest using AES-256-GCM and are used only to process your own AI requests. We display only a masked form (last 4 characters). You may delete your keys at any time from Settings.</li>
            <li><strong>No endorsement:</strong> We do not endorse, warrant, or guarantee any third-party provider. Availability, quality, speed, and pricing of third-party AI services are outside our control.</li>
            <li><strong>Liability:</strong> We are not liable for any loss, service interruption, data charge, quota exhaustion, key revocation, account ban, or damages arising from your use (or the provider's termination) of BYOK Keys. Disputes with a provider must be resolved directly with that provider.</li>
            <li><strong>Prohibited keys:</strong> You must not add keys that (a) do not belong to you or your organization, (b) were obtained through a mechanism whose terms prohibit their use in third-party applications, or (c) are used to resell provider services in violation of the provider's terms. We may disable any BYOK Key we reasonably believe violates a provider's terms or applicable law.</li>
            <li><strong>Credits:</strong> AI requests processed through your BYOK Keys do not consume platform AI credits. Requests that fall back to platform-provided AI keys consume credits under your plan.</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">6. AI-Generated Content</h2>
          <ul className="text-sm sm:text-base text-gray-600 space-y-1.5 sm:space-y-2">
            <li>AI-generated text, images, captions, replies, and recommendations are produced by third-party AI models and may be inaccurate, incomplete, or inappropriate.</li>
            <li>You are responsible for reviewing all AI-generated content before sending or publishing it, including compliance with advertising, consumer-protection, and communications laws.</li>
            <li>We do not claim ownership of your inputs; output ownership and usage rights are subject to the underlying AI provider's terms (for BYOK usage) and our platform terms (for platform-key usage).</li>
            <li>AI features are provided "as is" without warranty of accuracy, availability, fitness for a particular purpose, or non-infringement.</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">7. Payment, Billing & Credits</h2>
          <ul className="text-sm sm:text-base text-gray-600 space-y-1.5 sm:space-y-2">
            <li>All prices are in Indian Rupees (INR) unless stated otherwise, exclusive of applicable taxes (GST as applicable).</li>
            <li>Subscriptions auto-renew until cancelled. You may cancel anytime; access continues until the end of the paid period.</li>
            <li>AI and image credits are usage allowances tied to your plan; unused credits may not roll over and have no cash value unless stated otherwise.</li>
            <li>Refunds, if any, are governed by our Refund Policy.</li>
            <li>We may change prices with at least 30 days' prior notice; changes apply from your next billing cycle.</li>
            <li>Payments are processed by third-party gateways (e.g., Razorpay). We do not store your card details.</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">8. Data & Privacy</h2>
          <p className="text-sm sm:text-base text-gray-600">We collect and process personal data as described in our <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>. You retain ownership of your business data. We do not sell your personal data. By using third-party integrations (WhatsApp, AI providers, payment gateways), you acknowledge that the relevant third party processes data under its own terms.</p>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">9. Service Availability & No Warranty</h2>
          <p className="text-sm sm:text-base text-gray-600">The Service is provided on an "as is" and "as available" basis. We do not warrant that the Service will be uninterrupted, error-free, or secure, that third-party integrations (WhatsApp/Meta, AI providers, payment gateways, email providers) will remain available, or that defects will be corrected. Your sole remedy for dissatisfaction with the Service is to stop using it and, where eligible, seek a refund under our Refund Policy.</p>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">10. Limitation of Liability</h2>
          <p className="text-sm sm:text-base text-gray-600">To the maximum extent permitted by law:</p>
          <ul className="text-sm sm:text-base text-gray-600 space-y-1.5 sm:space-y-2 mt-2">
            <li>We shall not be liable for any indirect, incidental, special, exemplary, punitive, or consequential damages, including lost profits, lost data, lost business opportunities, or goodwill, arising from or related to your use of the Service.</li>
            <li>Our total aggregate liability for all claims shall not exceed the subscription fees paid by you to us in the twelve (12) months immediately preceding the event giving rise to the claim.</li>
            <li>We are not liable for acts or omissions of third-party providers, including WhatsApp/Meta account bans, AI provider outages or rate limits, payment gateway failures, or email delivery issues.</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">11. Indemnification</h2>
          <p className="text-sm sm:text-base text-gray-600">You agree to indemnify, defend, and hold harmless BizzAuto Solutions, its owners, directors, employees, and agents from and against any claims, liabilities, damages, losses, costs, or expenses (including reasonable legal fees) arising out of or in connection with: (a) your use or misuse of the Service; (b) content you create, send, or publish through the Service; (c) your violation of these Terms, any law, or third-party rights (including your recipients' consent/privacy rights); (d) your use of BYOK Keys or breach of a third-party AI provider's terms; or (e) messages sent by you to individuals who did not consent to receive them.</p>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">12. Termination & Suspension</h2>
          <ul className="text-sm sm:text-base text-gray-600 space-y-1.5 sm:space-y-2">
            <li>You may close your account at any time from Settings.</li>
            <li>We may suspend or terminate your account immediately if we reasonably believe you have violated these Terms, applicable law, or platform policies, or to protect other users, our infrastructure, or third-party providers.</li>
            <li>Upon termination, your right to use the Service ceases. Data is handled per our Privacy Policy (retention/deletion timelines).</li>
            <li>Sections 10 (Limitation of Liability), 11 (Indemnification), and 13 (Governing Law & Disputes) survive termination.</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">13. Governing Law & Dispute Resolution</h2>
          <p className="text-sm sm:text-base text-gray-600">These Terms are governed by the laws of India. Any dispute shall first be attempted to be resolved through good-faith negotiation for 30 days from written notice. Failing that, disputes shall be referred to binding arbitration under the Arbitration and Conciliation Act, 1996, by a sole arbitrator appointed mutually, seated in Mumbai, Maharashtra. Subject to the above, courts at Mumbai, Maharashtra shall have exclusive jurisdiction. Notwithstanding the foregoing, either party may seek interim injunctive relief from a court of competent jurisdiction.</p>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">14. Force Majeure</h2>
          <p className="text-sm sm:text-base text-gray-600">We shall not be liable for any failure or delay in performance caused by events beyond our reasonable control, including natural disasters, epidemics, war, terrorism, riots, government action, internet or telecom outages, cyberattacks, third-party provider outages (Meta/WhatsApp, AI providers, payment gateways), or labour disputes.</p>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">15. Changes to These Terms</h2>
          <p className="text-sm sm:text-base text-gray-600">We may update these Terms from time to time. The "Last updated" date above reflects the current version. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms. Material changes will be notified via email or in-app notice where reasonably practicable.</p>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">16. Severability & Entire Agreement</h2>
          <p className="text-sm sm:text-base text-gray-600">If any provision of these Terms is held invalid or unenforceable, the remaining provisions continue in full force. These Terms, together with the Privacy Policy and Refund Policy, constitute the entire agreement between you and us regarding the Service and supersede prior agreements.</p>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">17. Contact</h2>
          <p className="text-sm sm:text-base text-gray-600">For questions about these Terms:</p>
          <p className="text-sm sm:text-base text-gray-900 font-medium mt-2 break-all sm:break-normal">📧 legal@bizzauto.in</p>
        </section>
      </div>
    </div>
    <Footer />
  </div>
);

export default TermsPage;
