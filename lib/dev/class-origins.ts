/*
  Where each class on one element was written: the style inspector's answer for
  a class no stylesheet defines (`font-semibold`), or that reached the element
  through a constant, a `cx()` call or a `className` prop.

  The inspector already knows the JSX line that wrote the element and each
  owner's JSX line out from it. Here the `className` expression at each is read
  as source: a literal holds its classes, an identifier is followed to its
  `const` (across imports), `cx()`, `&&`, `||` and ternaries are walked, and
  `className` taken from props continues at the next owner's JSX. The
  element's real classes are the filter, so only what it carries is reported.
  Anything the source does not spell out -- a package's own classes, a value
  computed at runtime -- is left unresolved rather than guessed. Node only.
*/

import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

import ts from 'typescript';

/** A line in the app's source, 1-based; `column` is where the JSX starts. */
export type Step = { file: string; line: number; column?: number };

export type Origin = {
  file: string;
  line: number;
  /** The constant or property the class was reached through. */
  via?: string;
  /** The JSX that carried it to the element. */
  used: Step;
};

export type Origins = { found: Record<string, Origin>; unresolved: string[] };

/* What a `className` expression can contribute: text that holds classes,
   written at a line, or the `className` of the component's own props. */
type Part =
  | { kind: 'text'; text: string; file: string; line: number; via?: string }
  | { kind: 'forward' };

const HELPERS = new Set(['cx', 'clsx', 'twMerge', 'classNames']);
const DEPTH = 12;

const parsed = new Map<string, { mtime: number; source: ts.SourceFile }>();
function sourceOf(path: string) {
  const mtime = statSync(path).mtimeMs;
  const kept = parsed.get(path);
  if (kept?.mtime === mtime) return kept.source;
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  parsed.set(path, { mtime, source });
  return source;
}

const configs = new Map<string, ts.CompilerOptions>();
function optionsOf(root: string) {
  let options = configs.get(root);
  if (!options) {
    const path = join(root, 'tsconfig.json');
    const config = existsSync(path)
      ? ts.readConfigFile(path, ts.sys.readFile).config
      : {};
    options = ts.parseJsonConfigFileContent(config, ts.sys, root).options;
    configs.set(root, options);
  }
  return options;
}

const unwrap = (node: ts.Node): ts.Node =>
  ts.isParenthesizedExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isSatisfiesExpression(node) ||
  ts.isNonNullExpression(node) ||
  ts.isTypeAssertionExpression(node) ||
  ts.isJsxExpression(node)
    ? node.expression
      ? unwrap(node.expression)
      : node
    : node;

const lineOf = (node: ts.Node) =>
  node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;

type Context = { root: string; depth: number };

/* What a name stands for where it is used: the initialiser of a `const` in
   scope, a prop, or an import from another module. */
type Binding =
  | { kind: 'value'; init: ts.Node }
  | { kind: 'prop'; name: string }
  | { kind: 'import'; from: string; name: string };

function bindingOf(name: string, from: ts.Node): Binding | undefined {
  const inPattern = (
    pattern: ts.BindingName,
    initializer: ts.Node | undefined,
  ): Binding | undefined => {
    if (ts.isIdentifier(pattern)) {
      return pattern.text === name && initializer
        ? { kind: 'value', init: initializer }
        : undefined;
    }
    if (!ts.isObjectBindingPattern(pattern)) return undefined;
    for (const element of pattern.elements) {
      if (ts.isIdentifier(element.name) && element.name.text === name) {
        return {
          kind: 'prop',
          name: (element.propertyName ?? element.name).getText(),
        };
      }
    }
    return undefined;
  };

  for (let node = from.parent; node; node = node.parent) {
    if (ts.isFunctionLike(node)) {
      for (const parameter of node.parameters) {
        const hit = inPattern(parameter.name, undefined);
        if (hit) return hit;
        if (ts.isIdentifier(parameter.name) && parameter.name.text === name) {
          return { kind: 'prop', name: '' };
        }
      }
    }
    const statements =
      ts.isBlock(node) || ts.isSourceFile(node) || ts.isModuleBlock(node)
        ? node.statements
        : undefined;
    for (const statement of statements ?? []) {
      if (
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === name
      ) {
        return { kind: 'value', init: statement };
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          const hit = inPattern(declaration.name, declaration.initializer);
          if (hit) return hit;
        }
      }
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const named = statement.importClause?.namedBindings;
        if (named && ts.isNamedImports(named)) {
          for (const element of named.elements) {
            if (element.name.text === name) {
              return {
                kind: 'import',
                from: statement.moduleSpecifier.text,
                name: (element.propertyName ?? element.name).text,
              };
            }
          }
        }
      }
    }
  }
  return undefined;
}

/* The expression a module exports under `name`, following `export … from`. */
function exported(
  path: string,
  name: string,
  context: Context,
): ts.Node | undefined {
  if (context.depth > DEPTH) return undefined;
  const source = sourceOf(path);
  for (const statement of source.statements) {
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name)
          return declaration.initializer;
      }
    }
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === name &&
      statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    ) {
      return statement;
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const clause = statement.exportClause;
      const named =
        clause && ts.isNamedExports(clause)
          ? clause.elements.find((element) => element.name.text === name)
          : undefined;
      if (!clause || named) {
        const next = moduleFile(
          statement.moduleSpecifier.text,
          path,
          context.root,
        );
        const hit =
          next &&
          exported(next, (named?.propertyName ?? named?.name)?.text ?? name, {
            ...context,
            depth: context.depth + 1,
          });
        if (hit) return hit;
      }
    }
  }
  return undefined;
}

function moduleFile(specifier: string, containing: string, root: string) {
  const file = ts.resolveModuleName(
    specifier,
    containing,
    optionsOf(root),
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  return file && !file.includes('/node_modules/') ? file : undefined;
}

function objectOf(
  node: ts.Node,
  context: Context,
  via: string | undefined,
): { object: ts.ObjectLiteralExpression; via: string } | undefined {
  const base = unwrap(node);
  if (ts.isObjectLiteralExpression(base))
    return { object: base, via: via ?? '' };
  if (!ts.isIdentifier(base)) return undefined;
  const found = bindingOf(base.text, base);
  if (found?.kind === 'value') {
    return objectOf(found.init, context, base.text);
  }
  if (found?.kind === 'import') {
    const path = moduleFile(
      found.from,
      base.getSourceFile().fileName,
      context.root,
    );
    const init = path && exported(path, found.name, context);
    return init
      ? objectOf(init, { ...context, depth: context.depth + 1 }, base.text)
      : undefined;
  }
  return undefined;
}

/* Cut a template's loose ends: a class touching a substitution is only part
   of one, and says nothing alone. */
const whole = (text: string, before: boolean, after: boolean) =>
  text.replace(before ? /^\S+/ : /^$/, '').replace(after ? /\S+$/ : /^$/, '');

function collect(
  input: ts.Node,
  context: Context,
  via: string | undefined,
): Part[] {
  if (context.depth > DEPTH) return [];
  const next = { ...context, depth: context.depth + 1 };
  const node = unwrap(input);
  const file = node.getSourceFile().fileName;
  const text = (value: string, at: ts.Node): Part[] => [
    { kind: 'text', text: value, file, line: lineOf(at), via },
  ];

  if (ts.isStringLiteralLike(node)) return text(node.text, node);
  if (ts.isTemplateExpression(node)) {
    return [
      ...text(whole(node.head.text, false, true), node.head),
      ...node.templateSpans.flatMap((span, index) => [
        ...collect(span.expression, next, via),
        ...text(
          whole(span.literal.text, true, index < node.templateSpans.length - 1),
          span.literal,
        ),
      ]),
    ];
  }
  if (ts.isConditionalExpression(node)) {
    return [
      ...collect(node.whenTrue, next, via),
      ...collect(node.whenFalse, next, via),
    ];
  }
  if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind;
    if (kind === ts.SyntaxKind.AmpersandAmpersandToken)
      return collect(node.right, next, via);
    if (
      kind === ts.SyntaxKind.BarBarToken ||
      kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return [
        ...collect(node.left, next, via),
        ...collect(node.right, next, via),
      ];
    }
    return [];
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) =>
      collect(
        ts.isSpreadElement(element) ? element.expression : element,
        next,
        via,
      ),
    );
  }
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isIdentifier(callee) && HELPERS.has(callee.text)) {
      return node.arguments.flatMap((argument) => collect(argument, next, via));
    }
    if (ts.isIdentifier(callee)) {
      // A helper of the app's own: what it returns, whatever it is given.
      const fn = functionOf(callee, next);
      return fn
        ? returnsOf(fn).flatMap((value) => collect(value, next, via))
        : [];
    }
    // `[...].join(' ')`
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'join') {
      return collect(callee.expression, next, via);
    }
    return [];
  }
  if (ts.isIdentifier(node)) {
    const found = bindingOf(node.text, node);
    if (!found) return [];
    if (found.kind === 'prop') {
      return (found.name || node.text) === 'className'
        ? [{ kind: 'forward' }]
        : [];
    }
    if (found.kind === 'value') return collect(found.init, next, node.text);
    const path = moduleFile(found.from, file, context.root);
    const init = path && exported(path, found.name, next);
    return init ? collect(init, next, node.text) : [];
  }
  if (ts.isPropertyAccessExpression(node)) {
    if (node.name.text === 'className') return [{ kind: 'forward' }];
    return member(node.expression, [node.name.text], next, via, node);
  }
  if (ts.isElementAccessExpression(node)) {
    const key = node.argumentExpression;
    return member(
      node.expression,
      ts.isStringLiteralLike(key) ? [key.text] : undefined,
      next,
      via,
      node,
    );
  }
  return [];
}

/* The function a called name stands for, here or in another module. */
function functionOf(name: ts.Identifier, context: Context) {
  const found = bindingOf(name.text, name);
  let node: ts.Node | undefined;
  if (found?.kind === 'value') node = found.init;
  if (found?.kind === 'import') {
    const path = moduleFile(
      found.from,
      name.getSourceFile().fileName,
      context.root,
    );
    node = path ? exported(path, found.name, context) : undefined;
  }
  return node && ts.isFunctionLike(node) ? node : undefined;
}

/* What a function hands back: its expression body, or each `return`. */
function returnsOf(fn: ts.SignatureDeclaration): ts.Node[] {
  const body = (fn as { body?: ts.Node }).body;
  if (!body) return [];
  if (!ts.isBlock(body)) return [body];
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression)
      found.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

/* `STYLES.card`, or `STYLES[kind]`, where every entry is a candidate. */
function member(
  base: ts.Node,
  keys: string[] | undefined,
  context: Context,
  via: string | undefined,
  at: ts.Node,
): Part[] {
  const found = objectOf(base, context, via);
  if (!found) return [];
  const label = found.via || via || at.getText();
  return found.object.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) return [];
    const name = property.name.getText().replace(/^['"]|['"]$/g, '');
    return !keys || keys.includes(name)
      ? collect(property.initializer, context, label)
      : [];
  });
}

/* The innermost JSX tag containing the position: what the dev stack names. */
function tagAt(source: ts.SourceFile, line: number, column: number) {
  const offset = source.getPositionOfLineAndCharacter(line - 1, column - 1);
  let best: ts.JsxOpeningLikeElement | undefined;
  const visit = (node: ts.Node) => {
    if (node.pos > offset || node.end <= offset) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (!best || node.end - node.pos < best.end - best.pos) best = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return best;
}

function classNameOf(tag: ts.JsxOpeningLikeElement) {
  for (const attribute of tag.attributes.properties) {
    if (
      ts.isJsxAttribute(attribute) &&
      attribute.name.getText() === 'className'
    )
      return attribute.initializer;
  }
  return undefined;
}

/**
 * For each of `tokens` -- the element's classes -- the line that writes it,
 * walking `steps` outward from the component that wrote the element.
 */
export function classOrigins(
  root: string,
  steps: Step[],
  tokens: string[],
): Origins {
  const remaining = new Set(tokens);
  const found: Record<string, Origin> = {};
  for (const step of steps) {
    if (remaining.size === 0) break;
    const path = isAbsolute(step.file) ? step.file : join(root, step.file);
    const inside = relative(root, path);
    if (inside.startsWith('..') || inside.includes('node_modules')) break;
    if (!existsSync(path)) break;
    const tag = tagAt(sourceOf(path), step.line, step.column ?? 1);
    const attribute = tag && classNameOf(tag);
    if (!attribute) continue;
    const parts = collect(attribute, { root, depth: 0 }, undefined);
    for (const part of parts) {
      if (part.kind !== 'text') continue;
      for (const token of part.text.split(/\s+/)) {
        if (!remaining.has(token)) continue;
        remaining.delete(token);
        found[token] = {
          file: relative(root, part.file),
          line: part.line,
          via: part.via,
          used: { ...step, file: inside },
        };
      }
    }
    // What is left came from outside this JSX unless it hands `className` on.
    if (!parts.some((part) => part.kind === 'forward')) break;
  }
  return { found, unresolved: [...remaining] };
}
