'use client';

// Deep import: Blode's barrel is the whole icon library.
import Play from 'blode-icons-react/icons/play';
import { Button as AriaButton } from 'react-aria-components';
import { HEAD_CONTROL } from '@/components/app-shell/process/schedule-control';
import { Tooltip } from '@/components/ui/tooltip';
import { useRunSelection } from './run-selection';

/*
  Starts a run by hand, from the runs header beside the schedule: the other way
  a run begins, so it sits where the list of them does.
*/
export function StartRunButton() {
  const selection = useRunSelection();
  if (!selection) return null;
  const { start, cannotStart } = selection;
  return (
    <Tooltip
      label="Start run"
      description={cannotStart ?? 'Runs now, under the current instructions.'}
    >
      <AriaButton
        aria-label="Start run"
        // Announced as unavailable but still focusable, so its tooltip says why.
        aria-disabled={start ? undefined : 'true'}
        onPress={start ?? undefined}
        className={
          start
            ? `${HEAD_CONTROL} inline-grid w-7 place-items-center`
            : 'text-muted rounded-control -my-1 inline-grid min-h-7 w-7 cursor-default place-items-center'
        }
      >
        <Play aria-hidden size={14} strokeWidth={1.8} />
      </AriaButton>
    </Tooltip>
  );
}
