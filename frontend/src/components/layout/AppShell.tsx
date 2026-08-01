import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, Ellipsis, PanelLeftClose, PanelLeftOpen, Search, Trophy } from 'lucide-react';
import { cn } from '@/lib/cn';
import { dateTime, relativeTime } from '@/lib/format';
import { NAV, isActivePath, type NavItem } from '@/lib/nav';
import { useIsNarrow } from '@/lib/useMediaQuery';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useUiStore } from '@/lib/uiStore';
import { CommandPalette, type CommandItem } from '@/components/ui/CommandPalette';
import { Kbd, MOD_KEY } from '@/components/ui/Kbd';
import { Sheet } from '@/components/ui/Modal';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Tooltip } from '@/components/ui/Tooltip';
import type { DataFreshness, RunInfo } from '@/types/api';

export type AppShellProps = {
  children: ReactNode;
  /**
   * Custom gameweek region. When omitted, `event` and `deadline` render the
   * built-in gameweek chip and live deadline countdown.
   */
  gameweek?: ReactNode;
  /** Gameweek number for the built-in chip. */
  event?: number | null;
  /** ISO deadline for the built-in countdown. */
  deadline?: string | null;
  /**
   * Either custom content, or the `/api/meta` freshness rows — in which case
   * the shell renders the built-in summary pill.
   */
  freshness?: ReactNode | readonly DataFreshness[];
  /** The active model run, surfaced as provenance in the top bar. */
  run?: RunInfo | null;
  /** Extra palette entries merged after the route commands. */
  commandItems?: readonly CommandItem[];
  /** Controls placed left of the theme toggle. */
  topBarActions?: ReactNode;
  /** Width cap for the content column. */
  maxWidth?: number | string;
  className?: string;
  contentClassName?: string;
};

const SIDEBAR_W = 258;
const RAIL_W = 76;
/** How many items get a slot in the mobile tab bar before "More". */
const TAB_BAR_ITEMS = 4;
/** Milliseconds a pending `g` prefix stays armed. */
const CHORD_WINDOW = 1600;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/* ------------------------------------------------------------- top-bar bits -- */

function isFreshnessList(value: unknown): value is readonly DataFreshness[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) => typeof row === 'object' && row !== null && 'source' in row && 'status' in row,
    )
  );
}

/** Live `2d 04h 11m` until an ISO instant; `null` once it has passed. */
function useCountdown(iso: string | null | undefined): string | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!iso) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [iso]);

  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const remaining = target - Date.now();
  if (remaining <= 0) return null;

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function GameweekChip({ event, deadline }: { event: number | null; deadline: string | null }) {
  const countdown = useCountdown(deadline);
  if (event === null && !deadline) return null;

  const urgent = Boolean(countdown && !countdown.includes('d') && !countdown.includes('h'));

  return (
    <Tooltip
      content={
        <span className="block">
          <span className="block font-semibold">
            {event === null ? 'Gameweek unknown' : `Gameweek ${event}`}
          </span>
          <span className="block text-text-muted">
            {deadline ? `Deadline ${dateTime(deadline)}` : 'No deadline published'}
          </span>
        </span>
      }
    >
      <span
        tabIndex={0}
        className={cn(
          'flex min-w-0 items-center gap-2 rounded-[999px] border border-border bg-surface-sunken',
          'h-9 px-2.5 text-[12.5px] focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-[color:var(--color-ring)]',
        )}
      >
        <span className="num shrink-0 font-semibold text-text">
          {event === null ? 'GW —' : `GW ${event}`}
        </span>
        {countdown ? (
          <>
            <span aria-hidden className="h-3.5 w-px shrink-0 bg-border" />
            <Clock size={13} aria-hidden className="shrink-0 text-text-faint" />
            <span
              className={cn(
                'num truncate font-medium',
                urgent ? 'text-[color:var(--color-delta-down)]' : 'text-text-muted',
              )}
            >
              {countdown}
            </span>
          </>
        ) : deadline ? (
          <span className="truncate text-text-faint">Deadline passed</span>
        ) : null}
      </span>
    </Tooltip>
  );
}

const BAD_STATUS = new Set(['error', 'unreachable']);
const SOFT_STATUS = new Set(['partial', 'never', 'unconfigured']);

function FreshnessChip({ rows, run }: { rows: readonly DataFreshness[]; run?: RunInfo | null }) {
  if (rows.length === 0 && !run) return null;

  const bad = rows.filter((row) => BAD_STATUS.has(row.status));
  const soft = rows.filter((row) => SOFT_STATUS.has(row.status));
  const ok = rows.filter((row) => row.status === 'ok');

  const tone = bad.length > 0 ? 'critical' : soft.length > 0 ? 'warning' : 'good';
  const colour =
    tone === 'critical'
      ? 'var(--color-critical)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : 'var(--color-good)';
  const summary =
    bad.length > 0
      ? `${bad.length} source${bad.length === 1 ? '' : 's'} failing`
      : soft.length > 0
        ? `${soft.length} incomplete`
        : `${ok.length} source${ok.length === 1 ? '' : 's'} fresh`;

  return (
    <Tooltip
      content={
        <span className="block max-w-[280px]">
          <span className="block font-semibold">Data freshness</span>
          <span className="mt-1 block space-y-0.5">
            {rows.slice(0, 8).map((row) => (
              <span key={row.source} className="flex items-baseline justify-between gap-3">
                <span className="truncate text-text-muted">{row.source}</span>
                <span className="num shrink-0 text-text-faint">
                  {row.status === 'ok' ? relativeTime(row.last_success) : row.status}
                </span>
              </span>
            ))}
          </span>
          {run ? (
            <span className="mt-1.5 block border-t border-border pt-1.5 text-[11.5px] text-text-faint">
              Run {run.run_id.slice(0, 8)} · target GW{run.target_event} · {run.models.length} model
              {run.models.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </span>
      }
    >
      <span
        tabIndex={0}
        className={cn(
          'flex min-w-0 items-center gap-2 rounded-[999px] border border-border bg-surface-sunken',
          'h-9 px-2.5 text-[12.5px] text-text-muted focus-visible:outline-2',
          'focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
        )}
      >
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: colour, boxShadow: `0 0 8px -1px ${colour}` }}
        />
        <span className="truncate">{summary}</span>
      </span>
    </Tooltip>
  );
}

/* ---------------------------------------------------------------- app mark -- */

function AppMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] text-[color:var(--color-pitch-line)]"
        style={{
          background:
            'linear-gradient(145deg, var(--color-pitch-turf-alt), var(--color-pitch-turf-deep))',
          boxShadow: 'inset 0 1px 0 color-mix(in oklch, var(--color-pitch-rim) 45%, transparent)',
        }}
      >
        <Trophy size={17} />
      </span>
      {compact ? null : (
        <span className="min-w-0">
          <span className="block truncate font-display text-[15px] font-semibold leading-tight text-text">
            FPL Console
          </span>
          <span className="block truncate text-[11px] leading-tight text-text-faint">
            Research &amp; optimisation
          </span>
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------- nav button -- */

function NavRow({
  item,
  active,
  collapsed,
  layoutGroup,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  layoutGroup: string;
  onNavigate?: () => void;
}) {
  const reduced = useReducedMotion();
  const Icon = item.icon;

  const row = (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-11 items-center gap-3 rounded-[16px] px-3 outline-offset-2',
        'transition-colors duration-200',
        collapsed && 'justify-center px-0',
        active ? 'text-accent-ink' : 'text-text-muted hover:bg-surface-sunken hover:text-text',
      )}
    >
      {active ? (
        <motion.span
          layoutId={layoutGroup}
          aria-hidden
          className="absolute inset-0 -z-10 rounded-[16px] bg-accent-soft"
          style={{
            boxShadow: 'inset 0 0 0 1px color-mix(in oklch, var(--color-accent) 26%, transparent)',
          }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 38 }}
        />
      ) : null}
      <Icon size={18} className="shrink-0" aria-hidden />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{item.label}</span>
      )}
      {!collapsed && item.key ? (
        <Kbd keys={['g', item.key]} size="xs" className="opacity-0 transition-opacity group-hover/nav:opacity-100" />
      ) : null}
    </NavLink>
  );

  if (!collapsed) return <li className="group/nav">{row}</li>;

  return (
    <li>
      <Tooltip
        placement="right"
        content={
          <span className="flex items-center gap-2">
            <span className="font-semibold">{item.label}</span>
            {item.key ? <Kbd keys={['g', item.key]} size="xs" /> : null}
          </span>
        }
      >
        {row}
      </Tooltip>
    </li>
  );
}

/* ----------------------------------------------------------------- shell --- */

/**
 * The application frame: a curvy collapsible sidebar on desktop, a bottom tab
 * bar plus drawer under 900px, and a sticky top bar carrying the gameweek,
 * data freshness, the command palette and the theme control.
 *
 * It fetches nothing — the gameweek and freshness regions are slots the pages
 * fill. Navigation state is read from the router; collapse state is persisted
 * to localStorage by the UI store.
 */
export function AppShell({
  children,
  gameweek,
  event = null,
  deadline = null,
  freshness,
  run = null,
  commandItems,
  topBarActions,
  maxWidth = 1440,
  className,
  contentClassName,
}: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const narrow = useIsNarrow();
  const reduced = useReducedMotion();

  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const setDrawerOpen = useUiStore((s) => s.setDrawerOpen);
  const paletteOpen = useUiStore((s) => s.paletteOpen);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const togglePalette = useUiStore((s) => s.togglePalette);

  const [chordArmed, setChordArmed] = useState(false);
  const chordTimer = useRef<number | null>(null);

  const disarm = useCallback(() => {
    if (chordTimer.current !== null) window.clearTimeout(chordTimer.current);
    chordTimer.current = null;
    setChordArmed(false);
  }, []);

  /* `g`-prefixed route chords, plus the palette and sidebar shortcuts. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (mod && key === 'k') {
        event.preventDefault();
        togglePalette();
        return;
      }
      if (mod && key === 'b') {
        event.preventDefault();
        toggleSidebar();
        return;
      }
      if (mod || event.altKey || isTypingTarget(event.target)) return;

      if (chordTimer.current !== null) {
        const match = NAV.find((item) => item.key === event.key.toLowerCase());
        disarm();
        if (match) {
          event.preventDefault();
          navigate(match.to);
          setDrawerOpen(false);
        }
        return;
      }

      if (key === 'g') {
        event.preventDefault();
        setChordArmed(true);
        chordTimer.current = window.setTimeout(disarm, CHORD_WINDOW);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (chordTimer.current !== null) window.clearTimeout(chordTimer.current);
    };
  }, [disarm, navigate, setDrawerOpen, toggleSidebar, togglePalette]);

  /* Close the mobile drawer whenever the route changes. */
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, setDrawerOpen]);

  const routeCommands = useMemo<CommandItem[]>(
    () =>
      NAV.map((item) => {
        const Icon = item.icon;
        return {
          id: `route:${item.to}`,
          label: item.label,
          hint: item.hint,
          group: 'Go to',
          icon: <Icon size={15} aria-hidden />,
          keywords: item.to,
          ...(item.key ? { shortcut: ['g', item.key] as const } : {}),
          onSelect: () => navigate(item.to),
        };
      }),
    [navigate],
  );

  const paletteItems = useMemo<CommandItem[]>(
    () => [...routeCommands, ...(commandItems ?? [])],
    [routeCommands, commandItems],
  );

  const railWidth = collapsed ? RAIL_W : SIDEBAR_W;
  const tabItems = NAV.slice(0, TAB_BAR_ITEMS);

  const navList = (onNavigate?: () => void, forceExpanded = false) => (
    <ul className="flex flex-col gap-1">
      {NAV.map((item) => (
        <NavRow
          key={item.to}
          item={item}
          active={isActivePath(item, location.pathname)}
          collapsed={forceExpanded ? false : collapsed && !narrow}
          layoutGroup={forceExpanded ? 'nav-active-drawer' : 'nav-active-rail'}
          {...(onNavigate ? { onNavigate } : {})}
        />
      ))}
    </ul>
  );

  return (
    <div className={cn('min-h-dvh bg-page text-text', className)}>
      {/* ------------------------------------------------------- sidebar -- */}
      {narrow ? null : (
        <motion.aside
          aria-label="Primary"
          initial={false}
          animate={{ width: railWidth }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 40 }}
          className="fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-surface"
        >
          <div className={cn('flex h-16 items-center px-4', collapsed && 'justify-center px-0')}>
            <AppMark compact={collapsed} />
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto scrollbar-slim px-3 pb-3">
            {navList()}
          </nav>

          <div className={cn('border-t border-border p-3', collapsed && 'px-2')}>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'flex h-10 w-full items-center gap-2.5 rounded-[14px] px-3 text-[12.5px] font-medium',
                'text-text-faint transition-colors hover:bg-surface-sunken hover:text-text',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
                collapsed && 'justify-center px-0',
              )}
            >
              {collapsed ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
              {collapsed ? null : (
                <>
                  <span className="flex-1 text-left">Collapse</span>
                  <Kbd keys={[MOD_KEY, 'B']} size="xs" />
                </>
              )}
            </button>
          </div>
        </motion.aside>
      )}

      {/* --------------------------------------------------------- column -- */}
      <div
        className="flex min-h-dvh min-w-0 flex-col transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ paddingLeft: narrow ? 0 : railWidth }}
      >
        {/* ------------------------------------------------------ top bar -- */}
        <header
          className={cn(
            'sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5',
            'bg-surface/85 backdrop-blur-xl',
          )}
        >
          {narrow ? (
            <div className="flex min-w-0 items-center gap-2">
              <AppMark compact />
              <span className="sr-only">FPL Console</span>
            </div>
          ) : null}

          <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
            <div className="min-w-0 shrink">
              {gameweek ?? <GameweekChip event={event} deadline={deadline} />}
            </div>
            <div className="hidden min-w-0 shrink lg:block">
              {isFreshnessList(freshness) ? (
                <FreshnessChip rows={freshness} run={run} />
              ) : (
                /* Not the data shape, so it is caller-supplied content. TS
                   cannot subtract the array arm from the union, hence the
                   assertion — the guard above has already excluded it. */
                (freshness as ReactNode)
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {topBarActions}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              aria-keyshortcuts="Meta+K Control+K"
              className={cn(
                'flex h-9 items-center gap-2 rounded-[999px] border border-border bg-surface-sunken px-3',
                'text-[12.5px] text-text-faint transition-colors hover:border-border-strong hover:text-text',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
              )}
            >
              <Search size={15} aria-hidden />
              <span className="hidden sm:inline">Search</span>
              <Kbd keys={[MOD_KEY, 'K']} size="xs" className="hidden sm:inline-flex" />
            </button>
            <ThemeToggle />
          </div>
        </header>

        {/* ------------------------------------------------------ content -- */}
        <main
          className={cn(
            'mx-auto w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
            narrow && 'pb-[calc(76px+env(safe-area-inset-bottom))]',
            contentClassName,
          )}
          style={{ maxWidth }}
        >
          {children}
        </main>
      </div>

      {/* ------------------------------------------------------ tab bar --- */}
      {narrow ? (
        <nav
          aria-label="Primary"
          className={cn(
            'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/92 backdrop-blur-xl',
            'pb-[env(safe-area-inset-bottom)]',
          )}
        >
          <ul className="flex items-stretch">
            {tabItems.map((item) => {
              const active = isActivePath(item, location.pathname);
              const Icon = item.icon;
              return (
                <li key={item.to} className="min-w-0 flex-1">
                  <NavLink
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex h-[70px] flex-col items-center justify-center gap-1 px-1',
                      active ? 'text-accent' : 'text-text-faint',
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="nav-active-tabs"
                        aria-hidden
                        className="absolute inset-x-3 top-1.5 h-1 rounded-[999px] bg-accent"
                        transition={
                          reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 38 }
                        }
                      />
                    ) : null}
                    <Icon size={19} aria-hidden />
                    <span className="w-full truncate text-center text-[10.5px] font-medium">
                      {item.label.split(' ')[0]}
                    </span>
                  </NavLink>
                </li>
              );
            })}
            <li className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="More sections"
                aria-expanded={drawerOpen}
                className="flex h-[70px] w-full flex-col items-center justify-center gap-1 px-1 text-text-faint"
              >
                <Ellipsis size={19} aria-hidden />
                <span className="text-[10.5px] font-medium">More</span>
              </button>
            </li>
          </ul>
        </nav>
      ) : null}

      {/* -------------------------------------------------------- drawer -- */}
      <Sheet
        open={narrow && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        side="bottom"
        title="Sections"
      >
        <nav aria-label="All sections">{navList(() => setDrawerOpen(false), true)}</nav>
      </Sheet>

      {/* -------------------------------------------------------- palette -- */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        items={paletteItems}
        footer={
          <span className="flex items-center gap-1.5">
            <Kbd keys="g" size="xs" /> then a letter jumps
          </span>
        }
      />

      {/* -------------------------------------------- chord affordance ----- */}
      <AnimatePresence>
        {chordArmed ? (
          <motion.div
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
            role="status"
            className={cn(
              'pointer-events-none fixed bottom-5 left-1/2 z-[95] -translate-x-1/2',
              'flex items-center gap-2 rounded-[999px] border border-border bg-surface-raised px-3.5 py-2',
              'text-[12.5px] text-text-muted shadow-pop',
            )}
          >
            <Kbd keys="g" size="xs" />
            <span>then</span>
            {NAV.filter((item) => item.key)
              .slice(0, 6)
              .map((item) => (
                <Kbd key={item.to} keys={item.key ?? ''} size="xs" />
              ))}
            <span className="text-text-faint">…</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Re-exported so a page can close the drawer without importing the store. */
export function useShellDrawer(): { open: boolean; setOpen: (value: boolean) => void } {
  const open = useUiStore((s) => s.drawerOpen);
  const setOpen = useUiStore((s) => s.setDrawerOpen);
  return { open, setOpen };
}
