import Svg, { Circle, Path, Line, Rect } from 'react-native-svg';

export function Spinner({ size = 16, color = '#ffffff', trackColor = 'rgba(255,255,255,0.25)' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx="8" cy="8" r="6" stroke={trackColor} strokeWidth="2" />
      <Path d="M8 2a6 6 0 0 1 6 6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function CheckIcon({ size = 36, color = '#4ade80' }) {
  // Centered on the path's own bounding box (10.5,12.5)-(25.5,23.5), not just
  // the viewBox — the original points left it visibly off-center inside any
  // circular badge wrapping it.
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <Path d="M10.5 18.5L15.5 23.5L25.5 12.5" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function BackIcon({ size = 20, color = '#ffffff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M12.5 5L7.5 10L12.5 15" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function EditIcon({ size = 15, color = 'rgba(255,255,255,0.4)' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H3v-2L11.5 2.5z" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TrashIcon({ size = 18, color = '#ffffff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path d="M2.5 4.5h11" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <Path d="M6 2.5h4a1 1 0 011 1v1H5v-1a1 1 0 011-1z" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
      <Path d="M3.5 4.5l.6 8.1a1 1 0 001 .9h5.8a1 1 0 001-.9l.6-8.1" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
      <Path d="M6.5 7v4M9.5 7v4" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  );
}

export function EyeIcon({ open, size = 16 }) {
  return open ? (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="rgba(255,255,255,0.4)" strokeWidth="1.3" />
      <Circle cx="8" cy="8" r="2" stroke="rgba(255,255,255,0.4)" strokeWidth="1.3" />
    </Svg>
  ) : (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="rgba(255,255,255,0.4)" strokeWidth="1.3" />
      <Circle cx="8" cy="8" r="2" stroke="rgba(255,255,255,0.4)" strokeWidth="1.3" />
      <Line x1="2" y1="2" x2="14" y2="14" stroke="rgba(255,255,255,0.4)" strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  );
}

export function ChevronRight({ size = 14 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Path d="M5 3l4 4-4 4" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function HamburgerIcon() {
  return (
    <Svg width={20} height={14} viewBox="0 0 20 14" fill="none">
      <Line x1="0" y1="1" x2="20" y2="1" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" strokeLinecap="round" />
      <Line x1="0" y1="7" x2="14" y2="7" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" strokeLinecap="round" />
      <Line x1="0" y1="13" x2="17" y2="13" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

export function PlusIcon({ size = 26, color = '#ffffff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="12" y1="3" x2="12" y2="21" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <Line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </Svg>
  );
}

export function CameraIcon({ size = 22, color = 'rgba(255,255,255,0.5)' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Path d="M8 5.5l1-2h4l1 2h3a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0117 17.5H5A1.5 1.5 0 013.5 16V7A1.5 1.5 0 015 5.5h3z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <Circle cx="11" cy="11.5" r="3.25" stroke={color} strokeWidth="1.4" />
    </Svg>
  );
}

export function GoogleIcon({ size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <Path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <Path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
      <Path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </Svg>
  );
}

export function CalendarIcon({ size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Rect x="1.5" y="3" width="15" height="13" rx="2.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.4" />
      <Line x1="1.5" y1="7" x2="16.5" y2="7" stroke="rgba(255,255,255,0.7)" strokeWidth="1.4" />
      <Line x1="5" y1="1" x2="5" y2="4.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.4" strokeLinecap="round" />
      <Line x1="13" y1="1" x2="13" y2="4.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}
