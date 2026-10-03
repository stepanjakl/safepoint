'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import {
  buildEvaluationRequest,
  evaluateModelCase,
  evaluationCases,
  evaluationReportSchema,
  type EvaluationReport,
} from '@/lib/model-workbench/evaluation';
import { labResponseSchema } from '@/lib/model-workbench/review-lab-contract';
import type { ModelId } from '@/lib/model-workbench/models';

import { createLocalStore } from './local-store';

const reportStore = createLocalStore({
  key: 'safepoint.model-evaluation.v1',
  schema: evaluationReportSchema.nullable(),
  initialValue: null,
  invalidMessage:
    'The saved evaluation report is invalid. Run the examples again or clear the report.',
  unavailableMessage:
    'Evaluation storage is unavailable. Export the report to retain it after this page closes.',
});

export function ModelEvaluation({
  model,
  reviewAt,
  disabled,
  keyConfigured,
  onBusy,
  onStatus,
}: {
  model: ModelId;
  reviewAt: string;
  disabled: boolean;
  keyConfigured: boolean;
  onBusy: (busy: boolean) => void;
  onStatus: (message: string) => void;
}) {
  const { data: report, error } = useSyncExternalStore(
    reportStore.subscribe,
    reportStore.getSnapshot,
    reportStore.getServerSnapshot,
  );
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState('');
  const pending = useRef<AbortController | null>(null);
  const stopAfterCall = useRef(false);
  const runButton = useRef<HTMLButtonElement>(null);
  const stopButton = useRef<HTMLButtonElement>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
      onBusy(false);
    },
    [onBusy],
  );

  async function runExamples() {
    if (running || disabled || pending.current || !keyConfigured) return;
    const controller = new AbortController();
    pending.current = controller;
    stopAfterCall.current = false;
    setRunning(true);
    setStopping(false);
    onBusy(true);
    reportStore.update(null);
    const startedAt = new Date().toISOString();
    const records: EvaluationReport['records'] = [];
    try {
      for (const [index, test] of evaluationCases.entries()) {
        if (stopAfterCall.current || controller.signal.aborted) break;
        const message = `Evaluation ${index + 1} of ${evaluationCases.length}: ${test.title}.`;
        setProgress(message);
        onStatus(message);
        const request = buildEvaluationRequest(test, model, reviewAt);
        const started = performance.now();
        let response;
        try {
          const result = await fetch('/api/dev/review-lab', {
            signal: controller.signal,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
          });
          response = labResponseSchema.parse(await result.json());
        } catch (error) {
          if (controller.signal.aborted) return;
          response = labResponseSchema.parse({
            kind: 'error',
            message:
              error instanceof TypeError
                ? 'The local model route could not be reached.'
                : 'The local model route returned an unreadable response.',
          });
        }
        if (controller.signal.aborted) return;
        records.push(
          evaluateModelCase(
            test,
            request,
            response,
            Math.round(performance.now() - started),
          ),
        );
        reportStore.update(
          evaluationReportSchema.parse({
            kind: 'model_evaluation',
            suiteVersion: 1,
            model,
            reviewAt,
            startedAt,
            finishedAt: new Date().toISOString(),
            state:
              records.length === evaluationCases.length
                ? 'completed'
                : 'stopped',
            records,
          }),
        );
      }
      const passed = records.filter(
        ({ outcome }) => outcome === 'passed',
      ).length;
      const summary = `Evaluation ${records.length === evaluationCases.length ? 'finished' : 'stopped'}: ${passed} of ${records.length} completed cases passed synthetic checks.`;
      setProgress(summary);
      onStatus(summary);
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setRunning(false);
        setStopping(false);
        onBusy(false);
        if (document.activeElement === stopButton.current)
          requestAnimationFrame(() => runButton.current?.focus());
      }
    }
  }

  function exportReport() {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `safepoint-model-evaluation-${report.model}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onStatus('Model evaluation report exported as JSON.');
  }

  return (
    <section
      className="bg-surface-floating ground-floating border-rule-default rounded-shell grid min-w-0 gap-3 border p-5 wrap-anywhere"
      aria-labelledby="evaluation-heading"
    >
      <h2 id="evaluation-heading" className="text-title font-semibold">
        Model evaluation · examples
      </h2>
      <p className="text-meta text-muted">
        Seven fixed synthetic cases use seeded rules and one model. Results
        measure these examples; a reviewer still checks the reasoning and
        evidence.
      </p>
      <details className="min-w-0">
        <summary className="text-meta cursor-pointer">
          Seven example cases and latest report
        </summary>
        <div className="mt-4 grid min-w-0 gap-4">
          <p className="text-meta">
            Selected model: {model}. One request per case, run sequentially.
            Expected answers stay outside model inputs. All returned facts and
            rules remain evaluation drafts.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              ref={runButton}
              onPress={() => void runExamples()}
              isDisabled={running || disabled || !keyConfigured}
            >
              Run seven test cases
            </Button>
            <Button
              ref={stopButton}
              onPress={() => {
                if (stopping) return;
                stopAfterCall.current = true;
                setStopping(true);
                onStatus('Evaluation will stop after the current model call.');
              }}
              isDisabled={!running}
            >
              {stopping
                ? 'Stopping after current call…'
                : 'Stop after current call'}
            </Button>
          </div>
          {!keyConfigured ? (
            <p className="text-meta">
              Configure the server model key to run these examples.
            </p>
          ) : null}
          <p className="text-meta min-h-6">{progress}</p>
          {error ? <p className="text-meta">{error}</p> : null}
          {report ? (
            <p className="text-meta" data-evaluation-summary>
              Latest report · {report.model} · {report.state} ·{' '}
              {
                report.records.filter(({ outcome }) => outcome === 'passed')
                  .length
              }{' '}
              passed ·{' '}
              {
                report.records.filter(({ outcome }) => outcome === 'failed')
                  .length
              }{' '}
              need inspection ·{' '}
              {
                report.records.filter(
                  ({ outcome }) => outcome === 'call_failed',
                ).length
              }{' '}
              calls failed · {evaluationCases.length - report.records.length}{' '}
              not run
            </p>
          ) : null}
          <ol
            className="grid min-w-0 gap-3"
            aria-label="Evaluation cases"
            aria-busy={running}
          >
            {evaluationCases.map((test) => {
              const record = report?.records.find(
                ({ caseId }) => caseId === test.id,
              );
              return (
                <li
                  key={test.id}
                  className="border-rule-default rounded-control grid min-w-0 gap-2 border p-3"
                >
                  <h3 className="text-meta font-semibold">
                    {test.title} · {test.stage.replaceAll('_', ' ')} ·{' '}
                    {test.sku}
                  </h3>
                  <p className="text-meta">Expected behavior: {test.purpose}</p>
                  {test.text ? (
                    <blockquote className="text-meta text-muted">
                      “{test.text}”
                    </blockquote>
                  ) : null}
                  <p className="text-meta font-semibold">
                    {record
                      ? record.outcome === 'passed'
                        ? 'Passed synthetic checks'
                        : record.outcome === 'failed'
                          ? 'Needs inspection'
                          : 'Model call failed'
                      : 'Not run'}
                  </p>
                  {record ? (
                    <>
                      <p className="text-meta text-muted">
                        {record.elapsedMs} ms ·{' '}
                        {record.response.runId ?? 'No model run ID'}
                        {record.response.kind === 'result'
                          ? ` · ${record.response.usage?.inputTokens ?? 'unknown'} input tokens · ${record.response.usage?.outputTokens ?? 'unknown'} output tokens`
                          : ''}
                      </p>
                      {record.response.kind === 'error' ? (
                        <p className="text-meta">{record.response.message}</p>
                      ) : null}
                      <ul className="text-meta grid gap-1">
                        {record.checks.map((check) => (
                          <li key={check.label}>
                            <strong>
                              {check.passed ? 'Pass' : 'Fail'} · {check.label}
                            </strong>
                            <br />
                            {check.detail}
                          </li>
                        ))}
                      </ul>
                      <details className="text-meta min-w-0">
                        <summary className="cursor-pointer">
                          Exact request, model response and checks
                        </summary>
                        <pre className="bg-surface-inset rounded-control mt-2 max-w-full overflow-auto p-3 text-xs">
                          {JSON.stringify(record, null, 2)}
                        </pre>
                      </details>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className="text-meta text-muted">
            Only the latest report is saved in this browser. Exact inputs,
            rules, provider errors and outputs are included in its export.
            Passing does not approve a rule, a case or an external write.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onPress={exportReport} isDisabled={!report}>
              Export evaluation report
            </Button>
            <Button
              onPress={() => {
                reportStore.update(null);
                setProgress('');
                onStatus('Local evaluation report cleared.');
              }}
              isDisabled={running || (!report && !error)}
            >
              Clear evaluation report
            </Button>
          </div>
        </div>
      </details>
    </section>
  );
}
