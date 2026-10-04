import {
  AST_NODE_LIMIT,
  ENGINES,
  sameValue,
  type Bindings,
  type CelEngine,
  type CheckResult,
  type EvalResult,
  type Variables,
} from '@/lib/rulebook/cel-engines';
import {
  runConformance,
  type ConformanceReport,
} from '@/lib/rulebook/cel-conformance';
import {
  TOOLBOX,
  toolboxSignature,
  toolboxSource,
} from '@/lib/rulebook/toolbox';

/*
  Phase 0's formula-language trial. Each of the sheet's eleven rules is written
  once in CEL and asked of both libraries, with examples just inside and just
  outside its limit. Values are whole pence and minutes since Monday 00:00, the
  units the engine will use. Expected answers are written here, by hand, from
  the arithmetic in docs/SHEET-PROCESS-PLAN.md, never taken from either library.
*/

type Example = { label: string; given: Bindings; expect: boolean };

export type TrialRule = {
  id: string;
  wording: string;
  outcome: 'block' | 'attention';
  formula: string;
  variables: Variables;
  examples: Example[];
};

const int = 'int' as const;

// Minutes since Monday 00:00, so the examples read as the sheet does.
const at = (day: number, hour: number, minute = 0) =>
  BigInt(((day - 1) * 24 + hour) * 60 + minute);

export const TRIAL_RULES: TrialRule[] = [
  {
    id: 'R1',
    wording: "An offer price must keep at least the category's margin floor.",
    outcome: 'block',
    formula:
      '(offer_price - cost_price) * 100 >= margin_floor_pct * offer_price',
    variables: { offer_price: int, cost_price: int, margin_floor_pct: int },
    examples: [
      {
        label: 'Cherry tomatoes at 80p, cost 60p, floor 20%',
        given: { offer_price: 80n, cost_price: 60n, margin_floor_pct: 20n },
        expect: true,
      },
      {
        label: 'Exactly at the floor: 75p',
        given: { offer_price: 75n, cost_price: 60n, margin_floor_pct: 20n },
        expect: true,
      },
      {
        label: 'One penny below: 74p',
        given: { offer_price: 74n, cost_price: 60n, margin_floor_pct: 20n },
        expect: false,
      },
    ],
  },
  {
    id: 'R2',
    wording:
      'The kit price must keep at least the kit margin floor, counting the cost of every component.',
    outcome: 'block',
    formula: '(kit_price - kit_cost) * 100 >= margin_floor_pct * kit_price',
    variables: { kit_price: int, kit_cost: int, margin_floor_pct: int },
    examples: [
      {
        label: "The brief's £4.75 (cost 375p, floor 25%)",
        given: { kit_price: 475n, kit_cost: 375n, margin_floor_pct: 25n },
        expect: false,
      },
      {
        label: 'Exactly at the floor: £5.00',
        given: { kit_price: 500n, kit_cost: 375n, margin_floor_pct: 25n },
        expect: true,
      },
      {
        label: 'One penny below: £4.99',
        given: { kit_price: 499n, kit_cost: 375n, margin_floor_pct: 25n },
        expect: false,
      },
    ],
  },
  {
    id: 'R3',
    wording: 'Order quantities must be whole cases.',
    outcome: 'block',
    formula: 'order_units % case_size == 0',
    variables: { order_units: int, case_size: int },
    examples: [
      {
        label: 'Feta: the raw shortfall, 43 units, case of 12',
        given: { order_units: 43n, case_size: 12n },
        expect: false,
      },
      {
        label: 'Feta rounded up to 48 (4 cases)',
        given: { order_units: 48n, case_size: 12n },
        expect: true,
      },
      {
        label: 'No order',
        given: { order_units: 0n, case_size: 12n },
        expect: true,
      },
    ],
  },
  {
    id: 'R4',
    wording:
      "Don't use a stock count older than the category's limit; recount first.",
    outcome: 'block',
    formula: 'hours_between(counted_at, run_at) <= double(max_count_age_hours)',
    variables: { counted_at: int, run_at: int, max_count_age_hours: int },
    examples: [
      {
        label:
          'Loose avocados counted Tue 18:00, run Thu 08:45 (38¾ h), limit 24 h',
        given: {
          counted_at: at(2, 18),
          run_at: at(4, 8, 45),
          max_count_age_hours: 24n,
        },
        expect: false,
      },
      {
        label: 'Counted Thu 07:30, run Thu 08:45 (1¼ h)',
        given: {
          counted_at: at(4, 7, 30),
          run_at: at(4, 8, 45),
          max_count_age_hours: 24n,
        },
        expect: true,
      },
      {
        label: 'Exactly 24 hours old',
        given: {
          counted_at: at(3, 8, 45),
          run_at: at(4, 8, 45),
          max_count_age_hours: 24n,
        },
        expect: true,
      },
    ],
  },
  {
    id: 'R5',
    wording: 'Anything we order must arrive before the promotion starts.',
    outcome: 'block',
    formula: 'order_units == 0 || delivery_at <= starts_at',
    variables: { order_units: int, delivery_at: int, starts_at: int },
    examples: [
      {
        label: 'Produce: delivered Fri 06:00, starts Sat 07:00',
        given: { order_units: 60n, delivery_at: at(5, 6), starts_at: at(6, 7) },
        expect: true,
      },
      {
        label: 'Delivered Sat 08:00, an hour after the start',
        given: { order_units: 60n, delivery_at: at(6, 8), starts_at: at(6, 7) },
        expect: false,
      },
      {
        label: 'Late, but nothing ordered',
        given: { order_units: 0n, delivery_at: at(6, 8), starts_at: at(6, 7) },
        expect: true,
      },
    ],
  },
  {
    id: 'R6',
    wording:
      'A discount deeper than the category maximum needs individual approval.',
    outcome: 'attention',
    formula:
      '(regular_price - offer_price) * 100 <= max_discount_pct * regular_price',
    variables: { regular_price: int, offer_price: int, max_discount_pct: int },
    examples: [
      {
        label: 'Cherry tomatoes £1.10 → 80p (27.3%), maximum 25%',
        given: { regular_price: 110n, offer_price: 80n, max_discount_pct: 25n },
        expect: false,
      },
      {
        label: 'Rocket £1.00 → 75p, exactly 25%',
        given: { regular_price: 100n, offer_price: 75n, max_discount_pct: 25n },
        expect: true,
      },
      {
        label: 'Cherry tomatoes at 83p (24.5%)',
        given: { regular_price: 110n, offer_price: 83n, max_discount_pct: 25n },
        expect: true,
      },
    ],
  },
  {
    id: 'R7',
    wording:
      "Ripe stock shouldn't cover more than the category's ripe cover days of expected sales.",
    outcome: 'attention',
    formula:
      '!ripe || 2 * (available + order_units) <= ripe_cover_days * demand',
    variables: {
      ripe: 'bool',
      available: int,
      order_units: int,
      ripe_cover_days: int,
      demand: int,
    },
    examples: [
      {
        label: 'Ripe avocados: 12 + 60 against 65 over two days',
        given: {
          ripe: true,
          available: 12n,
          order_units: 60n,
          ripe_cover_days: 2n,
          demand: 65n,
        },
        expect: false,
      },
      {
        label: 'Ripe avocados: 12 + 50',
        given: {
          ripe: true,
          available: 12n,
          order_units: 50n,
          ripe_cover_days: 2n,
          demand: 65n,
        },
        expect: true,
      },
      {
        label: 'Not sold ripe: the rule does not apply',
        given: {
          ripe: false,
          available: 12n,
          order_units: 60n,
          ripe_cover_days: 2n,
          demand: 65n,
        },
        expect: true,
      },
    ],
  },
  {
    id: 'R8',
    wording: "Don't plan more kits than the scarcest component can supply.",
    outcome: 'attention',
    formula: 'kit_limit <= kit_capacity',
    variables: { kit_limit: int, kit_capacity: int },
    examples: [
      {
        label: 'The brief expects 40; sourdough allows 35',
        given: { kit_limit: 40n, kit_capacity: 35n },
        expect: false,
      },
      {
        label: 'Kit limit set to 35',
        given: { kit_limit: 35n, kit_capacity: 35n },
        expect: true,
      },
    ],
  },
  {
    id: 'R9',
    wording: 'An offer or kit price must be below the regular price.',
    outcome: 'block',
    formula: 'offer_price < regular_price',
    variables: { offer_price: int, regular_price: int },
    examples: [
      {
        label: 'Kit at £5.00 against £7.00 for the parts',
        given: { offer_price: 500n, regular_price: 700n },
        expect: true,
      },
      {
        label: 'Kit at £7.00, no saving',
        given: { offer_price: 700n, regular_price: 700n },
        expect: false,
      },
    ],
  },
  {
    id: 'R10',
    wording:
      'Stock plus the order should cover expected demand plus safety stock.',
    outcome: 'attention',
    formula: 'available + order_units >= required',
    variables: { available: int, order_units: int, required: int },
    examples: [
      {
        label: 'Feta: 17 on hand + 48 against 60 required',
        given: { available: 17n, order_units: 48n, required: 60n },
        expect: true,
      },
      {
        label: 'Sourdough: 0 + 72 against 81 required',
        given: { available: 0n, order_units: 72n, required: 81n },
        expect: false,
      },
    ],
  },
  {
    id: 'R11',
    wording: "Don't order more than the supplier's maximum.",
    outcome: 'block',
    formula: 'max_order_units == 0 || order_units <= max_order_units',
    variables: { order_units: int, max_order_units: int },
    examples: [
      {
        label: 'Sourdough: 72 against a limit of 72',
        given: { order_units: 72n, max_order_units: 72n },
        expect: true,
      },
      {
        label: 'Sourdough: 81 against 72',
        given: { order_units: 81n, max_order_units: 72n },
        expect: false,
      },
      {
        label: 'No limit set (blank → 0)',
        given: { order_units: 500n, max_order_units: 0n },
        expect: true,
      },
    ],
  },
];

export type TrialFact = {
  id: string;
  label: string;
  formula: string;
  variables: Variables;
  given: Bindings;
  expect: bigint;
  arithmetic: string;
};

const TRIAL_FACTS: TrialFact[] = [
  {
    id: 'own_demand',
    label: 'Eggs: weekend demand with a 40% lift',
    formula: 'ceil_div((w[0] + w[1] + w[2] + w[3]) * (100 + uplift_pct), 400)',
    variables: { w: 'list<int>', uplift_pct: int },
    given: { w: [19n, 21n, 20n, 20n], uplift_pct: 40n },
    expect: 28n,
    arithmetic: '(19 + 21 + 20 + 20) × 140 ÷ 400 = 28 exactly',
  },
  {
    id: 'required',
    label: 'Required stock: 50 units of demand plus 10% safety',
    formula: 'ceil_div(demand * (100 + safety_pct), 100)',
    variables: { demand: int, safety_pct: int },
    given: { demand: 50n, safety_pct: 10n },
    expect: 55n,
    arithmetic:
      '50 × 110 ÷ 100 = 55 exactly; in floating point 50 × 1.1 = 55.00000000000001, which rounds up to 56',
  },
  {
    id: 'kit_capacity',
    label: 'Kit capacity: the scarcest capped component',
    formula:
      'min_of(components.filter(c, c.max_order_units > 0).map(c, c.max_order_units + c.available - c.own_required))',
    variables: { components: 'list<map<string, int>>' },
    given: {
      components: [
        { sku_no: 1n, max_order_units: 72n, available: 0n, own_required: 37n },
        { sku_no: 2n, max_order_units: 0n, available: 12n, own_required: 28n },
        { sku_no: 3n, max_order_units: 0n, available: 17n, own_required: 16n },
      ],
    },
    expect: 35n,
    arithmetic: 'Only sourdough has a cap: 72 + 0 − 37 = 35',
  },
];

export type TrialTrap = {
  id: string;
  label: string;
  formula: string;
  variables: Variables;
  given: Bindings;
  // What a safe engine does: return this value, or refuse the formula.
  expect: { kind: 'value'; value: unknown } | { kind: 'refused' };
  why: string;
};

const TRIAL_TRAPS: TrialTrap[] = [
  {
    id: 'integer_division',
    label: 'Whole-number division stays whole',
    formula: '7 / 2',
    variables: {},
    given: {},
    expect: { kind: 'value', value: 3n },
    why: 'Counts must never turn into fractions behind our back; rounding is always explicit (ceil_div).',
  },
  {
    id: 'mixed_numbers',
    label: 'Whole and decimal numbers are not mixed silently',
    formula: '1 + 1.5',
    variables: {},
    given: {},
    expect: { kind: 'refused' },
    why: 'An engine that quietly turns pence into floating point reintroduces the 28 → 29 error.',
  },
  {
    id: 'unknown_field',
    label: 'A misspelt field is refused',
    formula: 'offer_prise < regular_price',
    variables: { offer_price: int, regular_price: int },
    given: { offer_price: 80n, regular_price: 110n },
    expect: { kind: 'refused' },
    why: 'A typo must stop the rule, not make it pass or fail at random.',
  },
  {
    id: 'wrong_type',
    label: 'Comparing a price with text is refused',
    formula: "offer_price < 'cheap'",
    variables: { offer_price: int },
    given: { offer_price: 80n },
    expect: { kind: 'refused' },
    why: 'Type errors should surface when the rule is written, not on the day it runs.',
  },
  {
    id: 'oversized',
    label: `A formula larger than ${AST_NODE_LIMIT} parts is refused`,
    formula: Array.from({ length: 400 }, () => '1').join(' + '),
    variables: {},
    given: {},
    expect: { kind: 'refused' },
    why: 'A drafted or pasted formula must not be allowed to grow without bound.',
  },
];

// ── running ───────────────────────────────────────────────────────────────

type EngineOutcome = {
  check: CheckResult;
  result: EvalResult;
  passed: boolean;
};

export type RuleTrialReport = {
  ranAt: string;
  durationMs: number;
  engines: Pick<
    CelEngine,
    | 'id'
    | 'name'
    | 'packageName'
    | 'version'
    | 'license'
    | 'staticCheck'
    | 'limits'
  >[];
  toolbox: { signature: string; summary: string; source: string }[];
  conformance: ConformanceReport[];
  rules: (Omit<TrialRule, 'examples'> & {
    examples: (Omit<Example, 'given'> & {
      given: Record<string, string>;
      outcomes: Record<string, EngineOutcome>;
    })[];
  })[];
  facts: (Omit<TrialFact, 'given' | 'expect'> & {
    given: Record<string, string>;
    expect: string;
    outcomes: Record<string, EngineOutcome>;
  })[];
  traps: (Omit<TrialTrap, 'given' | 'expect'> & {
    expect: string;
    outcomes: Record<
      string,
      EngineOutcome & { caught: 'check' | 'run' | null }
    >;
  })[];
  floatingPoint: {
    naive: string;
    naiveResult: number;
    integer: string;
    integerResult: string;
  };
  summary: {
    engine: CelEngine['id'];
    conformancePassed: number;
    conformanceTotal: number;
    examplesPassed: number;
    examplesTotal: number;
    trapsPassed: number;
    trapsTotal: number;
    staticCheck: boolean;
  }[];
  suggestion: string;
};

const text = (value: unknown): string =>
  typeof value === 'bigint'
    ? String(value)
    : JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? `${v}` : v));

const shown = (given: Bindings) =>
  Object.fromEntries(Object.entries(given).map(([k, v]) => [k, text(v)]));

function ask(
  engine: CelEngine,
  formula: string,
  variables: Variables,
  given: Bindings,
) {
  return {
    check: engine.check(formula, variables),
    result: engine.evaluate(formula, variables, given),
  };
}

export function runRuleTrial(): RuleTrialReport {
  const started = performance.now();
  const conformance = ENGINES.map((engine) => runConformance(engine));

  const rules = TRIAL_RULES.map((rule) => ({
    ...rule,
    examples: rule.examples.map((example) => ({
      label: example.label,
      expect: example.expect,
      given: shown(example.given),
      outcomes: Object.fromEntries(
        ENGINES.map((engine) => {
          const { check, result } = ask(
            engine,
            rule.formula,
            rule.variables,
            example.given,
          );
          return [
            engine.id,
            {
              check,
              result,
              passed: result.ok && result.value === example.expect,
            },
          ];
        }),
      ),
    })),
  }));

  const facts = TRIAL_FACTS.map((fact) => ({
    id: fact.id,
    label: fact.label,
    formula: fact.formula,
    variables: fact.variables,
    arithmetic: fact.arithmetic,
    given: shown(fact.given),
    expect: String(fact.expect),
    outcomes: Object.fromEntries(
      ENGINES.map((engine) => {
        const { check, result } = ask(
          engine,
          fact.formula,
          fact.variables,
          fact.given,
        );
        return [
          engine.id,
          { check, result, passed: result.ok && result.value === fact.expect },
        ];
      }),
    ),
  }));

  const traps = TRIAL_TRAPS.map((trap) => ({
    id: trap.id,
    label: trap.label,
    formula: trap.formula,
    variables: trap.variables,
    why: trap.why,
    expect:
      trap.expect.kind === 'refused' ? 'refused' : text(trap.expect.value),
    outcomes: Object.fromEntries(
      ENGINES.map((engine) => {
        const { check, result } = ask(
          engine,
          trap.formula,
          trap.variables,
          trap.given,
        );
        const caught: 'check' | 'run' | null =
          check.status === 'invalid' ? 'check' : !result.ok ? 'run' : null;
        const passed =
          trap.expect.kind === 'refused'
            ? caught !== null
            : result.ok && sameValue(result.value, trap.expect.value);
        return [
          engine.id,
          {
            check,
            result,
            passed,
            caught: trap.expect.kind === 'refused' ? caught : null,
          },
        ];
      }),
    ),
  }));

  const summary = ENGINES.map((engine) => {
    const report = conformance.find((c) => c.engine === engine.id)!;
    const examples = [...rules.flatMap((r) => r.examples), ...facts].map(
      (e) => e.outcomes[engine.id]!,
    );
    const trapOutcomes = traps.map((t) => t.outcomes[engine.id]!);
    return {
      engine: engine.id,
      conformancePassed: report.passed,
      conformanceTotal: report.passed + report.failed,
      examplesPassed: examples.filter((o) => o.passed).length,
      examplesTotal: examples.length,
      trapsPassed: trapOutcomes.filter((o) => o.passed).length,
      trapsTotal: trapOutcomes.length,
      staticCheck: engine.staticCheck,
    };
  });

  return {
    ranAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started),
    engines: ENGINES.map(
      ({ id, name, packageName, version, license, staticCheck, limits }) => ({
        id,
        name,
        packageName,
        version,
        license,
        staticCheck,
        limits,
      }),
    ),
    toolbox: TOOLBOX.map((fn) => ({
      signature: toolboxSignature(fn),
      summary: fn.summary,
      source: toolboxSource(fn),
    })),
    conformance,
    rules,
    facts,
    traps,
    floatingPoint: {
      naive: 'Math.ceil(50 * 1.1)',
      naiveResult: Math.ceil(50 * 1.1),
      integer: 'ceil_div(50 * 110, 100)',
      integerResult: String((50n * 110n + 99n) / 100n),
    },
    summary,
    suggestion: suggest(summary),
  };
}

function suggest(summary: RuleTrialReport['summary']): string {
  const clean = summary.filter(
    (s) =>
      s.examplesPassed === s.examplesTotal && s.trapsPassed === s.trapsTotal,
  );
  const best = [...clean].sort(
    (a, b) =>
      Number(b.staticCheck) - Number(a.staticCheck) ||
      b.conformancePassed / b.conformanceTotal -
        a.conformancePassed / a.conformanceTotal,
  )[0];
  if (!best)
    return 'Neither library got every rule example and trap right. Fall back to extending the JSON rule format, as the plan says.';
  const rate = ((100 * best.conformancePassed) / best.conformanceTotal).toFixed(
    1,
  );
  const name = ENGINES.find((e) => e.id === best.engine)!.name;
  return `${name} got every rule example and trap right, ${best.staticCheck ? 'checks formulas before they run, ' : ''}and passed ${rate}% of the conformance tests it was given. This is a suggestion from the numbers above; the decision is yours.`;
}
