import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';

/**
 * Public Appointment Booking Page
 * GET /api/public-booking/:businessId — get business info
 * POST /api/public-booking/:businessId/book — create appointment (no auth)
 */

const router = Router();

router.get('/:businessId', async (req: Request, res: Response) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.params.businessId },
      select: { id: true, name: true },
    });
    if (!business) return res.status(404).json({ success: false, error: 'Business not found' });

    res.json({
      success: true,
      data: {
        businessName: business.name,
        slotDuration: 30,
        services: ['Consultation', 'Follow-up', 'Product Demo', 'Support Call'],
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:businessId/book', async (req: Request, res: Response) => {
  try {
    const { customerName, customerPhone, service, date, time, notes } = req.body;
    if (!customerName || !customerPhone || !date || !time) {
      return res.status(400).json({ success: false, error: 'Name, phone, date, and time are required' });
    }

    const businessId = req.params.businessId;
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ success: false, error: 'Business not found' });

    const cleanPhone = customerPhone.replace(/\D/g, '');
    let contact = await prisma.contact.findFirst({
      where: { businessId, phone: { contains: cleanPhone.slice(-10) } },
    });
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          businessId,
          name: customerName,
          phone: cleanPhone,
          source: 'booking_page',
          whatsappOptIn: true,
        },
      });
    }

    const start = new Date(`${date}T${time}:00`);
    if (isNaN(start.getTime())) return res.status(400).json({ success: false, error: 'Invalid date or time' });

    const existing = await prisma.appointment.findFirst({
      where: { businessId, startTime: start, status: { notIn: ['cancelled'] } },
    });
    if (existing) return res.status(409).json({ success: false, error: 'This time slot is already booked' });

    const appointment = await prisma.appointment.create({
      data: {
        businessId,
        contactId: contact.id,
        title: `${service || 'Appointment'} — ${customerName}`,
        service: service || null,
        startTime: start,
        endTime: new Date(start.getTime() + 60 * 60 * 1000),
        status: 'pending',
        createdBy: 'public-booking',
        description: notes || null,
      },
    });

    // WhatsApp confirmation to customer (best-effort)
    (async () => {
      try {
        const { WhatsAppSendRouter } = await import('../services/whatsapp-send-router.service.js');
        const msg = `Hi ${customerName}! Your appointment with ${business.name} is booked for ${start.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}. We'll confirm shortly!`;
        await WhatsAppSendRouter.sendText(businessId, cleanPhone, msg, { contactId: contact.id, applyAntiBan: false });
      } catch (e: any) {
        console.warn('[PublicBooking] WhatsApp confirmation failed:', e?.message);
      }
    })();

    res.status(201).json({
      success: true,
      message: 'Appointment booked! You will receive a confirmation shortly.',
      data: { appointmentId: appointment.id },
    });
  } catch (error: any) {
    console.error('Public booking error:', error);
    res.status(500).json({ success: false, error: error.message || 'Booking failed' });
  }
});

export default router;
