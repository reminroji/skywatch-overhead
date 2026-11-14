import { X } from 'lucide-react';
import type { Aircraft, ObserverLocation } from '../types/airspace';
import { craftAccentHex, craftKindLabel, formatAltitude } from '../utils/airspaceFormat';

interface SkyCompassModalProps {
  observer: ObserverLocation;
  aircraft: Aircraft[];
  selectedHex: string | null;
  onSelectAircraft: (hex: string) => void;
  onClose: () => void;
}

export function SkyCompassModal({
  observer,
  aircraft,
  selectedHex,
  onSelectAircraft,
  onClose,
}: SkyCompassModalProps) {
  const airborne = aircraft.filter((a) => !a.onGround).slice(0, 60);
  const cx = 210;
  const cy = 210;
  const maxR = 175;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Overhead Sky Compass"
    >
      <div className="w-full max-w-2xl bg-[#0B0E17] border border-slate-800 rounded-md shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              Overhead Sky Dome Compass
            </h2>
            <p className="text-xs text-slate-400">
              Center is 90° straight above {observer.label}; outer ring is 0° horizon.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sky compass"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-[1fr_210px] gap-5 items-center">
          <svg viewBox="0 0 420 420" className="w-full max-w-[380px] mx-auto">
            {/* Elevation concentric rings: 0° (horizon), 30°, 60°, 90° (zenith) */}
            {[1, 2 / 3, 1 / 3].map((scale, i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={maxR * scale}
                fill={i === 0 ? '#07090E' : 'none'}
                stroke="#1E293B"
                strokeWidth="1"
                strokeDasharray={i > 0 ? '3 3' : undefined}
              />
            ))}

            {/* Cardinal crosshairs */}
            <line x1={cx} y1={cy - maxR} x2={cx} y2={cy + maxR} stroke="#1E293B" strokeWidth="1" />
            <line x1={cx - maxR} y1={cy} x2={cx + maxR} y2={cy} stroke="#1E293B" strokeWidth="1" />

            {/* Cardinal & elevation labels */}
            <text x={cx} y={cy - maxR - 10} textAnchor="middle" fill="#94A3B8" fontSize="11" fontFamily="JetBrains Mono, monospace">
              N (0°)
            </text>
            <text x={cx + maxR + 14} y={cy + 4} textAnchor="start" fill="#94A3B8" fontSize="11" fontFamily="JetBrains Mono, monospace">
              E
            </text>
            <text x={cx} y={cy + maxR + 18} textAnchor="middle" fill="#94A3B8" fontSize="11" fontFamily="JetBrains Mono, monospace">
              S
            </text>
            <text x={cx - maxR - 14} y={cy + 4} textAnchor="end" fill="#94A3B8" fontSize="11" fontFamily="JetBrains Mono, monospace">
              W
            </text>
            <text x={cx + 5} y={cy - (maxR * 2) / 3 - 4} fill="#475569" fontSize="9" fontFamily="JetBrains Mono, monospace">
              30°
            </text>
            <text x={cx + 5} y={cy - maxR / 3 - 4} fill="#475569" fontSize="9" fontFamily="JetBrains Mono, monospace">
              60°
            </text>
            <circle cx={cx} cy={cy} r="3" fill="#06B6D4" />

            {/* Aircraft plotted by azimuth bearing & zenith angle */}
            {airborne.map((ac) => {
              const r = ((90 - ac.elevationAngleDeg) / 90) * maxR;
              const rad = ((ac.bearingDeg - 90) * Math.PI) / 180;
              const px = cx + Math.cos(rad) * r;
              const py = cy + Math.sin(rad) * r;
              const color = craftAccentHex(ac.craftKind);
              const isSelected = ac.hex === selectedHex;

              return (
                <g
                  key={ac.hex}
                  className="cursor-pointer"
                  onClick={() => {
                    onSelectAircraft(ac.hex);
                    onClose();
                  }}
                >
                  <circle
                    cx={px}
                    cy={py}
                    r={isSelected ? 7 : 4.5}
                    fill={color}
                    stroke={isSelected ? '#FFFFFF' : '#07090E'}
                    strokeWidth={isSelected ? 2 : 1}
                  />
                  {(ac.elevationAngleDeg >= 30 || isSelected || ac.craftKind === 'helicopter') && (
                    <text
                      x={px + 8}
                      y={py + 3}
                      fill="#E2E8F0"
                      fontSize="9.5"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {ac.callsign}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          <div className="space-y-3 text-xs">
            <div className="font-medium text-slate-200">Highest Overhead</div>
            {airborne.length === 0 ? (
              <p className="text-slate-400">No airborne traffic in current radius.</p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto telemetry-scroll pr-1">
                {airborne.slice(0, 8).map((ac) => (
                  <li key={ac.hex}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectAircraft(ac.hex);
                        onClose();
                      }}
                      className="w-full text-left px-2.5 py-2 rounded border border-slate-800 hover:border-cyan-500/50 bg-[#07090E] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between font-mono-tabular">
                        <span className="font-semibold text-white">{ac.callsign}</span>
                        <span style={{ color: craftAccentHex(ac.craftKind) }}>
                          {ac.elevationAngleDeg}° up
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {craftKindLabel(ac.craftKind)} · {ac.compassDir} ·{' '}
                        {formatAltitude(ac.altitudeFt, ac.onGround)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
