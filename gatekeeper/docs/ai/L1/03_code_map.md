# 03 Code Map

> Directory-level ownership map and where to change behavior safely.

## Top-Level Layout

```text
app/                 Next.js routes + API handlers
components/          Client UI and RTC/RTM lifecycle
lib/                 Shared helpers and server-side chat completions handler
scripts/             Verification and doctor helpers
docs/                Human-oriented guides
docs/ai/             Progressive disclosure docs (this system)
public/              Static assets and branding
types/               Shared TypeScript route/component contracts
```

## API Route Ownership (`app/api`)

- `generate-agora-token/route.ts`: builds RTC+RTM token via `buildTokenWithRtm`.
- `invite-agent/route.ts`: validates input/env, configures and starts agent session.
- `stop-conversation/route.ts`: stops agent and handles idempotent already-stopping cases.
- `chat/completions/route.ts`: optional OpenAI-compatible SSE proxy for custom LLM path.

### Gatekeeper routes

- `tools/check-status`, `tools/request-verification` (Grandma) and `tools/report-verification` (Verifier): Agora custom tool endpoints, guarded by `requireToolSecret`.
- `transcript` (POST final turns from the browser, caller turns are scored) and `state` (GET, polled by the dashboard and family page).
- `session/[id]/trail` (decision trail download) and `demo/simulate` (operator controls, `DEMO_MODE=true` only).
- `invite-agent` and `stop-conversation` also register and end the Gatekeeper session; stopping the Verifier agent does not end the call.

## Gatekeeper Server Logic (`lib/server`, server-only)

- `store.ts`: in-memory sessions on `globalThis.__gatekeeper` (single local Node process). `config.ts`: env access. `http.ts`: tool secret and session lookup.
- `prompts.ts`, `tools.ts`, `guidance.ts`: agent prompts, Agora tool definitions, action-only guidance and closing lines. Names never reach Grandma's LLM.
- `agents.ts`: `startGrandma`, `startVerifierAgent`, `stopAgentSafe`.
- `risk.ts` (scorer interface + keyword scorer), `policy.ts` (`evaluate` pure, `applyPolicy` side effects), `scoring.ts` (debounced run).
- `verifier.ts` (launcher, watchdog, `startVerification`), `outcome.ts` (`finishVerification`, closing line via speak, stop Verifier).
- `scenarios.ts`: scripted calls shared by `scripts/eval.ts` and the contract tests.

## Client Ownership (`components`)

- `FamilyLanding.tsx` (`app/family`): family member answers the Verifier call in the `${sessionId}-verify` channel. `AgoraProvider.tsx`: shared RTC client provider.
- `dashboard/*` (`app/dashboard`): TranscriptFeed, ScamMeter, EventTimeline, VerifiedCard, DemoPanel, DashboardFooter.
- `LandingPage.tsx`: pre-call shell, token/invite/RTM bootstrap, conversation mount/unmount.
- `ConversationComponent.tsx`: RTC join, mic publish, toolkit init, transcript/metrics/issues state.
- `QuickstartConversationLayout.tsx`: in-call framing and slots.
- `QuickstartTranscriptPanel.tsx`: live transcript panel.
- `QuickstartPipelineMetrics.tsx`: latency chips from metrics stream.
- `ConnectionStatusPanel.tsx` + `ConversationErrorCard.tsx`: issue rendering/severity.

## Shared Logic (`lib`)

- `chat-completions.ts`: server-side custom LLM SSE handler factory, shared by the route and contract tests.
- `agora.ts`: constants (`DEFAULT_AGENT_UID`, `VERIFIER_AGENT_UID`, `FAMILY_UID`, `verifyChannelName`). `gatekeeper-shared.ts`: risk keys and labels. `transcript-forwarder.ts`: browser-side final-turn forwarding.
- `conversation.ts`: transcript normalization, spacing cleanup, timestamp normalization, visualizer state mapping.

## Validation and Tooling

- `scripts/verify-api-contracts.ts`: imports route handlers and validates contract behavior (including tools, scorer, policy, verifier flow, trail, demo controls).
- `scripts/eval.ts` (`pnpm eval`): replays scripted scenarios through scorer and policy, writes `eval_results.md`.
- `scripts/doctor.mjs`: local setup checks consumed by `pnpm run doctor`.
- `tailwind.config.ts`: includes `agora-agent-uikit` dist classes in content scan.

## Fast File Lookup

- Change agent prompt/model/VAD -> `app/api/invite-agent/route.ts`.
- Change token policy/channel naming -> `app/api/generate-agora-token/route.ts`.
- Change transcript mapping behavior -> `lib/conversation.ts` + `components/ConversationComponent.tsx`.
- Change session bootstrap UX -> `components/LandingPage.tsx`.

## Additional Component Roles

- `QuickstartPreCallCard.tsx`: start CTA and pre-call messaging.
- `QuickstartConversationLayout.tsx`: shared in-call composition shell.
- `MicrophoneSelector.tsx`: input-device selection UI.
- `ConnectionStatusPanel.tsx`: summary + detailed connection issue panel.
- `ErrorBoundary.tsx`: runtime guardrail for conversation subtree.

## Type Contract Locations

- `types/conversation.ts`: request/response payloads and component prop types.
- `types/env.d.ts`: typed environment variable expectations.
- `types/jsx.d.ts` and `react-jsx.d.ts`: JSX typing support details.

## Static and Styling Assets

- `public/*`: icons, logos, and heading SVG assets used in pre-call/in-call experience.
- `app/globals.css` and `styles/globals.css`: baseline theme/layout styles.
- `tailwind.config.ts`: utility class scan and theme extension.

## Verification Path Mapping

- API contract behavior test: `scripts/verify-api-contracts.ts`.
- Environment and prerequisites check: `scripts/doctor.mjs`.
- Aggregate check chain: `pnpm run verify` script in `package.json`.

## Ownership Boundaries

- `components/` owns client runtime lifecycle and UI state.
- `app/api/` owns privileged operations needing app certificate.
- `lib/` owns reusable helpers; `chat-completions.ts` is server-side only.
- `docs/` owns human-facing implementation narrative and runbooks.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — Cross-file call path during start/stop.
- [from_scratch_bootstrap.md](L2/from_scratch_bootstrap.md) — Official baseline map for recreating the quickstart recipe.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — Mapping and rendering flow from toolkit events.
