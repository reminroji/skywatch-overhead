import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Camera,
  Compass,
  ExternalLink,
  Navigation2,
  PlaneLanding,
  PlaneTakeoff,
  X,
} from 'lucide-react';
import type { Aircraft, AircraftMetadata, FlightRouteInfo } from '../types/airspace';
import {
  classifyFlightProfile,
  craftAccentHex,
  craftKindLabel,
  describeOverheadSightline,
  formatAltitude,
  formatCoord,
  formatVerticalRate,
  haversineNm,
  resolveTypeName,
} from '../utils/airspaceFormat';
import { AircraftSilhouette } from './AircraftIcons';
import { SkyElevationDiagram } from './SkyElevationDiagram';
import { TelemetryTrendChart } from './TelemetryTrendChart';

interface AircraftInspectorProps {
  aircraft: Aircraft;
  onRouteResolved: (hex: string, route: FlightRouteInfo | null) => void;
  onClose: () => void;
}

export function AircraftInspector({
  aircraft,
  onRouteResolved,
  onClose,
}: AircraftInspectorProps) {
  const [meta, setMeta] = useState<AircraftMetadata | null>(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [usedFallbackPhoto, setUsedFallbackPhoto] = useState(false);

  const hintModel = resolveTypeName(aircraft.aircraftType, aircraft.aircraftDesc);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingMeta(true);
    setMeta(null);
    setPhotoSrc(null);
    setUsedFallbackPhoto(false);

    const params = new URLSearchParams({
      hex: aircraft.hex,
      callsign: aircraft.callsign,
      model: hintModel,
    });

    fetch(`/api/aircraft-meta?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AircraftMetadata | null) => {
        if (!cancelled) {
          setMeta(data);
          setPhotoSrc(data?.photo?.url || null);
          setIsLoadingMeta(false);
          if (data?.route) {
            onRouteResolved(aircraft.hex, data.route);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoadingMeta(false);
      });

    return () => {
      cancelled = true;
    };
  }, [aircraft.hex, aircraft.callsign, hintModel, onRouteResolved]);

  const accent = craftAccentHex(aircraft.craftKind);
  const vrate = formatVerticalRate(aircraft.verticalRateFpm);
  const activeRoute = meta?.route || aircraft.route;
  const displayReg = meta?.registration || aircraft.registration;
  const profile = classifyFlightProfile(aircraft, meta, activeRoute);

  // Compute great-circle route progress if origin & destination are available
  let progressPct = 0;
  let flownNm = 0;
  let remainingNm = 0;
  let totalNm = 0;
  if (activeRoute) {
    const { origin, destination } = activeRoute;
    flownNm = haversineNm(origin.lat, origin.lng, aircraft.lat, aircraft.lon);
    remainingNm = haversineNm(aircraft.lat, aircraft.lon, destination.lat, destination.lng);
    totalNm = Math.max(1, haversineNm(origin.lat, origin.lng, destination.lat, destination.lng));
    progressPct = Math.max(2, Math.min(98, Math.round((flownNm / (flownNm + remainingNm)) * 100)));
  }

  const handlePhotoError = () => {
    if (!usedFallbackPhoto && meta?.photo?.fallbackUrl && photoSrc !== meta.photo.fallbackUrl) {
      setUsedFallbackPhoto(true);
      setPhotoSrc(meta.photo.fallbackUrl);
    } else {
      setPhotoSrc(null);
    }
  };

  const primaryOwner = profile.registeredOwner || profile.operatingCompany;
  const distinctOperator =
    profile.operatingCompany &&
    profile.registeredOwner &&
    profile.operatingCompany.toLowerCase() !== profile.registeredOwner.toLowerCase()
      ? profile.operatingCompany
      : null;

  return (
    <aside
      aria-label="Selected aircraft telemetry"
      className="w-full sm:w-[410px] bg-[#0B0E17]/96 border border-slate-800 rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-110px)]"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <AircraftSilhouette kind={aircraft.craftKind} color={accent} size={16} />
            <span style={{ color: accent }} className="font-medium">
              {craftKindLabel(aircraft.craftKind)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular uppercase">{aircraft.hex}</span>
            {displayReg && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular text-slate-300">{displayReg}</span>
              </>
            )}
          </div>

          <div className="mt-1 flex items-baseline gap-2">
            <h2 className="font-display text-xl font-bold tracking-tight text-white truncate">
              {aircraft.callsign}
            </h2>
            {activeRoute?.callsignIata && (
              <span className="font-mono-tabular text-xs text-slate-400">
                ({activeRoute.callsignIata})
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 truncate">{profile.modelDisplay}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close telemetry inspector"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="p-4 space-y-3.5 overflow-y-auto telemetry-scroll">
        {/* Emergency Squawk Alert */}
        {(aircraft.emergency ||
          aircraft.squawk === '7700' ||
          aircraft.squawk === '7600' ||
          aircraft.squawk === '7500') && (
          <div className="flex items-center gap-2 px-3 py-2 border border-rose-500/50 bg-rose-950/40 rounded text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              Emergency Squawk {aircraft.squawk || ''} {aircraft.emergency || ''}
            </span>
          </div>
        )}

        {/* Aircraft Photograph */}
        <div className="relative h-40 w-full rounded-md overflow-hidden border border-slate-800 bg-[#07090E]">
          {isLoadingMeta && !photoSrc ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-500 animate-pulse">
              <Camera className="w-5 h-5" />
              <span className="text-[11px]">Loading aircraft photograph...</span>
            </div>
          ) : photoSrc ? (
            <>
              <img
                src={photoSrc}
                alt={`${profile.modelDisplay} (${displayReg || aircraft.callsign})`}
                referrerPolicy="no-referrer"
                onError={handlePhotoError}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 px-2.5 py-1.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex items-center justify-between gap-2 text-[10px] text-slate-300">
                <span className="truncate">
                  {meta?.photo?.isExactAirframe && !usedFallbackPhoto
                    ? `Exact airframe${meta.photo.photographer ? ` · Photo by ${meta.photo.photographer}` : ''}`
                    : `${profile.modelDisplay} · Reference photo`}
                </span>
                {meta?.photo?.sourceLink && (
                  <a
                    href={meta.photo.sourceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 shrink-0"
                  >
                    <span>{usedFallbackPhoto ? 'Wikimedia' : meta.photo.source}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-slate-500 px-4 text-center">
              <AircraftSilhouette kind={aircraft.craftKind} color={accent} size={40} heading={90} />
              <span className="text-[11px] text-slate-400">
                No airframe photo published for {displayReg || aircraft.hex.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Flight Classification, Model & Ownership Profile */}
        <div className="border border-slate-800 bg-[#07090E] rounded-md p-3 space-y-2 text-xs">
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-400 shrink-0">Flight Type</span>
            <span className={`font-semibold text-right ${profile.categoryToneClass}`}>
              {profile.category}
            </span>
          </div>

          <div className="flex items-start justify-between gap-3 border-t border-slate-800/70 pt-2">
            <span className="text-slate-400 shrink-0">Kind of Flight</span>
            <span className="text-slate-100 text-right">
              {profile.flightKind}
              <span className="text-slate-400"> · {profile.phaseLabel}</span>
            </span>
          </div>

          <div className="flex items-start justify-between gap-3 border-t border-slate-800/70 pt-2">
            <span className="text-slate-400 shrink-0">Aircraft Model</span>
            <span className="text-white font-medium text-right">
              {profile.modelDisplay}
              {profile.icaoTypeCode && (
                <span className="font-mono-tabular text-slate-400 ml-1.5">
                  ({profile.icaoTypeCode})
                </span>
              )}
            </span>
          </div>

          <div className="flex items-start justify-between gap-3 border-t border-slate-800/70 pt-2">
            <span className="text-slate-400 shrink-0 inline-flex items-center gap-1">
              <Building2 className="w-3 h-3 text-slate-500" />
              <span>Owner / Company</span>
            </span>
            <span className="text-slate-100 font-medium text-right">
              {primaryOwner ? (
                <>
                  {primaryOwner}
                  {profile.ownerCountry && (
                    <span className="block text-[11px] font-normal text-slate-400">
                      Registered in {profile.ownerCountry}
                    </span>
                  )}
                </>
              ) : isLoadingMeta ? (
                <span className="text-slate-500 font-normal">Looking up owner...</span>
              ) : (
                <span className="text-slate-400 font-normal">Private / Unlisted Registry</span>
              )}
            </span>
          </div>

          {distinctOperator && (
            <div className="flex items-start justify-between gap-3 border-t border-slate-800/70 pt-2">
              <span className="text-slate-400 shrink-0">Operating Airline</span>
              <span className="text-cyan-300 font-medium text-right">{distinctOperator}</span>
            </div>
          )}
        </div>

        {/* Departure & Arrival Route Panel */}
        {activeRoute ? (
          <div className="border border-slate-800 bg-[#07090E] rounded-md p-3 space-y-2.5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
              {/* Departure */}
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400">
                  <PlaneTakeoff className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span>Departure</span>
                </div>
                <div className="mt-0.5 font-display text-xl font-bold text-white leading-tight">
                  {activeRoute.origin.iata || activeRoute.origin.icao}
                </div>
                <div className="text-xs font-medium text-slate-200 truncate">
                  {activeRoute.origin.city || activeRoute.origin.icao}
                  {activeRoute.origin.country ? `, ${activeRoute.origin.country}` : ''}
                </div>
                <div className="text-[11px] text-slate-400 truncate" title={activeRoute.origin.name}>
                  {activeRoute.origin.name}
                </div>
              </div>

              <div className="pt-4 text-slate-500 font-mono-tabular text-xs">→</div>

              {/* Arrival */}
              <div className="min-w-0 text-right">
                <div className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wider text-slate-400">
                  <span>Arrival</span>
                  <PlaneLanding className="w-3 h-3 text-amber-400 shrink-0" />
                </div>
                <div className="mt-0.5 font-display text-xl font-bold text-white leading-tight">
                  {activeRoute.destination.iata || activeRoute.destination.icao}
                </div>
                <div className="text-xs font-medium text-slate-200 truncate">
                  {activeRoute.destination.city || activeRoute.destination.icao}
                  {activeRoute.destination.country ? `, ${activeRoute.destination.country}` : ''}
                </div>
                <div
                  className="text-[11px] text-slate-400 truncate"
                  title={activeRoute.destination.name}
                >
                  {activeRoute.destination.name}
                </div>
              </div>
            </div>

            {/* Great-Circle Route Progress */}
            <div className="space-y-1 pt-1">
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono-tabular text-slate-400">
                <span>{Math.round(flownNm)} NM flown</span>
                <span>{Math.round(totalNm)} NM total</span>
                <span>{Math.round(remainingNm)} NM left</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-slate-800 bg-[#07090E] rounded-md px-3 py-2 text-xs text-slate-400">
            {isLoadingMeta
              ? 'Looking up departure and arrival airports...'
              : 'No filed commercial route available for this callsign.'}
          </div>
        )}

        {/* Sightline Summary */}
        <div className="flex items-center gap-2 text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded px-3 py-2">
          <Compass className="w-4 h-4 shrink-0" />
          <span>{describeOverheadSightline(aircraft)}</span>
        </div>

        <SkyElevationDiagram aircraft={aircraft} />

        <TelemetryTrendChart
          key={aircraft.hex}
          trail={aircraft.trail}
          currentLat={aircraft.lat}
          currentLon={aircraft.lon}
          currentAltFt={aircraft.altitudeFt}
          currentSpeedKts={aircraft.groundSpeedKts}
          onGround={aircraft.onGround}
        />

        {/* Primary Telemetry Grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-800/90 pt-3">
          <div>
            <div className="text-[11px] text-slate-400">Baro Altitude</div>
            <div className="font-mono-tabular text-base font-semibold text-white">
              {formatAltitude(aircraft.altitudeFt, aircraft.onGround)}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-400">Ground Speed</div>
            <div className="font-mono-tabular text-base font-semibold text-white">
              {aircraft.groundSpeedKts} <span className="text-xs font-normal text-slate-400">kt</span>
              <span className="text-xs font-normal text-slate-500 ml-1.5">
                ({Math.round(aircraft.groundSpeedKts * 1.15078)} mph)
              </span>
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-400">Vertical Rate</div>
            <div className={`font-mono-tabular text-sm font-semibold ${vrate.toneClass}`}>
              {vrate.symbol} {vrate.text}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-400">Track / Heading</div>
            <div className="font-mono-tabular text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <Navigation2
                className="w-3.5 h-3.5 text-cyan-400"
                style={{ transform: `rotate(${aircraft.heading}deg)` }}
              />
              <span>{aircraft.heading}°</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-400">Distance</div>
            <div className="font-mono-tabular text-sm font-semibold text-slate-100">
              {aircraft.distanceNm.toFixed(2)} NM{' '}
              <span className="text-xs font-normal text-slate-400">
                ({(aircraft.distanceNm * 1.852).toFixed(1)} km)
              </span>
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-400">Squawk / Cat</div>
            <div className="font-mono-tabular text-sm font-semibold text-slate-100">
              {aircraft.squawk || '—'} · {aircraft.categoryCode || '—'}
            </div>
          </div>
        </div>

        {/* Position & Signal Metadata */}
        <div className="border-t border-slate-800/90 pt-3 flex items-center justify-between text-[11px] font-mono-tabular text-slate-400">
          <span>{formatCoord(aircraft.lat, aircraft.lon)}</span>
          <span>
            {aircraft.rssi !== null ? `${aircraft.rssi} dBFS` : `${aircraft.messages} msgs`}
          </span>
        </div>
      </div>
    </aside>
  );
}
