export type CraftKind =
  | 'helicopter'
  | 'fighter'
  | 'heavy'
  | 'commercial'
  | 'light'
  | 'special'
  | 'unknown';

export type FilterKind =
  | 'all'
  | 'commercial'
  | 'helicopter'
  | 'fighter'
  | 'light'
  | 'special';

export type SortMode = 'overhead' | 'distance' | 'altitude' | 'speed';

export interface TrailPoint {
  lat: number;
  lng: number;
  altFt: number;
  gsKts: number;
  ts: number;
}

export interface AirportEndpoint {
  iata: string | null;
  icao: string;
  name: string;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
}

export interface FlightRouteInfo {
  callsignIata: string | null;
  airlineName: string | null;
  origin: AirportEndpoint;
  destination: AirportEndpoint;
  source: string;
}

export interface Aircraft {
  hex: string;
  callsign: string;
  registration: string | null;
  aircraftType: string | null;
  aircraftDesc: string | null;
  operator: string | null;
  categoryCode: string | null;
  craftKind: CraftKind;
  isMilitary: boolean;
  lat: number;
  lon: number;
  altitudeFt: number;
  altitudeGeomFt: number | null;
  onGround: boolean;
  groundSpeedKts: number;
  heading: number;
  verticalRateFpm: number;
  squawk: string | null;
  emergency: string | null;
  distanceNm: number;
  bearingDeg: number;
  compassDir: string;
  elevationAngleDeg: number;
  overheadScore: number;
  seenSec: number;
  rssi: number | null;
  messages: number;
  trail: TrailPoint[];
  route: FlightRouteInfo | null;
}

export interface AirspaceSnapshot {
  center: {
    lat: number;
    lon: number;
  };
  radiusNm: number;
  fetchedAt: number;
  source: string;
  totalCount: number;
  counts: {
    all: number;
    commercial: number;
    helicopter: number;
    fighter: number;
    light: number;
    special: number;
  };
  aircraft: Aircraft[];
}

export interface ObserverLocation {
  lat: number;
  lng: number;
  label: string;
  source: 'gps' | 'search' | 'preset' | 'default';
}

export type FlightCategory =
  | 'Commercial Flight'
  | 'Cargo Flight'
  | 'Private Jet'
  | 'Military Flight'
  | 'Helicopter'
  | 'General Aviation'
  | 'Special / Utility';

export interface AircraftPhotoInfo {
  url: string;
  fallbackUrl: string | null;
  source: 'Planespotters.net' | 'Airport-Data' | 'Wikimedia Commons';
  isExactAirframe: boolean;
  photographer: string | null;
  sourceLink: string | null;
}

export interface AircraftMetadata {
  hex: string;
  registration: string | null;
  manufacturer: string | null;
  type: string | null;
  icaoType: string | null;
  registeredOwners: string | null;
  registeredOwnerCountry: string | null;
  operatorFlagCode: string | null;
  photo: AircraftPhotoInfo | null;
  route: FlightRouteInfo | null;
}

export type TrackingMode = 'air' | 'both' | 'sea';

export type VesselKind =
  | 'cruise'
  | 'cargo'
  | 'tanker'
  | 'fishing'
  | 'tug'
  | 'sailing'
  | 'vos'
  | 'other';

export type VesselFilterKind =
  | 'all'
  | 'cruise'
  | 'cargo'
  | 'tanker'
  | 'vos'
  | 'other';

export interface Vessel {
  id: string;
  mmsi: string | null;
  imo: string | null;
  name: string;
  callsign: string | null;
  destination: string | null;
  vesselKind: VesselKind;
  shipTypeCode: number | null;
  lat: number;
  lon: number;
  sogKts: number | null;
  cogDeg: number | null;
  heading: number | null;
  draughtM: number | null;
  navStatus: string | null;
  oceanRegion: string;
  distanceNm: number;
  bearingDeg: number;
  compassDir: string;
  reportedAt: number;
  source: 'NOAA VOS' | 'Digitraffic AIS' | 'AISStream';
  windSpeedKts: number | null;
  windDirDeg: number | null;
  waveHeightFt: number | null;
  waterTempF: number | null;
  pressureIn: number | null;
}

export interface VesselsSnapshot {
  center: {
    lat: number;
    lon: number;
  };
  radiusNm: number;
  scope: 'global' | 'radius';
  fetchedAt: number;
  sources: string[];
  totalCount: number;
  counts: {
    all: number;
    cruise: number;
    cargo: number;
    tanker: number;
    vos: number;
    other: number;
  };
  vessels: Vessel[];
}

export interface ShippingLaneFeature {
  tier: 'Major' | 'Middle' | 'Minor';
  paths: Array<Array<{ lat: number; lng: number }>>;
}

export type ProximityTargetMode = 'both' | 'air' | 'sea';

export interface ProximityAlertConfig {
  enabled: boolean;
  radiusNm: number;
  targets: ProximityTargetMode;
  airborneOnly: boolean;
  soundEnabled: boolean;
}

export interface ProximityAlertEvent {
  id: string;
  entityKey: string;
  entityId: string;
  domain: 'air' | 'sea';
  title: string;
  subtitle: string;
  distanceNm: number;
  bearingDeg: number;
  compassDir: string;
  timestamp: number;
}

export type WeatherLayerMode = 'off' | 'precip' | 'temp' | 'both';

export interface WeatherStationSample {
  id: string;
  label: string;
  lat: number;
  lng: number;
  tempC: number;
  tempF: number;
  windKts: number;
  windDirDeg: number;
  precipMm1h: number;
  cloudCoverPct: number;
  humidityPct: number;
  pressureHpa: number;
  symbolCode: string;
}

export interface WeatherOverlaySnapshot {
  center: {
    lat: number;
    lng: number;
  };
  fetchedAt: number;
  radarHost: string | null;
  radarPath: string | null;
  radarTime: number | null;
  current: WeatherStationSample;
  gridPoints: WeatherStationSample[];
}
