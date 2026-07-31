import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { AppShell } from '@/components/layout';
import { CommandPalette, Skeleton, ToastViewport, type CommandItem } from '@/components/ui';
import { NAV } from '@/lib/nav';
import { useUiStore } from '@/lib/uiStore';
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
  const meta = useMeta();
  const paletteOpen = useUiStore((s) => s.paletteOpen);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);

  const commands: CommandItem[] = NAV.map((item) => ({
    id: item.to,
    label: item.label,
    hint: item.hint,
    icon: item.icon,
    run: () => navigate(item.to),
  }));

  return (
    <AppShell
      event={meta.data?.next_event ?? meta.data?.current_event ?? null}
      deadline={meta.data?.next_deadline ?? null}
      freshness={meta.data?.data_freshness ?? []}
      run={meta.data?.active_run ?? null}
    >
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

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={commands} />
      <ToastViewport />
    </AppShell>
  );
}
