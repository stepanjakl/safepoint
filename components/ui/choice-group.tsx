'use client';

import { ToggleButton } from 'react-aria-components';

type Choice<Value extends string> = {
  value: Value;
  label: string;
  ariaLabel?: string;
};

const CHOICE =
  'control-wash bg-field-face border-field-edge text-primary data-[hovered]:border-field-edge-hover data-[focus-visible]:border-field-edge-active data-[focus-visible]:outline-2 data-[focus-visible]:outline-field-edge-active data-[focus-visible]:outline-offset-2 data-[selected]:bg-surface-hover data-[selected]:border-field-edge-hover data-[selected]:font-medium data-[disabled]:text-muted data-[disabled]:cursor-not-allowed inline-flex min-h-8 min-w-0 cursor-pointer items-center justify-center rounded-full border px-2.5 py-1 text-meta whitespace-nowrap';

export function ChoiceGroup<Value extends string>({
  label,
  options,
  value,
  onChange,
  isDisabled = false,
}: {
  label: string;
  options: readonly Choice<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  isDisabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col gap-1.5"
    >
      {options.map((option) => (
        <ToggleButton
          key={option.value}
          aria-label={option.ariaLabel}
          isSelected={value === option.value}
          isDisabled={isDisabled}
          onChange={() => onChange(option.value)}
          className={CHOICE}
        >
          {option.label}
        </ToggleButton>
      ))}
    </div>
  );
}
