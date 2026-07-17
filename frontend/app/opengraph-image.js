import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ background: '#12392e', color: '#f5f9ed', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', padding: '72px' }}>
      <div style={{ alignItems: 'center', display: 'flex', fontSize: 32, fontWeight: 700, gap: 18 }}><span style={{ alignItems: 'center', background: '#c8f169', borderRadius: 16, color: '#15231f', display: 'flex', fontSize: 30, height: 58, justifyContent: 'center', width: 58 }}>A</span> ARIA</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}><span style={{ color: '#c8f169', fontSize: 22, letterSpacing: 4 }}>MORNING BRIEF</span><span style={{ fontSize: 76, fontWeight: 600, letterSpacing: -4, lineHeight: 1 }}>Only the next action worth a merchant’s time.</span></div>
      <span style={{ color: '#d9e4d7', fontSize: 28 }}>Synthetic revenue intelligence for Lagos merchants</span>
    </div>,
    size
  );
}
