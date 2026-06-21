// One-off script to test the Resend email send without ever displaying the API key.
// Run with: node --env-file=.env.local test-email.js

async function main() {
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is missing or empty in .env.local — fix that first.');
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'GreenReserve <hello@greenreserve.app>',
      to: ['camsanchez33@icloud.com'],
      subject: 'GreenReserve email test',
      html: '<p>If you got this, Resend is working.</p>',
    }),
  });

  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', data);
}

main();
