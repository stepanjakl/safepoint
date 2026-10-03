import { z } from 'zod';

import seedJson from '@/fixtures/promotion-release/aldertons-promotion-release-v1/review-rules.json' with { type: 'json' };
import { sameJsonValue } from './comparison';

export const ruleFieldSchema = z.enum([
  'marginPercent',
  'minimumMarginPercent',
  'shortfallUnits',
  'topUpUnits',
  'minimumOrderQuantityUnits',
  'orderMultipleUnits',
  'priceChangePercent',
  'individualApprovalPriceChangePercent',
  'confirmedAdditionalAllocationUnits',
  'fundingPencePerUnit',
  'fundingStatus',
  'candidateStatus',
]);
export type RuleField = z.infer<typeof ruleFieldSchema>;

const valueSchema = z.union([z.number().finite(), z.string().max(80)]);
const operandSchema = z.union([
  z.strictObject({ field: ruleFieldSchema }),
  z.strictObject({ value: valueSchema }),
]);
const clauseSchema = z.strictObject({
  left: ruleFieldSchema,
  operator: z.enum(['eq', 'gt', 'gte', 'lt', 'lte', 'multiple_of']),
  right: operandSchema,
});
const conditionSchema = z.strictObject({
  mode: z.enum(['all', 'any']),
  clauses: z.array(clauseSchema).min(1).max(8),
});
export const reviewRuleSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_]{2,49}$/),
  title: z.string().trim().min(3).max(100),
  source: z.string().trim().min(3).max(120),
  supportingQuote: z.string().trim().min(1).max(500).optional(),
  failure: z.enum(['block', 'attention']),
  emitPass: z.boolean(),
  when: conditionSchema.optional(),
  assert: conditionSchema,
});
export const reviewRuleSetSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    rules: z.array(reviewRuleSchema).min(1).max(20),
  })
  .superRefine(({ rules }, context) => {
    const seen = new Set<string>();
    const migrated = new Set([
      'minimum_margin',
      'stock_coverage',
      'order_terms',
      'large_price_change',
    ]);
    rules.forEach((rule, index) => {
      if (!migrated.has(rule.code) && !rule.code.startsWith('custom_'))
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'code'],
          message: 'New rule codes must begin with custom_.',
        });
      if (seen.has(rule.code))
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'code'],
          message: `Duplicate rule code ${rule.code}.`,
        });
      seen.add(rule.code);
      const core = seedJson.rules.find(({ code }) => code === rule.code);
      if (core) {
        const threshold =
          rule.code === 'minimum_margin' || rule.code === 'large_price_change';
        const clause = rule.assert.clauses[0];
        const expected = core.assert.clauses[0];
        const validThreshold =
          clause &&
          expected &&
          rule.assert.mode === 'all' &&
          rule.assert.clauses.length === 1 &&
          clause.left === expected.left &&
          clause.operator === expected.operator &&
          ('field' in clause.right
            ? 'field' in expected.right &&
              clause.right.field === expected.right.field
            : typeof clause.right.value === 'number' &&
              clause.right.value >= 0 &&
              clause.right.value <= 100);
        if (
          rule.failure !== core.failure ||
          rule.emitPass !== core.emitPass ||
          !sameJsonValue(rule.when, core.when) ||
          (threshold
            ? !validThreshold
            : !sameJsonValue(rule.assert, core.assert))
        )
          context.addIssue({
            code: 'custom',
            path: ['rules', index],
            message: `Protected rule ${rule.code}: keep its comparison, applicability and failure consequence. Only margin and price-change thresholds are editable.`,
          });
      }
      for (const [groupName, group] of [
        ['when', rule.when],
        ['assert', rule.assert],
      ] as const) {
        group?.clauses.forEach((clause, clauseIndex) => {
          const right =
            'field' in clause.right ? clause.right.field : clause.right.value;
          const leftText = ['fundingStatus', 'candidateStatus'].includes(
            clause.left,
          );
          const rightText =
            typeof right === 'string' &&
            (typeof clause.right === 'object' && 'field' in clause.right
              ? ['fundingStatus', 'candidateStatus'].includes(right)
              : true);
          if (
            (leftText || rightText) &&
            (!leftText || !rightText || clause.operator !== 'eq')
          )
            context.addIssue({
              code: 'custom',
              path: ['rules', index, groupName, 'clauses', clauseIndex],
              message:
                'Text facts support equality with another text value only.',
            });
          const enumValues =
            clause.left === 'fundingStatus'
              ? ['confirmed', 'unverified', 'not_offered']
              : clause.left === 'candidateStatus'
                ? ['approved', 'withdrawn']
                : null;
          if (
            enumValues &&
            'value' in clause.right &&
            !enumValues.includes(String(clause.right.value))
          )
            context.addIssue({
              code: 'custom',
              path: [
                'rules',
                index,
                groupName,
                'clauses',
                clauseIndex,
                'right',
              ],
              message: `Use a registered ${clause.left} value: ${enumValues.join(', ')}.`,
            });
          if (
            leftText &&
            'field' in clause.right &&
            clause.right.field !== clause.left
          )
            context.addIssue({
              code: 'custom',
              path: ['rules', index, groupName, 'clauses', clauseIndex],
              message: 'Enum facts must be compared within the same domain.',
            });
          if (
            clause.operator === 'multiple_of' &&
            (!clause.left.endsWith('Units') ||
              ('field' in clause.right
                ? !clause.right.field.endsWith('Units')
                : typeof clause.right.value !== 'number' ||
                  !Number.isSafeInteger(clause.right.value) ||
                  clause.right.value <= 0))
          )
            context.addIssue({
              code: 'custom',
              path: ['rules', index, groupName, 'clauses', clauseIndex],
              message:
                'Order multiples require whole-unit facts and a positive integer divisor.',
            });
        });
      }
    });
    for (const code of migrated)
      if (!seen.has(code))
        context.addIssue({
          code: 'custom',
          path: ['rules'],
          message: `Protected rule ${code} is required.`,
        });
  });
export type ReviewRuleSet = z.infer<typeof reviewRuleSetSchema>;
export const seedReviewRules = reviewRuleSetSchema.parse(seedJson);

export function describeRuleChanges(
  before: ReviewRuleSet,
  after: ReviewRuleSet,
  facts: Pick<
    RuleFacts,
    'minimumMarginPercent' | 'individualApprovalPriceChangePercent'
  >,
) {
  const changes: {
    code: string;
    direction: 'tightens' | 'loosens' | 'changed';
    explanation: string;
  }[] = [];
  for (const code of new Set(
    [...before.rules, ...after.rules].map(({ code }) => code),
  )) {
    const old = before.rules.find((rule) => rule.code === code);
    const next = after.rules.find((rule) => rule.code === code);
    if (sameJsonValue(old, next)) continue;
    if (!old || !next) {
      changes.push({
        code,
        direction: next ? 'tightens' : 'loosens',
        explanation: next ? 'Adds a constraint.' : 'Removes a constraint.',
      });
      continue;
    }
    if (code === 'minimum_margin' || code === 'large_price_change') {
      const resolve = (rule: typeof old) => {
        const right = rule.assert.clauses[0]?.right;
        return (
          right &&
          ('value' in right
            ? right.value
            : right.field === 'minimumMarginPercent'
              ? facts.minimumMarginPercent
              : facts.individualApprovalPriceChangePercent)
        );
      };
      const a = resolve(old),
        b = resolve(next);
      if (typeof a === 'number' && typeof b === 'number' && a !== b) {
        const tightens = code === 'minimum_margin' ? b > a : b < a;
        changes.push({
          code,
          direction: tightens ? 'tightens' : 'loosens',
          explanation: `Threshold ${a}% → ${b}%.`,
        });
        continue;
      }
    }
    changes.push({
      code,
      direction: 'changed',
      explanation:
        sameJsonValue(old.assert, next.assert) &&
        sameJsonValue(old.when, next.when) &&
        old.failure === next.failure
          ? 'Only rule description or provenance changed.'
          : 'Logical effect may tighten or loosen policy; review candidate differences.',
    });
  }
  return changes;
}

const fieldLabels: Record<RuleField, string> = {
  marginPercent: 'funded margin (%)',
  minimumMarginPercent: 'minimum margin (%)',
  shortfallUnits: 'stock shortfall (units)',
  topUpUnits: 'proposed top-up (units)',
  minimumOrderQuantityUnits: 'minimum supplier order (units)',
  orderMultipleUnits: 'supplier pack size (units)',
  priceChangePercent: 'price change (%)',
  individualApprovalPriceChangePercent: 'individual approval threshold (%)',
  confirmedAdditionalAllocationUnits: 'confirmed additional allocation (units)',
  fundingPencePerUnit: 'supplier funding (pence per unit)',
  fundingStatus: 'supplier funding status',
  candidateStatus: 'candidate approval status',
};

export function describeRule(rule: z.infer<typeof reviewRuleSchema>) {
  const describe = (group: z.infer<typeof conditionSchema>) =>
    group.clauses
      .map((clause) => {
        const operator = {
          eq: 'equals',
          gt: 'is greater than',
          gte: 'is at least',
          lt: 'is less than',
          lte: 'is at most',
          multiple_of: 'is a multiple of',
        }[clause.operator];
        return `${fieldLabels[clause.left]} ${operator} ${'field' in clause.right ? fieldLabels[clause.right.field] : clause.right.value}`;
      })
      .join(group.mode === 'all' ? ' and ' : ' or ');
  return `${rule.when ? `When ${describe(rule.when)}, require ` : 'Require '}${describe(rule.assert)}.`;
}

export type RuleFacts = Record<RuleField, number | string | null>;
export type RuleCheck = {
  code: string;
  title: string;
  source: string;
  status: 'pass' | 'attention' | 'block';
  detail: string;
  fields: RuleField[];
};

function checkCondition(
  condition: z.infer<typeof conditionSchema>,
  facts: RuleFacts,
) {
  const answers = condition.clauses.map(({ left, operator, right }) => {
    const a = facts[left];
    const b = 'field' in right ? facts[right.field] : right.value;
    if (a == null || b == null) return null;
    if (operator === 'eq') return a === b;
    if (typeof a !== 'number' || typeof b !== 'number') return null;
    if (operator === 'gt') return a > b;
    if (operator === 'gte') return a >= b;
    if (operator === 'lt') return a < b;
    if (operator === 'lte') return a <= b;
    return b !== 0 && a % b === 0;
  });
  if (answers.includes(null)) return null;
  return condition.mode === 'all'
    ? answers.every(Boolean)
    : answers.some(Boolean);
}

export function evaluateReviewRules(
  rules: ReviewRuleSet,
  facts: RuleFacts,
): RuleCheck[] {
  return rules.rules.flatMap((rule) => {
    const applicable = rule.when ? checkCondition(rule.when, facts) : true;
    if (applicable === false) return [];
    const result =
      applicable === null ? null : checkCondition(rule.assert, facts);
    if (result === true && !rule.emitPass) return [];
    const fields = [rule.when, rule.assert].flatMap(
      (group) =>
        group?.clauses.flatMap((clause) => [
          clause.left,
          ...('field' in clause.right ? [clause.right.field] : []),
        ]) ?? [],
    );
    const expression = rule.assert.clauses
      .map((clause) => {
        const left = facts[clause.left];
        const right =
          'field' in clause.right
            ? facts[clause.right.field]
            : clause.right.value;
        const symbol = {
          eq: '=',
          gt: '>',
          gte: '≥',
          lt: '<',
          lte: '≤',
          multiple_of: 'multiple of',
        }[clause.operator];
        return `${clause.left} ${left ?? 'missing'} ${symbol} ${'field' in clause.right ? `${clause.right.field} ` : ''}${right ?? 'missing'}`;
      })
      .join(rule.assert.mode === 'all' ? ' and ' : ' or ');
    return [
      {
        code: rule.code,
        title: rule.title,
        source: rule.source,
        status: result === null ? 'block' : result ? 'pass' : rule.failure,
        detail:
          result === null
            ? `Cannot evaluate: ${expression}.`
            : `${result ? 'Passed' : 'Failed'}: ${expression}.`,
        fields,
      },
    ];
  });
}
