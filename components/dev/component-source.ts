/*
  Development only: which component wrote an element, and where.

  React 19 keeps, on every element's fiber, the stack at which its JSX was
  created (`_debugStack`) and the component that created it (`_debugOwner`),
  for server components too. The frame under the JSX factory is the line in
  the component that wrote it, in compiled code; Next's dev server maps it back
  to the source the same way its error overlay does. No build step is needed.
*/

import * as React from 'react';

/* React records a creation stack for only 10,000 elements a second and gives
   the rest a shared placeholder until they re-render; this app's first load
   passes that. Lifted in development, before hydration, so anything can be
   located: this module loads with the inspector, in the root layout. */
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  const internals = (React as unknown as Record<string, object | undefined>)
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (internals && 'recentlyCreatedOwnerStacks' in internals) {
    Object.defineProperty(internals, 'recentlyCreatedOwnerStacks', {
      configurable: true,
      get: () => 0,
      set: () => {},
    });
  }
}

/** One component on the way out from the element, and the line in it that
    writes the element or the next component in. */
export type Written = {
  name: string;
  /** Written inside a package (a React Aria part, say): no link. */
  library: boolean;
  file?: string;
  line?: number;
  column?: number;
};

type Frame = {
  methodName: string;
  file: string;
  line1: number;
  column1: number;
  server: boolean;
};

/* A fiber, or a server component's info object, which names its fields
   without the underscore. */
type Owner = {
  _debugStack?: Error;
  debugStack?: Error;
  _debugOwner?: Owner | null;
  owner?: Owner | null;
};

const SERVER = 'about://React/Server/';
/* App components to walk out through, past the one that wrote the element. */
const DEPTH = 5;

function fiberOf(element: Element): Owner | undefined {
  const key = Object.keys(element).find((name) =>
    name.startsWith('__reactFiber$'),
  );
  return key
    ? ((element as unknown as Record<string, Owner>)[key] ?? undefined)
    : undefined;
}

/* The JSX factory, above the writer, and the placeholder for an element
   created past the cap. React's render loop is below
   `react_stack_bottom_frame`, which ends the writer's part of the stack. */
const FACTORY = /\/next\/dist\/compiled\/react|fakeJSXCallSite|UnknownOwner/;
const BOTTOM = 'react_stack_bottom_frame';

const FRAME = /at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;
/* A function named like a component, without V8's receiver prefixes. */
const componentName = (method = '') => {
  const name = method.replace(/^(?:Object\.|bound |new )/, '');
  return /^[A-Z]\w*$/.test(name) ? name : undefined;
};

/* The first frame under the JSX factory: the component body that wrote it.
   An inline callback (a `.map`, a render prop) is named for the component
   further down that called it. */
function writerOf(
  stack: Error | undefined,
): (Frame & { name?: string }) | undefined {
  const lines = stack?.stack?.split('\n').slice(1) ?? [];
  const end = lines.findIndex((text) => text.includes(BOTTOM));
  const frames = lines
    .slice(0, end < 0 ? undefined : end)
    .filter((text) => !FACTORY.test(text))
    .map((text) => FRAME.exec(text));
  const match = frames[0];
  if (!match) return undefined;
  const server = match[2]!.startsWith(SERVER);
  return {
    methodName: match[1] ?? '',
    file: server ? match[2]!.slice(SERVER.length) : match[2]!,
    line1: Number(match[3]),
    column1: Number(match[4]),
    server,
    name: frames.map((frame) => componentName(frame?.[1])).find(Boolean),
  };
}

type Original = { file: string; line1: number; column1: number };
const mapped = new Map<string, Promise<Original | undefined>>();
const keyOf = (frame: Frame) => `${frame.file}:${frame.line1}:${frame.column1}`;

/* One request per side for the frames not yet mapped, each cached. */
function original(frames: Frame[]) {
  for (const server of [false, true]) {
    const fresh = frames.filter(
      (frame) => frame.server === server && !mapped.has(keyOf(frame)),
    );
    if (fresh.length === 0) continue;
    const reply = fetch('/__nextjs_original-stack-frames', {
      method: 'POST',
      body: JSON.stringify({
        frames: fresh.map(({ methodName, file, line1, column1 }) => ({
          methodName,
          file,
          line1,
          column1,
          arguments: [],
        })),
        isServer: server,
        isEdgeServer: false,
        isAppDirectory: true,
      }),
    })
      .then((response) => (response.ok ? response.json() : []))
      .catch(() => []) as Promise<
      { value?: { originalStackFrame?: Original | null } }[]
    >;
    fresh.forEach((frame, index) => {
      mapped.set(
        keyOf(frame),
        reply.then((results) => {
          const found = results[index]?.value?.originalStackFrame;
          // A miss (mid-compile, say) is asked again next time.
          if (!found) mapped.delete(keyOf(frame));
          return found ?? undefined;
        }),
      );
    });
  }
  return Promise.all(frames.map((frame) => mapped.get(keyOf(frame))!));
}

/**
 * The component that wrote this element, then each one out from it, nearest
 * first. Package components before the first app one are kept (they wrote the
 * tag itself); those beyond it are the framework's and are not.
 */
export async function componentsOf(element: Element): Promise<Written[]> {
  const steps: { name?: string; frame: Frame; library: boolean }[] = [];
  let apps = 0;
  for (
    let node: Owner | null | undefined = fiberOf(element);
    node && apps < DEPTH;
    node = node._debugOwner ?? node.owner
  ) {
    const frame = writerOf(node._debugStack ?? node.debugStack);
    if (!frame) continue;
    // Only a module of the app's own maps back to a file worth opening.
    const library =
      frame.file.includes('/node_modules/') ||
      !/^(?:webpack-internal|webpack|file):/.test(frame.file);
    if (library && apps > 0) continue;
    // Named by the function the line is in, not the owner: after a
    // cloneElement that is the cloner, as Tooltip's trigger is.
    const { name } = frame;
    // A package's internal helper says nothing; its components do.
    if (library && !name) continue;
    steps.push({ name, frame, library });
    if (!library) apps += 1;
  }
  const own = steps.filter((step) => !step.library);
  const sources = await original(own.map((step) => step.frame));
  return steps.map((step) => {
    const source = step.library ? undefined : sources[own.indexOf(step)];
    return {
      name:
        step.name ?? source?.file?.split('/').at(-1) ?? step.frame.methodName,
      library: step.library,
      file: source?.file,
      line: source?.line1,
      column: source?.column1,
    };
  });
}
