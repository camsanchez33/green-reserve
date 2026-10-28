import twilio from 'twilio';
import { logSent, type SendMeta } from './sent-messages';

let _client: ReturnType<typeof twilio> | null = null;
function getClient() {
  if (!_client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    console.log('[twilio] init — SID:', sid ? sid.slice(0, 6) + '…' + sid.slice(-4) : 'MISSING', '| FROM:', from || 'MISSING');
    _client = twilio(sid, token);
  }
  return _client;
}

export async function sendSmsOtp(to: string, code: string) {
  const from = process.env.TWILIO_FROM_NUMBER;
  const toMasked = to.slice(0, 3) + '…' + to.slice(-4);
  console.log('[twilio] sendSmsOtp — to:', toMasked, '| from:', from || 'MISSING');
  try {
    const msg = await getClient().messages.create({
      to,
      from,
      body: `Your GreenReserve code is: ${code}. Expires in 10 minutes.`,
    });
    console.log('[twilio] message sent — SID:', msg.sid, '| status:', msg.status);
    // BRAIN-1b: the send log keeps that a code went out, never the code.
    await logSent({ kind: 'sign_in_code_text', channel: 'sms', to, status: 'sent', providerId: msg.sid });
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string; status?: number; moreInfo?: string };
    console.error('[twilio] sendSmsOtp FAILED — code:', e?.code, '| status:', e?.status, '| message:', e?.message, '| moreInfo:', e?.moreInfo);
    await logSent({ kind: 'sign_in_code_text', channel: 'sms', to, status: 'failed', error: e?.message ?? String(err) });
    throw err;
  }
}

/** 555-0100 to 555-0199 in any North American area code: reserved for fiction, never a real line. */
export function isFictionalNumber(phone: string): boolean {
  const d = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 && d.slice(3, 7) === '5550' && d[7] === '1';
}

/** Whether text messages can be sent at all (Twilio env present). */
export const smsConfigured = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);

/** PAY-1: one plain text message (the counter's "Text pay link"). Throws on failure. */
export async function sendSms(to: string, body: string, meta: SendMeta = { kind: 'text' }) {
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !from) {
    throw new Error('Text messages are not set up (Twilio)');
  }
  // Cam 2026-10-28: 555-0100–0199 is the fictional block (sample data) — never texted.
  if (isFictionalNumber(to)) {
    await logSent({ ...meta, channel: 'sms', to, status: 'skipped', error: 'fictional number' });
    throw new Error('That is a sample phone number (555-01xx) — no text was sent.');
  }
  // BRAIN-1b: every text lands in the send log (kind and ids, never the body).
  let msg;
  try {
    msg = await getClient().messages.create({ to, from, body });
  } catch (err) {
    await logSent({ ...meta, channel: 'sms', to, status: 'failed', error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  await logSent({ ...meta, channel: 'sms', to, status: 'sent', providerId: msg.sid });
  console.log('[twilio] sendSms — to:', to.slice(0, 3) + '…' + to.slice(-4), '| SID:', msg.sid);
}
