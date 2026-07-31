import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { AppShell } from '@/components/layout';
import { Skeleton, ToastViewport, type CommandItem } from '@/components/ui';
import { NAV } from '@/lib/nav';
import { useMeta } from '@/hooks/useEngine';

const Overview = lazy(() => import('@/pages/Overview'));
const SquadStudio = lazy(() => import('@/pages/SquadStudio'));
const Players = lazy(() => import('@/pages/Players'));
const PlayerDetail = lazy(() => import('@/pages/PlayerDetail'));
const Fixtures = lazy(() => import('@/pages/Fixtures'));
const Transfers = lazy(() => import('@/pages/Transfers'));
const Captain = lazy(() => import('@/pages/Captain'));
const Differentials = lazy(() => import('@/pages/Differentials'));
const Models = lazy(() => import('@/pages/Models'));
const Chips = lazy(() => import('@/pages/Chips'));
const Sources = lazy(() => import('@/pages/Sources'));
const Settings = lazy(() => import('@/pages/Settings'));
const Showcase = lazy(() => import('@/pages/Showcase'));

/** Gameweek and deadline for the top bar, read from the engine's own metadata. */
function GameweekBadge() {
  const meta = useMeta();
  const event = meta.data?.next_event ?? meta.data?.current_event ?? null;
  if (event === null) return null;
  const deadline = meta.data?.next_deadline;
  return (
    <span className="text-[12.5px] text-text-muted">
      <span className="font-medium text-text">GW{event}</span>
      {deadline ? ` · ${new Date(deadline).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })}` : ''}
    </span>
  );
}

/** How many sources last landed cleanly — the honest one-glance summary. */
function FreshnessBadge() {
  const meta = useMeta();
  const sources = meta.data?.data_freshness ?? [];
  if (sources.length === 0) return null;
  const live = sources.filter((s) => s.status === 'ok' || s.status === 'partial').length;
  return (
    <span className="text-[12px] text-text-faint">
      {live}/{sources.length} sources live
    </span>
  );
}

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64 rounded-xl" />
      <Skeleton className="h-40 w-full rounded-3xl" />
      <Skeleton className="h-64 w-full rounded-3xl" />
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();

  const commands: CommandItem[] = NAV.map((item) => {
    const Icon = item.icon;
    return {
      id: item.to,
      label: item.label,
      hint: item.hint,
      icon: <Icon className="size-4" />,
      onSelect: () => navigate(item.to),
    };
  });

  return (
    <AppShell gameweek={<GameweekBadge />} freshness={<FreshnessBadge />} commandItems={commands}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/pitch" element={<SquadStudio />} />
          <Route path="/players" element={<Players />} />
          <Route path="/players/:id" element={<PlayerDetail />} />
          <Route path="/fixtures" element={<Fixtures />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/captain" element={<Captain />} />
          <Route path="/differentials" element={<Differentials />} />
          <Route path="/models" element={<Models />} />
          <Route path="/chips" element={<Chips />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/showcase" element={<Showcase />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      <ToastViewport />
    </AppShell>
  );
}
