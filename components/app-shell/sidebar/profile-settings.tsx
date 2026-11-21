'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { Button, DialogTrigger, Popover } from 'react-aria-components';
import ChevronDown from 'blode-icons-react/icons/chevron-down';

import {
  DEFAULT_EDGE_PRESET,
  DEFAULT_NEUTRAL,
  EDGE_PRESETS,
  NEUTRALS,
  NEUTRAL_LABELS,
  readEdgePreset,
  readNeutral,
  readTheme,
  setEdgePreset,
  setNeutral,
  setTheme,
  subscribe,
} from '@/components/dev/design-preferences';
import { useNonModalPopover } from '@/components/dev/agentation-popover';
import { NonModalPopoverPanel } from '@/components/ui/non-modal-popover-panel';
import { Tooltip } from '@/components/ui/tooltip';
import { DEFAULT_THEME, type ThemeChoice } from '@/lib/ui/typography';
import { DISCLOSURE_ICON_BUTTON, MenuIcon } from './menu-parts';

const MODES = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
} satisfies Record<ThemeChoice, string>;

const EDGE_LABELS = {
  default: 'Default',
  retina: 'Retina',
  highlights: 'Retina highlights',
} satisfies Record<(typeof EDGE_PRESETS)[number], string>;

export function ProfileSettings() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverProps = useNonModalPopover(
    open,
    () => setOpen(false),
    popoverRef,
    triggerRef,
  );

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Tooltip label="Settings" isDisabled={open}>
        <Button
          ref={triggerRef}
          aria-label="Settings"
          className={DISCLOSURE_ICON_BUTTON}
        >
          <MenuIcon name="more" />
        </Button>
      </Tooltip>
      <Popover
        ref={popoverRef}
        placement="top start"
        offset={4}
        className="popover-motion control-face surface-popover rounded-shell z-50"
        {...popoverProps}
      >
        <NonModalPopoverPanel title="Settings" className="grid gap-2.5 p-3">
          <AppearanceFields />
        </NonModalPopoverPanel>
      </Popover>
    </DialogTrigger>
  );
}

function AppearanceFields() {
  const mode = useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
  const theme = useSyncExternalStore(
    subscribe,
    readNeutral,
    () => DEFAULT_NEUTRAL,
  );
  const edges = useSyncExternalStore(
    subscribe,
    readEdgePreset,
    () => DEFAULT_EDGE_PRESET,
  );

  return (
    <div className="grid gap-2">
      <AppearanceField
        label="Mode"
        options={Object.entries(MODES)}
        value={mode}
        onChange={(next) => {
          if (next === 'light' || next === 'dark' || next === 'system')
            setTheme(next);
        }}
      />
      <AppearanceField
        label="Theme"
        options={NEUTRALS.map((value) => [value, NEUTRAL_LABELS[value]])}
        value={theme}
        onChange={(next) => {
          const neutral = NEUTRALS.find((value) => value === next);
          if (neutral) setNeutral(neutral);
        }}
      />
      <AppearanceField
        label="Edges"
        options={EDGE_PRESETS.map((value) => [value, EDGE_LABELS[value]])}
        value={edges}
        onChange={(next) => {
          const preset = EDGE_PRESETS.find((value) => value === next);
          if (preset) setEdgePreset(preset);
        }}
      />
    </div>
  );
}

function AppearanceField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [value: string, label: string][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative grid">
      <span className="text-muted border-rule-faint text-meta pointer-events-none absolute inset-y-1.5 left-0 flex w-14 items-center border-r pl-2.5 font-medium">
        {label}
      </span>
      <select
        className="field text-meta text-primary min-h-8 cursor-pointer appearance-none py-1 pr-5 pl-17 text-left"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        size={14}
        strokeWidth={2.25}
        className="text-muted pointer-events-none absolute right-2 self-center"
      />
    </label>
  );
}
