import twilio from 'twilio';

let _client: ReturnType<typeof twilio> | null = null;
function getClient() {
  if (!_client) _client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return _client;
}

export async function sendSmsOtp(to: string, code: string) {
  await getClient().messages.create({
    to,
    from: process.env.TWILIO_FROM_NUMBER,
    body: `Your GreenReserve code is: ${code}. Expires in 10 minutes.`,
  });
}
