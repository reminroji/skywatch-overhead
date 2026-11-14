import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { LocateFixed, MapPin, Search, X } from 'lucide-react';
import type { ObserverLocation, TrackingMode } from '../types/airspace';

interface LocationSearchProps {
  currentLocation: ObserverLocation;
  trackingMode: TrackingMode;
  onSelectLocation: (loc: ObserverLocation) => void;
  onUseGps: () => void;
  isLocatingGps: boolean;
}

const CITY_PRESET_HUBS: ObserverLocation[] = [
  { lat: 40.7128, lng: -74.006, label: 'New York, NY', source: 'preset' },
  { lat: 32.7157, lng: -117.1611, label: 'San Diego, CA', source: 'preset' },
  { lat: 51.5074, lng: -0.1278, label: 'London, UK', source: 'preset' },
  { lat: 35.6762, lng: 139.6503, label: 'Tokyo, JP', source: 'preset' },
];

const OCEAN_PRESET_HUBS: ObserverLocation[] = [
  { lat: -8.5, lng: 76.0, label: 'Indian Ocean', source: 'preset' },
  { lat: 15.5, lng: 64.5, label: 'Arabian Sea', source: 'preset' },
  { lat: 2.5, lng: 101.2, label: 'Malacca Strait', source: 'preset' },
  { lat: 59.0, lng: 21.0, label: 'Baltic Sea', source: 'preset' },
  { lat: 35.5, lng: 18.0, label: 'Mediterranean', source: 'preset' },
];

function isQuotaError(err: unknown): boolean {
  const msg = String(err || '').toLowerCase();
  return (
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('429') ||
    msg.includes('over_query_limit')
  );
}

export function LocationSearch({
  currentLocation,
  trackingMode,
  onSelectLocation,
  onUseGps,
  isLocatingGps,
}: LocationSearchProps) {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmittingCity, setIsSubmittingCity] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!placesLib) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
    }

    let cancelled = false;
    setIsSearching(true);

    const timer = window.setTimeout(() => {
      placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: trimmed,
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((res) => {
          if (!cancelled) {
            setSuggestions(res.suggestions || []);
            setIsSearching(false);
            setIsOpen(true);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setSuggestions([]);
            setIsSearching(false);
          }
          if (isQuotaError(err)) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, query]);

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      setSearchError(null);
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location'],
        });

        const loc = place.location;
        if (loc) {
          onSelectLocation({
            lat: loc.lat(),
            lng: loc.lng(),
            label:
              place.displayName ||
              place.formattedAddress ||
              suggestion.placePrediction.text.text,
            source: 'search',
          });
        }
        setQuery('');
        setSuggestions([]);
        setIsOpen(false);
        sessionTokenRef.current = null;
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }
    },
    [placesLib, onSelectLocation]
  );

  const handleSubmitCity = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) return;

      setSearchError(null);
      setIsSubmittingCity(true);
      setIsOpen(false);

      try {
        // 1. If a Google Places prediction is already available, resolve it directly
        if (placesLib && suggestions[0]?.placePrediction) {
          await handleSelectSuggestion(suggestions[0]);
          setIsSubmittingCity(false);
          return;
        }

        // 2. Try Places API (New) Text Search
        if (placesLib?.Place?.searchByText) {
          try {
            const { places } = await placesLib.Place.searchByText({
              textQuery: trimmed,
              fields: ['displayName', 'formattedAddress', 'location'],
              maxResultCount: 1,
            });
            const hit = places?.[0];
            if (hit?.location) {
              onSelectLocation({
                lat: hit.location.lat(),
                lng: hit.location.lng(),
                label: hit.displayName || hit.formattedAddress || trimmed,
                source: 'search',
              });
              setQuery('');
              setSuggestions([]);
              sessionTokenRef.current = null;
              setIsSubmittingCity(false);
              return;
            }
          } catch (err) {
            if (isQuotaError(err)) {
              window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            }
          }
        }

        // 3. Server-side Geocoding fallback
        const res = await fetch(`/api/geocode-city?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errBody.error || `Could not find "${trimmed}".`);
        }
        const geo = (await res.json()) as { lat: number; lng: number; label: string };
        onSelectLocation({
          lat: geo.lat,
          lng: geo.lng,
          label: geo.label || trimmed,
          source: 'search',
        });
        setQuery('');
        setSuggestions([]);
        sessionTokenRef.current = null;
      } catch (err) {
        setSearchError(
          err instanceof Error ? err.message : `Could not locate "${trimmed}".`
        );
      } finally {
        setIsSubmittingCity(false);
      }
    },
    [query, placesLib, suggestions, handleSelectSuggestion, onSelectLocation]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium tracking-wider uppercase text-slate-400">
            {trackingMode === 'sea'
              ? 'Scanning Ocean / Maritime Zone'
              : trackingMode === 'both'
                ? 'Scanning Airspace & Ocean'
                : 'Scanning City / Airspace'}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-slate-100 truncate">
            <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate">{currentLocation.label}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onUseGps}
          disabled={isLocatingGps}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-500/60 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
        >
          <LocateFixed className="w-3.5 h-3.5 text-cyan-400" />
          <span>{isLocatingGps ? 'Locating...' : 'GPS'}</span>
        </button>
      </div>

      {/* City Name Search Form (Autocomplete + Enter/Button Submit) */}
      <form onSubmit={(e) => void handleSubmitCity(e)} className="relative flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (searchError) setSearchError(null);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setIsOpen(true);
            }}
            placeholder={
              trackingMode === 'air'
                ? 'Enter city name (e.g. San Diego, London)...'
                : 'Enter city, port, or ocean (e.g. Indian Ocean)...'
            }
            aria-label="Enter city or ocean name to scan"
            className="w-full pl-9 pr-8 py-2 text-sm bg-[#07090E] border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
                setIsOpen(false);
                setSearchError(null);
              }}
              aria-label="Clear city search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={!query.trim() || isSubmittingCity}
          className="px-3 py-2 text-xs font-semibold bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
        >
          {isSubmittingCity ? 'Finding...' : 'Scan'}
        </button>

        {isOpen && (suggestions.length > 0 || isSearching) && (
          <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-[#0B0E17] border border-slate-700 rounded-md shadow-xl overflow-hidden">
            {isSearching && suggestions.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-slate-400">Searching cities...</div>
            ) : (
              <ul className="divide-y divide-slate-800/80 max-h-56 overflow-y-auto">
                {suggestions.map((s, idx) => (
                  <li key={s.placePrediction?.placeId || idx}>
                    <button
                      type="button"
                      onClick={() => void handleSelectSuggestion(s)}
                      className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800/80 hover:text-cyan-300 transition-colors cursor-pointer"
                    >
                      {s.placePrediction?.text.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>

      {searchError && (
        <p className="text-xs text-rose-300">{searchError}</p>
      )}

      {/* Quick City / Ocean Presets */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(trackingMode === 'sea' ? OCEAN_PRESET_HUBS : trackingMode === 'both' ? [...OCEAN_PRESET_HUBS.slice(0, 3), ...CITY_PRESET_HUBS.slice(0, 2)] : CITY_PRESET_HUBS).map((hub) => {
          const isActive =
            Math.abs(currentLocation.lat - hub.lat) < 0.05 &&
            Math.abs(currentLocation.lng - hub.lng) < 0.05;
          return (
            <button
              key={hub.label}
              type="button"
              onClick={() => {
                setSearchError(null);
                onSelectLocation(hub);
              }}
              className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'border-cyan-500/70 bg-cyan-500/10 text-cyan-300'
                  : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {hub.label.split(',')[0]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
