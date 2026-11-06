'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
  DrawerOverlay,
  DrawerPanels,
} from '@/components/app-shell/drawer-overlay';
import { ModelLimits } from '@/components/brunch-orders/model-limits';
import { useTrial } from '@/components/brunch-orders/trial-parts';
import {
  DATA_TABLE_HEAD,
  DATA_TABLE_RULE,
  DATA_TABLE_RULE_ON,
  DataTable,
} from '@/components/ui/data-table';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { Pill } from '@/components/ui/pill';
import { cx } from '@/lib/cx';
import type { AccountedSentence, Agreement } from '@/lib/definitions/types';
import type {
  DefinitionDebug,
  DraftDebug,
  RecordWorking,
} from '@/lib/definitions/debug';
import { DRAFTING_MODELS, type DraftingModel } from '@/lib/models';
import { TabSwap } from '@/components/ui/swap';

/*
  What code finds of a draft and of each rule in it, for a person working out
  why a draft came out as it did. Everything shown is worked out when asked, on
  the run's read, and asks no model. What the model did on each attempt is not
  recorded yet, so it is not here. It knows no process: the words for what is
  worked out and tried come with the answer.
*/

type Reply =
  | { kind: 'debug'; debug: DefinitionDebug }
  | { kind: 'debugDraft'; debug: DraftDebug }
  | { kind: 'error'; message: string };

export type Debugging = { kind: 'draft' } | { kind: 'rule'; id: string };

const RULE_TABS = ['Summary', 'Source', 'Checks', 'Values'] as const;
const DRAFT_TABS = ['Sentences', 'Rules', 'Columns', 'Models'] as const;

const tabsOf = (names: readonly string[]) =>
  names.map((name) => ({ key: name, short: name, label: name }));

const AGREEMENT: Record<Agreement['status'], (runs: number) => string> = {
  agreed: (runs) => `${runs} written, and they behave the same`,
  split: (runs) => `${runs} written, and they behave differently`,
  chosen: (runs) => `${runs} written, and you chose this one`,
  unconfirmed: (runs) => `${runs} written, and only this one passed the checks`,
};

const KIND: Record<AccountedSentence['kind'], string> = {
  quantity: 'Quantity',
  check: 'Check',
  context: 'Context',
};

export function RulesDebug({
  debugging,
  route,
  text,
  readId,
  onClose,
}: {
  debugging: Debugging | null;
  // The process's rules route.
  route: string;
  text: string;
  readId: string | null;
  onClose: () => void;
}) {
  // What was last open stays while the drawer animates out.
  const [shown, setShown] = useState(debugging);
  if (debugging && debugging !== shown) setShown(debugging);
  return (
    <DrawerOverlay
      isOpen={debugging !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {shown?.kind === 'draft' ? (
        <DraftDrawer route={route} text={text} readId={readId} />
      ) : shown ? (
        <RuleDrawer
          key={shown.id}
          route={route}
          id={shown.id}
          text={text}
          readId={readId}
        />
      ) : null}
    </DrawerOverlay>
  );
}

// What the model read a sentence as, the same wherever it is shown.
function KindPill({ kind }: { kind: AccountedSentence['kind'] }) {
  return <Pill tone="neutral">{KIND[kind]}</Pill>;
}

// A tab's body takes the drawer's height below the tabs, as each view expects.
const TAB_BODY = 'flex min-h-0 min-w-0 flex-1 flex-col';

function Scroller({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={label}
      className="grid min-h-0 flex-1 content-start gap-4 overflow-auto"
    >
      {children}
    </div>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="readout text-muted">{term}</dt>
      <dd className="text-dense">{children}</dd>
    </div>
  );
}

function Waiting({
  state,
  message,
}: {
  state: ReturnType<typeof useTrial<Reply>>['state'];
  message: string | null;
}) {
  return (
    <p role="status" className="text-dense text-muted">
      {message ?? (state.kind === 'failed' ? state.message : 'Working it out…')}
    </p>
  );
}

function RuleDrawer({
  route,
  id,
  text,
  readId,
}: {
  route: string;
  id: string;
  text: string;
  readId: string | null;
}) {
  const asking = useTrial<Reply>(route);
  const { run } = asking;
  const [debug, setDebug] = useState<DefinitionDebug | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<string>('Summary');
  const [inputs, setInputs] = useState<Record<string, number>>({});
  // The answer to the last question only: typing asks many.
  const latest = useRef(0);
  const inputsKey = JSON.stringify(inputs);
  useEffect(() => {
    const asked = (latest.current += 1);
    void run({
      action: 'debug',
      text,
      readId,
      id,
      inputs: JSON.parse(inputsKey) as Record<string, number>,
    }).then((reply) => {
      if (asked !== latest.current) return;
      if (reply?.kind === 'debug') setDebug(reply.debug);
      if (reply?.kind === 'error') setMessage(reply.message);
    });
  }, [run, text, readId, id, inputsKey]);
  const fails =
    debug?.checks.filter((part) => part.problems.length).length ?? 0;
  return (
    <DrawerPanels
      title={debug ? `Debug: ${debug.summary.name}` : 'Debug'}
      closeLabel="Close"
      aside={null}
      width="fixed"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-5">
        {debug ? (
          <>
            <FilterTabs
              tabs={tabsOf(RULE_TABS).map((one) =>
                one.key === 'Checks' && fails ? { ...one, count: fails } : one,
              )}
              selected={tab}
              onChange={setTab}
              leadKey={null}
              ariaLabel="Debug views"
              menuLabel="Other debug views"
              className="self-start"
            />
            <TabSwap selected={tab} className={TAB_BODY}>
              {(shown) =>
                shown === 'Summary' ? (
                  <SummaryView debug={debug} fails={fails} />
                ) : shown === 'Source' ? (
                  <SourceView debug={debug} />
                ) : shown === 'Checks' ? (
                  <ChecksView debug={debug} />
                ) : (
                  <ValuesView
                    debug={debug}
                    onInput={(field, value) =>
                      setInputs({ ...inputs, [field]: value })
                    }
                  />
                )
              }
            </TabSwap>
          </>
        ) : (
          <Waiting state={asking.state} message={message} />
        )}
      </div>
    </DrawerPanels>
  );
}

function SummaryView({
  debug,
  fails,
}: {
  debug: DefinitionDebug;
  fails: number;
}) {
  const { summary } = debug;
  const names = (list: { name: string }[]) =>
    list.length ? list.map((one) => one.name).join(', ') : 'None';
  return (
    <Scroller label="Summary">
      <dl className="grid gap-3">
        <Fact term="Kind">
          {summary.result === 'number' ? 'Calculation' : 'Check'}
          {summary.consequence === 'block'
            ? ', blocks the proposal'
            : summary.consequence === 'decide'
              ? ', a person decides'
              : ''}
        </Fact>
        <Fact term="Written by">{summary.model ?? 'Not written'}</Fact>
        <Fact term="Independent writes">
          {summary.agreement
            ? AGREEMENT[summary.agreement.status](summary.agreement.runs)
            : 'Written once'}
        </Fact>
        <Fact term="Code’s checks">
          {!summary.written
            ? 'Not written yet'
            : fails
              ? `${fails} of ${debug.checks.length} find a problem`
              : `All ${debug.checks.length} pass`}
        </Fact>
        <Fact term="Decision">
          {summary.approvedAt
            ? 'Accepted'
            : summary.deniedAt
              ? `Denied${summary.denial ? `: ${summary.denial}` : ''}`
              : 'None yet'}
        </Fact>
        <Fact term="Reads">{names(summary.reads)}</Fact>
        <Fact term="Read by">{names(summary.readBy)}</Fact>
        <Fact term="Worked out on">
          {debug.read.source} ({debug.read.id})
        </Fact>
      </dl>
      {summary.problem ? (
        <p className="text-dense text-state-blocked">{summary.problem}</p>
      ) : null}
      {summary.ignoresProposal ? (
        <p className="text-dense text-state-advisory">
          No proposed value can change this check&rsquo;s answer. Right for a
          rule about the data; wrong for a rule about what is proposed.
        </p>
      ) : null}
      {summary.worksOutItself ? (
        <p className="text-dense text-state-advisory">
          This check works a quantity out itself, reading numbers its own words
          do not state.
        </p>
      ) : null}
      <p className="text-meta text-muted">
        Requests, time, tokens and attempts are not recorded yet.
      </p>
    </Scroller>
  );
}

function SourceView({ debug }: { debug: DefinitionDebug }) {
  const { source } = debug;
  return (
    <Scroller label="Source">
      <dl className="grid gap-3">
        <Fact term="As the model read it">{source.text}</Fact>
        <Fact term="The sentences it came from">
          {source.sentences === null ? (
            'Not recorded: this draft was found before sentences were kept.'
          ) : source.sentences.length ? (
            <ul className="grid gap-2">
              {source.sentences.map(({ sentence, kind, how }) => (
                <li key={sentence} className="grid justify-items-start gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <KindPill kind={kind} />
                    {how === 'quotes' ? (
                      <span className="text-meta text-muted">
                        Gives this rule a number or a group
                      </span>
                    ) : null}
                  </span>
                  <span>{sentence}</span>
                </li>
              ))}
            </ul>
          ) : (
            'None'
          )}
        </Fact>
        <Fact term="Formula">
          {source.formula ? (
            <code className="value text-meta break-words">
              {source.formula}
            </code>
          ) : (
            'Not written'
          )}
        </Fact>
        <Fact term="Columns it reads">
          {source.columns.own.length ? (
            <code className="value text-meta break-words">
              {columnList(source.columns.own)}
            </code>
          ) : (
            'None'
          )}
        </Fact>
        {source.columns.through.length ? (
          <Fact term="Through the calculations it reads">
            <code className="value text-meta break-words">
              {columnList(source.columns.through)}
            </code>
          </Fact>
        ) : null}
        <Fact term="Numbers it uses">
          {source.constants.length ? (
            <ul className="grid gap-1">
              {source.constants.map((constant) => (
                <li key={constant.id}>
                  <span className="value">
                    {constant.id} = {constant.value}
                  </span>{' '}
                  <span className="text-muted">
                    from &ldquo;{constant.quote}&rdquo;
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            'None'
          )}
        </Fact>
        <Fact term="Groups it uses">
          {source.groups.length ? (
            <ul className="grid gap-1">
              {source.groups.map((group) => (
                <li key={group.id}>
                  <span className="value">
                    {group.id}: {group.keys.join(', ')}
                  </span>{' '}
                  <span className="text-muted">
                    from &ldquo;{group.quote}&rdquo;
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            'None'
          )}
        </Fact>
      </dl>
    </Scroller>
  );
}

function ChecksView({ debug }: { debug: DefinitionDebug }) {
  if (!debug.checks.length)
    return (
      <p className="text-dense text-muted">
        Nothing to check until it has a formula.
      </p>
    );
  return (
    <Scroller label="Code’s checks">
      <ul className="grid gap-3">
        {debug.checks.map((part) => (
          <li key={part.id} className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={part.problems.length ? 'blocked' : 'ready'}>
                {part.problems.length ? 'Problem' : 'Passes'}
              </Pill>
              <span className="text-dense">{part.label}</span>
            </div>
            {part.problems.map((problem) => (
              <p key={problem} className="text-dense text-state-blocked">
                {problem}
              </p>
            ))}
            {part.note ? (
              <p className="text-meta text-muted">{part.note}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </Scroller>
  );
}

const resultWords = (record: RecordWorking) =>
  record.error
    ? 'Could not run'
    : !record.applies
      ? 'Doesn’t apply'
      : record.result === true
        ? 'Holds'
        : record.result === false
          ? 'Fails'
          : String(record.result);

function ValuesView({
  debug,
  onInput,
}: {
  debug: DefinitionDebug;
  onInput: (field: string, value: number) => void;
}) {
  if (!debug.source.formula)
    return (
      <p className="text-dense text-muted">
        Nothing to work out until it has a formula.
      </p>
    );
  return (
    <>
      {debug.fields.length ? (
        <div className="flex flex-wrap items-end gap-3">
          {debug.fields.map((field) => (
            <label key={field.id} className="grid gap-1">
              <span className="readout text-muted">Try {field.label}</span>
              <input
                type="number"
                min={0}
                step={1}
                defaultValue={debug.inputs[field.id] ?? 0}
                className="field text-dense min-h-9 w-24 px-2"
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isInteger(value) && value >= 0)
                    onInput(field.id, value);
                }}
              />
            </label>
          ))}
          <span className="text-meta text-muted">
            Every {debug.about.record}, at this value.
          </span>
        </div>
      ) : null}
      <Scroller label="Values on every record">
        <DataTable>
          <table className="text-dense w-full border-separate border-spacing-0">
            <caption className="sr-only">
              What the formula gives on every {debug.about.record}
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className={cx(DATA_TABLE_HEAD, 'pr-3 pl-4 text-left')}
                >
                  {debug.about.key}
                </th>
                <th
                  scope="col"
                  className={cx(DATA_TABLE_HEAD, 'pr-3 text-left')}
                >
                  Gives
                </th>
                <th
                  scope="col"
                  className={cx(DATA_TABLE_HEAD, 'pr-4 text-left')}
                >
                  Working
                </th>
              </tr>
            </thead>
            <tbody>
              {debug.records.map((record, index) => (
                <tr key={record.key}>
                  <th
                    scope="row"
                    title={record.name}
                    className={cx(
                      'py-2 pr-3 pl-4 text-left align-top font-normal whitespace-nowrap',
                      index > 0 && DATA_TABLE_RULE,
                    )}
                  >
                    {record.key}
                  </th>
                  <td
                    className={cx(
                      'py-2 pr-3 align-top whitespace-nowrap',
                      index > 0 && DATA_TABLE_RULE_ON,
                      record.result === false && 'text-state-blocked',
                    )}
                  >
                    {resultWords(record)}
                  </td>
                  <td
                    className={cx(
                      'value text-meta text-muted py-2 pr-4 align-top break-words',
                      index > 0 && DATA_TABLE_RULE_ON,
                    )}
                  >
                    {record.error ??
                      record.steps.map((step, at) => (
                        <div key={at}>{step}</div>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </Scroller>
    </>
  );
}

function DraftDrawer({
  route,
  text,
  readId,
}: {
  route: string;
  text: string;
  readId: string | null;
}) {
  const asking = useTrial<Reply>(route);
  const { run } = asking;
  const [tab, setTab] = useState<string>('Sentences');
  useEffect(() => {
    void run({ action: 'debugDraft', text, readId });
  }, [run, text, readId]);
  const body = asking.state.kind === 'done' ? asking.state.body : null;
  const debug = body?.kind === 'debugDraft' ? body.debug : null;
  return (
    <DrawerPanels
      title="Debug: the draft"
      closeLabel="Close"
      aside={null}
      width="fixed"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-5">
        {debug ? (
          <>
            <FilterTabs
              tabs={tabsOf(DRAFT_TABS)}
              selected={tab}
              onChange={setTab}
              leadKey={null}
              ariaLabel="Debug views"
              menuLabel="Other debug views"
              className="self-start"
            />
            <TabSwap selected={tab} className={TAB_BODY}>
              {(shown) =>
                shown === 'Sentences' ? (
                  <SentencesView debug={debug} />
                ) : shown === 'Rules' ? (
                  <RulesView debug={debug} />
                ) : shown === 'Columns' ? (
                  <ColumnsView debug={debug} />
                ) : (
                  <ModelsView debug={debug} />
                )
              }
            </TabSwap>
          </>
        ) : (
          <Waiting
            state={asking.state}
            message={body?.kind === 'error' ? body.message : null}
          />
        )}
      </div>
    </DrawerPanels>
  );
}

function SentencesView({ debug }: { debug: DraftDebug }) {
  return (
    <Scroller label="Sentences">
      <p className="text-dense">{debug.intent}</p>
      {debug.refused.length ? (
        <div className="grid gap-1">
          <p className="text-dense text-state-advisory">
            The first answer was refused, and a second was asked for:
          </p>
          <ul className="text-dense grid list-disc gap-0.5 pl-4">
            {debug.refused.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {debug.accountProblems.length ? (
        <ul className="text-dense text-state-blocked grid gap-1">
          {debug.accountProblems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {debug.accounting ? (
        <DataTable>
          <table className="text-dense w-full border-separate border-spacing-0">
            <caption className="sr-only">
              What each sentence of the instructions was read as
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className={cx(DATA_TABLE_HEAD, 'pr-3 pl-4 text-left')}
                >
                  Sentence
                </th>
                <th
                  scope="col"
                  className={cx(DATA_TABLE_HEAD, 'pr-3 text-left')}
                >
                  Read as
                </th>
                <th
                  scope="col"
                  className={cx(DATA_TABLE_HEAD, 'pr-4 text-left')}
                >
                  Belongs to
                </th>
              </tr>
            </thead>
            <tbody>
              {debug.accounting.map((row, index) => (
                <tr key={row.sentence}>
                  <th
                    scope="row"
                    className={cx(
                      'py-2 pr-3 pl-4 text-left align-top font-normal',
                      index > 0 && DATA_TABLE_RULE,
                    )}
                  >
                    {row.sentence}
                  </th>
                  <td
                    className={cx(
                      'py-2 pr-3 align-top whitespace-nowrap',
                      index > 0 && DATA_TABLE_RULE_ON,
                    )}
                  >
                    <KindPill kind={row.kind} />
                  </td>
                  <td
                    className={cx(
                      'value text-meta text-muted py-2 pr-4 align-top break-words',
                      index > 0 && DATA_TABLE_RULE_ON,
                    )}
                  >
                    {row.definitions.join(', ')}
                    {row.quotedBy.filter((id) => !row.definitions.includes(id))
                      .length ? (
                      <div>
                        quoted by{' '}
                        {row.quotedBy
                          .filter((id) => !row.definitions.includes(id))
                          .join(', ')}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      ) : (
        <p className="text-dense text-muted">
          Not recorded: this draft was found before sentences were kept.
        </p>
      )}
    </Scroller>
  );
}

const columnList = (columns: string[]) => columns.join(', ');

// Each rule's columns side by side, since a mistake in one shows against the
// others: two rules about stock that count it differently.
function ColumnsView({ debug }: { debug: DraftDebug }) {
  if (!debug.columns)
    return (
      <p className="text-dense text-muted">
        No read is kept to take the data&rsquo;s columns from.
      </p>
    );
  return (
    <Scroller label="Columns">
      <DataTable>
        <table className="text-dense w-full border-separate border-spacing-0">
          <caption className="sr-only">The columns each rule reads</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className={cx(DATA_TABLE_HEAD, 'pr-3 pl-4 text-left')}
              >
                Rule
              </th>
              <th scope="col" className={cx(DATA_TABLE_HEAD, 'pr-3 text-left')}>
                Reads
              </th>
              <th scope="col" className={cx(DATA_TABLE_HEAD, 'pr-4 text-left')}>
                Through others
              </th>
            </tr>
          </thead>
          <tbody>
            {debug.columns.rules.map((rule, index) => (
              <tr key={rule.id}>
                <th
                  scope="row"
                  className={cx(
                    'py-2 pr-3 pl-4 text-left align-top font-normal',
                    index > 0 && DATA_TABLE_RULE,
                  )}
                >
                  {rule.name}
                </th>
                <td
                  className={cx(
                    'value text-meta py-2 pr-3 align-top break-words',
                    index > 0 && DATA_TABLE_RULE_ON,
                  )}
                >
                  {rule.written ? (
                    columnList(rule.own) || 'None'
                  ) : (
                    <span className="text-muted">Not written</span>
                  )}
                </td>
                <td
                  className={cx(
                    'value text-meta text-muted py-2 pr-4 align-top break-words',
                    index > 0 && DATA_TABLE_RULE_ON,
                  )}
                >
                  {columnList(rule.through)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
      <dl className="grid gap-3">
        <Fact term="Not read by any rule">
          {debug.columns.unread.length ? (
            <code className="value text-meta break-words">
              {columnList(debug.columns.unread)}
            </code>
          ) : (
            'None'
          )}
        </Fact>
      </dl>
      <p className="text-meta text-muted">
        Which columns a rule reads, not whether it uses them rightly. An unread
        column is only a question: should a rule be reading it?
      </p>
    </Scroller>
  );
}

function RulesView({ debug }: { debug: DraftDebug }) {
  return (
    <Scroller label="Rules">
      <ul className="grid gap-3">
        {debug.definitions.map((definition) => (
          <li key={definition.id} className="grid gap-0.5">
            <span className="text-dense">
              {definition.name}{' '}
              <span className="text-muted">
                {definition.result === 'number' ? 'calculation' : 'check'}
                {definition.written ? '' : ', not written'}
                {definition.approved ? ', accepted' : ''}
              </span>
            </span>
            <span className="text-meta text-muted">
              {definition.model ?? 'No model yet'}
            </span>
            {definition.worksOutItself ? (
              <span className="text-meta text-state-advisory">
                Works a quantity out itself.
              </span>
            ) : null}
            {definition.problem ? (
              <span className="text-meta text-state-blocked">
                {definition.problem}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </Scroller>
  );
}

function ModelsView({ debug }: { debug: DraftDebug }) {
  const models = debug.models.filter((model): model is DraftingModel =>
    (DRAFTING_MODELS as readonly string[]).includes(model),
  );
  return (
    <Scroller label="Models">
      <dl className="grid gap-3">
        <Fact term="Found by">{debug.model}</Fact>
        <Fact term="Found at">{debug.foundAt}</Fact>
        <Fact term="Read used">{debug.readId ?? 'None yet'}</Fact>
      </dl>
      {models.map((model) => (
        <div key={model} className="grid gap-0.5">
          <p className="text-dense">{model}</p>
          <ModelLimits model={model} />
        </div>
      ))}
    </Scroller>
  );
}
