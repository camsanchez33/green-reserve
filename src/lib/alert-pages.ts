// ALERTS-2: the small pages behind the links in alert emails (confirm, stop). A GET only shows
// a page with a button; the button POSTs. Mail scanners open links, so a GET must change nothing.
// Every page links back to the course (no golfer screen is a dead end).

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function alertPage(opts: {
  title: string; body: string; course?: { name: string; slug: string } | null;
  action?: { url: string; label: string } | null;
}): string {
  const base = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
  const courseLink = opts.course ? `${base}/courses/${encodeURIComponent(opts.course.slug)}` : `${base}/courses`;
  const courseName = opts.course?.name || 'GreenReserve';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${esc(opts.title)} · GreenReserve</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<style>body{margin:0;padding:48px 16px;font-family:'Libre Franklin',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F6F4EC;color:#141814;text-align:center}
h1{font-family:'EB Garamond',Georgia,serif;font-size:26px;font-weight:600;margin:0 0 12px}
p{color:#3F453E;font-size:15px;margin:0 0 24px;line-height:1.5}
button,a.primary{display:block;width:100%;box-sizing:border-box;background:#173B2A;color:#fff;border:0;text-decoration:none;padding:13px 24px;border-radius:7px;font:600 15px inherit;margin-bottom:12px;cursor:pointer;min-height:44px}
a.secondary{display:inline-block;color:#173B2A;text-decoration:underline;padding:10px;font-weight:600;font-size:14px;min-height:44px;box-sizing:border-box}
.card{max-width:380px;margin:0 auto}</style>
</head>
<body><main class="card">
<h1>${esc(opts.title)}</h1>
<p>${esc(opts.body)}</p>
${opts.action ? `<form method="post" action="${esc(opts.action.url)}"><button type="submit">${esc(opts.action.label)}</button></form>` : ''}
<a class="${opts.action ? 'secondary' : 'primary'}" href="${esc(courseLink)}">Back to ${esc(courseName)}</a>
</main></body></html>`;
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
