import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };

/** The pinwheel mark, as satori can draw it. */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#2e1065" />
      <g transform="translate(6,6) scale(0.2)">
        <polygon points="50,50 44,8 74,4 68,44" fill="#c9a3ff" />
        <polygon points="50,50 44,8 74,4 68,44" fill="#9b6bff" transform="rotate(90,50,50)" />
        <polygon points="50,50 44,8 74,4 68,44" fill="#6f3fd1" transform="rotate(180,50,50)" />
        <polygon points="50,50 44,8 74,4 68,44" fill="#3d1a78" transform="rotate(270,50,50)" />
      </g>
    </svg>
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
    primary: '#9b6bff',
  };
  const initial = opts.title.trim().charAt(0).toUpperCase() || 'M';
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
          <Mark size={120} />
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 32 }}>
          <Mark size={44} />
          <span style={{ fontWeight: 700 }}>Magnox</span>
        </div>
      </div>
    </div>,
    OG_SIZE,
  );
}
