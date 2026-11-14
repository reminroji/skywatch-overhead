import type { Aircraft } from '../types/airspace';
import { craftAccentHex } from '../utils/airspaceFormat';

interface SkyElevationDiagramProps {
  aircraft: Aircraft;
}

export function SkyElevationDiagram({ aircraft }: SkyElevationDiagramProps) {
  const angle = Math.max(0, Math.min(90, aircraft.elevationAngleDeg));
  const accent = craftAccentHex(aircraft.craftKind);

  // Polar plot in quarter-arc: observer at (28, 108), radius = 84
  const ox = 28;
  const oy = 108;
  const r = 84;
  const rad = (angle * Math.PI) / 180;
  const ax = ox + Math.cos(rad) * r;
  const ay = oy - Math.sin(rad) * r;

  // Arc path for angle wedge
  const arcR = 28;
  const arcX = ox + Math.cos(rad) * arcR;
  const arcY = oy - Math.sin(rad) * arcR;

  return (
    <div className="border border-slate-800 bg-[#07090E] rounded-md p-3">
      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
        <span>Sky Sightline Elevation</span>
        <span className="font-mono-tabular text-slate-200">
          {aircraft.compassDir} ({aircraft.bearingDeg}°) · {angle}° up
        </span>
      </div>

      <svg viewBox="0 0 240 124" className="w-full h-28" role="img" aria-label={`Aircraft elevation ${angle} degrees above horizon`}>
        {/* Horizon & Zenith reference lines */}
        <line x1={ox} y1={oy} x2={224} y2={oy} stroke="#334155" strokeWidth="1" />
        <line x1={ox} y1={oy} x2={ox} y2={14} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />

        {/* Sky dome arc */}
        <path
          d={`M ${ox + r} ${oy} A ${r} ${r} 0 0 0 ${ox} ${oy - r}`}
          fill="none"
          stroke="#1E293B"
          strokeWidth="1.2"
          strokeDasharray="3 3"
        />

        {/* Angle wedge */}
        {angle > 2 && (
          <path
            d={`M ${ox + arcR} ${oy} A ${arcR} ${arcR} 0 0 0 ${arcX} ${arcY}`}
            fill="none"
            stroke={accent}
            strokeWidth="1.5"
            opacity="0.7"
          />
        )}

        {/* Sightline vector */}
        <line
          x1={ox}
          y1={oy}
          x2={ax}
          y2={ay}
          stroke={accent}
          strokeWidth="1.8"
          strokeDasharray="4 3"
        />

        {/* Ground distance projection */}
        <line
          x1={ax}
          y1={ay}
          x2={ax}
          y2={oy}
          stroke="#475569"
          strokeWidth="1"
          strokeDasharray="2 2"
        />

        {/* Observer point */}
        <circle cx={ox} cy={oy} r="4" fill="#06B6D4" />
        <text x={ox - 4} y={oy + 13} fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono, monospace">
          YOU
        </text>

        {/* Aircraft marker */}
        <circle cx={ax} cy={ay} r="5" fill={accent} />
        <circle cx={ax} cy={ay} r="9" fill={accent} opacity="0.18" />

        {/* Labels */}
        <text x={ox + 6} y={20} fill="#64748B" fontSize="9" fontFamily="JetBrains Mono, monospace">
          90° ZENITH
        </text>
        <text x={176} y={oy + 13} fill="#64748B" fontSize="9" fontFamily="JetBrains Mono, monospace">
          0° HORIZON
        </text>
        <text
          x={Math.min(ax + 10, 168)}
          y={Math.max(ay - 6, 18)}
          fill="#F8FAFC"
          fontSize="10"
          fontWeight="600"
          fontFamily="JetBrains Mono, monospace"
        >
          {aircraft.onGround ? 'GND' : `${aircraft.altitudeFt.toLocaleString()} ft`}
        </text>
        <text
          x={148}
          y={44}
          fill={accent}
          fontSize="16"
          fontWeight="700"
          fontFamily="JetBrains Mono, monospace"
        >
          {angle}°
        </text>
        <text x={148} y={58} fill="#94A3B8" fontSize="9.5" fontFamily="IBM Plex Sans, sans-serif">
          {aircraft.distanceNm.toFixed(1)} NM away
        </text>
      </svg>
    </div>
  );
}
