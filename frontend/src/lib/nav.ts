import {
  BarChart3,
  Beaker,
  CalendarRange,
  Crown,
  Database,
  LayoutDashboard,
  Repeat,
  Settings,
  Sparkles,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  /** Route path, matched with react-router `end` for `/` only. */
  to: string;
  label: string;
  icon: LucideIcon;
  /** One-line description, used in the command palette and sidebar tooltips. */
  hint: string;
  /** Single-key shortcut, pressed after `g` (e.g. `g p` -> Player Explorer). */
  key?: string;
  /** Route matches by prefix (so `/players/12` still highlights Players). */
  prefix?: boolean;
};

export const NAV: readonly NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, hint: 'Gameweek dashboard', key: 'o' },
  { to: '/pitch', label: 'Squad Studio', icon: Sparkles, hint: 'Build and tune the XI', key: 's' },
  {
    to: '/players',
    label: 'Player Explorer',
    icon: Users,
    hint: 'Search, filter and compare players',
    key: 'p',
    prefix: true,
  },
  {
    to: '/fixtures',
    label: 'Fixture Planner',
    icon: CalendarRange,
    hint: 'Difficulty grid over the horizon',
    key: 'f',
  },
  { to: '/transfers', label: 'Transfer Planner', icon: Repeat, hint: 'Plan hits and swaps', key: 't' },
  { to: '/captain', label: 'Captaincy', icon: Crown, hint: 'Armband candidates', key: 'c' },
  {
    to: '/differentials',
    label: 'Differentials',
    icon: Zap,
    hint: 'High xP, low ownership',
    key: 'd',
  },
  { to: '/models', label: 'Model Lab', icon: Beaker, hint: 'Leaderboard and calibration', key: 'm' },
  { to: '/chips', label: 'Chip Strategy', icon: BarChart3, hint: 'When to play each chip', key: 'h' },
  { to: '/sources', label: 'Data Sources', icon: Database, hint: 'Ingest status and config', key: 'r' },
  { to: '/settings', label: 'Settings', icon: Settings, hint: 'Preferences', key: ',' },
] as const;

/** Routes that exist but are intentionally absent from the sidebar. */
export const HIDDEN_ROUTES = ['/players/:id', '/showcase'] as const;

export function isActivePath(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  if (item.prefix) return pathname === item.to || pathname.startsWith(`${item.to}/`);
  return pathname === item.to;
}
