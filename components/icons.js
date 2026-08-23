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
