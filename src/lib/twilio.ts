import twilio from 'twilio';

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
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string; status?: number; moreInfo?: string };
    console.error('[twilio] sendSmsOtp FAILED — code:', e?.code, '| status:', e?.status, '| message:', e?.message, '| moreInfo:', e?.moreInfo);
    throw err;
  }
}
