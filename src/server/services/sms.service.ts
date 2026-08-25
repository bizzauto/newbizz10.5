/**
 * SMS sending via Twilio REST API (no SDK dependency).
 * Requires TWILIO_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER in .env.
 */
export class SmsService {
  static isConfigured(): boolean {
    return Boolean(
      process.env.TWILIO_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
    );
  }

  /**
   * Send an SMS. Throws with a descriptive message on failure so callers
   * can persist the error (e.g. reviewRequest.errorMessage).
   */
  static async sendSms(to: string, body: string): Promise<{ sid: string }> {
    const accountSid = process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !from) {
      throw new Error(
        'SMS provider not configured. Set TWILIO_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER in .env'
      );
    }

    const phone = to.trim();
    if (!phone) {
      throw new Error('Contact has no phone number');
    }
    // Twilio requires E.164; default to India country code for bare 10-digit numbers
    const digits = phone.replace(/[^\d+]/g, '');
    const e164 = digits.startsWith('+')
      ? digits
      : digits.length === 10
        ? `+91${digits}`
        : `+${digits}`;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams({ To: e164, From: from, Body: body });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Twilio SMS failed (${response.status}): ${data?.message || 'unknown error'}`);
    }
    return { sid: data.sid };
  }
}
