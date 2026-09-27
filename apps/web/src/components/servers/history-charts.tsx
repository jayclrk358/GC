'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { CircleAlert, CircleCheck, CircleX, Minus } from 'lucide-react';
import { HISTORY_RANGES, type HistoryPoint, type HistoryRange } from '@magnox/shared';
import type { ServerHistory } from '@magnox/core';
import { cn } from '@/lib/utils';

const PLOT_H = 180;
const AXIS_H = 24;
const PAD = { left: 40, right: 44, top: 12 };
const STRIP_H = 18;

type Uptime = 'up' | 'partial' | 'down' | 'none';

function uptimeState(u: number | null): Uptime {
  if (u === null) return 'none';
  if (u >= 0.99) return 'up';
  return u > 0 ? 'partial' : 'down';
}

const UPTIME_FILL: Record<Uptime, string> = {
  up: 'var(--c-success)',
  partial: 'var(--c-warning)',
  down: 'var(--c-danger)',
  none: 'var(--c-border)',
};

/** Round numbers for the y axis: steps of 1, 2 or 5 × 10^k, at most ~4 intervals. */
function yTicks(max: number): number[] {
  const top = Math.max(4, max);
  const raw = top / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw);
  const end = Math.ceil(top / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= end + 1e-9; v += step) ticks.push(Math.round(v));
  return ticks;
}

/** Tick times on local boundaries: every 6 h (24h), every day (7d), every 5 days (30d). */
function xTicks(range: HistoryRange, from: number, to: number): number[] {
  const d = new Date(from);
  const out: number[] = [];
  if (range === '24h') {
    d.setMinutes(0, 0, 0);
    while (d.getTime() < from || d.getHours() % 6 !== 0) d.setHours(d.getHours() + 1);
    for (; d.getTime() < to; d.setHours(d.getHours() + 6)) out.push(d.getTime());
  } else {
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < from) d.setDate(d.getDate() + 1);
    const every = range === '7d' ? 1 : 5;
    for (; d.getTime() < to; d.setDate(d.getDate() + every)) out.push(d.getTime());
  }
  return out;
}

function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function formatters(range: HistoryRange) {
  return {
    tick: new Intl.DateTimeFormat(
      undefined,
      range === '24h'
        ? { hour: 'numeric', minute: '2-digit' }
        : range === '7d'
          ? { weekday: 'short', day: 'numeric' }
          : { day: 'numeric', month: 'short' },
    ),
    point: new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
}

const num = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const pct = (u: number) =>
  `${new Intl.NumberFormat(undefined, { maximumFractionDigits: u < 0.999 && u > 0.99 ? 2 : 1 }).format(u * 100)}%`;

export function ServerHistoryCharts({
  serverId,
  initial,
}: {
  serverId: string;
  initial: ServerHistory;
}) {
  const t = useTranslations('serverPage');
  const [history, setHistory] = React.useState(initial);
  const [range, setRange] = React.useState<HistoryRange>(initial.range);
  const [failedRange, setFailedRange] = React.useState<HistoryRange | null>(null);
  // Loading is simply "the range shown isn't the one picked yet".
  const failed = failedRange === range;
  const loading = range !== history.range && !failed;

  React.useEffect(() => {
    if (range === history.range) return;
    let live = true;
    fetch(`/api/servers/${serverId}/history?range=${range}`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<ServerHistory>) : Promise.reject(new Error())))
      .then((h) => live && setHistory(h))
      .catch(() => live && setFailedRange(range));
    return () => {
      live = false;
    };
  }, [range, history.range, serverId]);

  const s = history.summary;
  const tiles = [
    { label: t('uptime'), value: s.uptime === null ? '—' : pct(s.uptime) },
    { label: t('avgPlayers'), value: s.avgPlayers === null ? '—' : num.format(s.avgPlayers) },
    { label: t('peakPlayers'), value: s.peakPlayers === null ? '—' : num.format(s.peakPlayers) },
  ];

  return (
    <section aria-labelledby="history-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="history-h" className="text-xl font-bold uppercase">
          {t('history')}
        </h2>
        <fieldset className="flex rounded-ui border border-border bg-surface p-0.5">
          <legend className="sr-only">{t('rangeLabel')}</legend>
          {HISTORY_RANGES.map((r) => (
            <label
              key={r}
              className="cursor-pointer rounded-ui-sm px-3 py-1.5 text-sm font-semibold text-muted has-checked:bg-primary has-checked:text-on-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
            >
              <input
                type="radio"
                name="history-range"
                value={r}
                checked={range === r}
                onChange={() => {
                  setFailedRange(null);
                  setRange(r);
                }}
                className="sr-only"
              />
              {t(`range.${r}`)}
            </label>
          ))}
        </fieldset>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-danger">
          {t('historyFailed')}
        </p>
      )}
      <div
        className={cn('flex flex-col gap-4 transition-opacity', loading && 'opacity-60')}
        aria-busy={loading}
      >
        <dl className="grid grid-cols-3 gap-3">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="flex flex-col-reverse justify-end gap-1 rounded-ui border border-border bg-surface px-4 py-3"
            >
              <dt className="text-sm text-muted">{tile.label}</dt>
              <dd className="font-heading text-2xl font-bold sm:text-3xl">{tile.value}</dd>
            </div>
          ))}
        </dl>
        <Charts history={history} />
      </div>
    </section>
  );
}

function Charts({ history }: { history: ServerHistory }) {
  const t = useTranslations('serverPage');
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = React.useState<number | null>(null);
  const [keyboard, setKeyboard] = React.useState(false);
  const points = history.points;
  const n = points.length;
  const from = new Date(history.from).getTime();
  const to = new Date(history.to).getTime();
  const fmt = React.useMemo(() => formatters(history.range), [history.range]);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const bw = n ? plotW / n : 0;
  const maxY = Math.max(0, ...points.map((p) => Math.max(p.players ?? 0, p.peak ?? 0)));
  const ticks = yTicks(maxY);
  const top = ticks[ticks.length - 1]!;
  const x = (i: number) => PAD.left + (i + 0.5) * bw;
  const y = (v: number) => PAD.top + PLOT_H - (v / top) * PLOT_H;
  const tx = (time: number) => PAD.left + ((time - from) / (to - from)) * plotW;

  // Lines break where there's no data rather than joining across the gap.
  const segments: number[][] = [];
  let run: number[] = [];
  points.forEach((p, i) => {
    if (p.players === null) {
      if (run.length) segments.push(run);
      run = [];
    } else run.push(i);
  });
  if (run.length) segments.push(run);
  const lastIdx = [...points.keys()].reverse().find((i) => points[i]!.players !== null);

  const indexAt = (clientX: number, el: Element) => {
    const rect = el.getBoundingClientRect();
    const i = Math.floor((clientX - rect.left - PAD.left) / bw);
    return Math.max(0, Math.min(n - 1, i));
  };
  const pointer = {
    onPointerMove: (e: React.PointerEvent<Element>) => {
      setKeyboard(false);
      setActive(indexAt(e.clientX, e.currentTarget));
    },
    onPointerLeave: () => setActive(null),
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const cur = active ?? lastIdx ?? n - 1;
    const next =
      e.key === 'ArrowLeft'
        ? cur - 1
        : e.key === 'ArrowRight'
          ? cur + 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    setKeyboard(true);
    setActive(Math.max(0, Math.min(n - 1, next)));
  };

  const activePoint = active !== null ? points[active] : null;
  const readout = activePoint ? describe(activePoint, fmt.point, t) : '';
  const rangeName = t(`rangeLong.${history.range}`);

  return (
    <div className="flex flex-col gap-4">
      <figure className="flex flex-col gap-2 rounded-ui-lg border border-border bg-surface p-4">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-bold">{t('playersChart')}</span>
          <span className="text-xs text-muted">{t('localTime')}</span>
        </figcaption>
        <div
          ref={ref}
          role="group"
          tabIndex={0}
          aria-label={t('chartKeys', { range: rangeName })}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setKeyboard(true);
            setActive((a) => a ?? lastIdx ?? n - 1);
          }}
          onBlur={() => {
            setActive(null);
            setKeyboard(false);
          }}
          className="relative rounded-ui-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          style={{ height: PLOT_H + PAD.top + AXIS_H }}
        >
          {width > 0 && (
            <svg
              width={width}
              height={PLOT_H + PAD.top + AXIS_H}
              aria-hidden
              className="block touch-none select-none"
              {...pointer}
            >
              {ticks.map((v) => (
                <g key={v}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={y(v)}
                    y2={y(v)}
                    stroke="var(--c-border)"
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  <text
                    x={PAD.left - 8}
                    y={y(v)}
                    dy="0.35em"
                    textAnchor="end"
                    className="fill-muted text-[11px] tabular-nums"
                  >
                    {num.format(v)}
                  </text>
                </g>
              ))}
              {xTicks(history.range, from, to).map((time) => (
                <text
                  key={time}
                  x={tx(time)}
                  y={PAD.top + PLOT_H + 17}
                  textAnchor="middle"
                  className="fill-muted text-[11px] tabular-nums"
                >
                  {fmt.tick.format(time)}
                </text>
              ))}
              {segments.map((seg) => {
                const line = seg
                  .map((i, k) => `${k ? 'L' : 'M'}${x(i)},${y(points[i]!.players!)}`)
                  .join('');
                const area = `${line}L${x(seg[seg.length - 1]!)},${y(0)}L${x(seg[0]!)},${y(0)}Z`;
                return (
                  <g key={seg[0]}>
                    <path d={area} fill="var(--mx-chart-1)" opacity={0.1} />
                    {seg.length > 1 ? (
                      <path
                        d={line}
                        fill="none"
                        stroke="var(--mx-chart-1)"
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    ) : (
                      <circle
                        cx={x(seg[0]!)}
                        cy={y(points[seg[0]!]!.players!)}
                        r={4}
                        fill="var(--mx-chart-1)"
                      />
                    )}
                  </g>
                );
              })}
              {lastIdx !== undefined && (
                <g>
                  <circle
                    cx={x(lastIdx)}
                    cy={y(points[lastIdx]!.players!)}
                    r={4}
                    fill="var(--mx-chart-1)"
                    stroke="var(--c-surface)"
                    strokeWidth={2}
                  />
                  <text
                    x={x(lastIdx) + 8}
                    y={y(points[lastIdx]!.players!)}
                    dy="0.35em"
                    className="fill-fg text-xs font-semibold tabular-nums"
                  >
                    {num.format(points[lastIdx]!.players!)}
                  </text>
                </g>
              )}
              {active !== null && (
                <g>
                  <line
                    x1={x(active)}
                    x2={x(active)}
                    y1={PAD.top}
                    y2={PAD.top + PLOT_H}
                    stroke="var(--c-text-muted)"
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  {activePoint?.players !== null && activePoint?.players !== undefined && (
                    <circle
                      cx={x(active)}
                      cy={y(activePoint.players)}
                      r={4}
                      fill="var(--mx-chart-1)"
                      stroke="var(--c-surface)"
                      strokeWidth={2}
                    />
                  )}
                </g>
              )}
            </svg>
          )}
          {activePoint && active !== null && (
            <Tooltip point={activePoint} fmt={fmt.point} left={x(active)} width={width} />
          )}
          {/* Keyboard readers hear the value under the crosshair. */}
          <p className="sr-only" aria-live="polite">
            {keyboard ? readout : ''}
          </p>
        </div>
      </figure>

      <figure className="flex flex-col gap-2 rounded-ui-lg border border-border bg-surface p-4">
        <figcaption className="font-bold">{t('uptimeChart')}</figcaption>
        {width > 0 && (
          <svg
            width={width}
            height={STRIP_H}
            aria-hidden
            className="block touch-none select-none"
            {...pointer}
          >
            {points.map((p, i) => {
              const gap = bw > 5 ? 2 : bw > 2.5 ? 1 : 0;
              return (
                <rect
                  key={p.t}
                  x={PAD.left + i * bw + gap / 2}
                  y={0}
                  width={Math.max(0.5, bw - gap)}
                  height={STRIP_H}
                  rx={bw > 5 ? 2 : 0}
                  fill={UPTIME_FILL[uptimeState(p.uptime)]}
                  opacity={active === null || active === i ? 1 : 0.55}
                />
              );
            })}
          </svg>
        )}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {(
            [
              ['up', CircleCheck],
              ['partial', CircleAlert],
              ['down', CircleX],
              ['none', Minus],
            ] as const
          ).map(([k, Icon]) => (
            <li key={k} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-3 rounded-sm"
                style={{ background: UPTIME_FILL[k] }}
              />
              <Icon aria-hidden className="size-3.5" />
              {t(`uptimeState.${k}`)}
            </li>
          ))}
        </ul>
      </figure>

      <details className="rounded-ui-lg border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          {t('showTable')}
        </summary>
        <div
          // Scrollable, so it must be reachable (and scrollable) from the keyboard.
          tabIndex={0}
          role="region"
          aria-label={t('tableCaption', { range: rangeName })}
          className="max-h-96 overflow-auto border-t border-border focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <table className="w-full text-sm">
            <caption className="sr-only">{t('tableCaption', { range: rangeName })}</caption>
            <thead className="sticky top-0 bg-surface-2 text-start">
              <tr>
                <th scope="col" className="px-4 py-2 text-start font-semibold">
                  {t('time')}
                </th>
                <th scope="col" className="px-4 py-2 text-end font-semibold">
                  {t('avgPlayers')}
                </th>
                <th scope="col" className="px-4 py-2 text-end font-semibold">
                  {t('peakPlayers')}
                </th>
                <th scope="col" className="px-4 py-2 text-end font-semibold">
                  {t('uptime')}
                </th>
              </tr>
            </thead>
            <tbody>
              {width > 0 &&
                [...points].reverse().map((p) => (
                  <tr key={p.t} className="border-t border-border">
                    <th scope="row" className="px-4 py-1.5 text-start font-normal">
                      {fmt.point.format(new Date(p.t))}
                    </th>
                    <td className="px-4 py-1.5 text-end tabular-nums">
                      {p.players === null ? '—' : num.format(p.players)}
                    </td>
                    <td className="px-4 py-1.5 text-end tabular-nums">
                      {p.peak === null ? '—' : num.format(p.peak)}
                    </td>
                    <td className="px-4 py-1.5 text-end tabular-nums">
                      {p.uptime === null ? t('noData') : pct(p.uptime)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function describe(
  p: HistoryPoint,
  fmt: Intl.DateTimeFormat,
  t: ReturnType<typeof useTranslations<'serverPage'>>,
): string {
  const when = fmt.format(new Date(p.t));
  if (p.uptime === null) return `${when}: ${t('noData')}`;
  const players =
    p.players === null
      ? t('offline')
      : t('playersReadout', { avg: num.format(p.players), peak: num.format(p.peak ?? 0) });
  return `${when}: ${players}. ${t('uptimeReadout', { uptime: pct(p.uptime) })}`;
}

function Tooltip({
  point,
  fmt,
  left,
  width,
}: {
  point: HistoryPoint;
  fmt: Intl.DateTimeFormat;
  left: number;
  width: number;
}) {
  const t = useTranslations('serverPage');
  const flip = left > width - 180;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-2 z-10 flex min-w-40 flex-col gap-1 rounded-ui border border-border bg-surface px-3 py-2 text-xs shadow-lg"
      style={flip ? { right: width - left + 10 } : { left: left + 10 }}
    >
      <span className="text-muted">{fmt.format(new Date(point.t))}</span>
      {point.uptime === null ? (
        <span className="font-semibold">{t('noData')}</span>
      ) : (
        <>
          <span className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-3 rounded-full bg-[var(--mx-chart-1)]" />
            <strong className="text-sm tabular-nums">
              {point.players === null ? t('offline') : num.format(point.players)}
            </strong>
            <span className="text-muted">{t('avgPlayersShort')}</span>
          </span>
          {point.peak !== null && (
            <span className="text-muted">
              {t('peakShort')} <strong className="text-fg tabular-nums">{point.peak}</strong>
            </span>
          )}
          <span className="text-muted">
            {t('uptime')} <strong className="text-fg tabular-nums">{pct(point.uptime)}</strong>
          </span>
        </>
      )}
    </div>
  );
}
