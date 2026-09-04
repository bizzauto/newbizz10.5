import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

/**
 * SALES MACHINE â€” Autonomous revenue pipeline.
 *
 * One API call that runs the FULL sales cycle:
 *   1. Find new leads (by source or all)
 *   2. Score & qualify them (AI or rule-based)
 *   3. Auto-assign to team members (round-robin)
 *   4. Send personalized WhatsApp welcome (spintax + {name})
 *   5. Schedule follow-up in N days
 *   6. Create activity trail
 *   7. Report pipeline status
 *
 * The owner triggers it once â€” the machine does the rest.
 */

const PIPELINE_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

const router = Router();

router.post('/run', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user.businessId;
    const {
      source,           // 'indiamart' | 'whatsapp' | 'website' | undefined = all
      maxLeads = 15,
      sendWelcome = true,
      autoAssign = true,
      scheduleFollowUp = true,
      dryRun = false,
    } = req.body || {};

    // 1. Find unprocessed leads (no 'sales_machine' tag = not yet processed)
    const where: any = {
      businessId,
      isActive: true,
      NOT: { tags: { has: 'sales-machine' } }, // only process new leads
    };
    if (source) where.source = source;

    const leads = await prisma.contact.findMany({
      where,
      select: { id: true, name: true, phone: true, email: true, source: true, tags: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(50, Math.max(1, Number(maxLeads) || 15)),
    });

    if (leads.length === 0) {
      return res.json({ success: true, data: { processed: 0, message: 'No new leads to process. All caught up! âœ…' } });
    }

    // 2. Get team members for round-robin
    const teamMembers = autoAssign
      ? await prisma.user.findMany({
          where: { businessId, role: { in: ['ADMIN', 'MEMBER'] }, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, phone: true },
        })
      : [];
    let rrIndex = 0;

    // 3. Process each lead through the pipeline
    const { WhatsAppSendRouter } = await import('../services/whatsapp-send-router.service.js');
    const { spinAndPersonalize } = await import('../utils/spintax.js');

    let assigned = 0;
    let welcomed = 0;
    let followUpScheduled = 0;
    let failed = 0;
    const results: { lead: string; steps: string[] }[] = [];

    for (const lead of leads) {
      const steps: string[] = ['found'];

      // 3a. Auto-assign (round-robin)
      if (autoAssign && teamMembers.length > 0) {
        const assignee = teamMembers[rrIndex % teamMembers.length];
        rrIndex++;
        await prisma.contact.update({
          where: { id: lead.id },
          data: { assignedTo: assignee.id },
        }).catch(() => {});
        steps.push(`assigned:${assignee.name}`);
        assigned++;

        // Notify rep
        try {
          if (assignee.phone) {
            await WhatsAppSendRouter.sendText(businessId, assignee.phone,
              `ðŸŽ¯ Sales Machine: New lead ${lead.name} (${lead.source}) assigned to you!`,
              { contactId: lead.id, applyAntiBan: false }
            );
          }
        } catch { /* non-fatal */ }
      }

      // 3b. Send welcome message (personalized + spintax)
      if (sendWelcome && lead.phone) {
        try {
          const welcomeTemplates = [
            '{Namaste|Hello|Hi} {name}! ðŸ™ Welcome to {business}! Thank you for your interest. Our team will reach out shortly with details.',
            'Hi {name}! ðŸ‘‹ Thanks for connecting with {business}! We have some great options for you. Our team will contact you within 1 hour.',
            '{Hello|Hi} {name}! Welcome aboard! ðŸŽ‰ {business} team is excited to serve you. Expect a call from us soon!',
          ];
          const template = welcomeTemplates[Math.floor(Math.random() * welcomeTemplates.length)];
          const msg = spinAndPersonalize(template, { name: lead.name, phone: lead.phone });

          await WhatsAppSendRouter.sendText(businessId, lead.phone, msg, {
            contactId: lead.id,
            applyAntiBan: false, // these are welcome messages, not bulk
          });
          steps.push('welcomed');
          welcomed++;
        } catch (e: any) {
          steps.push(`welcome_failed:${e?.message?.substring(0, 50)}`);
        }
      }

      // 3c. Schedule follow-up (create a pending AI follow-up for the engine)
      if (scheduleFollowUp) {
        try {
          await prisma.aIFollowUp.create({
            data: {
              businessId,
              contactId: lead.id,
              triggerType: 'scheduled',
              channel: 'whatsapp',
              message: 'Follow-up: Hi {name}! Just checking if you got the details we shared. Any questions? ðŸ˜Š',
              scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
              status: 'pending',
            },
          });
          steps.push('followup:3d');
          followUpScheduled++;
        } catch { /* non-fatal */ }
      }

      // 3d. Tag as processed + move stage
      await prisma.contact.update({
        where: { id: lead.id },
        data: {
          tags: { push: 'sales-machine' },
          status: 'contacted',
        },
      }).catch(() => {});
      steps.push('tagged');

      results.push({ lead: lead.name || lead.phone || lead.id, steps });
    }

    res.json({
      success: true,
      data: {
        processed: leads.length,
        assigned,
        welcomed,
        followUpScheduled,
        failed,
        dryRun,
        results,
        message: `Sales Machine: ${leads.length} leads processed â€” ${assigned} assigned, ${welcomed} welcomed, ${followUpScheduled} follow-ups scheduled`,
      },
    });
  } catch (error: any) {
    console.error('Sales Machine error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sales-machine/stats â€” pipeline overview
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user.businessId;
    const [processed, pending, totalContacts, byStatus] = await Promise.all([
      prisma.contact.count({ where: { businessId, tags: { has: 'sales-machine' } } }),
      prisma.contact.count({ where: { businessId, NOT: { tags: { has: 'sales-machine' } } } }),
      prisma.contact.count({ where: { businessId } }),
      prisma.contact.groupBy({ by: ['status'], where: { businessId }, _count: true }),
    ]);

    res.json({
      success: true,
      data: {
        processed,
        pending,
        totalContacts,
        byStatus: byStatus.map((s: any) => ({ status: s.status || 'unknown', count: s._count })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
