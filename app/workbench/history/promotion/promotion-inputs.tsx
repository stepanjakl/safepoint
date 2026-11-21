'use client';

import { useContext } from 'react';
import {
  DrawerAside,
  type AsideLayer,
} from '@/components/app-shell/drawer-aside';
import { SECTION } from '@/components/app-shell/process/panel-parts';
import { ProcessInputNavigation } from '@/components/app-shell/process/process-sheet';
import { SectionRow } from '@/components/app-shell/runs/section-row';
import {
  SystemDisc,
  SystemMeta,
} from '@/components/app-shell/system/system-parts';
import { useAsidePanel } from '@/components/app-shell/use-aside-panel';
import type { InputDetail } from '@/lib/prototype/promotion/input-details';
import { byAttention, type SystemLink } from '@/lib/shell/system-links';
import { cx } from '@/lib/ui/cx';

import { InputDetailView } from './input-detail';

export function PromotionInputs({
  inputs,
  details,
  runLabel,
}: {
  inputs: SystemLink[];
  details: Record<string, InputDetail>;
  runLabel?: string;
}) {
  const navigation = useContext(ProcessInputNavigation);
  const sorted = [...inputs].sort(byAttention);
  const {
    aside,
    leaving,
    direction,
    exiting,
    openAside,
    closeAside,
    finishExit,
    settleLeaving,
    onKeyDownCapture,
  } = useAsidePanel({
    initial: navigation?.initialInputId ?? null,
    place: (id) => sorted.findIndex((input) => input.id === id),
    viewKey: (id) => id,
    scope: '.promotion-inputs',
  });

  function layer(id: string | null): AsideLayer | null {
    const link = sorted.find((input) => input.id === id);
    const detail = link && details[link.id];
    if (!link || !detail) return null;
    return {
      key: link.id,
      eyebrow: 'Input',
      title: detail.label,
      announce: detail.label,
      leading: <SystemDisc link={link} />,
      meta: <SystemMeta link={link} />,
      body: (
        <InputDetailView
          detail={detail}
          onClose={() => closeAside()}
          onNavigate={() => navigation?.returnToRun()}
        />
      ),
    };
  }

  const panel = layer(aside);

  return (
    <div
      className="promotion-inputs process-panels sheet-column-edge shell:grid-rows-[minmax(0,1fr)] @sheet-narrow/sheet:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] @sheet-wide/sheet:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] grid h-full min-h-0 grid-cols-[minmax(0,1fr)]"
      onKeyDownCapture={onKeyDownCapture}
    >
      <div
        className={cx(
          'process-panel-list sheet-bleed sheet-bleed-head @max-sheet-narrow/sheet:sheet-bleed-end @max-sheet-narrow/sheet:sheet-bleed-end-head shell:min-h-0 shell:overflow-y-auto shell:overscroll-contain min-w-0',
          panel && '@max-sheet-narrow/sheet:hidden',
        )}
      >
        <SectionRow {...SECTION.inputs} count={inputs.length} />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5">
          <p className="text-dense text-muted leading-relaxed">
            The JSON files this run read. Each is an analysed extract, treated
            as the source of truth; producing and updating them happens outside
            Safepoint.
          </p>
          <div>
            {runLabel ? (
              <p className="text-meta text-muted pb-1.5">
                As read by the run of {runLabel}
              </p>
            ) : null}
            <ul aria-labelledby={SECTION.inputs.id}>
              {sorted.map((link) => (
                <li
                  key={link.id}
                  className="border-rule-faint border-b last:border-b-0"
                >
                  <button
                    type="button"
                    aria-expanded={!exiting && aside === link.id}
                    onClick={() => openAside(link.id)}
                    className="group/input-row control-wash hover:bg-surface-hover focus-visible:bg-surface-hover aria-expanded:bg-surface-selected aria-expanded:text-primary rounded-control -mx-sheet-inset px-sheet-inset flex min-h-11 w-[calc(100%+2*var(--spacing-sheet-inset))] cursor-pointer items-center gap-3 py-2 text-left"
                  >
                    <SystemDisc link={link} />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="text-primary text-dense truncate">
                        {link.label}
                      </span>
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <SystemMeta link={link} />
                        <span className="value text-micro text-muted group-aria-expanded/input-row:text-primary truncate">
                          {link.file}
                        </span>
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-muted text-dense">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <p className="border-rule-faint text-muted text-meta border-t pt-3">
            Inputs can’t be changed in this demo.
          </p>
        </div>
      </div>
      {panel ? (
        <DrawerAside
          current={panel}
          leaving={layer(leaving)}
          direction={direction}
          exiting={exiting}
          onExited={finishExit}
          onLeft={settleLeaving}
          flat
          className="z-1"
        />
      ) : null}
    </div>
  );
}
