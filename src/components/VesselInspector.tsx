import { Anchor, Compass, Navigation2, Waves, Wind, X } from 'lucide-react';
import type { Vessel } from '../types/airspace';
import {
  formatCoord,
  formatTimeAgo,
  vesselAccentHex,
  vesselKindLabel,
} from '../utils/airspaceFormat';
import { VesselSilhouette } from './AircraftIcons';

interface VesselInspectorProps {
  vessel: Vessel;
  onClose: () => void;
}

export function VesselInspector({ vessel, onClose }: VesselInspectorProps) {
  const accent = vesselAccentHex(vessel.vesselKind);
  const hasWeatherTelemetry =
    vessel.windSpeedKts !== null ||
    vessel.waveHeightFt !== null ||
    vessel.waterTempF !== null ||
    vessel.pressureIn !== null;

  return (
    <aside
      aria-label="Selected vessel telemetry"
      className="w-full sm:w-[390px] bg-[#0B0E17]/96 border border-slate-800 rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-110px)]"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <VesselSilhouette
              kind={vessel.vesselKind}
              color={accent}
              size={16}
              heading={vessel.heading ?? vessel.cogDeg}
            />
            <span style={{ color: accent }} className="font-medium">
              {vesselKindLabel(vessel.vesselKind)}
            </span>
            {vessel.mmsi && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">MMSI {vessel.mmsi}</span>
              </>
            )}
            {vessel.callsign && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular text-slate-300">{vessel.callsign}</span>
              </>
            )}
          </div>

          <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-white truncate">
            {vessel.name}
          </h2>
          <p className="text-xs text-slate-300 truncate">
            {vessel.oceanRegion}
            {vessel.imo ? ` · IMO ${vessel.imo}` : ''}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close vessel inspector"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 overflow-y-auto telemetry-scroll">
        {/* Destination / Route Basin Card */}
        <div className="border border-slate-800 bg-[#07090E] rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Anchor className="w-3.5 h-3.5 text-teal-400" />
              <span>Maritime Route / Destination</span>
            </span>
            <span className="font-mono-tabular text-slate-300">{vessel.source}</span>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <div className="font-display text-base font-bold text-white truncate">
                {vessel.destination || vessel.oceanRegion}
              </div>
              <div className="text-xs text-slate-400 truncate">
                {vessel.destination
                  ? `Reported AIS destination · Currently in ${vessel.oceanRegion}`
                  : `Cruising active shipping lane corridor in ${vessel.oceanRegion}`}
              </div>
            </div>
          </div>
        </div>

        {/* Relative Bearing */}
        <div className="flex items-center gap-2 text-xs text-teal-300 bg-teal-500/10 border border-teal-500/30 rounded px-3 py-2">
          <Compass className="w-4 h-4 shrink-0" />
          <span className="font-mono-tabular">
            {vessel.distanceNm.toLocaleString()} NM {vessel.compassDir} ({vessel.bearingDeg}°) from center
          </span>
        </div>

        {/* Navigation Telemetry Grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-800/90 pt-3">
          <div>
            <div className="text-[11px] text-slate-400">Speed Over Ground</div>
            <div className="font-mono-tabular text-base font-semibold text-white">
              {vessel.sogKts !== null ? (
                <>
                  {vessel.sogKts} <span className="text-xs font-normal text-slate-400">kt</span>
                  <span className="text-xs font-normal text-slate-500 ml-1.5">
                    ({Math.round(vessel.sogKts * 1.852)} km/h)
                  </span>
                </>
              ) : (
                <span className="text-sm text-slate-400 font-normal">VOS Position</span>
              )}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-400">Course / Heading</div>
            <div className="font-mono-tabular text-sm font-semibold text-slate-100 flex items-center gap-1.5 mt-0.5">
              {vessel.heading !== null || vessel.cogDeg !== null ? (
                <>
                  <Navigation2
                    className="w-3.5 h-3.5 text-teal-400"
                    style={{ transform: `rotate(${vessel.heading ?? vessel.cogDeg ?? 0}deg)` }}
                  />
                  <span>
                    {vessel.cogDeg !== null ? `${vessel.cogDeg}° COG` : ''}
                    {vessel.heading !== null && vessel.heading !== vessel.cogDeg
                      ? ` · ${vessel.heading}° HDG`
                      : ''}
                  </span>
                </>
              ) : (
                <span className="text-slate-400 font-normal">Not transmitted</span>
              )}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-400">Nav Status</div>
            <div className="text-xs font-medium text-slate-200 mt-0.5">
              {vessel.navStatus || 'Under way'}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-400">Draught / AIS Type</div>
            <div className="font-mono-tabular text-sm font-semibold text-slate-100 mt-0.5">
              {vessel.draughtM !== null ? `${vessel.draughtM} m` : '—'} ·{' '}
              {vessel.shipTypeCode ?? 'VOS'}
            </div>
          </div>
        </div>

        {/* Marine Weather Telemetry (when reported by Voluntary Observing Ships) */}
        {hasWeatherTelemetry && (
          <div className="border-t border-slate-800/90 pt-3 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Waves className="w-3.5 h-3.5 text-sky-400" />
              <span>At-Sea Marine Conditions</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <div className="text-slate-400 inline-flex items-center gap-1">
                  <Wind className="w-3 h-3" />
                  <span>Wind</span>
                </div>
                <div className="font-mono-tabular text-slate-100 font-medium">
                  {vessel.windSpeedKts !== null ? `${vessel.windSpeedKts} kt` : '—'}
                  {vessel.windDirDeg !== null ? ` @ ${vessel.windDirDeg}°` : ''}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Wave Height</div>
                <div className="font-mono-tabular text-slate-100 font-medium">
                  {vessel.waveHeightFt !== null ? `${vessel.waveHeightFt} ft` : '—'}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Sea Surface Temp</div>
                <div className="font-mono-tabular text-slate-100 font-medium">
                  {vessel.waterTempF !== null ? `${vessel.waterTempF}°F` : '—'}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Baro Pressure</div>
                <div className="font-mono-tabular text-slate-100 font-medium">
                  {vessel.pressureIn !== null ? `${vessel.pressureIn} inHg` : '—'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Position & Timestamp Metadata */}
        <div className="border-t border-slate-800/90 pt-3 flex items-center justify-between text-[11px] font-mono-tabular text-slate-400">
          <span>{formatCoord(vessel.lat, vessel.lon)}</span>
          <span>Updated {formatTimeAgo(vessel.reportedAt)}</span>
        </div>
      </div>
    </aside>
  );
}
