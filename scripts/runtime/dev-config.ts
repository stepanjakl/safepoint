import { createRequire } from 'node:module';

const { loadEnvConfig } = createRequire(import.meta.url)(
  '@next/env',
) as typeof import('@next/env');

export function loadDevConfig() {
  loadEnvConfig(process.cwd(), true);

  const agentationEnabled = process.env.AGENTATION !== 'off';
  return {
    agentationEnabled,
    nextPublicAgentation: agentationEnabled ? 'on' : 'off',
  };
}
