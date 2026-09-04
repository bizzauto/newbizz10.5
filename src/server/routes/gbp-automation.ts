import { Router } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

// ==================== AUTO REVIEW REQUEST (shared helper) ====================
async function triggerAutoReview(businessId: string, contactId: string, triggerType: string, triggerId?: string): Promise<void> {
  try {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, gbpReviewUrl: true } });
    if (!business?.gbpReviewUrl) return;
    const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { name: true, phone: true } });
    if (!contact?.phone) return;
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
    const recent = await prisma.activity.findFirst({ where: { businessId, contactId, type: 'review_request_sent', createdAt: { gte: sevenDaysAgo } } });
    if (recent) return;
    const triggerMsg: Record<string, string> = {
      order_delivered: 'Your order has been delivered! 🎉',
      invoice_paid: 'Thank you for your payment! 🙏',
      appointment_completed: 'Thank you for visiting! 🙏',
    };
    const msg = `Hi ${contact.name || 'there'}!\n\n${triggerMsg[triggerType] || 'We value your feedback!'}\n\nWould you leave a quick Google review? It really helps! 🙏\n\n👉 ${business.gbpReviewUrl}`;
    const { WhatsAppSendRouter } = await import('../services/whatsapp-send-router.service.js');
    await WhatsAppSendRouter.sendText(businessId, contact.phone, msg, { contactId, applyAntiBan: false });
    await prisma.activity.create({
      data: { businessId, contactId, type: 'review_request_sent', title: 'Auto review request', content: `Auto review request (${triggerType})`, createdBy: 'gbp-automation', metadata: { triggerType, triggerId } },
    });
  } catch (err: any) {
    console.warn('[GBP-Auto] triggerAutoReview failed:', err?.message);
  }
}

export { triggerAutoReview };

// ==================== AUTO REVIEW CAMPAIGN ====================
router.post('/auto-review-campaign', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user.businessId;
    const { triggerType, triggerId, contactId } = req.body || {};
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, gbpReviewUrl: true } });
    if (!business?.gbpReviewUrl) return res.status(400).json({ success: false, error: 'Google review URL not set' });
    let contact: any = null;
    if (contactId) contact = await prisma.contact.findFirst({ where: { id: contactId, businessId } });
    if (!contact?.phone) return res.status(400).json({ success: false, error: 'Contact has no phone number' });
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
    const recent = await prisma.activity.findFirst({ where: { businessId, contactId: contact.id, type: 'review_request_sent', createdAt: { gte: sevenDaysAgo } } });
    if (recent && triggerType !== 'manual') return res.json({ success: true, data: { skipped: true, reason: 'Already sent within 7 days' } });
    const triggerMsg: Record<string, string> = { order_delivered: 'Your order has been delivered! 🎉', invoice_paid: 'Thank you for your payment! 🙏', appointment_completed: 'Thank you for visiting us! 🙏', manual: 'We value your feedback!' };
    const message = `Hi ${contact.name || 'there'}!\n\n${triggerMsg[triggerType || 'manual']}\n\nWould you leave a quick Google review? It really helps! 🙏\n\n👉 ${business.gbpReviewUrl}`;
    const { WhatsAppSendRouter } = await import('../services/whatsapp-send-router.service.js');
    await WhatsAppSendRouter.sendText(businessId, contact.phone, message, { contactId: contact.id, applyAntiBan: false });
    await prisma.activity.create({ data: { businessId, contactId: contact.id, type: 'review_request_sent', title: 'Review request sent', content: `Sent (${triggerType || 'manual'})`, createdBy: 'gbp-automation' } });
    res.json({ success: true, message: `Sent to ${contact.name || contact.phone}` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== REVIEW WIDGET ====================
router.get('/widget/:businessId', async (req: any, res: any) => {
  try {
    const reviews: any[] = await prisma.review.findMany({ where: { businessId: req.params.businessId, platform: 'google' }, orderBy: { createdAt: 'desc' }, take: 10 }).catch(() => []);
    const business = await prisma.business.findUnique({ where: { id: req.params.businessId }, select: { name: true } });
    const total = reviews.length;
    const avgRating = total > 0 ? reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / total : 0;
    res.json({
      success: true,
      data: {
        businessName: business?.name || 'Business', totalReviews: total, averageRating: Math.round(avgRating * 10) / 10,
        reviews: reviews.map((r: any) => ({ author: r.reviewerName, rating: r.rating, text: r.text, time: r.reviewDate || r.createdAt, reply: r.replyText })),
      },
    });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/widget/:businessId/embed', async (req: any, res: any) => {
  try {
    const origin = process.env.FRONTEND_URL || 'https://bizzautoai.com';
    const embedCode = `<div id="bizzauto-reviews"></div>\n<script>\n(function(){\n  var c=document.getElementById('bizzauto-reviews');if(!c)return;\n  fetch('${origin}/api/gbp-automation/widget/${req.params.businessId}').then(r=>r.json()).then(d=>{if(!d.success)return;var x=d.data;var h='<div style="font-family:system-ui;max-width:600px;margin:20px auto;padding:20px;border-radius:16px;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.08)"><h3 style="margin:0 0 4px;color:#1a1a2e">'+x.businessName+'</h3><div style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><span style="color:#f59e0b;font-size:20px">'+'\\u2605'.repeat(Math.round(x.averageRating))+'</span><span style="color:#666;font-size:14px">'+x.averageRating+' / 5 \\u00b7 '+x.totalReviews+' reviews</span></div>';x.reviews.slice(0,5).forEach(function(r){h+='<div style="border-top:1px solid #eee;padding:12px 0"><strong style="color:#333;font-size:13px">'+(r.author||'Customer')+'</strong><span style="color:#f59e0b;font-size:12px"> '+'\\u2605'.repeat(r.rating)+'</span>'+(r.text?'<p style="margin:4px 0 0;color:#555;font-size:13px">'+r.text+'</p>':'')+'</div>'});h+='</div>';c.innerHTML=h;});\n})();\n</script>`;
    res.type('text/plain').send(embedCode);
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== REVIEW FUNNEL ANALYTICS ====================
router.get('/analytics', authenticate, async (req: any, res: any) => {
  try {
    const businessId = req.user.businessId;
    const monthAgo = new Date(Date.now() - 30 * 86400_000);
    const twoMonthsAgo = new Date(Date.now() - 60 * 86400_000);
    const [reviews, reviewRequests, qrData, negCount] = await Promise.all([
      prisma.review.findMany({ where: { businessId, platform: 'google' }, select: { rating: true, createdAt: true, replyText: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.activity.count({ where: { businessId, type: 'review_request_sent' } }),
      prisma.reviewQRCode.aggregate({ where: { businessId }, _sum: { scans: true } }),
      prisma.negativeFeedback.count({ where: { businessId } }),
    ]);
    const distribution = [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews.filter((r: any) => r.rating === star).length }));
    const thisMonth = reviews.filter((r: any) => new Date(r.createdAt) >= monthAgo);
    const lastMonth = reviews.filter((r: any) => { const d = new Date(r.createdAt); return d >= twoMonthsAgo && d < monthAgo; });
    const withReply = reviews.filter((r: any) => r.replyText).length;
    const totalScans = qrData._sum.scans || 0;
    res.json({
      success: true,
      data: {
        totalReviews: reviews.length,
        averageRating: reviews.length > 0 ? Math.round(reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length * 10) / 10 : 0,
        distribution,
        trend: { thisMonth: thisMonth.length, lastMonth: lastMonth.length },
        responseRate: reviews.length > 0 ? Math.round((withReply / reviews.length) * 100) : 0,
        reviewRequestsSent: reviewRequests, qrScans: totalScans, negativeFeedback: negCount,
        funnel: { scanned: totalScans, reviewed: reviews.length, rate: totalScans > 0 ? Math.round((reviews.length / totalScans) * 100) : 0 },
      },
    });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== BUSINESS-WISE COMMENT TEMPLATES ====================
router.get('/templates', authenticate, async (req: any, res: any) => {
  const TEMPLATES: Record<string, string[]> = {
    led_light: ['Led Brighter se lights liye — quality bahut badhiya hai aur installation bhi smooth tha. Highly recommended!', 'Great LED products and prompt service. The team helped me pick the perfect lighting for my shop.', 'Best LED store! Genuine products, reasonable prices aur after-sales support bhi excellent.', 'Bahut accha experience! Lights ki quality top-class hai, staff helpful hai aur delivery time par mili.', 'Excellent quality LED lights! Maine apne ghar ke liye poora set liya — brightness aur dono kamaal hai.', 'Top-quality LED panels aur strip lights mile yahan. Mere office ki poori lighting inhone handle ki — flawless work!'],
    led_driver: ['LED drivers bhi yahin se liye — quality genuine hai aur bahut stable chal rahe hain. Recommended!', 'Great LED drivers at reasonable prices. The team helped me pick the right wattage for my setup.', 'Best place for LED drivers and accessories. Genuine products with warranty!'],
    spd: ['SPD lagwaya yahan se — bijli ka suraj aaya to bilkul safe rahe. Best investment for home safety!', 'Great surge protection devices. Professional installation and genuine products. Highly recommended!'],
    sensor: ['LDR sensor bilkul sahi kaam kar raha hai — automatic street light ban gaya hamara! Best quality.', 'Great sensors at affordable prices. Technical support bhi mila installation ke liye.'],
    restaurant: ['Amazing food and great ambiance! The staff was very friendly and service was quick. Highly recommended!', 'Best restaurant in the area! Every dish was delicious and portions were generous. Will definitely come back!', 'Great value for money. The food was fresh and the atmosphere was perfect for a family dinner.', 'Loved the food! Must try their special dishes. The service was prompt and the staff was courteous.'],
    salon: ['Best salon experience! The staff is professional and the service was excellent. Highly recommended!', 'Great haircut and friendly staff. The place is clean and they use quality products. Will visit again!', 'Amazing service! They really listen to what you want and deliver perfectly. Best salon in town!'],
    retail: ['Great store with genuine products at fair prices. Staff is helpful and knowledgeable. Highly recommended!', 'Best shopping experience! Wide variety of products and excellent customer service.', 'Amazing collection and friendly staff. They go above and beyond to help customers. Will visit again!'],
    default: ['Excellent service and professional staff. Highly recommended for anyone looking for quality!', 'Great experience! The team was helpful and the results were exactly what I expected.', 'Best in the business! Genuine, reliable, and affordable. Will definitely use again.', 'Amazing experience from start to finish. Professional and courteous. 5 stars!'],
  };
  const { category } = req.query;
  res.json({ success: true, data: TEMPLATES[(category as string) || 'default'] || TEMPLATES.default });
});

// ==================== WHATSAPP MARKETING TEMPLATES ====================
router.get('/wa-templates', authenticate, async (req: any, res: any) => {
  res.json({
    success: true,
    data: {
      promotional: ['{name} ji, {business} pe aaj special offer hai! 🎉 {Humari|Hamari} best products pe {20-30% discount} mil raha hai. {Aaj hi order karo|Reply for details}!', 'Hi {name}! 🛍️ {Humne|We} laaye hain {naye|new} products jo aapke liye perfect hain! {Check out|Dekho} — {Limited stock}!', '{name} ji, {weekend sale|mega sale} chalu hai! 🎊 Flat {25%} off sabhi products pe. {Offer|Deal} sirf is weekend tak!'],
      followup: ['Hi {name}! {Pichle baar|Last time} aapne {interest dikhaya tha}. {Ab naye products aaye hain|We have new arrivals}! {Interested?|Check them out!}', '{name} ji, {humne|we} aapke liye {kuch special|something special} rakha hai! {Reply karo|Let us know} aur details paao 😊'],
      festival: ['{name} ji, {Diwali|Holi|New Year} ki hardik shubhkamnayein! 🪔 {Is festive season me|Special} {up to 40% discount} sabhi products pe!', '{Festive greetings|Shubhkamnayein} {name} ji! 🎊 {Business} pe {festival offer} — {Buy 2 get 1 free}! {Limited time}!'],
      reengagement: ['{name} ji, {bahut din ho gaye|its been a while}! {Humne|We} {kuch naya launch kiya hai|have something new} jo aapko pasand aayega! {Dekhna chahenge?|Interested?}', 'Hi {name}! {Hum yaad kar rahe the|We miss you}! {Is baar|This time} {kuch extra special|something extra special} hai aapke liye 😊'],
    },
  });
});

export default router;
