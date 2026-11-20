// Gatekeeper server config. Server-only: never import from a client component.

export interface GatekeeperConfig {
  publicBaseUrl: string;
  toolSecret: string;
  grandmaName: string;
  familyName: string;
  familyRelation: string;
}

export function getConfig(): GatekeeperConfig {
  return {
    publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, ''),
    toolSecret: (process.env.TOOL_SECRET ?? '').trim(),
    grandmaName: process.env.DEMO_GRANDMA_NAME?.trim() || 'Rosa',
    familyName: process.env.DEMO_FAMILY_NAME?.trim() || 'Alex',
    familyRelation: process.env.DEMO_FAMILY_RELATION?.trim() || 'grandson',
  };
}

// Agora custom tools need an absolute HTTPS URL and a shared secret.
// When either is missing the agent still starts, but without tools.
export function toolsEnabled(): boolean {
  const { publicBaseUrl, toolSecret } = getConfig();
  return (
    publicBaseUrl.startsWith('https://') &&
    toolSecret.length > 0 &&
    toolSecret !== 'change-me'
  );
}

export function toolsDisabledReason(): string | null {
  const { publicBaseUrl, toolSecret } = getConfig();
  if (!publicBaseUrl.startsWith('https://')) {
    return 'PUBLIC_BASE_URL must be an absolute https:// URL (start a tunnel to :3000)';
  }
  if (!toolSecret || toolSecret === 'change-me') {
    return 'TOOL_SECRET must be set to a random value (not "change-me")';
  }
  return null;
}

// Operator fallback controls (POST /api/demo/simulate). Off unless DEMO_MODE=true, because the
// route can force a verification result and must not be reachable on a public tunnel by default.
export function demoModeEnabled(): boolean {
  return process.env.DEMO_MODE === 'true';
}
