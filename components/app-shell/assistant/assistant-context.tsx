'use client';

import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Heading,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
  Separator,
} from 'react-aria-components';
// Deep imports: Blode's barrel is the whole icon library.
import Check from 'blode-icons-react/icons/check';
import EyeOpen from 'blode-icons-react/icons/eye-open';
import EyeSlash from 'blode-icons-react/icons/eye-slash';
import History from 'blode-icons-react/icons/history';
import { IconButton } from '@/components/ui/icon-button';
import { OverflowTooltip } from '@/components/ui/tooltip';

/*
  What the assistant is asked about: the process on screen unless the reader
  chooses another, or none for a general question. `page` follows the page.
*/
export type AssistantContextChoice = 'page' | 'none' | (string & {});

export type ContextProcess = { id: string; name: string };

const POPOVER =
  'popover-motion control-face surface-popover rounded-shell outline-none';
const ITEM =
  'control-wash text-dense data-[hovered]:bg-surface-hover data-[focus-visible]:bg-surface-hover rounded-control flex h-8 cursor-pointer items-center gap-2 ps-1.5 pe-2.5 outline-none';

export function ContextPicker({
  choice,
  onChoiceChange,
  processes,
  onScreen,
  onClose,
}: {
  choice: AssistantContextChoice;
  onChoiceChange: (choice: AssistantContextChoice) => void;
  // However the menu closes -- a choice, the pill again, outside, Escape.
  onClose: () => void;
  processes: ContextProcess[];
  // The process the page is showing, if any.
  onScreen: string | null;
}) {
  const chosen =
    choice === 'none' ? null : choice === 'page' ? onScreen : choice;
  const name = processes.find((process) => process.id === chosen)?.name;
  return (
    <MenuTrigger
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <AriaButton
        aria-label={name ? `Context: ${name}` : 'Context: none'}
        className="control-wash bg-surface-hover-strong text-meta text-muted hover:bg-surface-selected hover:text-primary data-[pressed]:bg-surface-selected data-[focus-visible]:bg-surface-selected data-[focus-visible]:text-primary aria-expanded:bg-surface-selected aria-expanded:text-primary inline-flex h-6 min-w-0 cursor-pointer items-center gap-1 rounded-full ps-1.5 pe-2.5"
      >
        {name ? (
          <EyeOpen
            aria-hidden
            size={14}
            strokeWidth={1.8}
            className="flex-none"
          />
        ) : (
          <EyeSlash
            aria-hidden
            size={14}
            strokeWidth={1.8}
            className="flex-none"
          />
        )}
        <span className="truncate">{name ?? 'No context'}</span>
      </AriaButton>
      <Popover
        placement="top start"
        offset={6}
        className={`${POPOVER} max-w-xs min-w-52`}
      >
        <Menu
          aria-label="Context"
          selectionMode="single"
          selectedKeys={[chosen ?? 'none']}
          onAction={(key) =>
            onChoiceChange(
              key === onScreen
                ? 'page'
                : (String(key) as AssistantContextChoice),
            )
          }
          className="grid min-w-0 p-1 outline-none"
        >
          <MenuSection aria-label="Processes" className="min-w-0">
            {processes.map((process) => (
              <MenuItem
                key={process.id}
                id={process.id}
                textValue={process.name}
                className={ITEM}
              >
                {({ isSelected, isHovered, isFocused }) => (
                  <>
                    <EyeOpen
                      aria-label={
                        process.id === onScreen ? 'On screen' : undefined
                      }
                      aria-hidden={process.id !== onScreen}
                      size={14}
                      strokeWidth={1.8}
                      className={`text-muted flex-none ${process.id === onScreen ? '' : 'invisible'}`}
                    />
                    <OverflowTooltip
                      label={process.name}
                      isOpen={isHovered || isFocused}
                    >
                      <span className="block truncate">{process.name}</span>
                    </OverflowTooltip>
                    <Check
                      aria-hidden
                      size={14}
                      strokeWidth={2}
                      className={`flex-none ${isSelected ? '' : 'invisible'}`}
                    />
                  </>
                )}
              </MenuItem>
            ))}
          </MenuSection>
          <Separator className="my-1 ms-7 -me-1 border-t border-(--sp-popover-ring)" />
          <MenuItem id="none" textValue="No context" className={ITEM}>
            {({ isSelected }) => (
              <>
                <span aria-hidden className="size-3.5 flex-none" />
                <span className="flex-1">No context</span>
                <Check
                  aria-hidden
                  size={14}
                  strokeWidth={2}
                  className={`flex-none ${isSelected ? '' : 'invisible'}`}
                />
              </>
            )}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

/*
  Past conversations. There are none until messages can be sent, so for now
  it says so rather than pretending.
*/
export function HistoryButton({
  hideTooltip = false,
}: {
  hideTooltip?: boolean;
}) {
  return (
    <DialogTrigger>
      <IconButton label="History" shape="round" hideTooltip={hideTooltip}>
        <History aria-hidden size={16} strokeWidth={1.8} />
      </IconButton>
      <Popover placement="bottom end" offset={6} className={`${POPOVER} w-64`}>
        <Dialog className="grid gap-1 p-4 outline-none">
          <Heading slot="title" className="text-dense font-medium">
            History
          </Heading>
          <p className="text-meta text-muted">No conversations yet.</p>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
