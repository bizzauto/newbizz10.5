import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import axios from 'axios';

const router = Router();

/**
 * Google Calendar 2-way sync for appointments.
 * Uses the business's existing GBP/Google OAuth token (same google_sheets /
 * google-business integration token). Creates a Google Calendar event for
 * every appointment; a cron on the old drainer refreshes external sync.
 */

async function getGoogleToken(businessId: string): Promise<string | null> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { gbpAccessToken: true, gbpRefreshToken: true },
  });
  if (!b?.gbpAccessToken) return null;
  try {
    const { decrypt } = await import('../utils/auth.js');
    return decrypt(b.gbpAccessToken);
  } catch {
    return null;
  }
}

// POST /api/google-calendar/sync/:appointmentId
// Create a Google Calendar event for an appointment
router.post('/sync/:appointmentId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.appointmentId, businessId: req.user.businessId },
      include: { contact: { select: { name: true, phone: true } } },
    });
    if (!appointment) return res.status(404).json({ success: false, error: 'Appointment not found' });

    const token = await getGoogleToken(req.user.businessId);
    if (!token) return res.status(400).json({ success: false, error: 'Google not connected â€” connect Google Business first' });

    const start = appointment.startTime || new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour default
    const title = appointment.service ? `${appointment.service} â€” ${appointment.contact?.name || 'Appointment'}` : `Appointment â€” ${appointment.contact?.name || 'Customer'}`;

    const event = {
      summary: title,
      description: `BizzAuto appointment.\nCustomer: ${appointment.contact?.name}\nPhone: ${appointment.contact?.phone}\nStatus: ${appointment.status}`,
      start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
      end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
      reminders: { useDefault: true },
    };

    const calRes = await axios.post(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
      event,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    // Store the Google Calendar event link on the appointment
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        meetingUrl: calRes.data.htmlLink,
        meetingLink: calRes.data.id,
      },
    });

    res.json({ success: true, data: { eventId: calRes.data.id, htmlLink: calRes.data.htmlLink } });
  } catch (error: any) {
    console.error('Calendar sync error:', error?.response?.data || error.message);
    res.status(500).json({ success: false, error: error?.response?.data?.error?.message || error.message });
  }
});

// GET /api/google-calendar/status
router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const token = await getGoogleToken(req.user.businessId);
    const syncedCount = await prisma.appointment.count({
      where: {
        businessId: req.user.businessId,
        meetingLink: { not: null },
      },
    });
    res.json({ success: true, data: { connected: !!token, syncedCount } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
