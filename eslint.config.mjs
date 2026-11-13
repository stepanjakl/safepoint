import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/*
  Where code may reach. lib/definitions is the rules engine: it finds, checks,
  calculates and decides on what it is given, and knows nothing of files,
  React or Next. Everything that reads or writes a kept file is under server/
  (which the build refuses to put in a client bundle, `server-only`), and
  components/ and the client files of app/ reach the server only by fetch.
*/

const FILES = ['fs', 'fs/promises', 'path'].flatMap((name) => [
  {
    name,
    message:
      'The engine does no file IO: keep it in server/storage and pass what the engine needs in.',
  },
  {
    name: `node:${name}`,
    message:
      'The engine does no file IO: keep it in server/storage and pass what the engine needs in.',
  },
]);

const ALL_SERVER = ['@/server/*'];

const engine = (serverGroup = ALL_SERVER) => ({
  paths: [
    ...FILES,
    {
      name: 'react',
      message: 'The engine is not UI: React belongs in components/.',
    },
    {
      name: 'next',
      message: 'The engine does not know the framework: Next belongs in app/.',
    },
  ],
  patterns: [
    {
      group: ['next/*'],
      message: 'The engine does not know the framework: Next belongs in app/.',
    },
    {
      group: ['@/components/*', '@/app/*'],
      message:
        'The engine is below the UI: components/ and app/ import the engine, never the reverse.',
    },
    {
      group: serverGroup,
      message:
        'The engine does not reach storage: put what touches kept files in server/ and pass what the engine needs in.',
    },
  ],
});

const client = {
  paths: ['fs', 'fs/promises', 'path'].map((name) => ({
    name,
    message:
      'The browser has no files: fetch from a route, or move this to server/.',
  })),
  patterns: [
    {
      group: ['node:*'],
      message:
        'The browser has no Node: fetch from a route, or move this to server/.',
    },
    {
      group: ['@/server/*'],
      message:
        'A client file cannot reach server/: fetch from a route, and put a shared type in lib/.',
    },
  ],
};

const config = [
  {
    ignores: [
      '.next/**',
      'next-env.d.ts',
      '.agents/**',
      '.claude/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    files: ['lib/definitions/**/*.{ts,tsx}'],
    ignores: ['lib/definitions/**/*.{test,fixture}.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', engine()] },
  },
  {
    // The one exception: a model's requests are counted inside the calls the
    // engine makes, so limits.ts keeps what it learns through this one
    // module, which holds the file's path and shape. A negation cannot reach
    // into a folder the pattern has excluded, so the folders are listed.
    files: ['lib/definitions/limits.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        engine([
          '@/server/jobs/*',
          '@/server/operations/*',
          '@/server/storage/*',
          '!@/server/storage/model-limits',
        ]),
      ],
    },
  },
  {
    // Client files: everything of components/, and the client files of
    // app/workbench (the only client files in app/).
    files: ['components/**/*.{ts,tsx}', 'app/workbench/**/*.{ts,tsx}'],
    ignores: [
      '**/*.test.{ts,tsx}',
      // Server components: they render on the server and may read it.
      'app/workbench/**/page.tsx',
      // Not a client file: the run workbench's server page reads the frozen
      // browser-test fixtures through it, in development only.
      'app/workbench/run/brunch-direct.ts',
    ],
    rules: { 'no-restricted-imports': ['error', client] },
  },
  {
    files: ['server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/components/*', '@/app/*'],
              message:
                'server/ is below the UI: put what both need in lib/, and let components/ and app/ import server/.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
