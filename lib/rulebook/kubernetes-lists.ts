import { Environment } from '@marcbachmann/cel-js';

/*
  sum() from the Kubernetes CEL list library (`kubernetes.lists`), the one list
  function standard CEL cannot express: a total over a list of any length. It
  is adopted as Kubernetes defines it, not designed here, and pinned to:

    kubernetes/kubernetes  staging/src/k8s.io/apiserver/pkg/cel/library/lists.go
    commit d7356c0340192cf8254e13596b8f5d65f23ae7bc (2026-09-05, as in v1.37.1)
    Apache License 2.0, Copyright The Kubernetes Authors

  <list<T>>.sum() <T>, for T int, uint, double or duration. An empty list sums
  to zero of its element type; an untyped empty list ([]) to int 0. The
  Kubernetes examples are the tests in kubernetes-lists.test.ts. Its min() and
  max() are left out: standard CEL already writes them with filter and all.
*/

const INT_MIN = -(2n ** 63n);
const INT_MAX = 2n ** 63n - 1n;
const UINT_MAX = 2n ** 64n - 1n;

type Duration = { addDuration(other: Duration): Duration };
const ZERO_DURATION = new Environment().evaluate(
  "duration('0s')",
) as unknown as Duration;

// CEL's 64-bit integers: overflow is an error, as for the + operator.
function sumIntegers(values: bigint[], min: bigint, max: bigint, kind: string) {
  let total = 0n;
  for (const value of values) {
    total += value;
    if (total < min || total > max)
      throw new Error(`${kind} overflow in sum()`);
  }
  return total;
}

const sumDoubles = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);

const sumDurations = (values: Duration[]) =>
  values.reduce((total, value) => total.addDuration(value), ZERO_DURATION);

// A list whose element type is only known at run time.
function sumDynamic(values: unknown[]) {
  if (values.every((v) => typeof v === 'bigint'))
    return sumIntegers(values, INT_MIN, INT_MAX, 'integer');
  if (values.every((v) => typeof v === 'number')) return sumDoubles(values);
  if (values.every((v) => v instanceof ZERO_DURATION.constructor))
    return sumDurations(values as Duration[]);
  throw new Error('no such overload: sum() needs one number or duration type');
}

export function registerKubernetesSum(env: Environment): Environment {
  const overloads: [string, string, (values: never[]) => unknown][] = [
    [
      'list<int>',
      'int',
      (v: bigint[]) => sumIntegers(v, INT_MIN, INT_MAX, 'integer'),
    ],
    [
      'list<uint>',
      'uint',
      (v: bigint[]) => sumIntegers(v, 0n, UINT_MAX, 'unsigned integer'),
    ],
    ['list<double>', 'double', sumDoubles],
    [
      'list<google.protobuf.Duration>',
      'google.protobuf.Duration',
      sumDurations,
    ],
    ['list<dyn>', 'dyn', sumDynamic],
  ];
  for (const [receiverType, returnType, handler] of overloads)
    env.registerFunction({
      name: 'sum',
      receiverType,
      returnType,
      params: [],
      handler,
      description:
        'kubernetes.lists sum(): the total of a list; zero for an empty list',
    });
  return env;
}
