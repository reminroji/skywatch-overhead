import type { CraftKind, VesselKind } from '../types/airspace';

interface IconProps {
  kind: CraftKind;
  color?: string;
  size?: number;
  heading?: number;
  className?: string;
}

export function AircraftSilhouette({
  kind,
  color = 'currentColor',
  size = 24,
  heading = 0,
  className = '',
}: IconProps) {
  const style = {
    transform: `rotate(${heading}deg)`,
    transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
  };

  if (kind === 'helicopter') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        style={style}
        className={className}
        aria-hidden="true"
      >
        {/* Main rotor blades */}
        <path
          d="M5 7L27 21M27 7L5 21"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.85"
        />
        {/* Cabin fuselage */}
        <ellipse cx="16" cy="14" rx="4.2" ry="6.2" fill={color} />
        {/* Tail boom & horizontal stabilizer */}
        <rect x="14.9" y="19" width="2.2" height="9.5" rx="1" fill={color} />
        <rect x="12" y="26.5" width="8" height="1.8" rx="0.9" fill={color} />
        {/* Rotor hub */}
        <circle cx="16" cy="14" r="1.5" fill="#07090E" />
      </svg>
    );
  }

  if (kind === 'heavy') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        style={style}
        className={className}
        aria-hidden="true"
      >
        {/* Widebody swept wings + 4 engine pods */}
        <path
          d="M16 3L17.8 11.5L29 18.5V21L17.8 17.5L17.5 25L22 28V30L16 28.4L10 30V28L14.5 25L14.2 17.5L3 21V18.5L14.2 11.5L16 3Z"
          fill={color}
        />
        <circle cx="9.5" cy="15.5" r="1.2" fill={color} />
        <circle cx="22.5" cy="15.5" r="1.2" fill={color} />
      </svg>
    );
  }

  if (kind === 'light') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        style={style}
        className={className}
        aria-hidden="true"
      >
        {/* High-wing prop / light GA silhouette */}
        <rect x="13" y="4.5" width="6" height="1.4" rx="0.7" fill={color} opacity="0.8" />
        <path
          d="M16 6L17.3 12L27.5 14V16.8L17.2 16.2L17 24.5L21 27.2V29L16 27.6L11 29V27.2L15 24.5L14.8 16.2L4.5 16.8V14L14.7 12L16 6Z"
          fill={color}
        />
      </svg>
    );
  }

  if (kind === 'fighter') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        style={style}
        className={className}
        aria-hidden="true"
      >
        {/* Supersonic swept-delta fighter silhouette */}
        <path
          d="M16 2L17.6 9.5L28 19.5V22L18 18.8L17.8 25.5L22.5 28.5V30L16 27.6L9.5 30V28.5L14.2 25.5L14 18.8L4 22V19.5L14.4 9.5L16 2Z"
          fill={color}
        />
      </svg>
    );
  }

  if (kind === 'special') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        style={style}
        className={className}
        aria-hidden="true"
      >
        {/* Delta / high-performance silhouette */}
        <path
          d="M16 3L18.2 12L27 22.5L25.5 24L17.8 20.5L17.2 26.5L20.5 28.8V30L16 28.8L11.5 30V28.8L14.8 26.5L14.2 20.5L6.5 24L5 22.5L13.8 12L16 3Z"
          fill={color}
        />
      </svg>
    );
  }

  // Commercial twinjet / default aircraft
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      style={style}
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16 3.5L17.7 11.8L28 18.2V20.6L17.7 17.4L17.3 25L21.5 27.8V29.6L16 28.1L10.5 29.6V27.8L14.7 25L14.3 17.4L4 20.6V18.2L14.3 11.8L16 3.5Z"
        fill={color}
      />
    </svg>
  );
}

interface VesselIconProps {
  kind: VesselKind;
  color?: string;
  size?: number;
  heading?: number | null;
  className?: string;
}

export function VesselSilhouette({
  kind,
  color = 'currentColor',
  size = 20,
  heading = 0,
  className = '',
}: VesselIconProps) {
  const hasHeading = typeof heading === 'number' && Number.isFinite(heading);
  const style = hasHeading
    ? {
        transform: `rotate(${heading}deg)`,
        transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }
    : undefined;

  if (!hasHeading && kind === 'vos') {
    // Non-directional ocean vessel diamond-hull beacon when heading isn't reported
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <path
          d="M16 4L24 14L20.5 26H11.5L8 14L16 4Z"
          fill={color}
          fillOpacity="0.88"
          stroke="#07090E"
          strokeWidth="1.2"
        />
        <rect x="13.5" y="13" width="5" height="6" rx="1" fill="#07090E" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {/* Top-down pointed ship hull */}
      <path
        d="M16 3L21.5 11.5V26.5C21.5 27.6 20.6 28.5 19.5 28.5H12.5C11.4 28.5 10.5 27.6 10.5 26.5V11.5L16 3Z"
        fill={color}
        stroke="#07090E"
        strokeWidth="1"
      />
      {kind === 'cruise' ? (
        <>
          <rect x="12.5" y="12" width="7" height="11" rx="1.5" fill="#07090E" fillOpacity="0.45" />
          <circle cx="16" cy="10" r="1.3" fill="#07090E" />
        </>
      ) : (
        <rect x="12.5" y="20" width="7" height="4" rx="0.8" fill="#07090E" fillOpacity="0.6" />
      )}
    </svg>
  );
}

