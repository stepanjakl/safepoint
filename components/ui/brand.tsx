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
          className="text-brand-mark block size-7 flex-none"
        />
      </span>
      <span aria-hidden="true">Safepoint</span>
    </span>
  );
}
