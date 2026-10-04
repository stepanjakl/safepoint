/*
  The functions every formula may call, written once in TypeScript and given to
  whichever expression engine evaluates the formula. A process cannot add code
  here; it can only use what is listed. Whole numbers arrive as bigint, so
  money and counts never pass through floating point.
*/

export type CelType =
  'int' | 'double' | 'bool' | 'string' | 'list<int>' | 'list<map<string, int>>';

export type ToolboxFunction = {
  name: string;
  params: CelType[];
  result: CelType;
  summary: string;
  impl: (...args: never[]) => unknown;
};

function ceilDiv(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error('ceil_div: division by zero');
  const quotient = a / b;
  // bigint division truncates toward zero; step up when a remainder is left
  // and the exact result is positive.
  return a % b !== 0n && a > 0n === b > 0n ? quotient + 1n : quotient;
}

function hoursBetween(fromMinute: bigint, toMinute: bigint): number {
  return Number(toMinute - fromMinute) / 60;
}

function minOf(list: Iterable<bigint>): bigint {
  let least: bigint | undefined;
  for (const value of list)
    if (least === undefined || value < least) least = value;
  if (least === undefined) throw new Error('min_of: empty list');
  return least;
}

export const TOOLBOX: ToolboxFunction[] = [
  {
    name: 'ceil_div',
    params: ['int', 'int'],
    result: 'int',
    summary:
      'Whole-number division that rounds up: ceil_div(81, 8) = 11. Used for anything counted in whole units.',
    impl: ceilDiv as ToolboxFunction['impl'],
  },
  {
    name: 'hours_between',
    params: ['int', 'int'],
    result: 'double',
    summary:
      'Hours between two moments given in minutes: hours_between(2520, 4845) = 38.75.',
    impl: hoursBetween as ToolboxFunction['impl'],
  },
  {
    name: 'min_of',
    params: ['list<int>'],
    result: 'int',
    summary:
      'The smallest number in a list, for example the scarcest kit component.',
    impl: minOf as ToolboxFunction['impl'],
  },
];

export function toolboxSignature(fn: ToolboxFunction) {
  return `${fn.name}(${fn.params.join(', ')}): ${fn.result}`;
}

export function toolboxSource(fn: ToolboxFunction) {
  return fn.impl.toString();
}
