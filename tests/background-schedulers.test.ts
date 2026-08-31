/**
 * Background scheduler tick tests — DB-heavy logic with mocked prisma.
 * Focus: due-row selection, stale guards, per-row failure isolation.
 */
jest.mock('../src/server/db', () => ({
  prisma: {
    dripQueue: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    message: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
    business: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ name: 'TestBiz' }) },
    contact: { findFirst: jest.fn().mockResolvedValue({ name: 'Rahul' }), findUnique: jest.fn().mockResolvedValue({ name: 'Rahul', phone: '919800000000' }), update: jest.fn() },
    appointmentReminder: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    cartRecovery: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    stockAlert: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    activity: { create: jest.fn() },
    whatsAppFlowSession: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    whatsAppFlow: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
  },
}));

jest.mock('../src/server/services/whatsapp-send-router.service', () => ({
  WhatsAppSendRouter: { sendText: jest.fn().mockResolvedValue({ ok: true }) },
}));

jest.mock('../src/server/services/evolution.service', () => ({
  EvolutionApiService: {
    sendText: jest.fn().mockResolvedValue({}),
    sendMedia: jest.fn().mockResolvedValue({}),
    getAntiBanSettings: jest.fn().mockResolvedValue({ enabled: true, messageDelayMs: 0, groupMessageDelayMs: 0, randomDelayMs: 0, maxMessagesPerDay: 0 }),
    checkDailyLimit: jest.fn().mockResolvedValue(false),
    getConfig: jest.fn().mockResolvedValue({ baseUrl: 'http://x', apiKey: 'k', instanceName: 'i' }),
  },
}));

import { prisma } from '../src/server/db';
import { dripQueueTick, appointmentReminderTick, cartRecoveryTick } from '../src/server/services/background-schedulers.service';
import { WhatsAppSendRouter } from '../src/server/services/whatsapp-send-router.service';

const mockedSend = WhatsAppSendRouter.sendText as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('dripQueueTick', () => {
  it('sends due step and marks sent', async () => {
    (prisma.dripQueue.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'd1',
        step: 0,
        sendAt: new Date(Date.now() - 60_000),
        campaign: { id: 'c1', name: 'Camp', businessId: 'b1', status: 'active', dripSteps: JSON.stringify([{ message: 'Hi {name}!' }]), content: { message: 'x' } },
        contact: { id: 'ct1', phone: '919800000001', name: 'Rahul' },
      },
    ]);

    const n = await dripQueueTick();
    expect(n).toBe(1);
    expect(mockedSend).toHaveBeenCalledWith('b1', '919800000001', expect.stringContaining('Rahul'), expect.objectContaining({ rotate: true }));
    expect(prisma.dripQueue.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'd1' } }));
  });

  it('cancels rows when campaign is paused', async () => {
    (prisma.dripQueue.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'd2', step: 0, sendAt: new Date(),
        campaign: { id: 'c1', name: 'Camp', businessId: 'b1', status: 'paused', dripSteps: '[]', content: {} },
        contact: { id: 'ct1', phone: '919800000001', name: 'R' },
      },
    ]);

    await dripQueueTick();
    expect(mockedSend).not.toHaveBeenCalled();
    expect(prisma.dripQueue.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }));
  });

  it('hard-fails rows with no contact phone', async () => {
    (prisma.dripQueue.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'd3', step: 0, sendAt: new Date(),
        campaign: { id: 'c1', name: 'C', businessId: 'b1', status: 'active', dripSteps: '[]', content: {} },
        contact: { id: 'ct2', phone: null, name: 'X' },
      },
    ]);

    await dripQueueTick();
    expect(mockedSend).not.toHaveBeenCalled();
    expect(prisma.dripQueue.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }));
  });
});

describe('appointmentReminderTick', () => {
  it('sends due reminder via whatsapp and marks sent', async () => {
    (prisma.appointmentReminder.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'r1',
        businessId: 'b1',
        contactId: 'ct1',
        channel: 'whatsapp',
        message: 'Reminder for {name}',
        scheduledAt: new Date(Date.now() - 120_000),
        contact: { phone: '919800000002', name: 'Priya', email: null },
      },
    ]);
    (prisma.appointmentReminder.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'r1', businessId: 'b1', contactId: 'ct1', channel: 'whatsapp', message: 'Reminder for {name}',
      contact: { phone: '919800000002', name: 'Priya', email: null },
    });

    const n = await appointmentReminderTick();
    expect(n).toBe(1);
    expect(mockedSend).toHaveBeenCalledWith('b1', '919800000002', expect.stringContaining('Priya'), expect.anything());
    expect(prisma.appointmentReminder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'sent' }) }));
  });

  it('marks stale reminders (>7d) as failed without sending', async () => {
    (prisma.appointmentReminder.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'r2', businessId: 'b1', channel: 'whatsapp', message: 'x',
        scheduledAt: new Date(Date.now() - 8 * 24 * 3600_000),
        contact: { phone: '91', name: null, email: null },
      },
    ]);

    const n = await appointmentReminderTick();
    expect(n).toBe(0);
    expect(mockedSend).not.toHaveBeenCalled();
    expect(prisma.appointmentReminder.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'failed' } }));
  });
});

describe('cartRecoveryTick', () => {
  it('skips carts younger than 1h on first reminder', async () => {
    (prisma.cartRecovery.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'k1', businessId: 'b1', contactId: 'ct1', cartValue: 999, reminderCount: 0,
        createdAt: new Date(Date.now() - 10 * 60_000), // 10 min old
        cartItems: [{ name: 'Shoe' }],
        contact: { phone: '919800000003', name: 'Amit', email: null },
      },
    ]);

    const n = await cartRecoveryTick();
    expect(n).toBe(0);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('sends reminder for eligible cart with item summary', async () => {
    (prisma.cartRecovery.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'k2', businessId: 'b1', contactId: 'ct1', cartValue: 1499.5, reminderCount: 0,
        createdAt: new Date(Date.now() - 3 * 3600_000),
        cartItems: [{ name: 'Kurta' }, { name: 'Pajama' }],
        contact: { phone: '919800000004', name: 'Sunita', email: null },
      },
    ]);

    const n = await cartRecoveryTick();
    expect(n).toBe(1);
    const msg = mockedSend.mock.calls[0][2] as string;
    expect(msg).toContain('2 items');
    expect(msg).toContain('Kurta, Pajama');
    expect(mockedSend).toHaveBeenCalledWith('b1', '919800000004', expect.any(String), expect.anything());
    expect(prisma.cartRecovery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reminderCount: { increment: 1 } }) }));
  });
});
