'use client';

import { motion, useReducedMotion } from 'motion/react';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { DURATION_PANE, DURATION_STATE, EASE_OUT_QUAD } from '@/lib/motion';

type PendingRoute = { from: string; to: string };
type WorkspaceReveal = 'waiting' | 'opening' | 'fading' | 'complete' | null;
type WorkspaceIntroState = {
  path: string;
  reveal: WorkspaceReveal;
  attentionReady: boolean;
};

const ShellPageNavigation = createContext<{
  destinationPath: string;
  leaving: boolean;
  leavingProcess: boolean;
  enteringProcess: boolean;
  enteringShell: boolean;
  leaveTo: (href: string) => void;
  finishLeaving: () => void;
  workspaceReveal: WorkspaceReveal;
  workspaceAttentionReady: boolean;
  finishWorkspaceIntro: () => void;
  finishWorkspaceReveal: () => void;
  finishWorkspaceFade: () => void;
} | null>(null);

export function ShellPageTransitionProvider({
  children,
  processPaths,
}: {
  children: ReactNode;
  processPaths: string[];
}) {
  const path = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState<PendingRoute | null>(null);
  const [journey, setJourney] = useState({ current: path, previous: path });
  if (journey.current !== path)
    setJourney({ current: path, previous: journey.current });
  const [workspaceIntro, setWorkspaceIntro] = useState<WorkspaceIntroState>(
    () => ({
      path,
      reveal: path === '/workspace' ? 'waiting' : null,
      attentionReady: false,
    }),
  );
  if (workspaceIntro.path !== path)
    setWorkspaceIntro({
      path,
      reveal: 'complete',
      attentionReady: path === '/workspace',
    });
  const workspaceReveal =
    workspaceIntro.path === path ? workspaceIntro.reveal : 'complete';
  const workspaceAttentionReady =
    workspaceIntro.path === path && workspaceIntro.attentionReady;
  const leaving = pending !== null && pending.from === path;
  const isProcessRoute = (route: string) => processPaths.includes(route);
  const leavingProcess =
    leaving && isProcessRoute(path) && isProcessRoute(pending.to);
  const enteringProcess =
    journey.previous !== path &&
    isProcessRoute(path) &&
    isProcessRoute(journey.previous);
  const enteringShell =
    path === '/workspace' || journey.previous === '/workspace';

  function leaveTo(href: string) {
    if (href !== path && !leaving) setPending({ from: path, to: href });
  }

  function finishLeaving() {
    // App Router swaps children immediately, so navigate after the visible pane fades.
    if (leaving && pending) router.push(pending.to);
  }

  function finishWorkspaceIntro() {
    if (path !== '/workspace') return;
    setWorkspaceIntro((intro) => {
      if (intro.path !== path || intro.reveal === 'opening') return intro;
      if (intro.reveal === 'waiting') return { ...intro, reveal: 'opening' };
      return { ...intro, attentionReady: true };
    });
  }

  function finishWorkspaceReveal() {
    setWorkspaceIntro((intro) =>
      intro.path === path && intro.reveal === 'opening'
        ? { ...intro, reveal: 'fading' }
        : intro,
    );
  }

  function finishWorkspaceFade() {
    setWorkspaceIntro((intro) =>
      intro.path === path && intro.reveal === 'fading'
        ? { ...intro, reveal: 'complete', attentionReady: true }
        : intro,
    );
  }

  return (
    <ShellPageNavigation
      value={{
        destinationPath: leaving ? pending.to : path,
        leaving,
        leavingProcess,
        enteringProcess,
        enteringShell,
        leaveTo,
        finishLeaving,
        workspaceReveal,
        workspaceAttentionReady,
        finishWorkspaceIntro,
        finishWorkspaceReveal,
        finishWorkspaceFade,
      }}
    >
      {children}
    </ShellPageNavigation>
  );
}

export function useShellPageNavigation() {
  const navigation = useContext(ShellPageNavigation);
  if (!navigation) throw new Error('Shell page navigation is unavailable');
  return navigation;
}

export function ShellPageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { leaving, leavingProcess, enteringShell, finishLeaving } =
    useShellPageNavigation();
  const reduceMotion = useReducedMotion();
  const fades = !leavingProcess;

  return (
    <motion.div
      key={path}
      className="p-pane-inset shell:h-full min-w-0"
      initial={fades && enteringShell && !reduceMotion ? { opacity: 0 } : false}
      animate={{ opacity: leaving && fades ? 0 : 1 }}
      transition={{
        duration: reduceMotion
          ? 0
          : leaving && fades
            ? DURATION_STATE
            : DURATION_PANE,
        ease: EASE_OUT_QUAD,
      }}
      onAnimationComplete={(definition) => {
        if (
          leaving &&
          fades &&
          typeof definition === 'object' &&
          !Array.isArray(definition) &&
          definition.opacity === 0
        )
          finishLeaving();
      }}
      inert={leaving}
    >
      {children}
    </motion.div>
  );
}
