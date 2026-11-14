import { useEffect, useRef } from 'react';
import {
  AdvancedMarker,
  ColorScheme,
  Map as GoogleMap,
  useMap,
} from '@vis.gl/react-google-maps';
import { CloudRain, Crosshair, Layers, Minus, Navigation, Plus, Route, Thermometer, Wind } from 'lucide-react';
import type {
  Aircraft,
  FlightRouteInfo,
  ObserverLocation,
  ShippingLaneFeature,
  TrackingMode,
  Vessel,
  WeatherLayerMode,
  WeatherOverlaySnapshot,
} from '../types/airspace';
import { craftAccentHex, formatAltitude, vesselAccentHex } from '../utils/airspaceFormat';
import { AircraftSilhouette, VesselSilhouette } from './AircraftIcons';

export type MapStyleMode = 'roadmap' | 'hybrid' | 'satellite' | 'terrain';

interface AirspaceMapProps {
  observer: ObserverLocation;
  radiusNm: number;
  trackingMode: TrackingMode;
  aircraft: Aircraft[];
  vessels: Vessel[];
  shippingLanes: ShippingLaneFeature[];
  showShipRoutes: boolean;
  weatherMode: WeatherLayerMode;
  weatherData: WeatherOverlaySnapshot | null;
  weatherLoading: boolean;
  weatherError: string | null;
  selectedHex: string | null;
  selectedVesselId: string | null;
  selectedRoute: FlightRouteInfo | null;
  followSelected: boolean;
  mapStyleMode: MapStyleMode;
  proximityAlert: {
    enabled: boolean;
    radiusNm: number;
  };
  onChangeMapStyle: (mode: MapStyleMode) => void;
  onToggleShipRoutes: () => void;
  onToggleWeather: () => void;
  onChangeWeatherMode: (mode: WeatherLayerMode) => void;
  onSelectAircraft: (hex: string | null) => void;
  onSelectVessel: (id: string | null) => void;
  onToggleFollow: () => void;
}

function formatWeatherSymbol(code: string): string {
  const base = code.replace(/_(day|night|polartwilight)$/i, '').toLowerCase();
  const labels: Record<string, string> = {
    clearsky: 'Clear Sky',
    fair: 'Fair',
    partlycloudy: 'Partly Cloudy',
    cloudy: 'Overcast',
    fog: 'Fog',
    lightrainshowers: 'Light Showers',
    rainshowers: 'Rain Showers',
    heavyrainshowers: 'Heavy Showers',
    lightrain: 'Light Rain',
    rain: 'Rain',
    heavyrain: 'Heavy Rain',
    lightrainandthunder: 'Light Rain & Thunder',
    rainandthunder: 'Thunderstorm',
    heavyrainandthunder: 'Severe Thunderstorm',
    sleet: 'Sleet',
    lightsleet: 'Light Sleet',
    heavysleet: 'Heavy Sleet',
    lightsnow: 'Light Snow',
    snow: 'Snow',
    heavysnow: 'Heavy Snow',
    snowshowers: 'Snow Showers',
  };
  return labels[base] || base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());
}

function tempAccentHex(tempF: number): string {
  if (tempF <= 32) return '#60A5FA';
  if (tempF <= 55) return '#22D3EE';
  if (tempF <= 72) return '#34D399';
  if (tempF <= 86) return '#FBBF24';
  return '#FB7185';
}

function targetZoomForContext(observer: ObserverLocation, radiusNm: number, trackingMode: TrackingMode): number {
  if (trackingMode === 'sea') {
    const isOceanBasin = /ocean|sea|strait|gulf|cape/i.test(observer.label);
    return isOceanBasin ? 4 : 6;
  }
  return radiusNm <= 5 ? 12 : radiusNm <= 15 ? 11 : radiusNm <= 30 ? 10 : 9;
}

function RadarOverlays({
  observer,
  radiusNm,
  trackingMode,
  selectedAircraft,
  selectedVessel,
  selectedRoute,
  shippingLanes,
  showShipRoutes,
  weatherMode,
  weatherData,
  followSelected,
  proximityAlert,
}: {
  observer: ObserverLocation;
  radiusNm: number;
  trackingMode: TrackingMode;
  selectedAircraft: Aircraft | null;
  selectedVessel: Vessel | null;
  selectedRoute: FlightRouteInfo | null;
  shippingLanes: ShippingLaneFeature[];
  showShipRoutes: boolean;
  weatherMode: WeatherLayerMode;
  weatherData: WeatherOverlaySnapshot | null;
  followSelected: boolean;
  proximityAlert: {
    enabled: boolean;
    radiusNm: number;
  };
}) {
  const map = useMap();
  const outerCircleRef = useRef<google.maps.Circle | null>(null);
  const innerCircleRef = useRef<google.maps.Circle | null>(null);
  const alertCircleRef = useRef<google.maps.Circle | null>(null);
  const trailLineRef = useRef<google.maps.Polyline | null>(null);
  const sightLineRef = useRef<google.maps.Polyline | null>(null);
  const originLegRef = useRef<google.maps.Polyline | null>(null);
  const destLegRef = useRef<google.maps.Polyline | null>(null);
  const laneLinesRef = useRef<google.maps.Polyline[]>([]);
  const lastCenterRef = useRef<string>('');

  // Pan to observer when observer, radius, or mode changes
  useEffect(() => {
    if (!map) return;
    const key = `${observer.lat.toFixed(4)},${observer.lng.toFixed(4)},${radiusNm},${trackingMode}`;
    if (lastCenterRef.current !== key) {
      lastCenterRef.current = key;
      map.panTo({ lat: observer.lat, lng: observer.lng });
      map.setZoom(targetZoomForContext(observer, radiusNm, trackingMode));
    }
  }, [map, observer, radiusNm, trackingMode]);

  // Follow selected aircraft or vessel if enabled
  useEffect(() => {
    if (!map || !followSelected) return;
    if (selectedAircraft) {
      map.panTo({ lat: selectedAircraft.lat, lng: selectedAircraft.lon });
    } else if (selectedVessel) {
      map.panTo({ lat: selectedVessel.lat, lng: selectedVessel.lon });
    }
  }, [
    map,
    followSelected,
    selectedAircraft,
    selectedVessel,
  ]);

  // Global maritime shipping lanes overlay
  useEffect(() => {
    for (const poly of laneLinesRef.current) {
      poly.setMap(null);
    }
    laneLinesRef.current = [];

    if (!map || !showShipRoutes || shippingLanes.length === 0) return;

    const created: google.maps.Polyline[] = [];
    for (const feature of shippingLanes) {
      const strokeColor =
        feature.tier === 'Major'
          ? '#0EA5E9'
          : feature.tier === 'Middle'
            ? '#0284C7'
            : '#475569';
      const strokeOpacity =
        feature.tier === 'Major' ? 0.62 : feature.tier === 'Middle' ? 0.36 : 0.24;
      const strokeWeight =
        feature.tier === 'Major' ? 1.8 : feature.tier === 'Middle' ? 1.2 : 0.9;

      for (const path of feature.paths) {
        const poly = new google.maps.Polyline({
          map,
          path,
          clickable: false,
          geodesic: false,
          strokeColor,
          strokeOpacity,
          strokeWeight,
          zIndex: feature.tier === 'Major' ? 5 : 3,
        });
        created.push(poly);
      }
    }
    laneLinesRef.current = created;

    return () => {
      for (const poly of created) {
        poly.setMap(null);
      }
      laneLinesRef.current = [];
    };
  }, [map, shippingLanes, showShipRoutes]);

  // Real-time RainViewer precipitation radar PNG tile overlay
  useEffect(() => {
    if (!map) return;
    const showPrecip = weatherMode === 'precip' || weatherMode === 'both';
    const host = weatherData?.radarHost;
    const radarPath = weatherData?.radarPath;

    if (!showPrecip || !host || !radarPath) return;

    const radarLayer = new google.maps.ImageMapType({
      name: 'Precipitation Radar',
      tileSize: new google.maps.Size(256, 256),
      minZoom: 1,
      maxZoom: 12,
      opacity: 0.65,
      getTileUrl: (coord, zoom) => {
        const scale = 1 << zoom;
        if (coord.y < 0 || coord.y >= scale) return '';
        const x = ((coord.x % scale) + scale) % scale;
        return `${host}${radarPath}/256/${zoom}/${x}/${coord.y}/2/1_1.png`;
      },
    });

    map.overlayMapTypes.push(radarLayer);

    return () => {
      const arr = map.overlayMapTypes.getArray();
      const idx = arr.indexOf(radarLayer);
      if (idx !== -1) {
        map.overlayMapTypes.removeAt(idx);
      }
    };
  }, [map, weatherMode, weatherData?.radarHost, weatherData?.radarPath]);

  // Outer scan radius ring + inner 5 NM "Directly Overhead" zenith ring (airspace scans)
  useEffect(() => {
    if (!map) return;

    if (trackingMode === 'sea') {
      outerCircleRef.current?.setMap(null);
      outerCircleRef.current = null;
      innerCircleRef.current?.setMap(null);
      innerCircleRef.current = null;
      return;
    }

    if (!outerCircleRef.current) {
      outerCircleRef.current = new google.maps.Circle({
        map,
        clickable: false,
        strokeColor: '#06B6D4',
        strokeOpacity: 0.45,
        strokeWeight: 1.5,
        fillColor: '#06B6D4',
        fillOpacity: 0.03,
      });
    }
    outerCircleRef.current.setCenter({ lat: observer.lat, lng: observer.lng });
    outerCircleRef.current.setRadius(radiusNm * 1852);

    if (!innerCircleRef.current) {
      innerCircleRef.current = new google.maps.Circle({
        map,
        clickable: false,
        strokeColor: '#38BDF8',
        strokeOpacity: 0.35,
        strokeWeight: 1,
        fillColor: '#38BDF8',
        fillOpacity: 0.04,
      });
    }
    innerCircleRef.current.setCenter({ lat: observer.lat, lng: observer.lng });
    innerCircleRef.current.setRadius(Math.min(5, radiusNm) * 1852);

    return () => {
      outerCircleRef.current?.setMap(null);
      outerCircleRef.current = null;
      innerCircleRef.current?.setMap(null);
      innerCircleRef.current = null;
    };
  }, [map, observer.lat, observer.lng, radiusNm, trackingMode]);

  // Amber proximity alert perimeter ring
  useEffect(() => {
    if (!map || !proximityAlert.enabled) {
      alertCircleRef.current?.setMap(null);
      alertCircleRef.current = null;
      return;
    }

    if (!alertCircleRef.current) {
      alertCircleRef.current = new google.maps.Circle({
        map,
        clickable: false,
        strokeColor: '#F59E0B',
        strokeOpacity: 0.85,
        strokeWeight: 2,
        fillColor: '#F59E0B',
        fillOpacity: 0.05,
        zIndex: 6,
      });
    }
    alertCircleRef.current.setCenter({ lat: observer.lat, lng: observer.lng });
    alertCircleRef.current.setRadius(proximityAlert.radiusNm * 1852);

    return () => {
      alertCircleRef.current?.setMap(null);
      alertCircleRef.current = null;
    };
  }, [map, observer.lat, observer.lng, proximityAlert.enabled, proximityAlert.radiusNm]);

  // Flight path trail, observer sightline, and Origin -> Aircraft -> Destination great-circle legs
  useEffect(() => {
    if (!map) return;

    if (!selectedAircraft && !selectedVessel) {
      trailLineRef.current?.setMap(null);
      sightLineRef.current?.setMap(null);
      originLegRef.current?.setMap(null);
      destLegRef.current?.setMap(null);
      return;
    }

    if (selectedVessel && !selectedAircraft) {
      trailLineRef.current?.setMap(null);
      originLegRef.current?.setMap(null);
      destLegRef.current?.setMap(null);

      if (!sightLineRef.current) {
        sightLineRef.current = new google.maps.Polyline({
          map,
          clickable: false,
          geodesic: true,
          strokeOpacity: 0,
          icons: [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 0.65,
                strokeColor: '#2DD4BF',
                scale: 2,
              },
              offset: '0',
              repeat: '12px',
            },
          ],
        });
      }
      sightLineRef.current.setMap(map);
      sightLineRef.current.setPath([
        { lat: observer.lat, lng: observer.lng },
        { lat: selectedVessel.lat, lng: selectedVessel.lon },
      ]);
      return;
    }

    if (!selectedAircraft) return;

    const accent = craftAccentHex(selectedAircraft.craftKind);
    const path = selectedAircraft.trail.map((p) => ({ lat: p.lat, lng: p.lng }));

    if (!trailLineRef.current) {
      trailLineRef.current = new google.maps.Polyline({
        map,
        clickable: false,
        geodesic: true,
        strokeWeight: 2.5,
        strokeOpacity: 0.9,
      });
    }
    trailLineRef.current.setMap(map);
    trailLineRef.current.setOptions({ strokeColor: accent });
    trailLineRef.current.setPath(path);

    if (!sightLineRef.current) {
      sightLineRef.current = new google.maps.Polyline({
        map,
        clickable: false,
        geodesic: true,
        strokeOpacity: 0,
        icons: [
          {
            icon: {
              path: 'M 0,-1 0,1',
              strokeOpacity: 0.65,
              strokeColor: '#94A3B8',
              scale: 2,
            },
            offset: '0',
            repeat: '10px',
          },
        ],
      });
    }
    sightLineRef.current.setMap(map);
    sightLineRef.current.setPath([
      { lat: observer.lat, lng: observer.lng },
      { lat: selectedAircraft.lat, lng: selectedAircraft.lon },
    ]);

    if (selectedRoute) {
      if (!originLegRef.current) {
        originLegRef.current = new google.maps.Polyline({
          map,
          clickable: false,
          geodesic: true,
          strokeColor: '#06B6D4',
          strokeOpacity: 0.55,
          strokeWeight: 2,
        });
      }
      originLegRef.current.setMap(map);
      originLegRef.current.setPath([
        { lat: selectedRoute.origin.lat, lng: selectedRoute.origin.lng },
        { lat: selectedAircraft.lat, lng: selectedAircraft.lon },
      ]);

      if (!destLegRef.current) {
        destLegRef.current = new google.maps.Polyline({
          map,
          clickable: false,
          geodesic: true,
          strokeOpacity: 0,
          icons: [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 0.55,
                strokeColor: '#F59E0B',
                scale: 2,
              },
              offset: '0',
              repeat: '12px',
            },
          ],
        });
      }
      destLegRef.current.setMap(map);
      destLegRef.current.setPath([
        { lat: selectedAircraft.lat, lng: selectedAircraft.lon },
        { lat: selectedRoute.destination.lat, lng: selectedRoute.destination.lng },
      ]);
    } else {
      originLegRef.current?.setMap(null);
      destLegRef.current?.setMap(null);
    }
  }, [map, selectedAircraft, selectedVessel, selectedRoute, observer.lat, observer.lng]);

  useEffect(() => {
    return () => {
      trailLineRef.current?.setMap(null);
      sightLineRef.current?.setMap(null);
      originLegRef.current?.setMap(null);
      destLegRef.current?.setMap(null);
    };
  }, []);

  return null;
}

function MapViewportControls({
  observer,
  radiusNm,
  trackingMode,
  mapStyleMode,
  showShipRoutes,
  weatherMode,
  weatherData,
  weatherLoading,
  weatherError,
  onChangeMapStyle,
  onToggleShipRoutes,
  onToggleWeather,
  onChangeWeatherMode,
  hasSelected,
  followSelected,
  onToggleFollow,
}: {
  observer: ObserverLocation;
  radiusNm: number;
  trackingMode: TrackingMode;
  mapStyleMode: MapStyleMode;
  showShipRoutes: boolean;
  weatherMode: WeatherLayerMode;
  weatherData: WeatherOverlaySnapshot | null;
  weatherLoading: boolean;
  weatherError: string | null;
  onChangeMapStyle: (mode: MapStyleMode) => void;
  onToggleShipRoutes: () => void;
  onToggleWeather: () => void;
  onChangeWeatherMode: (mode: WeatherLayerMode) => void;
  hasSelected: boolean;
  followSelected: boolean;
  onToggleFollow: () => void;
}) {
  const map = useMap();

  const handleRecenter = () => {
    if (!map) return;
    map.panTo({ lat: observer.lat, lng: observer.lng });
    map.setZoom(targetZoomForContext(observer, radiusNm, trackingMode));
  };

  const handleZoom = (delta: number) => {
    if (!map) return;
    const current = map.getZoom() ?? 10;
    map.setZoom(Math.max(2, Math.min(18, current + delta)));
  };

  const modes: Array<{ id: MapStyleMode; label: string }> = [
    { id: 'roadmap', label: 'Dark' },
    { id: 'hybrid', label: 'Hybrid' },
    { id: 'satellite', label: 'Satellite' },
    { id: 'terrain', label: 'Terrain' },
  ];

  const weatherActive = weatherMode !== 'off';
  const radarTimeLabel =
    weatherData?.radarTime
      ? new Date(weatherData.radarTime * 1000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
      {/* Map Layer Selector */}
      <div className="flex items-center gap-1 p-1 bg-[#0B0E17]/95 border border-slate-800 rounded-md shadow-lg">
        <Layers className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-0.5" aria-hidden="true" />
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChangeMapStyle(m.id)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mapStyleMode === m.id
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Camera & Overlay Actions */}
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        <button
          type="button"
          onClick={onToggleWeather}
          aria-pressed={weatherActive}
          title="Toggle real-time precipitation radar & temperature weather overlay"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            weatherActive
              ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
              : 'bg-[#0B0E17]/95 border-slate-800 text-slate-300 hover:border-slate-700'
          }`}
        >
          <CloudRain className="w-3.5 h-3.5" />
          <span>Weather</span>
          {weatherActive && weatherData?.current && (
            <span className="font-mono-tabular text-emerald-300">
              {weatherData.current.tempF}°F
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleShipRoutes}
          title="Toggle global maritime shipping routes"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            showShipRoutes
              ? 'bg-sky-500/20 border-sky-400/60 text-sky-200'
              : 'bg-[#0B0E17]/95 border-slate-800 text-slate-300 hover:border-slate-700'
          }`}
        >
          <Route className="w-3.5 h-3.5" />
          <span>Ship Routes</span>
        </button>

        {hasSelected && (
          <button
            type="button"
            onClick={onToggleFollow}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              followSelected
                ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-200'
                : 'bg-[#0B0E17]/95 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>{followSelected ? 'Following' : 'Follow'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleRecenter}
          title="Recenter on observer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#0B0E17]/95 border border-slate-800 text-slate-200 hover:border-cyan-500/60 hover:text-cyan-300 rounded-md shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
          <span>Center</span>
        </button>

        <div className="flex items-center bg-[#0B0E17]/95 border border-slate-800 rounded-md shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => handleZoom(1)}
            aria-label="Zoom in"
            className="p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-slate-800" />
          <button
            type="button"
            onClick={() => handleZoom(-1)}
            aria-label="Zoom out"
            className="p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Live Weather Sub-controls & Local Atmospheric Conditions */}
      {weatherActive && (
        <div className="bg-[#0B0E17]/95 border border-slate-800 rounded-md shadow-xl p-2.5 w-[278px] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-0.5 bg-[#07090E] border border-slate-800 rounded">
              {(
                [
                  { id: 'both', label: 'All' },
                  { id: 'precip', label: 'Precip' },
                  { id: 'temp', label: 'Temp' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeWeatherMode(opt.id)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    weatherMode === opt.id
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-[10px] font-mono-tabular text-slate-400 whitespace-nowrap">
              {weatherLoading
                ? 'Syncing...'
                : radarTimeLabel
                  ? `Radar ${radarTimeLabel}`
                  : 'Live MET'}
            </span>
          </div>

          {weatherError && !weatherData ? (
            <div className="text-[11px] text-rose-300">{weatherError}</div>
          ) : weatherData?.current ? (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Thermometer
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: tempAccentHex(weatherData.current.tempF) }}
                  />
                  <span className="text-sm font-bold font-mono-tabular text-white">
                    {weatherData.current.tempF}°F
                  </span>
                  <span className="text-[11px] font-mono-tabular text-slate-400">
                    ({weatherData.current.tempC}°C)
                  </span>
                </div>
                <span className="text-[11px] text-slate-200 truncate">
                  {formatWeatherSymbol(weatherData.current.symbolCode)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-800/80 text-[10px] font-mono-tabular">
                <div className="text-slate-300 flex items-center gap-1">
                  <Wind className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span>{weatherData.current.windKts}kt</span>
                </div>
                <div className="text-slate-300 text-center">
                  {weatherData.current.precipMm1h.toFixed(1)} mm/h
                </div>
                <div className="text-slate-400 text-right">
                  {weatherData.current.pressureHpa} hPa
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400">Fetching live atmospheric grid...</div>
          )}
        </div>
      )}
    </div>
  );
}

export function AirspaceMap({
  observer,
  radiusNm,
  trackingMode,
  aircraft,
  vessels,
  shippingLanes,
  showShipRoutes,
  weatherMode,
  weatherData,
  weatherLoading,
  weatherError,
  selectedHex,
  selectedVesselId,
  selectedRoute,
  followSelected,
  mapStyleMode,
  proximityAlert,
  onChangeMapStyle,
  onToggleShipRoutes,
  onToggleWeather,
  onChangeWeatherMode,
  onSelectAircraft,
  onSelectVessel,
  onToggleFollow,
}: AirspaceMapProps) {
  const selectedAircraft = aircraft.find((a) => a.hex === selectedHex) || null;
  const selectedVessel = vessels.find((v) => v.id === selectedVesselId) || null;
  const activeRoute = selectedRoute || selectedAircraft?.route || null;
  const showTempField =
    (weatherMode === 'temp' || weatherMode === 'both') && Boolean(weatherData);
  const weatherStations = weatherData
    ? [weatherData.current, ...weatherData.gridPoints]
    : [];

  return (
    <div className="relative w-full h-full bg-[#07090E]">
      <GoogleMap
        defaultCenter={{ lat: observer.lat, lng: observer.lng }}
        defaultZoom={11}
        mapId="DEMO_MAP_ID"
        mapTypeId={mapStyleMode}
        colorScheme={ColorScheme.DARK}
        gestureHandling="greedy"
        disableDefaultUI
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        onClick={() => {
          onSelectAircraft(null);
          onSelectVessel(null);
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <RadarOverlays
          observer={observer}
          radiusNm={radiusNm}
          trackingMode={trackingMode}
          selectedAircraft={selectedAircraft}
          selectedVessel={selectedVessel}
          selectedRoute={activeRoute}
          shippingLanes={shippingLanes}
          showShipRoutes={showShipRoutes}
          weatherMode={weatherMode}
          weatherData={weatherData}
          followSelected={followSelected}
          proximityAlert={proximityAlert}
        />

        <MapViewportControls
          observer={observer}
          radiusNm={radiusNm}
          trackingMode={trackingMode}
          mapStyleMode={mapStyleMode}
          showShipRoutes={showShipRoutes}
          weatherMode={weatherMode}
          weatherData={weatherData}
          weatherLoading={weatherLoading}
          weatherError={weatherError}
          onChangeMapStyle={onChangeMapStyle}
          onToggleShipRoutes={onToggleShipRoutes}
          onToggleWeather={onToggleWeather}
          onChangeWeatherMode={onChangeWeatherMode}
          hasSelected={Boolean(selectedAircraft || selectedVessel)}
          followSelected={followSelected}
          onToggleFollow={onToggleFollow}
        />

        {/* Regional Temperature & Wind Field Markers */}
        {showTempField &&
          weatherStations.map((st) => {
            const accent = tempAccentHex(st.tempF);
            const windFlowDeg = (st.windDirDeg + 180) % 360;
            return (
              <AdvancedMarker
                key={`wx-${st.id}`}
                position={{ lat: st.lat, lng: st.lng }}
                title={`${st.label}: ${st.tempF}°F (${st.tempC}°C) · Wind ${st.windKts} kt · ${formatWeatherSymbol(st.symbolCode)}`}
                zIndex={12}
              >
                <div
                  className={`pointer-events-none select-none flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#07090E]/90 border text-[11px] font-mono-tabular shadow-md whitespace-nowrap ${
                    st.id === 'center' ? 'mt-10' : ''
                  }`}
                  style={{ borderColor: `${accent}80` }}
                >
                  <span className="font-bold" style={{ color: accent }}>
                    {st.tempF}°F
                  </span>
                  <span className="text-slate-400 text-[10px] inline-flex items-center gap-0.5">
                    <span
                      aria-hidden="true"
                      className="inline-block leading-none text-cyan-300"
                      style={{ transform: `rotate(${windFlowDeg}deg)` }}
                    >
                      ↑
                    </span>
                    {st.windKts}kt
                  </span>
                </div>
              </AdvancedMarker>
            );
          })}

        {/* Observer Anchor Marker */}
        <AdvancedMarker
          position={{ lat: observer.lat, lng: observer.lng }}
          title={`Observer: ${observer.label}`}
          zIndex={50}
        >
          <div className="relative flex items-center justify-center">
            <div className="w-7 h-7 rounded-full border border-cyan-400/70 bg-cyan-500/15 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 border border-[#07090E]" />
            </div>
          </div>
        </AdvancedMarker>

        {/* Origin & Destination Airport Markers for Selected Flight */}
        {selectedAircraft && activeRoute && (
          <>
            <AdvancedMarker
              position={{ lat: activeRoute.origin.lat, lng: activeRoute.origin.lng }}
              title={`Departure: ${activeRoute.origin.name}`}
              zIndex={70}
            >
              <div className="px-2 py-0.5 rounded bg-[#07090E] border border-cyan-400 text-[11px] font-mono-tabular text-cyan-300 shadow-lg whitespace-nowrap">
                DEP {activeRoute.origin.iata || activeRoute.origin.icao}
              </div>
            </AdvancedMarker>

            <AdvancedMarker
              position={{ lat: activeRoute.destination.lat, lng: activeRoute.destination.lng }}
              title={`Arrival: ${activeRoute.destination.name}`}
              zIndex={70}
            >
              <div className="px-2 py-0.5 rounded bg-[#07090E] border border-amber-400 text-[11px] font-mono-tabular text-amber-300 shadow-lg whitespace-nowrap">
                ARR {activeRoute.destination.iata || activeRoute.destination.icao}
              </div>
            </AdvancedMarker>
          </>
        )}

        {/* Live Maritime Vessels */}
        {trackingMode !== 'air' &&
          vessels.map((v) => {
            const isSelected = v.id === selectedVesselId;
            const accent = vesselAccentHex(v.vesselKind);
            const showLabel = isSelected || v.vesselKind === 'cruise';

            return (
              <AdvancedMarker
                key={v.id}
                position={{ lat: v.lat, lng: v.lon }}
                zIndex={isSelected ? 95 : v.vesselKind === 'cruise' ? 35 : 15}
                onClick={() => onSelectVessel(v.id)}
                title={`${v.name} · ${v.oceanRegion}${v.sogKts !== null ? ` · ${v.sogKts} kt` : ''}`}
              >
                <div className="relative flex flex-col items-center cursor-pointer group">
                  <div
                    className={`flex items-center justify-center rounded-full transition-transform duration-150 ${
                      isSelected
                        ? 'w-8 h-8 bg-[#07090E]/95 border-2 scale-110 shadow-lg'
                        : 'w-5 h-5 hover:scale-125'
                    }`}
                    style={isSelected ? { borderColor: accent } : undefined}
                  >
                    <VesselSilhouette
                      kind={v.vesselKind}
                      color={accent}
                      size={isSelected ? 20 : 15}
                      heading={v.heading ?? v.cogDeg}
                    />
                  </div>

                  {showLabel && (
                    <div
                      className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono-tabular leading-none whitespace-nowrap border ${
                        isSelected
                          ? 'bg-[#07090E] text-white border-teal-400/80 shadow-md'
                          : 'bg-[#07090E]/85 text-teal-200 border-slate-700/80'
                      }`}
                    >
                      {v.name}
                      {v.sogKts !== null ? ` · ${v.sogKts}kt` : ''}
                    </div>
                  )}
                </div>
              </AdvancedMarker>
            );
          })}

        {/* Live Aircraft & Helicopter Markers */}
        {trackingMode !== 'sea' &&
          aircraft.map((ac) => {
            const isSelected = ac.hex === selectedHex;
            const accent = craftAccentHex(ac.craftKind);
            const isOverheadClose = !ac.onGround && ac.elevationAngleDeg >= 55;
            const showLabel = isSelected || isOverheadClose || ac.craftKind === 'helicopter';

            return (
              <AdvancedMarker
                key={ac.hex}
                position={{ lat: ac.lat, lng: ac.lon }}
                zIndex={isSelected ? 100 : ac.craftKind === 'helicopter' ? 40 : 20}
                onClick={() => onSelectAircraft(ac.hex)}
                title={`${ac.callsign} (${ac.aircraftType || ac.craftKind}) · ${formatAltitude(ac.altitudeFt, ac.onGround)}`}
              >
                <div className="relative flex flex-col items-center cursor-pointer group">
                  <div
                    className={`flex items-center justify-center rounded-full transition-transform duration-150 ${
                      isSelected
                        ? 'w-9 h-9 bg-[#07090E]/90 border-2 scale-110 shadow-lg'
                        : 'w-7 h-7 hover:scale-115'
                    }`}
                    style={isSelected ? { borderColor: accent } : undefined}
                  >
                    <AircraftSilhouette
                      kind={ac.craftKind}
                      color={ac.emergency ? '#FB7185' : accent}
                      size={isSelected ? 24 : ac.craftKind === 'heavy' ? 23 : 20}
                      heading={ac.heading}
                    />
                  </div>

                  {showLabel && (
                    <div
                      className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono-tabular leading-none whitespace-nowrap border ${
                        isSelected
                          ? 'bg-[#07090E] text-white border-cyan-400/70 shadow-md'
                          : 'bg-[#07090E]/85 text-slate-200 border-slate-700/80'
                      }`}
                    >
                      {ac.callsign}{' '}
                      <span className="text-slate-400">
                        {ac.onGround
                          ? 'GND'
                          : `${Math.round(ac.altitudeFt / 100) * 100 >= 1000 ? `${(ac.altitudeFt / 1000).toFixed(1)}k` : `${ac.altitudeFt}`}`}
                      </span>
                    </div>
                  )}
                </div>
              </AdvancedMarker>
            );
          })}
      </GoogleMap>
    </div>
  );
}
