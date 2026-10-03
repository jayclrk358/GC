import { ImageResponse } from 'next/og';
import { LOGO, WORDMARK } from '@/components/shell/brand-paths';

export const OG_SIZE = { width: 1200, height: 630 };

/** The Game Central logo and name, in the image's own colours. */
function Brand({ text, accent }: { text: string; accent: string }) {
  const h = 26;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={48} height={48} viewBox={LOGO.viewBox}>
        <path d={LOGO.d} fill={text} />
      </svg>
      <svg width={(h * WORDMARK.width) / 100} height={h} viewBox={`0 0 ${WORDMARK.width} 100`}>
        <path d={WORDMARK.game} fill={text} />
        <path d={WORDMARK.central} fill={accent} />
      </svg>
    </div>
  );
}

/** A link preview: a title, a line under it and a few facts, in the given colours. */
export function shareImage(opts: {
  title: string;
  subtitle: string;
  facts?: string[];
  colors?: { bg: string; surface: string; text: string; muted: string; primary: string };
}) {
  const c = opts.colors ?? {
    bg: '#07080f',
    surface: '#151726',
    text: '#f4f4fb',
    muted: '#a9adc8',
    primary: '#a78bfa',
  };
  const initial = opts.title.trim().charAt(0).toUpperCase() || 'G';
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: `linear-gradient(135deg, ${c.bg} 0%, ${c.surface} 100%)`,
        color: c.text,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        {opts.colors ? (
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 28,
              background: c.primary,
              color: c.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 64,
              fontWeight: 800,
            }}
          >
            {initial}
          </div>
        ) : (
          <svg width={120} height={120} viewBox={LOGO.viewBox}>
            <path d={LOGO.d} fill={c.text} />
          </svg>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 860 }}>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05 }}>
            {opts.title.slice(0, 60)}
          </div>
          {opts.subtitle && (
            <div style={{ fontSize: 34, color: c.muted, lineHeight: 1.3 }}>
              {opts.subtitle.slice(0, 120)}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {(opts.facts ?? []).map((f) => (
            <div
              key={f}
              style={{
                display: 'flex',
                padding: '10px 22px',
                borderRadius: 999,
                background: c.surface,
                border: `2px solid ${c.primary}`,
                fontSize: 28,
              }}
            >
              {f}
            </div>
          ))}
        </div>
        <Brand text={c.text} accent={c.primary} />
      </div>
    </div>,
    OG_SIZE,
  );
}
