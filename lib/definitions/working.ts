import { serialize, type ASTNode } from '@marcbachmann/cel-js';

import { givenOf, valuesFor } from './checks';
import { contextFor, run, syntaxOf } from './formulas';
import type { KeptRead } from './records';
import {
  TRIED,
  type Definition,
  type DefinitionProcess,
  type DefinitionSet,
} from './types';

/*
  The app's own working of an example, as steps a person can follow: the
  formula with the record's values in place (a choice whose condition is
  settled keeps only the side it takes; every condition joined by || or &&
  stays), then each side of a comparison and what is rounded reduced to its
  value, then, for a check, each comparison to true or false, and the whole
  to true or false: what holds or fails means. A check that a guard settles
  for the record, whatever is proposed, is worked out only as far as the
  guard.
*/

type Node = ASTNode & { op: string; args: unknown };
const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && 'op' in value;

// A value as a node the serializer prints.
const literal = (value: unknown): Node =>
  (Array.isArray(value)
    ? { op: 'list', args: value.map(literal) }
    : { op: 'value', args: value }) as Node;

const COMPARE = ['==', '!=', '<', '<=', '>', '>='];
const ROUNDING = ['ceil', 'floor', 'round'];

// Whether a node reads any of these names.
const reads = (node: unknown, names: string[]): boolean =>
  isNode(node)
    ? (node.op === 'id' && names.includes(node.args as string)) ||
      reads(node.args, names)
    : Array.isArray(node) && node.some((item) => reads(item, names));

/*
  The guard that settles a check for this record whatever is proposed: a check
  written "not in scope, or the rule" -- its outermost || led by a negation
  that reads none of the proposal's fields -- whose record is out of scope.
  Such a check does not apply to the record. Only the leading negation counts:
  a later part that holds is the rule being met, not its scope. Null when the
  check applies.
*/
function guardOf(
  root: Node,
  context: Parameters<typeof run>[1],
  fields: string[],
): Node | null {
  if (root.op !== '||') return null;
  let lead: Node = root;
  while (lead.op === '||') lead = (lead.args as Node[])[0]!;
  if (lead.op !== '!_' || reads(lead, fields)) return null;
  try {
    return run(serialize(lead), context) === true ? lead : null;
  } catch {
    return null;
  }
}

export const applies = (
  formula: string,
  context: Parameters<typeof run>[1],
  fields: string[],
) => guardOf(syntaxOf(formula) as Node, context, fields) === null;

export function stepsFor(
  formula: string,
  context: Parameters<typeof run>[1],
  // The proposal's fields: what an example tries, marked where it appears.
  tried: string[],
) {
  const whole = syntaxOf(formula) as Node;
  // A check that does not apply is worked out only as far as its guard.
  const root = guardOf(whole, context, tried) ?? whole;
  const value = (node: Node) => run(serialize(node), context);
  // A part that cannot run on its own -- it reads a blank cell, which the
  // whole formula never reaches past an || that already holds -- is left as
  // written rather than ending the working.
  const ABSENT = { op: 'id', args: 'absent' } as Node;
  const settled = (node: Node, otherwise: Node): Node => {
    try {
      return literal(value(node));
    } catch {
      return otherwise;
    }
  };
  const bare = new Set(
    Object.keys(context).filter(
      (name) => !['values', 'constants', 'groups'].includes(name),
    ),
  );

  // The values in place, and only the branch of each choice that applies.
  const fold = (node: Node): Node => {
    const { op, args } = node;
    if (op === 'id' && typeof args === 'string' && tried.includes(args))
      return node;
    if (op === 'id' && typeof args === 'string' && bare.has(args)) {
      const read = value(node);
      return typeof read === 'object' ? node : literal(read);
    }
    if (op === '.') {
      const [object] = args as [Node, string];
      return object.op === 'id' && object.args !== 'groups'
        ? settled(node, ABSENT)
        : node;
    }
    if (op === 'in') return literal(value(node));
    if (op === 'call') {
      const [name, list] = args as [string, Node[]];
      if (name === 'has') return literal(value(node));
      return { ...node, args: [name, list.map(fold)] } as Node;
    }
    if (op === '?:') {
      const [condition, yes, no] = args as Node[];
      return fold(value(condition!) ? yes! : no!);
    }
    if (op === '!_') return { ...node, args: fold(args as Node) } as Node;
    if (Array.isArray(args))
      return {
        ...node,
        args: args.map((arg) => (isNode(arg) ? fold(arg) : arg)),
      } as Node;
    return node;
  };

  // Each side of a comparison, and what is rounded, reduced to its value.
  const reduce = (node: Node): Node => {
    const { op, args } = node;
    if (COMPARE.includes(op))
      return {
        ...node,
        args: (args as Node[]).map((arg) => settled(arg, arg)),
      } as Node;
    if (op === 'call') {
      const [name, list] = args as [string, Node[]];
      if (ROUNDING.includes(name))
        return {
          ...node,
          args: [name, list.map((arg) => settled(arg, arg))],
        } as Node;
    }
    if (op === '!_') return { ...node, args: reduce(args as Node) } as Node;
    if (op === '||' || op === '&&')
      return {
        ...node,
        args: (args as Node[]).map(reduce),
      } as Node;
    return node;
  };

  // Conversions stay in the tree, where running a step needs them, and are
  // left out of what is shown: they change no value a person reads.
  const unconverted = (node: Node): Node => {
    if (node.op === 'call') {
      const [name, list] = node.args as [string, Node[]];
      if ((name === 'double' || name === 'int') && list.length === 1)
        return unconverted(list[0]!);
    }
    if (isNode(node.args))
      return { ...node, args: unconverted(node.args) } as Node;
    if (Array.isArray(node.args))
      return {
        ...node,
        args: node.args.map((arg) =>
          isNode(arg)
            ? unconverted(arg)
            : Array.isArray(arg)
              ? arg.map((item) => (isNode(item) ? unconverted(item) : item))
              : arg,
        ),
      } as Node;
    return node;
  };
  // Each comparison reduced to true or false, the logic around it kept.
  const decide = (node: Node): Node => {
    const { op, args } = node;
    if (COMPARE.includes(op)) return settled(node, node);
    if (op === '!_') return { ...node, args: decide(args as Node) } as Node;
    if (op === '||' || op === '&&')
      return { ...node, args: (args as Node[]).map(decide) } as Node;
    return node;
  };

  // A tried field, still a name in the tree so a step runs, is shown as its
  // value, marked.
  const marked = (node: Node): Node => {
    if (node.op === 'id' && tried.includes(node.args as string))
      return {
        ...node,
        args: `${TRIED[0]}${String(value(node))}${TRIED[1]}`,
      } as Node;
    if (isNode(node.args)) return { ...node, args: marked(node.args) } as Node;
    if (Array.isArray(node.args))
      return {
        ...node,
        args: node.args.map((arg) =>
          isNode(arg)
            ? marked(arg)
            : Array.isArray(arg)
              ? arg.map((item) => (isNode(item) ? marked(item) : item))
              : arg,
        ),
      } as Node;
    return node;
  };
  const shown = (node: Node) => serialize(marked(unconverted(node)));
  const folded = fold(root);
  // The result is the whole formula's, run as the app runs it.
  const result = value(root);
  const stages = [folded, reduce(folded)];
  // A check goes on to true or false, which is what holds or fails means.
  if (typeof result === 'boolean')
    stages.push(decide(stages[1]!), literal(result));
  const steps: string[] = [];
  for (const stage of stages) {
    const step = shown(stage);
    // The same step but for its marks is not a new one.
    const unmarked = (text = '') =>
      text.replaceAll(TRIED[0], '').replaceAll(TRIED[1], '');
    if (unmarked(step) !== unmarked(steps.at(-1))) steps.push(step);
  }
  return steps;
}

// Each example's steps, in the examples' order; none where it cannot run.
export function workingOf(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  definition: Definition,
): string[][] {
  const { formula } = definition;
  if (!formula) return [];
  const { subject } = owner;
  return definition.examples.map((example) => {
    try {
      return stepsFor(
        formula,
        contextFor(
          read,
          example.key,
          subject,
          givenOf(definition, example.inputs),
          valuesFor(
            set,
            read,
            example.key,
            example.inputs,
            definition.id,
            subject,
          ),
        ),
        subject.proposal.map((field) => field.id),
      );
    } catch {
      return [];
    }
  });
}
