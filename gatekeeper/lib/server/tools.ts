import type { LlmTool } from 'agora-agents';

// Agora custom tool definitions (handoff section 6; schema confirmed against
// https://docs.agora.io/en/ai/build/tools/custom-tools).
// Rules from the docs: names are letters and numbers only; {{args.x}} is NOT allowed in headers;
// a placeholder must be the whole value of a header or body leaf; GET tools cannot have a body.

const SECRET_HEADER = { 'x-tool-secret': '{{template_variables.tool_secret}}' };

// Verifier tool: reports what the family member said. The session id is the GRANDMA session id
// (passed as a template variable), not the verify channel name.
export function verifierTools(baseUrl: string): LlmTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'reportVerification',
        description:
          'Report the family member\'s answer. Call exactly once, as soon as you know whether they are safe and whether they made the call.',
        parameters: {
          type: 'object',
          properties: {
            result: {
              type: 'string',
              enum: ['family_safe_did_not_call', 'family_confirms_they_called', 'unclear'],
              description:
                'family_safe_did_not_call: they are safe and did NOT make the call. family_confirms_they_called: they really made the call. unclear: you cannot tell.',
            },
            note: {
              type: 'string',
              description: 'One short sentence with what the family member said.',
            },
          },
          required: ['result', 'note'],
          additionalProperties: false,
        },
      },
      execution: { mode: 'sync' },
      server: {
        method: 'POST',
        url: `${baseUrl}/api/tools/report-verification?session={{template_variables.session_id}}`,
        headers: SECRET_HEADER,
        body: {
          result: '{{args.result}}',
          note: '{{args.note}}',
          tool_call_id: '{{tool_call_id}}',
        },
        timeout_ms: 5000,
      },
    },
  ];
}

export function grandmaTools(baseUrl: string): LlmTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'checkStatus',
        description:
          "Check the protection status: risk level and whether family verification is pending or done. Call this whenever the caller asks for money, payment, codes, personal details, secrecy, or urgency, and every turn while verification is pending.",
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
      execution: { mode: 'sync' },
      server: {
        method: 'GET',
        url: `${baseUrl}/api/tools/check-status?session={{template_variables.session_id}}`,
        headers: SECRET_HEADER,
        timeout_ms: 3000,
      },
    },
    {
      type: 'function',
      function: {
        name: 'requestVerification',
        description:
          'Ask the family to confirm the caller\'s story. Use when the caller claims to be a relative, the government, police, a bank or a utility, or asks for money.',
        parameters: {
          type: 'object',
          properties: {
            claimed_identity: {
              type: 'string',
              description:
                "Who the caller claims to be, e.g. 'grandson', 'FBI agent', 'the electric company'.",
            },
            claim_summary: {
              type: 'string',
              description:
                'One sentence: what the caller says happened and what they want.',
            },
          },
          required: ['claimed_identity', 'claim_summary'],
          additionalProperties: false,
        },
      },
      execution: { mode: 'sync' },
      server: {
        method: 'POST',
        url: `${baseUrl}/api/tools/request-verification?session={{template_variables.session_id}}`,
        headers: SECRET_HEADER,
        body: {
          claimed_identity: '{{args.claimed_identity}}',
          claim_summary: '{{args.claim_summary}}',
          tool_call_id: '{{tool_call_id}}',
        },
        timeout_ms: 5000,
      },
    },
  ];
}
