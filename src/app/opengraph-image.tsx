import { ImageResponse } from 'next/og';

// SD-7: the site had no social card at all — a shared link rendered as a bare
// URL. Generated at request time, so there is no PNG to keep in sync with copy.
// Public look: paper ground, pine, serif-feeling wordmark (system serif — font
// files cannot be loaded here without shipping them).
export const alt = 'GreenReserve — the online tee sheet for golf courses';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          background: '#F6F4EC', padding: '72px 80px', fontFamily: 'Georgia, "Times New Roman", serif', color: '#1C1C18',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 22, height: 22, borderRadius: 999, background: '#24513B' }} />
          <div style={{ fontSize: 30, letterSpacing: 1, color: '#24513B' }}>GreenReserve</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -2, maxWidth: 980 }}>
            The tee sheet your course deserves.
          </div>
          <div style={{ fontSize: 30, color: '#57574F', fontFamily: 'Helvetica, Arial, sans-serif', maxWidth: 900, lineHeight: 1.3 }}>
            Golfers book online. You keep 100% of green fees. Free for courses.
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 24, color: '#87867C' }}>
          <div>greenreserve.app</div>
          <div>$1.50 per player · no monthly fee</div>
        </div>
      </div>
    ),
    size,
  );
}
