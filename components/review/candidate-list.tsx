'use client';

import {
  Header,
  ListBox,
  ListBoxItem,
  ListBoxSection,
} from 'react-aria-components';

import { Glyph } from '@/components/ui/glyph';
import type { Sku } from '@/lib/promotion-release';
import type { CandidateRow, CategoryGroup } from '@/lib/review-presentation';

import { outcomeMarker, toneText } from './markers';

/*
  One listbox for all 27 candidates. Category headers are presentation only;
  arrow keys move continuously through every row. Selection follows focus, so
  the detail beside the list changes as the reviewer moves.
*/
export function CandidateList({
  categories,
  rowsBySku,
  selectedSku,
  onSelect,
  describedBy,
}: {
  categories: CategoryGroup[];
  rowsBySku: Record<Sku, CandidateRow>;
  selectedSku: Sku;
  onSelect: (sku: Sku) => void;
  describedBy: string;
}) {
  return (
    <ListBox
      aria-label="Candidates"
      aria-describedby={describedBy}
      selectionMode="single"
      selectionBehavior="replace"
      disallowEmptySelection
      selectedKeys={[selectedSku]}
      onSelectionChange={(keys) => {
        if (keys === 'all') return;
        const [key] = keys;
        if (typeof key === 'string') onSelect(key as Sku);
      }}
      className="outline-none"
    >
      {categories.map((group) => (
        <ListBoxSection key={group.id} id={group.id}>
          <Header className="readout border-rule-faint bg-surface-inset text-muted flex min-h-7 items-center justify-between border-b px-4">
            <span>{group.label}</span>
            <span>{group.skus.length}</span>
          </Header>
          {group.skus.map((sku) => {
            const row = rowsBySku[sku];
            const marker = outcomeMarker[row.outcome];
            return (
              <ListBoxItem
                key={row.sku}
                id={row.sku}
                textValue={`${row.name}, ${row.outcomeLabel}`}
                className="group border-rule-faint before:bg-action data-[focus-visible]:outline-focus data-[hovered]:bg-surface-inset data-[selected]:bg-surface-selected relative flex min-h-11 cursor-default items-start gap-2.5 border-b py-2 pr-3 pl-4 outline-none before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:opacity-0 data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-solid data-[selected]:before:opacity-100"
              >
                <span
                  className={`mt-1 flex w-3 shrink-0 justify-center ${toneText[marker.tone]}`}
                >
                  <Glyph name={marker.glyph} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-dense truncate group-data-[selected]:font-medium">
                      {row.name}
                    </span>
                    <span className="value text-meta text-muted shrink-0">
                      {row.sku}
                    </span>
                  </span>
                  <span className="text-meta text-muted block truncate">
                    <span className={`font-medium ${toneText[marker.tone]}`}>
                      {row.outcomeLabel}
                    </span>
                    {' · '}
                    {row.reason}
                  </span>
                </span>
              </ListBoxItem>
            );
          })}
        </ListBoxSection>
      ))}
    </ListBox>
  );
}
