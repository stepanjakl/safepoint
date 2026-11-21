import type { SystemLink } from '@/lib/shell/system-links';
import {
  SystemDisc,
  SystemMeta,
} from '@/components/app-shell/system/system-parts';

export function OutputsList({ outputs }: { outputs: SystemLink[] }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <p className="text-dense text-muted leading-relaxed">
        The APIs this process may call once changes are approved, what each call
        can genuinely do, and how it is undone.
      </p>
      {outputs.length === 0 ? (
        <p className="text-dense text-muted py-2">None.</p>
      ) : (
        <ul>
          {outputs.map((link) => (
            <li
              key={link.id}
              className="border-rule-faint flex items-start gap-3 border-b py-3 last:border-b-0"
            >
              <SystemDisc link={link} />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-dense text-primary">{link.label}</span>
                  <SystemMeta link={link} />
                </span>
                {link.api ? (
                  <span className="value text-micro text-muted">
                    {link.api}
                  </span>
                ) : null}
                {link.undo ? (
                  <span className="text-meta text-muted leading-normal">
                    {link.undo}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="border-rule-faint text-muted text-meta border-t pt-3">
        Outputs can’t be changed in this demo.
      </p>
    </div>
  );
}
