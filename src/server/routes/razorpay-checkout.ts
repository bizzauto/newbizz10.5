import { Router, Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';

const router = Router();

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

function getRazorpayInstance(): Razorpay {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set');
  }
  return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
}

router.post('/create-order', async (req: Request, res: Response) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({ success: false, error: 'Amount must be at least 100 paise' });
    }

    const razorpay = getRazorpayInstance();
    const order = await razorpay.orders.create({
      amount: Math.round(amount),
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      payment_capture: true,
    });

    res.json({
      success: true,
      data: {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key: RAZORPAY_KEY_ID,
      },
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    const description = error?.error?.description || error.message;
    res.status(statusCode).json({ success: false, error: description || 'Failed to create order' });
  }
});

router.post('/verify-payment', (req: Request, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Missing required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature' });
    }

    if (!RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ success: false, error: 'Payment verification not configured' });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(razorpay_signature)
    );

    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Signature mismatch' });
    }

    res.json({ success: true, data: { razorpay_order_id, razorpay_payment_id } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Verification failed' });
  }
});

export default router;
