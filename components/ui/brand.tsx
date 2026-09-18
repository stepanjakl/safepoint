import { BiomorphicSymbol } from './biomorphic-symbol';

/** A fixed brand family, independent of the interface typeface settings. */
export function Brand({ markCellClassName }: { markCellClassName?: string }) {
  return (
    <span
      className="font-brand text-wordmark text-brand-wordmark inline-flex flex-none items-center gap-1.25 [font-feature-settings:normal] font-bold whitespace-nowrap uppercase"
      aria-label="Safepoint"
    >
      <span className={markCellClassName} aria-hidden="true">
        <BiomorphicSymbol
          variant="soft-radial"
          className="block size-7 flex-none text-[var(--color-radix-cyan-8)]"
        />
      </span>
      <span className="text-[var(--color-radix-sage-4)]" aria-hidden="true">
        Safepoint
      </span>
    </span>
  );
}
