# 06 Interfaces

> Contracts at repo boundaries: API routes, env vars, runtime events, and shared TypeScript payloads.

## HTTP Route Contracts

### `GET /api/generate-agora-token`

Query params:

- `uid` optional; invalid/zero resolves to random RTM-safe UID.
- `channel` optional; defaults to generated `ai-conversation-<ts>-<rand>`.

Success response:

```json
{ "token": "...", "uid": "1234", "channel": "ai-conversation-..." }
```

Failure response: `{ "error": string, "details"?: string }` with `500`.

### `POST /api/invite-agent`

Body (`ClientStartRequest`):

```json
{ "requester_id": "1234", "channel_name": "ai-conversation-..." }
```

Success (`AgentResponse`):

```json
{ "agent_id": "...", "create_ts": 1710000000, "state": "RUNNING" }
```

Validation failures return `400`; server failures return `500`.

### `POST /api/stop-conversation`

Body (`StopConversationRequest`): `{ "agent_id": "..." }`.

Responses:

- `{ "success": true }`
- `{ "success": true, "state": "already-stopping" }` for idempotent stop state
- `{ "error": string }` on failure

### `POST /api/chat/completions`

Optional SSE proxy path (not default runtime path). Requires `NEXT_LLM_API_KEY` and `NEXT_LLM_URL` when used.

### Gatekeeper routes

Tool routes (`/api/tools/*`) require header `x-tool-secret` (401 on mismatch, 503 if `TOOL_SECRET` is unset) and `?session=<id>`; unknown session is 404 with safe default guidance.

- `GET /api/tools/check-status` -> `{ risk_level, verification, guidance }`.
- `POST /api/tools/request-verification` body `{ claimed_identity, claim_summary, tool_call_id? }` -> `{ ok, status, guidance }`; idempotent, starts the Verifier.
- `POST /api/tools/report-verification` body `{ result: family_safe_did_not_call | family_confirms_they_called | unclear, note }` -> `{ ok, status, guidance }`; first result wins, pushes Grandma's closing line.
- `POST /api/transcript` body `{ sessionId, speaker: caller | grandma | family, text, ts? }`; `400` invalid, `404` unknown session.
- `GET /api/state?session=<id>` (default: latest) -> `StateResponse { session, callUrl, serverTime }`.
- `GET /api/session/<id>/trail` -> JSON download of the full session including policy decisions.
- `POST /api/demo/simulate` body `{ action: caller_line | start_verification | verify_result, ... }`; `403` unless `DEMO_MODE=true`; counts `manualInterventions`. The extra action `new_session` (session id must start with `harness-`) registers a session for `scripts/harness.ts`, is not counted, and such sessions never start a real Verifier agent.

Verification states: `none`, `pending`, `confirmed_safe_family_not_caller`, `family_confirms_call`, `unreachable`.

## Event/Data Interfaces

- RTM transcript/state/metrics/errors consumed through `AgoraVoiceAI` event emitter.
- Raw RTM `message` event parsed as fallback for `message.error` and `message.sal_status` payloads.
- `AGENT_METRICS` payloads displayed by `QuickstartPipelineMetrics`.

## Environment Contract

Required:

- `NEXT_PUBLIC_AGORA_APP_ID`
- `NEXT_AGORA_APP_CERTIFICATE`

Gatekeeper optional: `PUBLIC_BASE_URL` (https tunnel), `TOOL_SECRET`, `DEMO_GRANDMA_NAME`, `DEMO_FAMILY_NAME`, `DEMO_FAMILY_RELATION`, `DEMO_MODE`, `AGORA_TELEPHONY_ENABLED`. Without `PUBLIC_BASE_URL` (https) and `TOOL_SECRET` the agents start without tools.

This is the complete base `.env.local` contract. The optional BYOK route and provider snippets use additional variables only when a developer explicitly enables them.

## Test Coverage for Interfaces

- `scripts/verify-api-contracts.ts` asserts token generation, input validation, env failures, and SSE framing cases.

## Shared Client-Side Interfaces

From `types/conversation.ts` (high-use):

- `AgoraTokenData`: token bootstrap payload consumed by `LandingPage`.
- `AgoraRenewalTokens`: renewal callback result (`rtcToken`, `rtmToken`).
- `ConversationComponentProps`: runtime dependencies for in-call component.

## Interface Invariants

- Token payload must always include `token`, `uid`, `channel`.
- Invite route requires both `requester_id` and `channel_name`.
- Stop route requires `agent_id`; missing should never be tolerated silently.
- Token route should always return UID as string for downstream compatibility.

## Event Interface Notes

- Metrics stream entries are append-only in component state, capped to recent window.
- Connection issue records carry `source`, `agentUserId`, code/message, timestamp.
- SAL and signaling fallback payloads are parsed defensively because message schema can vary.

## Backward Compatibility Guidance

- If route response shape changes, update both client consumers and contract tests in same change.
- If adding fields, keep existing fields stable to avoid quickstart consumer breakage.
- Reflect interface changes in README and L1 docs to keep sample copyable.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — How route contracts are used in sequence.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — Event-level contract mapping.
