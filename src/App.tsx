import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import {
  Anchor,
  ArrowUpDown,
  Bell,
  BellRing,
  LocateFixed,
  Pause,
  Plane,
  Play,
  RefreshCw,
  Search,
  Radar,
  Ship,
  X,
} from 'lucide-react';
import type {
  Aircraft,
  AirspaceSnapshot,
  FilterKind,
  FlightRouteInfo,
  ObserverLocation,
  ProximityAlertConfig,
  ProximityAlertEvent,
  ShippingLaneFeature,
  SortMode,
  TrackingMode,
  Vessel,
  VesselFilterKind,
  VesselsSnapshot,
  WeatherLayerMode,
  WeatherOverlaySnapshot,
} from './types/airspace';
import {
  craftAccentHex,
  craftKindLabel,
  describeOverheadSightline,
  formatAltitude,
  formatVerticalRate,
  vesselAccentHex,
  vesselKindLabel,
} from './utils/airspaceFormat';
import {
  getBrowserNotificationPermission,
  loadProximityConfig,
  playProximityChime,
  requestBrowserNotificationPermission,
  saveProximityConfig,
  sendBrowserNotification,
  type BrowserNotifPermission,
} from './utils/proximityAlerts';
import { AircraftSilhouette, VesselSilhouette } from './components/AircraftIcons';
import { LocationSearch } from './components/LocationSearch';
import { AirspaceMap, type MapStyleMode } from './components/AirspaceMap';
import { AircraftInspector } from './components/AircraftInspector';
import { VesselInspector } from './components/VesselInspector';
import { SkyCompassModal } from './components/SkyCompassModal';
import { CraftGuideModal } from './components/CraftGuideModal';
import { ProximityAlertModal } from './components/ProximityAlertModal';

const DEFAULT_OBSERVER: ObserverLocation = {
  lat: 40.7128,
  lng: -74.006,
  label: 'New York, NY',
  source: 'default',
};

const INDIAN_OCEAN_CENTER: ObserverLocation = {
  lat: -8.5,
  lng: 76.0,
  label: 'Indian Ocean',
  source: 'preset',
};

const RADIUS_OPTIONS = [5, 15, 30, 60] as const;

export default function App() {
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [keyResolved, setKeyResolved] = useState<boolean>(
    () => Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [observer, setObserver] = useState<ObserverLocation>(DEFAULT_OBSERVER);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const [trackingMode, setTrackingMode] = useState<TrackingMode>('air');
  const [listDomain, setListDomain] = useState<'air' | 'sea'>('air');
  const [showShipRoutes, setShowShipRoutes] = useState(false);
  const [shippingLanes, setShippingLanes] = useState<ShippingLaneFeature[]>([]);
  const [weatherMode, setWeatherMode] = useState<WeatherLayerMode>('off');
  const [weatherData, setWeatherData] = useState<WeatherOverlaySnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const [radiusNm, setRadiusNm] = useState<number>(15);
  const [filterKind, setFilterKind] = useState<FilterKind>('all');
  const [sortMode, setSortMode] = useState<SortMode>('overhead');
  const [searchCallsign, setSearchCallsign] = useState('');
  const [hideGround, setHideGround] = useState(true);

  const [vesselScope, setVesselScope] = useState<'global' | 'radius'>('global');
  const [vesselRadiusNm, setVesselRadiusNm] = useState<number>(1200);
  const [vesselFilter, setVesselFilter] = useState<VesselFilterKind>('all');
  const [searchVessel, setSearchVessel] = useState('');

  const [snapshot, setSnapshot] = useState<AirspaceSnapshot | null>(null);
  const [vesselSnapshot, setVesselSnapshot] = useState<VesselsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingVessels, setIsLoadingVessels] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [vesselError, setVesselError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);
  const [resolvedRoutes, setResolvedRoutes] = useState<Record<string, FlightRouteInfo | null>>({});
  const [followSelected, setFollowSelected] = useState(false);
  const [mapStyleMode, setMapStyleMode] = useState<MapStyleMode>('roadmap');

  const [mobilePane, setMobilePane] = useState<'map' | 'list'>('map');
  const [showCompass, setShowCompass] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const [alertConfig, setAlertConfig] = useState<ProximityAlertConfig>(() => loadProximityConfig());
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [notifPermission, setNotifPermission] = useState<BrowserNotifPermission>(() =>
    getBrowserNotificationPermission()
  );
  const [alertHistory, setAlertHistory] = useState<ProximityAlertEvent[]>([]);
  const [activeToast, setActiveToast] = useState<ProximityAlertEvent | null>(null);

  const resolvedRoutesRef = useRef<Record<string, FlightRouteInfo | null>>({});
  resolvedRoutesRef.current = resolvedRoutes;

  const seededRef = useRef<{ key: string; air: boolean; sea: boolean }>({
    key: '',
    air: false,
    sea: false,
  });
  const insideEntitiesRef = useRef<Record<string, boolean>>({});
  const cooldownEntitiesRef = useRef<Record<string, number>>({});
  const lastEvaluatedAirTsRef = useRef<number>(0);
  const lastEvaluatedSeaTsRef = useRef<number>(0);

  const handleChangeAlertConfig = useCallback((next: ProximityAlertConfig) => {
    setAlertConfig(next);
    saveProximityConfig(next);
  }, []);

  const handleRequestNotifPermission = useCallback(() => {
    void requestBrowserNotificationPermission().then((perm) => {
      setNotifPermission(perm);
    });
  }, []);

  const handleRouteResolved = useCallback((hex: string, route: FlightRouteInfo | null) => {
    setResolvedRoutes((prev) => {
      if (prev[hex] === route) return prev;
      return { ...prev, [hex]: route };
    });
  }, []);

  // Listen for Google Maps quota exhaustion events
  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Fallback check for runtime server config if VITE_GOOGLE_MAPS_API_KEY was not baked at build
  useEffect(() => {
    if (mapsApiKey) {
      setKeyResolved(true);
      return;
    }
    let cancelled = false;
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : { mapsApiKey: '' }))
      .then((data: { mapsApiKey?: string }) => {
        if (!cancelled) {
          if (data.mapsApiKey) setMapsApiKey(data.mapsApiKey);
          setKeyResolved(true);
        }
      })
      .catch(() => {
        if (!cancelled) setKeyResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mapsApiKey]);

  const handleUseGps = useCallback((silent = false) => {
    if (!navigator.geolocation) {
      if (!silent) {
        setLocationNotice('Geolocation is unavailable in this browser. Search for a city instead.');
      }
      return;
    }
    setIsLocatingGps(true);
    if (!silent) setLocationNotice(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let label = `${lat.toFixed(3)}°, ${lng.toFixed(3)}°`;

        try {
          const geoRes = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lng}`);
          if (geoRes.ok) {
            const geo = (await geoRes.json()) as { label?: string | null };
            if (geo.label) label = geo.label;
          }
        } catch {
          // Keep coordinate label
        }

        setObserver({ lat, lng, label, source: 'gps' });
        setSelectedHex(null);
        setSelectedVesselId(null);
        setFollowSelected(false);
        setIsLocatingGps(false);
      },
      (err) => {
        setIsLocatingGps(false);
        if (!silent) {
          setLocationNotice(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was declined. Use the search box to pick any city or ocean.'
              : 'Could not determine GPS position. Search for a location instead.'
          );
        }
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
    );
  }, []);

  // Attempt passive GPS lock on initial load; falls back cleanly if blocked
  useEffect(() => {
    handleUseGps(true);
  }, [handleUseGps]);

  const shouldMonitorAir =
    trackingMode !== 'sea' || (alertConfig.enabled && alertConfig.targets !== 'sea');
  const shouldMonitorSea =
    trackingMode !== 'air' || (alertConfig.enabled && alertConfig.targets !== 'air');
  const effectiveAirFetchRadius = Math.min(
    100,
    Math.max(
      radiusNm,
      alertConfig.enabled && alertConfig.targets !== 'sea' ? Math.ceil(alertConfig.radiusNm) : 0
    )
  );

  const fetchAirspace = useCallback(
    async (isManual = false) => {
      if (!shouldMonitorAir) return;
      if (isManual) setIsRefreshing(true);
      try {
        const params = new URLSearchParams({
          lat: String(observer.lat),
          lon: String(observer.lng),
          radius: String(effectiveAirFetchRadius),
        });
        const res = await fetch(`/api/flights?${params.toString()}`);
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errBody.error || `Feed returned HTTP ${res.status}`);
        }
        const data = (await res.json()) as AirspaceSnapshot;
        setSnapshot(data);
        setFeedError(null);
      } catch (err) {
        setFeedError(err instanceof Error ? err.message : 'Unable to reach live ADS-B feed.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [observer.lat, observer.lng, effectiveAirFetchRadius, shouldMonitorAir]
  );

  const fetchVessels = useCallback(
    async (isManual = false) => {
      if (!shouldMonitorSea) return;
      if (isManual) setIsRefreshing(true);
      setIsLoadingVessels(true);
      try {
        const effectiveScope = trackingMode === 'air' ? 'global' : vesselScope;
        const params = new URLSearchParams({
          lat: String(observer.lat),
          lon: String(observer.lng),
          scope: effectiveScope,
          radius: String(vesselRadiusNm),
        });
        const res = await fetch(`/api/vessels?${params.toString()}`);
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errBody.error || `Maritime feed returned HTTP ${res.status}`);
        }
        const data = (await res.json()) as VesselsSnapshot;
        setVesselSnapshot(data);
        setVesselError(null);
      } catch (err) {
        setVesselError(err instanceof Error ? err.message : 'Unable to reach maritime vessel feed.');
      } finally {
        setIsLoadingVessels(false);
        setIsRefreshing(false);
      }
    },
    [observer.lat, observer.lng, vesselScope, vesselRadiusNm, shouldMonitorSea, trackingMode]
  );

  // Fetch global shipping lanes whenever Ship Routes overlay or Sea mode is activated
  useEffect(() => {
    if ((!showShipRoutes && trackingMode === 'air') || shippingLanes.length > 0) return;
    let cancelled = false;
    fetch('/api/shipping-lanes')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { features?: ShippingLaneFeature[] } | null) => {
        if (!cancelled && data?.features) {
          setShippingLanes(data.features);
        }
      })
      .catch(() => {
        // Non-fatal
      });
    return () => {
      cancelled = true;
    };
  }, [showShipRoutes, trackingMode, shippingLanes.length]);

  // Initial fetch & 5-second live polling for aircraft
  useEffect(() => {
    if (!shouldMonitorAir) {
      setIsLoading(false);
      return;
    }
    if (trackingMode !== 'sea') {
      setIsLoading(true);
    }
    void fetchAirspace(false);

    if (isPaused) return;
    const timer = window.setInterval(() => {
      void fetchAirspace(false);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [fetchAirspace, isPaused, shouldMonitorAir, trackingMode]);

  // Fetch & 30-second live polling for maritime vessels
  useEffect(() => {
    if (!shouldMonitorSea) return;
    void fetchVessels(false);

    if (isPaused) return;
    const timer = window.setInterval(() => {
      void fetchVessels(false);
    }, 30000);

    return () => window.clearInterval(timer);
  }, [fetchVessels, isPaused, shouldMonitorSea]);

  // Fetch & 5-minute live polling for real-time weather radar + MET atmospheric grid
  useEffect(() => {
    if (weatherMode === 'off') return;
    let cancelled = false;
    const weatherRadius = trackingMode === 'sea' ? 120 : radiusNm;

    const loadWeather = async () => {
      setWeatherLoading(true);
      try {
        const params = new URLSearchParams({
          lat: String(observer.lat),
          lon: String(observer.lng),
          radius: String(weatherRadius),
        });
        const res = await fetch(`/api/weather?${params.toString()}`);
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errBody.error || `Weather feed returned HTTP ${res.status}`);
        }
        const data = (await res.json()) as WeatherOverlaySnapshot;
        if (!cancelled) {
          setWeatherData(data);
          setWeatherError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setWeatherError(err instanceof Error ? err.message : 'Unable to reach weather feed.');
        }
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };

    void loadWeather();
    const timer = window.setInterval(() => {
      void loadWeather();
    }, 300_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [weatherMode, observer.lat, observer.lng, radiusNm, trackingMode]);

  const handleChangeTrackingMode = useCallback(
    (nextMode: TrackingMode, jumpToIndianOceanIfDefault = false) => {
      setTrackingMode(nextMode);
      if (nextMode === 'sea') {
        setListDomain('sea');
        setShowShipRoutes(true);
        setSelectedHex(null);
        if (jumpToIndianOceanIfDefault && observer.source === 'default') {
          setObserver(INDIAN_OCEAN_CENTER);
        }
      } else if (nextMode === 'both') {
        setShowShipRoutes(true);
      } else {
        setListDomain('air');
        setSelectedVesselId(null);
      }
    },
    [observer.source]
  );

  const visibleAirCounts = useMemo(() => {
    if (!snapshot || trackingMode === 'sea') {
      return {
        all: 0,
        commercial: 0,
        helicopter: 0,
        fighter: 0,
        light: 0,
        special: 0,
      };
    }
    if (snapshot.radiusNm <= radiusNm) return snapshot.counts;

    const inRadius = snapshot.aircraft.filter((ac) => ac.distanceNm <= radiusNm);
    let commercial = 0;
    let helicopter = 0;
    let fighter = 0;
    let light = 0;
    let special = 0;
    for (const ac of inRadius) {
      if (ac.craftKind === 'commercial' || ac.craftKind === 'heavy') commercial += 1;
      else if (ac.craftKind === 'helicopter') helicopter += 1;
      else if (ac.craftKind === 'fighter' || ac.isMilitary) fighter += 1;
      else if (ac.craftKind === 'light') light += 1;
      else special += 1;
    }
    return {
      all: inRadius.length,
      commercial,
      helicopter,
      fighter,
      light,
      special,
    };
  }, [snapshot, radiusNm, trackingMode]);

  const filteredAircraft = useMemo(() => {
    if (!snapshot || trackingMode === 'sea') return [];
    const term = searchCallsign.trim().toLowerCase();

    const list = snapshot.aircraft.filter((ac) => {
      if (ac.distanceNm > radiusNm) return false;
      if (hideGround && ac.onGround) return false;

      if (filterKind === 'commercial' && ac.craftKind !== 'commercial' && ac.craftKind !== 'heavy') {
        return false;
      }
      if (filterKind === 'helicopter' && ac.craftKind !== 'helicopter') {
        return false;
      }
      if (filterKind === 'fighter' && ac.craftKind !== 'fighter' && !ac.isMilitary) {
        return false;
      }
      if (filterKind === 'light' && ac.craftKind !== 'light') {
        return false;
      }
      if (filterKind === 'special' && ac.craftKind !== 'special' && ac.craftKind !== 'unknown') {
        return false;
      }

      if (term) {
        const route = ac.route || resolvedRoutes[ac.hex];
        const routeText = route
          ? `${route.origin.iata || ''} ${route.origin.icao} ${route.origin.city || ''} ${route.origin.name} ${route.destination.iata || ''} ${route.destination.icao} ${route.destination.city || ''} ${route.destination.name}`
          : '';
        const haystack = `${ac.callsign} ${ac.registration || ''} ${ac.aircraftType || ''} ${ac.aircraftDesc || ''} ${ac.operator || ''} ${ac.hex} ${routeText}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      return true;
    });

    return [...list].sort((a, b) => {
      if (sortMode === 'overhead') return b.overheadScore - a.overheadScore;
      if (sortMode === 'distance') return a.distanceNm - b.distanceNm;
      if (sortMode === 'altitude') return b.altitudeFt - a.altitudeFt;
      return b.groundSpeedKts - a.groundSpeedKts;
    });
  }, [snapshot, trackingMode, radiusNm, filterKind, searchCallsign, hideGround, sortMode, resolvedRoutes]);

  const filteredVessels = useMemo(() => {
    if (!vesselSnapshot || trackingMode === 'air') return [];
    const term = searchVessel.trim().toLowerCase();

    return vesselSnapshot.vessels.filter((v) => {
      if (vesselFilter === 'cruise' && v.vesselKind !== 'cruise') return false;
      if (vesselFilter === 'cargo' && v.vesselKind !== 'cargo') return false;
      if (vesselFilter === 'tanker' && v.vesselKind !== 'tanker') return false;
      if (vesselFilter === 'vos' && v.vesselKind !== 'vos') return false;
      if (
        vesselFilter === 'other' &&
        v.vesselKind !== 'fishing' &&
        v.vesselKind !== 'tug' &&
        v.vesselKind !== 'sailing' &&
        v.vesselKind !== 'other'
      ) {
        return false;
      }

      if (term) {
        const haystack = `${v.name} ${v.mmsi || ''} ${v.imo || ''} ${v.callsign || ''} ${v.destination || ''} ${v.oceanRegion} ${v.source}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [vesselSnapshot, trackingMode, vesselFilter, searchVessel]);

  const closestOverhead: Aircraft | null = useMemo(() => {
    if (!snapshot || trackingMode === 'sea') return null;
    const airborne = snapshot.aircraft.filter((a) => !a.onGround && a.distanceNm <= radiusNm);
    return airborne[0] || null;
  }, [snapshot, radiusNm, trackingMode]);

  const selectedAircraft: Aircraft | null = useMemo(() => {
    if (!snapshot || !selectedHex || trackingMode === 'sea') return null;
    return snapshot.aircraft.find((a) => a.hex === selectedHex) || null;
  }, [snapshot, selectedHex, trackingMode]);

  const selectedVessel: Vessel | null = useMemo(() => {
    if (!vesselSnapshot || !selectedVesselId || trackingMode === 'air') return null;
    return vesselSnapshot.vessels.find((v) => v.id === selectedVesselId) || null;
  }, [vesselSnapshot, selectedVesselId, trackingMode]);

  const emitProximityEvents = useCallback(
    (events: ProximityAlertEvent[], soundEnabled: boolean) => {
      if (events.length === 0) return;

      if (events.length === 1) {
        const ev = events[0];
        sendBrowserNotification(
          ev.title,
          `${ev.distanceNm.toFixed(1)} NM ${ev.compassDir} · ${ev.subtitle}`,
          ev.entityKey
        );
      } else {
        const first = events[0];
        sendBrowserNotification(
          `${events.length} craft entered ${alertConfig.radiusNm} NM perimeter`,
          `${first.title} (+${events.length - 1} more) · ${first.distanceNm.toFixed(1)} NM ${first.compassDir}`,
          `batch-${first.timestamp}`
        );
      }

      if (soundEnabled) {
        playProximityChime();
      }

      setAlertHistory((prev) => [...events, ...prev].slice(0, 25));
      setActiveToast(events[0]);
    },
    [alertConfig.radiusNm]
  );

  // Auto-dismiss active in-app toast banner after 8 seconds
  useEffect(() => {
    if (!activeToast) return;
    const timer = window.setTimeout(() => {
      setActiveToast((curr) => (curr?.id === activeToast.id ? null : curr));
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [activeToast]);

  // Proximity alert entry detection engine for aircraft & maritime vessels
  useEffect(() => {
    const configKey = `${observer.lat.toFixed(4)},${observer.lng.toFixed(4)},${alertConfig.radiusNm},${alertConfig.enabled},${alertConfig.targets},${alertConfig.airborneOnly}`;

    if (!alertConfig.enabled) {
      seededRef.current = { key: '', air: false, sea: false };
      insideEntitiesRef.current = {};
      lastEvaluatedAirTsRef.current = 0;
      lastEvaluatedSeaTsRef.current = 0;
      return;
    }

    if (seededRef.current.key !== configKey) {
      seededRef.current = { key: configKey, air: false, sea: false };
      insideEntitiesRef.current = {};
      lastEvaluatedAirTsRef.current = 0;
      lastEvaluatedSeaTsRef.current = 0;
    }

    const now = Date.now();
    const hysteresisNm = Math.max(0.25, alertConfig.radiusNm * 0.05);
    const COOLDOWN_MS = 180_000;
    const newEvents: ProximityAlertEvent[] = [];

    // 1. Evaluate Aircraft Feed
    if (
      alertConfig.targets !== 'sea' &&
      snapshot &&
      snapshot.fetchedAt !== lastEvaluatedAirTsRef.current &&
      Math.abs(snapshot.center.lat - observer.lat) < 0.01 &&
      Math.abs(snapshot.center.lon - observer.lng) < 0.01
    ) {
      lastEvaluatedAirTsRef.current = snapshot.fetchedAt;
      const presentAirKeys = new Set<string>();
      const wasSeeded = seededRef.current.air;

      for (const ac of snapshot.aircraft) {
        if (alertConfig.airborneOnly && ac.onGround) continue;
        const key = `air:${ac.hex}`;
        presentAirKeys.add(key);

        if (ac.distanceNm <= alertConfig.radiusNm) {
          const alreadyInside = Boolean(insideEntitiesRef.current[key]);
          if (!wasSeeded) {
            insideEntitiesRef.current[key] = true;
          } else if (!alreadyInside) {
            insideEntitiesRef.current[key] = true;
            const lastAlertedAt = cooldownEntitiesRef.current[key] ?? 0;
            if (now - lastAlertedAt >= COOLDOWN_MS) {
              cooldownEntitiesRef.current[key] = now;
              const route = ac.route || resolvedRoutesRef.current[ac.hex];
              const routeTag = route
                ? ` · ${route.origin.iata || route.origin.icao}→${route.destination.iata || route.destination.icao}`
                : '';
              newEvents.push({
                id: `${key}-${now}`,
                entityKey: key,
                entityId: ac.hex,
                domain: 'air',
                title: `${ac.callsign} entered ${alertConfig.radiusNm} NM`,
                subtitle: `${craftKindLabel(ac.craftKind)} · ${formatAltitude(ac.altitudeFt, ac.onGround)}${routeTag}`,
                distanceNm: ac.distanceNm,
                bearingDeg: ac.bearingDeg,
                compassDir: ac.compassDir,
                timestamp: now,
              });
            }
          }
        } else if (ac.distanceNm > alertConfig.radiusNm + hysteresisNm) {
          delete insideEntitiesRef.current[key];
        }
      }

      for (const k of Object.keys(insideEntitiesRef.current)) {
        if (k.startsWith('air:') && !presentAirKeys.has(k)) {
          delete insideEntitiesRef.current[k];
        }
      }
      seededRef.current.air = true;
    }

    // 2. Evaluate Maritime Vessel Feed
    if (
      alertConfig.targets !== 'air' &&
      vesselSnapshot &&
      vesselSnapshot.fetchedAt !== lastEvaluatedSeaTsRef.current &&
      Math.abs(vesselSnapshot.center.lat - observer.lat) < 0.01 &&
      Math.abs(vesselSnapshot.center.lon - observer.lng) < 0.01
    ) {
      lastEvaluatedSeaTsRef.current = vesselSnapshot.fetchedAt;
      const presentSeaKeys = new Set<string>();
      const wasSeeded = seededRef.current.sea;

      for (const v of vesselSnapshot.vessels) {
        const key = `sea:${v.id}`;
        presentSeaKeys.add(key);

        if (v.distanceNm <= alertConfig.radiusNm) {
          const alreadyInside = Boolean(insideEntitiesRef.current[key]);
          if (!wasSeeded) {
            insideEntitiesRef.current[key] = true;
          } else if (!alreadyInside) {
            insideEntitiesRef.current[key] = true;
            const lastAlertedAt = cooldownEntitiesRef.current[key] ?? 0;
            if (now - lastAlertedAt >= COOLDOWN_MS) {
              cooldownEntitiesRef.current[key] = now;
              const speedStr = v.sogKts !== null ? `${v.sogKts} kt` : 'At Sea';
              const destStr = v.destination ? ` · → ${v.destination}` : '';
              newEvents.push({
                id: `${key}-${now}`,
                entityKey: key,
                entityId: v.id,
                domain: 'sea',
                title: `${v.name} entered ${alertConfig.radiusNm} NM`,
                subtitle: `${vesselKindLabel(v.vesselKind)} · ${speedStr}${destStr}`,
                distanceNm: v.distanceNm,
                bearingDeg: v.bearingDeg,
                compassDir: v.compassDir,
                timestamp: now,
              });
            }
          }
        } else if (v.distanceNm > alertConfig.radiusNm + hysteresisNm) {
          delete insideEntitiesRef.current[key];
        }
      }

      for (const k of Object.keys(insideEntitiesRef.current)) {
        if (k.startsWith('sea:') && !presentSeaKeys.has(k)) {
          delete insideEntitiesRef.current[k];
        }
      }
      seededRef.current.sea = true;
    }

    if (newEvents.length > 0) {
      emitProximityEvents(newEvents, alertConfig.soundEnabled);
    }
  }, [
    snapshot,
    vesselSnapshot,
    alertConfig.enabled,
    alertConfig.radiusNm,
    alertConfig.targets,
    alertConfig.airborneOnly,
    alertConfig.soundEnabled,
    observer.lat,
    observer.lng,
    emitProximityEvents,
  ]);

  const handleSendTestAlert = useCallback(() => {
    const now = Date.now();
    const domain = alertConfig.targets === 'sea' ? 'sea' : 'air';
    const sampleDist = Math.max(0.5, Math.round(alertConfig.radiusNm * 0.65 * 10) / 10);
    const testEvent: ProximityAlertEvent = {
      id: `test-${now}`,
      entityKey: `test-${now}`,
      entityId: '__test__',
      domain,
      title:
        domain === 'sea'
          ? `Test Vessel entered ${alertConfig.radiusNm} NM`
          : `TEST01 entered ${alertConfig.radiusNm} NM`,
      subtitle:
        domain === 'sea'
          ? `Cruise Vessel · 18.4 kt · ${observer.label}`
          : `Airliner · 6,400 ft · ${observer.label}`,
      distanceNm: sampleDist,
      bearingDeg: 45,
      compassDir: 'NE',
      timestamp: now,
    };
    emitProximityEvents([testEvent], alertConfig.soundEnabled);
  }, [alertConfig.targets, alertConfig.radiusNm, alertConfig.soundEnabled, observer.label, emitProximityEvents]);

  const handleSelectAlertEvent = useCallback(
    (ev: ProximityAlertEvent) => {
      if (ev.entityId === '__test__') return;
      if (ev.domain === 'air') {
        if (trackingMode === 'sea') setTrackingMode('both');
        setListDomain('air');
        setSelectedVesselId(null);
        setSelectedHex(ev.entityId);
      } else {
        if (trackingMode === 'air') setTrackingMode('both');
        setListDomain('sea');
        setSelectedHex(null);
        setSelectedVesselId(ev.entityId);
      }
      setFollowSelected(true);
      setMobilePane('map');
    },
    [trackingMode]
  );

  const handleSelectObserver = useCallback((loc: ObserverLocation) => {
    setObserver(loc);
    setLocationNotice(null);
    setSelectedHex(null);
    setSelectedVesselId(null);
    setFollowSelected(false);
  }, []);

  const handleFocusClosestOverhead = useCallback(() => {
    if (!closestOverhead) return;
    if (trackingMode === 'sea') setTrackingMode('both');
    setSelectedVesselId(null);
    setSelectedHex(closestOverhead.hex);
    setFollowSelected(true);
    setMobilePane('map');
  }, [closestOverhead, trackingMode]);

  const filterTabs: Array<{ id: FilterKind; label: string; count: number }> = [
    { id: 'all', label: 'All', count: visibleAirCounts.all },
    { id: 'commercial', label: 'Jets', count: visibleAirCounts.commercial },
    { id: 'helicopter', label: 'Helis', count: visibleAirCounts.helicopter },
    { id: 'fighter', label: 'Fighters', count: visibleAirCounts.fighter },
    { id: 'light', label: 'Light', count: visibleAirCounts.light },
    { id: 'special', label: 'Other', count: visibleAirCounts.special },
  ];

  const vesselTabs: Array<{ id: VesselFilterKind; label: string; count: number }> = [
    { id: 'all', label: 'All', count: vesselSnapshot?.counts.all ?? 0 },
    { id: 'cruise', label: 'Cruise', count: vesselSnapshot?.counts.cruise ?? 0 },
    { id: 'cargo', label: 'Cargo', count: vesselSnapshot?.counts.cargo ?? 0 },
    { id: 'tanker', label: 'Tankers', count: vesselSnapshot?.counts.tanker ?? 0 },
    { id: 'vos', label: 'Ocean VOS', count: vesselSnapshot?.counts.vos ?? 0 },
    { id: 'other', label: 'Other', count: vesselSnapshot?.counts.other ?? 0 },
  ];

  const activeListDomain: 'air' | 'sea' =
    trackingMode === 'sea' ? 'sea' : trackingMode === 'air' ? 'air' : listDomain;

  const mainContent = (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#07090E] text-slate-100">
      {/* Tier 1/2 GMP Quota Banner (Demo Key Specialization) */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="h-14 px-5 border-b border-slate-800 bg-[#0B0E17] flex items-center justify-between gap-8 shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setSelectedHex(null);
            setSelectedVesselId(null);
            setFollowSelected(false);
          }}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Skywatch
        </a>

        {/* Zone 2: Clean single-line text nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <button
            type="button"
            onClick={() => {
              setShowCompass(false);
              setShowGuide(false);
              handleChangeTrackingMode('air');
            }}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              trackingMode === 'air' ? 'text-white' : ''
            }`}
          >
            Live Radar
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCompass(false);
              setShowGuide(false);
              handleChangeTrackingMode('sea', true);
            }}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              trackingMode === 'sea' ? 'text-teal-300' : ''
            }`}
          >
            Ocean & Ships
          </button>
          <button
            type="button"
            onClick={() => setShowCompass(true)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sky Compass
          </button>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Craft Guide
          </button>
          <button
            type="button"
            onClick={handleFocusClosestOverhead}
            disabled={!closestOverhead}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
          >
            Closest Overhead
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => handleUseGps(false)}
            disabled={isLocatingGps}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#07090E] bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <LocateFixed className="w-3.5 h-3.5" />
            <span>{isLocatingGps ? 'Locating...' : 'Locate Me'}</span>
          </button>
        </div>
      </header>

      {/* Mobile Pane Switcher */}
      <div className="lg:hidden flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-[#0B0E17] shrink-0">
        <div className="flex items-center gap-1 p-0.5 bg-[#07090E] border border-slate-800 rounded-md">
          <button
            type="button"
            onClick={() => setMobilePane('map')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
              mobilePane === 'map' ? 'bg-slate-800 text-white' : 'text-slate-400'
            }`}
          >
            Map View
          </button>
          <button
            type="button"
            onClick={() => setMobilePane('list')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
              mobilePane === 'list' ? 'bg-slate-800 text-white' : 'text-slate-400'
            }`}
          >
            {activeListDomain === 'sea'
              ? `Ships (${filteredVessels.length})`
              : `Aircraft (${filteredAircraft.length})`}
          </button>
        </div>

        <button
          type="button"
          onClick={() => handleChangeTrackingMode(trackingMode === 'sea' ? 'air' : 'sea', true)}
          className="text-xs font-medium text-teal-300 hover:text-teal-200 cursor-pointer"
        >
          {trackingMode === 'sea' ? 'Airspace' : 'Ocean & Ships'}
        </button>
      </div>

      {/* Main Split Workspace */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Left Control & Live Feed Column */}
        <aside
          className={`${
            mobilePane === 'list' ? 'flex' : 'hidden lg:flex'
          } flex-col w-full lg:w-[390px] xl:w-[410px] h-full border-r border-slate-800 bg-[#0B0E17] shrink-0 min-h-0`}
        >
          {/* Tracking Domain Selector + Location & Scan Controls */}
          <div className="p-4 border-b border-slate-800 space-y-3 shrink-0">
            <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#07090E] border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => handleChangeTrackingMode('air')}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  trackingMode === 'air'
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Plane className="w-3.5 h-3.5" />
                <span>Airspace</span>
              </button>
              <button
                type="button"
                onClick={() => handleChangeTrackingMode('both')}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  trackingMode === 'both'
                    ? 'bg-sky-500/15 text-sky-200 border border-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <span>Air + Sea</span>
              </button>
              <button
                type="button"
                onClick={() => handleChangeTrackingMode('sea', true)}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  trackingMode === 'sea'
                    ? 'bg-teal-500/15 text-teal-300 border border-teal-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Ship className="w-3.5 h-3.5" />
                <span>Ships</span>
              </button>
            </div>

            <LocationSearch
              currentLocation={observer}
              trackingMode={trackingMode}
              onSelectLocation={handleSelectObserver}
              onUseGps={() => handleUseGps(false)}
              isLocatingGps={isLocatingGps}
            />

            {locationNotice && (
              <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded px-2.5 py-1.5">
                {locationNotice}
              </p>
            )}

            {/* Scan Radius / Ocean Scope & Live Polling Controls */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              {trackingMode === 'sea' ? (
                <div className="flex items-center gap-1 p-0.5 bg-[#07090E] border border-slate-800 rounded-md">
                  <button
                    type="button"
                    onClick={() => setVesselScope('global')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      vesselScope === 'global'
                        ? 'bg-teal-500/15 text-teal-300 border border-teal-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    All Oceans
                  </button>
                  {[600, 1500].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setVesselScope('radius');
                        setVesselRadiusNm(r);
                      }}
                      className={`px-2 py-1 text-xs font-mono-tabular rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        vesselScope === 'radius' && vesselRadiusNm === r
                          ? 'bg-teal-500/15 text-teal-300 border border-teal-500/40'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      {r} NM
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1 p-0.5 bg-[#07090E] border border-slate-800 rounded-md">
                  {RADIUS_OPTIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRadiusNm(r)}
                      className={`px-2.5 py-1 text-xs font-mono-tabular rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        radiusNm === r
                          ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      {r} NM
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsPaused((p) => !p)}
                  aria-label={isPaused ? 'Resume live updates' : 'Pause live updates'}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-slate-800 bg-[#07090E] rounded text-slate-300 hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isPaused ? (
                    <>
                      <Play className="w-3 h-3 text-amber-400" />
                      <span>Paused</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">● Live</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (shouldMonitorAir) void fetchAirspace(true);
                    if (shouldMonitorSea) void fetchVessels(true);
                  }}
                  disabled={isRefreshing}
                  aria-label="Refresh telemetry now"
                  className="p-1.5 border border-slate-800 bg-[#07090E] rounded text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Proximity Alert Perimeter Strip */}
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#07090E] border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => setShowAlertModal(true)}
                className="flex items-center gap-2 min-w-0 text-left group cursor-pointer"
              >
                {alertConfig.enabled ? (
                  <BellRing className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <Bell className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
                    Proximity Alert
                  </div>
                  <div className="text-[11px] font-mono-tabular truncate">
                    {alertConfig.enabled ? (
                      <span className="text-amber-300">
                        {alertConfig.radiusNm} NM ·{' '}
                        {alertConfig.targets === 'both'
                          ? 'Air + Sea'
                          : alertConfig.targets === 'air'
                            ? 'Aircraft'
                            : 'Vessels'}
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        Configure radius ({alertConfig.radiusNm} NM)
                      </span>
                    )}
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                {alertHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAlertModal(true)}
                    title="View recent perimeter entries"
                    className="px-1.5 py-0.5 text-[11px] font-mono-tabular text-amber-300 hover:text-amber-200 cursor-pointer"
                  >
                    {alertHistory.length}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const nextEnabled = !alertConfig.enabled;
                    if (nextEnabled && notifPermission === 'default') {
                      handleRequestNotifPermission();
                    }
                    handleChangeAlertConfig({ ...alertConfig, enabled: nextEnabled });
                  }}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    alertConfig.enabled
                      ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 hover:bg-amber-500/30'
                      : 'bg-[#0B0E17] border-slate-700 text-slate-300 hover:border-amber-400/50 hover:text-amber-200'
                  }`}
                >
                  {alertConfig.enabled ? 'Armed' : 'Arm'}
                </button>
              </div>
            </div>
          </div>

          {/* Directly Overhead Spotlight (Aircraft modes) */}
          {trackingMode !== 'sea' && closestOverhead && activeListDomain === 'air' && (
            <div className="px-4 py-3 border-b border-slate-800 bg-[#07090E]/70 shrink-0">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>Closest Overhead Right Now</span>
                <span className="font-mono-tabular text-cyan-300">
                  {closestOverhead.elevationAngleDeg}° elevation
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedVesselId(null);
                  setSelectedHex(closestOverhead.hex);
                  setFollowSelected(true);
                  setMobilePane('map');
                }}
                className="w-full text-left flex items-center justify-between gap-3 group cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <AircraftSilhouette
                    kind={closestOverhead.craftKind}
                    color={craftAccentHex(closestOverhead.craftKind)}
                    size={22}
                    heading={closestOverhead.heading}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-tabular text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">
                        {closestOverhead.callsign}
                      </span>
                      <span className="text-xs text-slate-400">
                        {closestOverhead.aircraftType || craftKindLabel(closestOverhead.craftKind)}
                      </span>
                      {(closestOverhead.route || resolvedRoutes[closestOverhead.hex]) && (
                        <span className="font-mono-tabular text-xs text-cyan-300">
                          {(closestOverhead.route || resolvedRoutes[closestOverhead.hex])!.origin.iata ||
                            (closestOverhead.route || resolvedRoutes[closestOverhead.hex])!.origin.icao}{' '}
                          →{' '}
                          {(closestOverhead.route || resolvedRoutes[closestOverhead.hex])!.destination.iata ||
                            (closestOverhead.route || resolvedRoutes[closestOverhead.hex])!.destination.icao}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {(closestOverhead.route || resolvedRoutes[closestOverhead.hex])
                        ? `${(closestOverhead.route || resolvedRoutes[closestOverhead.hex])!.origin.city || (closestOverhead.route || resolvedRoutes[closestOverhead.hex])!.origin.name} → ${(closestOverhead.route || resolvedRoutes[closestOverhead.hex])!.destination.city || (closestOverhead.route || resolvedRoutes[closestOverhead.hex])!.destination.name}`
                        : describeOverheadSightline(closestOverhead)}
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono-tabular shrink-0">
                  <div className="text-xs font-semibold text-slate-100">
                    {formatAltitude(closestOverhead.altitudeFt, closestOverhead.onGround)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {closestOverhead.distanceNm.toFixed(1)} NM
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Air + Sea Domain Switcher inside sidebar */}
          {trackingMode === 'both' && (
            <div className="px-3 pt-3 shrink-0">
              <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#07090E] border border-slate-800 rounded-md">
                <button
                  type="button"
                  onClick={() => setListDomain('air')}
                  className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                    listDomain === 'air' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Aircraft ({filteredAircraft.length})
                </button>
                <button
                  type="button"
                  onClick={() => setListDomain('sea')}
                  className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                    listDomain === 'sea' ? 'bg-slate-800 text-teal-200' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Ships & Cruise ({filteredVessels.length})
                </button>
              </div>
            </div>
          )}

          {/* Filters Section */}
          {activeListDomain === 'air' ? (
            <div className="p-3 border-b border-slate-800 space-y-2.5 shrink-0">
              {snapshot && (
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
                  <span className="truncate">
                    Over <span className="text-slate-200 font-medium">{observer.label.split(',')[0]}</span>
                  </span>
                  <span className="font-mono-tabular shrink-0">
                    <span className="text-cyan-400">{visibleAirCounts.commercial} jets</span>
                    {' · '}
                    <span className="text-amber-400">{visibleAirCounts.helicopter} helis</span>
                    {' · '}
                    <span className="text-rose-400">{visibleAirCounts.fighter} mil/fighters</span>
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1 p-1 bg-[#07090E] border border-slate-800 rounded-md overflow-x-auto">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterKind(tab.id)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      filterKind === tab.id
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label} <span className="font-mono-tabular text-[11px] text-slate-400">{tab.count}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchCallsign}
                    onChange={(e) => setSearchCallsign(e.target.value)}
                    placeholder="Filter callsign, tail, type..."
                    aria-label="Filter aircraft list"
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSortMode((prev) =>
                      prev === 'overhead'
                        ? 'distance'
                        : prev === 'distance'
                          ? 'altitude'
                          : prev === 'altitude'
                            ? 'speed'
                            : 'overhead'
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-300 hover:border-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                  title="Cycle sort order"
                >
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  <span className="capitalize">{sortMode}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHideGround((v) => !v)}
                  className={`px-2 py-1.5 text-xs border rounded whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    hideGround
                      ? 'border-slate-800 bg-[#07090E] text-slate-400 hover:text-slate-200'
                      : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                  }`}
                  title="Toggle parked/taxiing aircraft"
                >
                  {hideGround ? 'Air Only' : '+ Ground'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 border-b border-slate-800 space-y-2.5 shrink-0">
              {vesselSnapshot && (
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5 gap-2">
                  <span className="truncate">
                    {vesselScope === 'global'
                      ? `All Oceans · nearest to ${observer.label.split(',')[0]}`
                      : `Within ${vesselRadiusNm} NM of ${observer.label.split(',')[0]}`}
                  </span>
                  <span className="font-mono-tabular shrink-0 text-teal-300">
                    {vesselSnapshot.totalCount} vessels
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1 p-1 bg-[#07090E] border border-slate-800 rounded-md overflow-x-auto">
                {vesselTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setVesselFilter(tab.id)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      vesselFilter === tab.id
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label} <span className="font-mono-tabular text-[11px] text-slate-400">{tab.count}</span>
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchVessel}
                  onChange={(e) => setSearchVessel(e.target.value)}
                  placeholder="Filter ship, Indian Ocean, port, MMSI..."
                  aria-label="Filter maritime vessels"
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>
          )}

          {/* Live List (Aircraft or Maritime Vessels) */}
          <div className="flex-1 min-h-0 overflow-y-auto telemetry-scroll divide-y divide-slate-800/70">
            {activeListDomain === 'air' ? (
              isLoading && !snapshot ? (
                <div className="p-4 space-y-3">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-12 rounded bg-slate-900/70 animate-pulse" />
                  ))}
                </div>
              ) : feedError && !snapshot ? (
                <div className="p-6 text-center space-y-3">
                  <p className="text-xs text-rose-300">{feedError}</p>
                  <button
                    type="button"
                    onClick={() => void fetchAirspace(true)}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white rounded cursor-pointer"
                  >
                    Retry Live Feed
                  </button>
                </div>
              ) : filteredAircraft.length === 0 ? (
                <div className="p-6 text-center space-y-3">
                  <Radar className="w-7 h-7 text-slate-600 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-200">No matching aircraft overhead</p>
                    <p className="text-xs text-slate-400">
                      Try expanding the scan radius or switching craft filters.
                    </p>
                  </div>
                  {radiusNm < 30 && (
                    <button
                      type="button"
                      onClick={() => setRadiusNm(30)}
                      className="px-3 py-1.5 text-xs font-medium bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 rounded hover:bg-cyan-500/25 transition-colors cursor-pointer"
                    >
                      Expand Scan to 30 NM
                    </button>
                  )}
                </div>
              ) : (
                filteredAircraft.map((ac) => {
                  const isSelected = ac.hex === selectedHex;
                  const accent = craftAccentHex(ac.craftKind);
                  const vrate = formatVerticalRate(ac.verticalRateFpm);

                  return (
                    <button
                      key={ac.hex}
                      type="button"
                      onClick={() => {
                        setSelectedVesselId(null);
                        setSelectedHex(ac.hex);
                        setMobilePane('map');
                      }}
                      className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isSelected ? 'bg-cyan-500/10' : 'hover:bg-slate-900/70'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded bg-[#07090E] border border-slate-800 flex items-center justify-center shrink-0">
                          <AircraftSilhouette
                            kind={ac.craftKind}
                            color={ac.emergency ? '#FB7185' : accent}
                            size={18}
                            heading={ac.heading}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm">
                            <span className="font-mono-tabular font-semibold text-white truncate">
                              {ac.callsign}
                            </span>
                            <span aria-hidden="true" className="text-slate-600">·</span>
                            <span className="text-xs font-mono-tabular text-slate-400">
                              {ac.aircraftType || craftKindLabel(ac.craftKind)}
                            </span>
                            {(ac.route || resolvedRoutes[ac.hex]) && (
                              <>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span className="text-xs font-mono-tabular text-cyan-300 truncate">
                                  {(ac.route || resolvedRoutes[ac.hex])!.origin.iata ||
                                    (ac.route || resolvedRoutes[ac.hex])!.origin.icao}
                                  →
                                  {(ac.route || resolvedRoutes[ac.hex])!.destination.iata ||
                                    (ac.route || resolvedRoutes[ac.hex])!.destination.icao}
                                </span>
                              </>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                            <span style={{ color: accent }}>{craftKindLabel(ac.craftKind)}</span>
                            {ac.isMilitary && ac.craftKind !== 'fighter' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-rose-400">Military</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            {(ac.route || resolvedRoutes[ac.hex]) ? (
                              <span className="truncate text-slate-300">
                                {(ac.route || resolvedRoutes[ac.hex])!.origin.city ||
                                  (ac.route || resolvedRoutes[ac.hex])!.origin.icao}{' '}
                                to{' '}
                                {(ac.route || resolvedRoutes[ac.hex])!.destination.city ||
                                  (ac.route || resolvedRoutes[ac.hex])!.destination.icao}
                              </span>
                            ) : (
                              <>
                                <span className="font-mono-tabular">
                                  {ac.distanceNm.toFixed(1)} NM {ac.compassDir}
                                </span>
                                {!ac.onGround && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono-tabular text-slate-300">
                                      {ac.elevationAngleDeg}° up
                                    </span>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono-tabular shrink-0">
                        <div className="text-xs font-semibold text-slate-100">
                          {formatAltitude(ac.altitudeFt, ac.onGround)}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center justify-end gap-1.5">
                          <span>{ac.groundSpeedKts} kt</span>
                          <span className={vrate.toneClass}>{vrate.symbol}</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )
            ) : isLoadingVessels && !vesselSnapshot ? (
              <div className="p-4 space-y-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 rounded bg-slate-900/70 animate-pulse" />
                ))}
              </div>
            ) : vesselError && !vesselSnapshot ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-xs text-rose-300">{vesselError}</p>
                <button
                  type="button"
                  onClick={() => void fetchVessels(true)}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white rounded cursor-pointer"
                >
                  Retry Maritime Feed
                </button>
              </div>
            ) : filteredVessels.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <Anchor className="w-7 h-7 text-slate-600 mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-200">No vessels in current filter</p>
                  <p className="text-xs text-slate-400">
                    Switch to All Oceans or pick Indian Ocean / Baltic Sea to inspect cruising ships.
                  </p>
                </div>
                {vesselScope === 'radius' && (
                  <button
                    type="button"
                    onClick={() => setVesselScope('global')}
                    className="px-3 py-1.5 text-xs font-medium bg-teal-500/15 border border-teal-500/40 text-teal-300 rounded hover:bg-teal-500/25 transition-colors cursor-pointer"
                  >
                    Show All Oceans
                  </button>
                )}
              </div>
            ) : (
              filteredVessels.map((v) => {
                const isSelected = v.id === selectedVesselId;
                const accent = vesselAccentHex(v.vesselKind);

                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setSelectedHex(null);
                      setSelectedVesselId(v.id);
                      setFollowSelected(true);
                      setMobilePane('map');
                    }}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isSelected ? 'bg-teal-500/10' : 'hover:bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded bg-[#07090E] border border-slate-800 flex items-center justify-center shrink-0">
                        <VesselSilhouette
                          kind={v.vesselKind}
                          color={accent}
                          size={17}
                          heading={v.heading ?? v.cogDeg}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="font-mono-tabular font-semibold text-white truncate">
                            {v.name}
                          </span>
                          {v.destination && (
                            <>
                              <span aria-hidden="true" className="text-slate-600">→</span>
                              <span className="text-xs font-mono-tabular text-teal-300 truncate">
                                {v.destination}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                          <span style={{ color: accent }}>{vesselKindLabel(v.vesselKind)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate text-slate-300">{v.oceanRegion}</span>
                          {v.mmsi && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-tabular text-slate-400">{v.mmsi}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono-tabular shrink-0">
                      <div className="text-xs font-semibold text-slate-100">
                        {v.sogKts !== null ? `${v.sogKts} kt` : v.windSpeedKts !== null ? `${v.windSpeedKts}kt wind` : 'At Sea'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {v.distanceNm.toLocaleString()} NM {v.compassDir}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Main Google Map Viewport */}
        <main
          className={`${
            mobilePane === 'map' ? 'block' : 'hidden lg:block'
          } flex-1 relative min-h-0 h-full`}
        >
          {!keyResolved ? (
            <div className="w-full h-full flex items-center justify-center bg-[#07090E] text-sm text-slate-400">
              Initializing airspace radar...
            </div>
          ) : !mapsApiKey ? (
            <div className="w-full h-full flex items-center justify-center bg-[#07090E] p-6 text-center">
              <div className="max-w-md space-y-2 border border-slate-800 bg-[#0B0E17] p-5 rounded-md">
                <h2 className="font-display text-base font-bold text-white">
                  Google Maps Key Required
                </h2>
                <p className="text-xs text-slate-400">
                  Set <code className="font-mono text-slate-200">VITE_GOOGLE_MAPS_API_KEY</code> in your environment to render the live airspace map.
                </p>
              </div>
            </div>
          ) : (
            <AirspaceMap
              observer={observer}
              radiusNm={radiusNm}
              trackingMode={trackingMode}
              aircraft={filteredAircraft}
              vessels={filteredVessels}
              shippingLanes={shippingLanes}
              showShipRoutes={showShipRoutes}
              weatherMode={weatherMode}
              weatherData={weatherData}
              weatherLoading={weatherLoading}
              weatherError={weatherError}
              selectedHex={selectedHex}
              selectedVesselId={selectedVesselId}
              selectedRoute={
                selectedAircraft
                  ? selectedAircraft.route || resolvedRoutes[selectedAircraft.hex] || null
                  : null
              }
              followSelected={followSelected}
              mapStyleMode={mapStyleMode}
              proximityAlert={{
                enabled: alertConfig.enabled,
                radiusNm: alertConfig.radiusNm,
              }}
              onChangeMapStyle={setMapStyleMode}
              onToggleShipRoutes={() => setShowShipRoutes((v) => !v)}
              onToggleWeather={() =>
                setWeatherMode((m) => (m === 'off' ? 'both' : 'off'))
              }
              onChangeWeatherMode={setWeatherMode}
              onSelectAircraft={(hex) => {
                setSelectedVesselId(null);
                setSelectedHex(hex);
                if (!hex) setFollowSelected(false);
              }}
              onSelectVessel={(id) => {
                setSelectedHex(null);
                setSelectedVesselId(id);
                if (!id) setFollowSelected(false);
              }}
              onToggleFollow={() => setFollowSelected((f) => !f)}
            />
          )}

          {/* In-App Proximity Entry Toast Banner */}
          {activeToast && (
            <div
              role="status"
              aria-live="polite"
              className="absolute top-3 left-3 right-3 sm:right-auto sm:max-w-sm z-30 bg-[#0B0E17]/95 border border-amber-400/60 rounded-md shadow-2xl px-3.5 py-2.5 flex items-start justify-between gap-3"
            >
              <button
                type="button"
                onClick={() => {
                  handleSelectAlertEvent(activeToast);
                  setActiveToast(null);
                }}
                className="flex items-start gap-2.5 min-w-0 text-left cursor-pointer group"
              >
                <BellRing className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white group-hover:text-amber-200 transition-colors truncate">
                    {activeToast.title}
                  </div>
                  <div className="text-[11px] text-slate-300 truncate mt-0.5">
                    {activeToast.subtitle}
                  </div>
                  <div className="text-[11px] font-mono-tabular text-amber-300 mt-0.5">
                    {activeToast.distanceNm.toFixed(1)} NM {activeToast.compassDir}
                    {activeToast.entityId !== '__test__' && ' · Click to focus'}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveToast(null)}
                aria-label="Dismiss proximity alert"
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Compact Radar & Maritime Legend */}
          <div className="absolute bottom-3 left-3 z-10 hidden sm:flex items-center gap-3 px-3 py-1.5 bg-[#0B0E17]/92 border border-slate-800 rounded-md text-[11px] text-slate-300 shadow-lg flex-wrap max-w-[calc(100%-430px)]">
            {trackingMode !== 'sea' && (
              <>
                <span className="font-mono-tabular text-slate-200">
                  {filteredAircraft.length} airborne
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-cyan-400">Airliners</span>
                <span className="text-amber-400">Helicopters</span>
                <span className="text-rose-400">Fighters / Mil</span>
                <span className="text-emerald-400">Light / GA</span>
              </>
            )}
            {trackingMode === 'both' && <span aria-hidden="true" className="text-slate-600">|</span>}
            {trackingMode !== 'air' && (
              <>
                <span className="font-mono-tabular text-slate-200">
                  {filteredVessels.length} ships
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-teal-300">Cruise</span>
                <span className="text-blue-400">Cargo</span>
                <span className="text-orange-400">Tankers</span>
                <span className="text-sky-400">Ocean VOS</span>
              </>
            )}
            {showShipRoutes && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-sky-300">Sea Lanes</span>
              </>
            )}
            {weatherMode !== 'off' && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="inline-flex items-center gap-1.5 text-emerald-300">
                  <span>
                    {weatherMode === 'precip'
                      ? 'Precip Radar'
                      : weatherMode === 'temp'
                        ? 'Temp & Wind'
                        : 'Weather Radar'}
                  </span>
                  {(weatherMode === 'precip' || weatherMode === 'both') && (
                    <span
                      aria-label="Precipitation intensity scale light to heavy"
                      className="inline-block w-14 h-2 rounded-sm border border-slate-700"
                      style={{
                        background:
                          'linear-gradient(90deg, #38BDF8 0%, #2563EB 40%, #FACC15 72%, #EF4444 100%)',
                      }}
                    />
                  )}
                </span>
              </>
            )}
            {alertConfig.enabled && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono-tabular text-amber-300">
                  Alert {alertConfig.radiusNm} NM
                </span>
              </>
            )}
          </div>

          {/* Selected Aircraft or Vessel Telemetry Inspector */}
          {selectedAircraft ? (
            <div className="absolute bottom-3 right-3 left-3 sm:left-auto z-20">
              <AircraftInspector
                aircraft={selectedAircraft}
                onRouteResolved={handleRouteResolved}
                onClose={() => {
                  setSelectedHex(null);
                  setFollowSelected(false);
                }}
              />
            </div>
          ) : selectedVessel ? (
            <div className="absolute bottom-3 right-3 left-3 sm:left-auto z-20">
              <VesselInspector
                vessel={selectedVessel}
                onClose={() => {
                  setSelectedVesselId(null);
                  setFollowSelected(false);
                }}
              />
            </div>
          ) : null}
        </main>
      </div>

      {/* Interactive Modals */}
      {showCompass && (
        <SkyCompassModal
          observer={observer}
          aircraft={filteredAircraft}
          selectedHex={selectedHex}
          onSelectAircraft={(hex) => {
            setSelectedVesselId(null);
            setSelectedHex(hex);
            setMobilePane('map');
          }}
          onClose={() => setShowCompass(false)}
        />
      )}

      {showGuide && <CraftGuideModal onClose={() => setShowGuide(false)} />}

      {showAlertModal && (
        <ProximityAlertModal
          observer={observer}
          config={alertConfig}
          notifPermission={notifPermission}
          alertHistory={alertHistory}
          onChangeConfig={handleChangeAlertConfig}
          onRequestNotifPermission={handleRequestNotifPermission}
          onSendTestAlert={handleSendTestAlert}
          onSelectEvent={handleSelectAlertEvent}
          onClearHistory={() => setAlertHistory([])}
          onClose={() => setShowAlertModal(false)}
        />
      )}
    </div>
  );

  if (!mapsApiKey) {
    return mainContent;
  }

  return (
    <APIProvider
      apiKey={mapsApiKey}
      libraries={['places', 'marker', 'core']}
      language="en"
      region="US"
    >
      {mainContent}
    </APIProvider>
  );
}
