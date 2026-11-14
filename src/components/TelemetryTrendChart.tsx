import { useId, useMemo, useState, type PointerEvent } from 'react';
import type { TrailPoint } from '../types/airspace';

interface TelemetryTrendChartProps {
  trail: TrailPoint[];
  currentLat: number;
  currentLon: number;
  currentAltFt: number;
  currentSpeedKts: number;
  onGround: boolean;
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function formatCompactAlt(ft: number): string {
  if (ft >= 10000) return `${(ft / 1000).toFixed(1)}k`;
  if (ft >= 1000) return `${(ft / 1000).toFixed(2).replace(/\.00$/, '')}k`;
  return `${Math.round(ft)}`;
}

function formatRelativeAge(msAgo: number): string {
  const sec = Math.max(0, Math.round(msAgo / 1000));
  if (sec < 60) return `-${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem === 0 ? `-${min}m` : `-${min}m ${rem}s`;
}

function formatClockTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function computePaddedRange(values: number[], minSpan: number, clampZeroMin: boolean): [number, number] {
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin;

  if (span < minSpan) {
    const mid = (rawMin + rawMax) / 2;
    let lo = mid - minSpan / 2;
    let hi = mid + minSpan / 2;
    if (clampZeroMin && lo < 0) {
      lo = 0;
      hi = minSpan;
    }
    return [Math.floor(lo), Math.ceil(hi)];
  }

  const pad = span * 0.16;
  const lo = clampZeroMin ? Math.max(0, Math.floor(rawMin - pad)) : Math.floor(rawMin - pad);
  const hi = Math.ceil(rawMax + pad);
  return [lo, Math.max(lo + 1, hi)];
}

export function TelemetryTrendChart({
  trail,
  currentLat,
  currentLon,
  currentAltFt,
  currentSpeedKts,
  onGround,
}: TelemetryTrendChartProps) {
  const gradId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const samples = useMemo(() => {
    const now = Date.now();
    const cutoff = now - FIFTEEN_MINUTES_MS;
    const filtered = trail
      .filter((p) => p.ts >= cutoff)
      .sort((a, b) => a.ts - b.ts);

    if (filtered.length === 0) {
      return [
        {
          lat: currentLat,
          lng: currentLon,
          altFt: currentAltFt,
          gsKts: currentSpeedKts,
          ts: now,
        },
      ];
    }
    return filtered;
  }, [trail, currentLat, currentLon, currentAltFt, currentSpeedKts]);

  const first = samples[0];
  const last = samples[samples.length - 1];
  const spanMs = Math.max(0, last.ts - first.ts);
  const hasTrend = samples.length >= 2 && spanMs > 0;

  const altDelta = last.altFt - first.altFt;
  const speedDelta = last.gsKts - first.gsKts;

  const activeIdx =
    hoverIdx !== null && hoverIdx >= 0 && hoverIdx < samples.length
      ? hoverIdx
      : samples.length - 1;
  const activePoint = samples[activeIdx];
  const isInspecting = hoverIdx !== null && hoverIdx < samples.length;

  // SVG plot geometry
  const W = 340;
  const H = 122;
  const padL = 36;
  const padR = 34;
  const padT = 12;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const [altMin, altMax] = useMemo(
    () => computePaddedRange(samples.map((s) => s.altFt), 400, true),
    [samples]
  );
  const [spdMin, spdMax] = useMemo(
    () => computePaddedRange(samples.map((s) => s.gsKts), 20, true),
    [samples]
  );

  const toX = (ts: number) => {
    if (!hasTrend) return padL + plotW;
    return padL + ((ts - first.ts) / spanMs) * plotW;
  };

  const toAltY = (altFt: number) => {
    const norm = (altFt - altMin) / Math.max(1, altMax - altMin);
    return padT + (1 - norm) * plotH;
  };

  const toSpdY = (gsKts: number) => {
    const norm = (gsKts - spdMin) / Math.max(1, spdMax - spdMin);
    return padT + (1 - norm) * plotH;
  };

  const coords = samples.map((p) => ({
    x: toX(p.ts),
    altY: toAltY(p.altFt),
    spdY: toSpdY(p.gsKts),
  }));

  const altPath =
    coords.length > 1
      ? coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.altY.toFixed(1)}`).join(' ')
      : '';
  const altAreaPath =
    coords.length > 1
      ? `${altPath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
      : '';
  const spdPath =
    coords.length > 1
      ? coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.spdY.toFixed(1)}`).join(' ')
      : '';

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!hasTrend) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const dist = Math.abs(coords[i].x - svgX);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    setHoverIdx(bestIdx);
  };

  const activeCoord = coords[activeIdx];
  const altDeltaText =
    !hasTrend
      ? 'Baseline'
      : altDelta === 0
        ? '0 ft'
        : `${altDelta > 0 ? '+' : ''}${altDelta.toLocaleString()} ft`;
  const spdDeltaText =
    !hasTrend
      ? 'Baseline'
      : speedDelta === 0
        ? '0 kt'
        : `${speedDelta > 0 ? '+' : ''}${speedDelta} kt`;

  const altDeltaTone =
    !hasTrend || altDelta === 0
      ? 'text-slate-400'
      : altDelta > 0
        ? 'text-emerald-400'
        : 'text-amber-400';

  const spdDeltaTone =
    !hasTrend || speedDelta === 0
      ? 'text-slate-400'
      : speedDelta > 0
        ? 'text-cyan-300'
        : 'text-amber-400';

  return (
    <div className="border border-slate-800 bg-[#07090E] rounded-md p-3">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 text-[11px] mb-2">
        <span className="text-slate-300 font-medium">15m Altitude & Speed Trend</span>
        <span className="font-mono-tabular text-slate-400">
          {isInspecting
            ? `@ ${formatClockTime(activePoint.ts)}`
            : hasTrend
              ? `${samples.length} pts · ${formatRelativeAge(spanMs).replace('-', '')} span`
              : '1 sample · updates every 5s'}
        </span>
      </div>

      {/* Synchronized Numeric Legend / Scrubbed Values */}
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="inline-block w-3 h-0.5 bg-cyan-400 shrink-0" aria-hidden="true" />
            <span>Altitude</span>
            <span className={`font-mono-tabular ml-auto ${altDeltaTone}`}>{altDeltaText}</span>
          </div>
          <div className="font-mono-tabular text-sm font-semibold text-white mt-0.5">
            {onGround && activePoint.altFt === 0
              ? 'GND'
              : `${activePoint.altFt.toLocaleString()} `}
            {!(onGround && activePoint.altFt === 0) && (
              <span className="text-[11px] font-normal text-slate-400">ft</span>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span
              className="inline-block w-3 h-0 border-t-2 border-dashed border-amber-400 shrink-0"
              aria-hidden="true"
            />
            <span>Speed</span>
            <span className={`font-mono-tabular ml-auto ${spdDeltaTone}`}>{spdDeltaText}</span>
          </div>
          <div className="font-mono-tabular text-sm font-semibold text-white mt-0.5">
            {activePoint.gsKts}{' '}
            <span className="text-[11px] font-normal text-slate-400">kt</span>
          </div>
        </div>
      </div>

      {/* Dual-Axis Mini Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full h-30 select-none ${hasTrend ? 'cursor-crosshair' : ''}`}
        role="img"
        aria-label={`Altitude and speed trend over ${samples.length} telemetry samples`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal Gridlines */}
        {[0, 0.5, 1].map((t) => {
          const y = padT + t * plotH;
          return (
            <line
              key={t}
              x1={padL}
              y1={y}
              x2={padL + plotW}
              y2={y}
              stroke="#1E293B"
              strokeWidth="1"
              strokeDasharray={t === 1 ? undefined : '2 3'}
            />
          );
        })}

        {/* Left Y-axis Labels (Altitude ft) */}
        <text
          x={padL - 4}
          y={padT + 4}
          textAnchor="end"
          fill="#22D3EE"
          opacity="0.75"
          fontSize="8.5"
          fontFamily="JetBrains Mono, monospace"
        >
          {formatCompactAlt(altMax)}
        </text>
        <text
          x={padL - 4}
          y={padT + plotH + 2}
          textAnchor="end"
          fill="#64748B"
          fontSize="8.5"
          fontFamily="JetBrains Mono, monospace"
        >
          {formatCompactAlt(altMin)}
        </text>

        {/* Right Y-axis Labels (Ground Speed kt) */}
        <text
          x={padL + plotW + 4}
          y={padT + 4}
          textAnchor="start"
          fill="#FBBF24"
          opacity="0.8"
          fontSize="8.5"
          fontFamily="JetBrains Mono, monospace"
        >
          {spdMax}kt
        </text>
        <text
          x={padL + plotW + 4}
          y={padT + plotH + 2}
          textAnchor="start"
          fill="#64748B"
          fontSize="8.5"
          fontFamily="JetBrains Mono, monospace"
        >
          {spdMin}kt
        </text>

        {/* Curves or Single-Sample Baseline */}
        {hasTrend ? (
          <>
            <path d={altAreaPath} fill={`url(#${gradId})`} />
            <path
              d={altPath}
              fill="none"
              stroke="#06B6D4"
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={spdPath}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="1.5"
              strokeDasharray="4 2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Inspection / Live Hairline & Active Sample Nodes */}
            <line
              x1={activeCoord.x}
              y1={padT}
              x2={activeCoord.x}
              y2={padT + plotH}
              stroke={isInspecting ? '#94A3B8' : '#334155'}
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle
              cx={activeCoord.x}
              cy={activeCoord.altY}
              r={isInspecting ? 3.5 : 3}
              fill="#06B6D4"
              stroke="#07090E"
              strokeWidth="1.2"
            />
            <circle
              cx={activeCoord.x}
              cy={activeCoord.spdY}
              r={isInspecting ? 3.5 : 3}
              fill="#F59E0B"
              stroke="#07090E"
              strokeWidth="1.2"
            />
          </>
        ) : (
          <>
            {/* Baseline horizontal guides until 2nd sample arrives */}
            <line
              x1={padL}
              y1={activeCoord.altY}
              x2={activeCoord.x}
              y2={activeCoord.altY}
              stroke="#06B6D4"
              strokeWidth="1"
              strokeOpacity="0.35"
              strokeDasharray="2 3"
            />
            <line
              x1={padL}
              y1={activeCoord.spdY}
              x2={activeCoord.x}
              y2={activeCoord.spdY}
              stroke="#F59E0B"
              strokeWidth="1"
              strokeOpacity="0.35"
              strokeDasharray="2 3"
            />
            <circle cx={activeCoord.x} cy={activeCoord.altY} r="3.5" fill="#06B6D4" />
            <circle cx={activeCoord.x} cy={activeCoord.spdY} r="3.5" fill="#F59E0B" />
            <text
              x={padL + plotW / 2}
              y={padT + plotH / 2 + 3}
              textAnchor="middle"
              fill="#64748B"
              fontSize="9"
              fontFamily="IBM Plex Sans, sans-serif"
            >
              Awaiting next 5s telemetry sweep...
            </text>
          </>
        )}

        {/* X-Axis Time Bounds */}
        <text
          x={padL}
          y={H - 5}
          textAnchor="start"
          fill="#64748B"
          fontSize="8.5"
          fontFamily="JetBrains Mono, monospace"
        >
          {hasTrend ? formatRelativeAge(last.ts - first.ts) : '-15m max'}
        </text>
        {hasTrend && spanMs >= 20000 && (
          <text
            x={padL + plotW / 2}
            y={H - 5}
            textAnchor="middle"
            fill="#475569"
            fontSize="8.5"
            fontFamily="JetBrains Mono, monospace"
          >
            {formatRelativeAge(spanMs / 2)}
          </text>
        )}
        <text
          x={padL + plotW}
          y={H - 5}
          textAnchor="end"
          fill="#94A3B8"
          fontSize="8.5"
          fontFamily="JetBrains Mono, monospace"
        >
          Now
        </text>
      </svg>
    </div>
  );
}
