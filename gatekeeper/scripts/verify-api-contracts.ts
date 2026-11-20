import { AgoraClient, Agent } from 'agora-agents';
import { RtcTokenBuilder } from 'agora-token';
import { NextRequest } from 'next/server';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

process.env.NEXT_PUBLIC_AGORA_APP_ID = '0123456789abcdef0123456789abcdef';
process.env.NEXT_AGORA_APP_CERTIFICATE = 'fedcba9876543210fedcba9876543210';
process.env.PUBLIC_BASE_URL = 'https://gatekeeper.example.test';
process.env.TOOL_SECRET = 'test-tool-secret';

async function verifyGenerateAgoraTokenRoute() {
  const { GET: generateAgoraToken } =
    await import('../app/api/generate-agora-token/route');
  const originalBuildTokenWithRtm = RtcTokenBuilder.buildTokenWithRtm;
  let tokenBuilderArgs: unknown[] | null = null;

  RtcTokenBuilder.buildTokenWithRtm = ((...args: unknown[]) => {
    tokenBuilderArgs = args;
    return 'mock-rtc-rtm-token';
  }) as typeof RtcTokenBuilder.buildTokenWithRtm;

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/generate-agora-token?uid=4321&channel=test-channel',
    );
    const response = await generateAgoraToken(request);
    const body = await getJson(response);

    assert(
      response.status === 200,
      'GET /api/generate-agora-token should return 200',
    );
    assert(
      body.token === 'mock-rtc-rtm-token',
      'GET /api/generate-agora-token should return the built token',
    );
    assert(
      body.uid === '4321',
      'GET /api/generate-agora-token should preserve the requested uid',
    );
    assert(
      body.channel === 'test-channel',
      'GET /api/generate-agora-token should preserve the requested channel',
    );

    assert(
      Array.isArray(tokenBuilderArgs),
      'GET /api/generate-agora-token should call buildTokenWithRtm',
    );
    assert(
      tokenBuilderArgs?.[2] === 'test-channel',
      'buildTokenWithRtm should use the requested channel',
    );
    assert(
      tokenBuilderArgs?.[3] === '4321',
      'buildTokenWithRtm should receive the requested uid as account string',
    );
  } finally {
    RtcTokenBuilder.buildTokenWithRtm = originalBuildTokenWithRtm;
  }
}

async function verifyGenerateAgoraTokenReplacesZeroUid() {
  const { GET: generateAgoraToken } =
    await import('../app/api/generate-agora-token/route');
  const originalBuildTokenWithRtm = RtcTokenBuilder.buildTokenWithRtm;
  let tokenBuilderArgs: unknown[] | null = null;

  RtcTokenBuilder.buildTokenWithRtm = ((...args: unknown[]) => {
    tokenBuilderArgs = args;
    return 'mock-rtc-rtm-token';
  }) as typeof RtcTokenBuilder.buildTokenWithRtm;

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/generate-agora-token?uid=0&channel=test-channel',
    );
    const response = await generateAgoraToken(request);
    const body = await getJson(response);

    assert(
      response.status === 200,
      'GET /api/generate-agora-token?uid=0 should return 200',
    );
    assert(
      typeof body.uid === 'string' && body.uid !== '0',
      'GET /api/generate-agora-token?uid=0 should generate an RTM-safe uid',
    );
    assert(
      Array.isArray(tokenBuilderArgs) && tokenBuilderArgs[3] === body.uid,
      'buildTokenWithRtm should mint the token for the generated uid',
    );
  } finally {
    RtcTokenBuilder.buildTokenWithRtm = originalBuildTokenWithRtm;
  }
}

async function verifyChatCompletionsMissingEnv() {
  const { createChatCompletionsHandler } =
    await import('../lib/chat-completions');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;

  delete process.env.NEXT_LLM_API_KEY;
  delete process.env.NEXT_LLM_URL;

  const handler = createChatCompletionsHandler({
    createOpenAIClient: (() => {
      throw new Error('createOpenAI should not be called when env is missing');
    }) as never,
    streamTextImpl: (() => {
      throw new Error('streamText should not be called when env is missing');
    }) as never,
  });

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/chat/completions',
      {
        body: JSON.stringify({ messages: [] }),
        method: 'POST',
      },
    );
    const response = await handler(request);
    const body = await getJson(response);

    assert(
      response.status === 500,
      'POST /api/chat/completions should reject missing LLM env',
    );
    assert(
      body.error === 'NEXT_LLM_API_KEY and NEXT_LLM_URL must be set',
      'POST /api/chat/completions should explain missing LLM env',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifyChatCompletionsInvalidJson() {
  const { createChatCompletionsHandler } =
    await import('../lib/chat-completions');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  process.env.NEXT_LLM_API_KEY = 'test-key';
  process.env.NEXT_LLM_URL = 'https://example.test/v1/chat/completions';

  const handler = createChatCompletionsHandler({
    createOpenAIClient: (() => {
      throw new Error('createOpenAI should not be called for invalid JSON');
    }) as never,
    streamTextImpl: (() => {
      throw new Error('streamText should not be called for invalid JSON');
    }) as never,
  });

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/chat/completions',
      {
        body: '{not json',
        method: 'POST',
      },
    );
    const response = await handler(request);
    const body = await getJson(response);

    assert(
      response.status === 400,
      'POST /api/chat/completions should reject invalid JSON',
    );
    assert(
      body.error === 'Invalid JSON body',
      'POST /api/chat/completions should explain invalid JSON',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifyChatCompletionsSseDone() {
  const { createChatCompletionsHandler } =
    await import('../lib/chat-completions');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  process.env.NEXT_LLM_API_KEY = 'test-key';
  process.env.NEXT_LLM_URL = 'https://example.test/v1/chat/completions';

  let capturedBaseUrl: string | undefined;
  let capturedModelId: string | undefined;
  let capturedMessages: unknown;

  const handler = createChatCompletionsHandler({
    createOpenAIClient: ((options: { baseURL?: string }) => {
      capturedBaseUrl = options.baseURL;
      return (modelId: string) => {
        capturedModelId = modelId;
        return { modelId };
      };
    }) as never,
    streamTextImpl: ((options: { messages?: unknown }) => {
      capturedMessages = options.messages;
      return {
        textStream: (async function* () {
          yield 'hello';
          yield ' world';
        })(),
      };
    }) as never,
  });

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/chat/completions',
      {
        body: JSON.stringify({
          model: 'caller-model-ignored-for-routing',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
        method: 'POST',
      },
    );
    const response = await handler(request);
    const text = await response.text();

    assert(
      response.status === 200,
      'POST /api/chat/completions should return 200 for a valid request',
    );
    assert(
      response.headers.get('content-type') === 'text/event-stream',
      'POST /api/chat/completions should return SSE content type',
    );
    assert(
      capturedBaseUrl === 'https://example.test/v1',
      'POST /api/chat/completions should pass base URL without /chat/completions',
    );
    assert(
      capturedModelId === 'gpt-4o',
      'POST /api/chat/completions should route to the pinned server model',
    );
    assert(
      JSON.stringify(capturedMessages) ===
        JSON.stringify([{ role: 'user', content: 'Hi' }]),
      'POST /api/chat/completions should pass request messages to streamText',
    );
    assert(
      text.includes('data: [DONE]'),
      'POST /api/chat/completions should terminate with [DONE]',
    );
    assert(
      text.includes('"content":"hello"') && text.includes('"content":" world"'),
      'POST /api/chat/completions should stream text chunks as OpenAI-compatible deltas',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifyInviteAgentValidation() {
  const { POST: inviteAgent } = await import('../app/api/invite-agent/route');
  const request = new NextRequest('http://localhost:3000/api/invite-agent', {
    body: JSON.stringify({ channel_name: 'missing-requester' }),
    method: 'POST',
  });
  const response = await inviteAgent(request);
  const body = await getJson(response);

  assert(
    response.status === 400,
    'POST /api/invite-agent should reject missing fields',
  );
  assert(
    body.error === 'channel_name and requester_id are required',
    'POST /api/invite-agent should explain validation failure',
  );
}

async function verifyInviteAgentSuccess() {
  const { POST: inviteAgent } = await import('../app/api/invite-agent/route');
  const originalCreateSession = Agent.prototype.createSession;
  let capturedSessionConfig: {
    channel?: string;
    agentUid?: string;
    remoteUids?: string[];
  } | null = null;

  Agent.prototype.createSession = ((sessionConfig: unknown) => {
    capturedSessionConfig = sessionConfig as {
      channel?: string;
      agentUid?: string;
      remoteUids?: string[];
    };
    return {
      start: async () => 'mock-agent-id',
    };
  }) as unknown as typeof Agent.prototype.createSession;

  try {
    const request = new NextRequest('http://localhost:3000/api/invite-agent', {
      body: JSON.stringify({
        requester_id: 'user-4321',
        channel_name: 'test-channel',
      }),
      method: 'POST',
    });
    const response = await inviteAgent(request);
    const body = await getJson(response);

    assert(
      response.status === 200,
      'POST /api/invite-agent should return 200 on success',
    );
    assert(
      body.agent_id === 'mock-agent-id',
      'POST /api/invite-agent should return the started agent id',
    );
    assert(
      body.state === 'RUNNING',
      'POST /api/invite-agent should return RUNNING state',
    );
    assert(
      capturedSessionConfig !== null,
      'POST /api/invite-agent should call createSession',
    );
    const sessionConfig = capturedSessionConfig as {
      channel?: string;
      agentUid?: string;
      remoteUids?: string[];
    };

    assert(
      sessionConfig.channel === 'test-channel',
      'POST /api/invite-agent should pass the requested channel to createSession',
    );
    assert(
      sessionConfig.agentUid === '123456',
      'POST /api/invite-agent should use the shared default agent UID',
    );
    assert(
      JSON.stringify(sessionConfig.remoteUids) ===
        JSON.stringify(['user-4321']),
      'POST /api/invite-agent should scope the session to the requesting user',
    );
  } finally {
    Agent.prototype.createSession = originalCreateSession;
  }
}

async function verifyStopConversationValidation() {
  const { POST: stopConversation } =
    await import('../app/api/stop-conversation/route');
  const request = new NextRequest(
    'http://localhost:3000/api/stop-conversation',
    {
      body: JSON.stringify({}),
      method: 'POST',
    },
  );
  const response = await stopConversation(request);
  const body = await getJson(response);

  assert(
    response.status === 400,
    'POST /api/stop-conversation should reject missing agent_id',
  );
  assert(
    body.error === 'agent_id is required',
    'POST /api/stop-conversation should explain validation failure',
  );
}

async function verifyStopConversationSuccess() {
  const { POST: stopConversation } =
    await import('../app/api/stop-conversation/route');
  const originalStopAgent = AgoraClient.prototype.stopAgent;
  let stoppedAgentId: string | null = null;

  AgoraClient.prototype.stopAgent = async function (
    this: AgoraClient,
    agentId: string,
  ) {
    stoppedAgentId = agentId;
  } as typeof AgoraClient.prototype.stopAgent;

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/stop-conversation',
      {
        body: JSON.stringify({ agent_id: 'mock-agent-id' }),
        method: 'POST',
      },
    );
    const response = await stopConversation(request);
    const body = await getJson(response);

    assert(
      response.status === 200,
      'POST /api/stop-conversation should return 200 on success',
    );
    assert(
      body.success === true,
      'POST /api/stop-conversation should return success',
    );
    assert(
      stoppedAgentId === 'mock-agent-id',
      'POST /api/stop-conversation should call stopAgent with the requested agent id',
    );
  } finally {
    AgoraClient.prototype.stopAgent = originalStopAgent;
  }
}

const TOOL_HEADERS = { 'x-tool-secret': 'test-tool-secret' };

async function verifyGrandmaToolDefinitions() {
  const { grandmaTools } = await import('../lib/server/tools');
  const tools = grandmaTools('https://gatekeeper.example.test');
  const names = tools.map((t) => t.function.name);

  assert(
    JSON.stringify(names) === JSON.stringify(['checkStatus', 'requestVerification']),
    'Grandma should expose exactly checkStatus and requestVerification',
  );
  for (const tool of tools) {
    assert(
      /^[A-Za-z][A-Za-z0-9]*$/.test(tool.function.name),
      'Tool names must be letters and numbers only, starting with a letter',
    );
    assert(
      tool.server.url.startsWith('https://'),
      'Tool URLs must be absolute https URLs',
    );
    assert(
      tool.server.headers?.['x-tool-secret'] === '{{template_variables.tool_secret}}',
      'Tool secret must be a complete template_variables header value',
    );
    assert(
      !Object.values(tool.server.headers ?? {}).some((v) => v.includes('{{args.')),
      'Headers must not use {{args.*}}',
    );
  }
  assert(
    tools[0].server.method === 'GET' && tools[0].server.body === undefined,
    'checkStatus must be a GET without a body',
  );
}

async function verifyToolRoutes() {
  const { GET: checkStatus } = await import('../app/api/tools/check-status/route');
  const { POST: requestVerification } = await import(
    '../app/api/tools/request-verification/route'
  );
  const { createSession, getSession } = await import('../lib/server/store');
  const sessionId = 'contract-test-session';
  createSession(sessionId, '4321');

  // Missing or wrong secret -> 401
  let response = await checkStatus(
    new Request(`http://localhost:3000/api/tools/check-status?session=${sessionId}`),
  );
  assert(response.status === 401, 'check-status should reject a missing secret');
  response = await checkStatus(
    new Request(`http://localhost:3000/api/tools/check-status?session=${sessionId}`, {
      headers: { 'x-tool-secret': 'wrong' },
    }),
  );
  assert(response.status === 401, 'check-status should reject a wrong secret');
  response = await requestVerification(
    new Request(`http://localhost:3000/api/tools/request-verification?session=${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ claimed_identity: 'x', claim_summary: 'y' }),
    }),
  );
  assert(response.status === 401, 'request-verification should reject a missing secret');

  // Unknown session -> 404 with safe default guidance
  response = await checkStatus(
    new Request('http://localhost:3000/api/tools/check-status?session=nope', {
      headers: TOOL_HEADERS,
    }),
  );
  let body = await getJson(response);
  assert(response.status === 404, 'check-status should 404 for an unknown session');
  assert(typeof body.guidance === 'string', '404 should still carry default guidance');

  // check-status returns the three documented keys
  response = await checkStatus(
    new Request(`http://localhost:3000/api/tools/check-status?session=${sessionId}`, {
      headers: TOOL_HEADERS,
    }),
  );
  body = await getJson(response);
  assert(response.status === 200, 'check-status should return 200');
  assert(
    body.risk_level === 'green' &&
      body.verification === 'none' &&
      typeof body.guidance === 'string',
    'check-status should return risk_level, verification and guidance',
  );

  // request-verification validates, records, sets pending, and is idempotent
  response = await requestVerification(
    new Request(`http://localhost:3000/api/tools/request-verification?session=${sessionId}`, {
      method: 'POST',
      headers: TOOL_HEADERS,
      body: JSON.stringify({ claimed_identity: 'grandson' }),
    }),
  );
  assert(response.status === 400, 'request-verification should require both arguments');

  const goodRequest = () =>
    new Request(`http://localhost:3000/api/tools/request-verification?session=${sessionId}`, {
      method: 'POST',
      headers: TOOL_HEADERS,
      body: JSON.stringify({
        claimed_identity: 'grandson',
        claim_summary: 'Says he is in jail and needs bail money',
        tool_call_id: 'call-1',
      }),
    });
  response = await requestVerification(goodRequest());
  body = await getJson(response);
  assert(
    response.status === 200 && body.ok === true && body.status === 'pending',
    'request-verification should return ok/pending',
  );
  assert(
    getSession(sessionId)?.verification === 'pending' &&
      getSession(sessionId)?.claim?.claimedIdentity === 'grandson',
    'request-verification should record the claim and set pending',
  );
  const startedAt = getSession(sessionId)?.metrics.verifyStartedAt;
  response = await requestVerification(goodRequest());
  body = await getJson(response);
  assert(body.status === 'pending', 'request-verification should be idempotent');
  assert(
    getSession(sessionId)?.metrics.verifyStartedAt === startedAt,
    'a repeated request must not restart verification',
  );

  // Guidance must never contain the demo family name (handoff section 20.2)
  response = await checkStatus(
    new Request(`http://localhost:3000/api/tools/check-status?session=${sessionId}`, {
      headers: TOOL_HEADERS,
    }),
  );
  body = await getJson(response);
  assert(
    !String(body.guidance).includes('Alex') && body.verification === 'pending',
    'check-status guidance must not include family names',
  );
}

async function verifyInviteAgentRegistersSession() {
  const { POST: inviteAgent } = await import('../app/api/invite-agent/route');
  const { getSession } = await import('../lib/server/store');
  const originalCreateSession = Agent.prototype.createSession;
  Agent.prototype.createSession = (() => ({
    start: async () => 'mock-grandma-id',
  })) as unknown as typeof Agent.prototype.createSession;

  try {
    const response = await inviteAgent(
      new NextRequest('http://localhost:3000/api/invite-agent', {
        body: JSON.stringify({ requester_id: '777', channel_name: 'gk-register-test' }),
        method: 'POST',
      }),
    );
    assert(response.status === 200, 'invite-agent should still return 200');
    const session = getSession('gk-register-test');
    assert(
      session?.grandmaAgentId === 'mock-grandma-id' && session.callerUid === '777',
      'invite-agent should register the call in the store keyed by channel',
    );
  } finally {
    Agent.prototype.createSession = originalCreateSession;
  }
}

async function verifyKeywordScorerAndPolicy() {
  const { buildWindow, keywordScore } = await import('../lib/server/risk');
  const { evaluate } = await import('../lib/server/policy');

  const scripts: Record<string, string[]> = {
    'grandchild in jail': [
      'Grandma? It is me... I am in trouble, I got arrested.',
      "Please don't tell Mom.",
      'I need $2,000 for bail today, can you get gift cards?',
    ],
    'fake FBI': [
      'This is Special Agent Miller with the FBI.',
      'Your identity was used to buy illegal firearms.',
      "To avoid arrest you must move your savings to a safe account today. Don't tell anyone.",
    ],
    'fake utility': [
      'This is your electric company, your account is past due.',
      'We disconnect in 30 minutes.',
      'Pay $480 now with a prepaid card or a Bitcoin ATM.',
    ],
  };

  for (const [name, lines] of Object.entries(scripts)) {
    const transcript: { speaker: 'caller'; text: string }[] = [];
    let redAt = 0;
    lines.forEach((text, i) => {
      transcript.push({ speaker: 'caller', text });
      const { scores } = keywordScore(buildWindow(transcript));
      if (!redAt && evaluate(scores).riskLevel === 'red') redAt = i + 1;
    });
    assert(redAt > 0 && redAt <= 3, `Script "${name}" should reach red by caller line 3`);
  }

  // Credential requests are red alone; routine identity questions are not.
  assert(
    evaluate(keywordScore('Please read me the code we just texted you.').scores).riskLevel === 'red',
    'a verification code request should be red on its own',
  );
  assert(
    evaluate(keywordScore('Can I confirm your address and date of birth?').scores).riskLevel !== 'red',
    'a routine address and birth date check should not be red',
  );
  assert(
    evaluate(keywordScore('Can you send me some money to get out?').scores).riskLevel === 'red',
    'asking to send money without an amount should be red',
  );
  assert(
    evaluate(keywordScore("Give me a call back, I'll bring money on Sunday.").scores).riskLevel !== 'red',
    'a harmless "give me a call back ... money" line should not be red',
  );

  const benign = keywordScore('Hey Rosa, it is Dan next door. Can I borrow your ladder this weekend?');
  assert(
    evaluate(benign.scores).riskLevel === 'green',
    'A friendly neighbour call should stay green',
  );

  // Policy ratchet: the risk level never drops once raised.
  const { createSession, getSession } = await import('../lib/server/store');
  const { applyPolicy } = await import('../lib/server/policy');
  const { emptyScores } = await import('../lib/gatekeeper-shared');
  const session = createSession('policy-ratchet-test', '1');
  await applyPolicy(session, {
    scores: { ...emptyScores(), payment_demand: 0.9 },
    scorer: 'keyword',
    window: 'gift cards',
  });
  assert(session.riskLevel === 'red', 'payment demand should make the call red');
  assert(
    session.verification === 'pending' &&
      session.events.some((e) => e.detail.includes('triggered automatically')),
    'red should trigger verification automatically',
  );
  await applyPolicy(session, { scores: emptyScores(), scorer: 'keyword', window: 'hello' });
  assert(
    getSession('policy-ratchet-test')?.riskLevel === 'red',
    'risk level must not drop after it was raised',
  );
}

async function verifyTranscriptAndStateRoutes() {
  const { POST: postTranscript } = await import('../app/api/transcript/route');
  const { GET: getState } = await import('../app/api/state/route');
  const { createSession, getSession } = await import('../lib/server/store');
  createSession('transcript-test', '9');

  const post = (payload: unknown) =>
    postTranscript(
      new Request('http://localhost:3000/api/transcript', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );

  assert((await post({ sessionId: 'transcript-test', speaker: 'robot', text: 'x' })).status === 400,
    'transcript should reject an unknown speaker');
  assert((await post({ sessionId: 'nope', speaker: 'caller', text: 'hi' })).status === 404,
    'transcript should 404 for an unknown session');
  assert((await post({ sessionId: 'transcript-test', speaker: 'grandma', text: 'Hello dear' })).status === 200,
    'transcript should accept a grandma line');
  assert((await post({ sessionId: 'transcript-test', speaker: 'caller', text: 'Hi Grandma' })).status === 200,
    'transcript should accept a caller line');
  assert(getSession('transcript-test')?.transcript.length === 2, 'transcript lines should be stored');

  const response = await getState(
    new Request('http://localhost:3000/api/state?session=transcript-test'),
  );
  const body = (await getJson(response)) as {
    session: { id: string; transcript: unknown[]; profile: { familyName: string } } | null;
  };
  assert(response.status === 200 && body.session?.id === 'transcript-test', 'state should return the session');
  assert(body.session?.transcript.length === 2, 'state should include the transcript');
  assert(typeof body.session?.profile.familyName === 'string', 'state should include the profile for the dashboard');
  assert(
    !('decisions' in (body.session as object)),
    'state should not include the decision trail',
  );
}

async function verifyVerifierFlow() {
  const { verifierTools } = await import('../lib/server/tools');
  const { cleanVar, VERIFIER_PROMPT, VERIFIER_GREETING } = await import('../lib/server/prompts');
  const { deriveClaim, startVerification } = await import('../lib/server/verifier');
  const { armWatchdog } = await import('../lib/server/outcome');
  const { closingLine } = await import('../lib/server/guidance');
  const { createSession, getSession } = await import('../lib/server/store');
  const { POST: reportVerification } = await import('../app/api/tools/report-verification/route');
  const { POST: stopConversation } = await import('../app/api/stop-conversation/route');

  // Tool definition
  const [tool] = verifierTools('https://gatekeeper.example.test');
  assert(tool.function.name === 'reportVerification', 'Verifier should expose reportVerification');
  assert(tool.server.url.startsWith('https://'), 'Verifier tool URL must be https');
  assert(
    tool.server.headers?.['x-tool-secret'] === '{{template_variables.tool_secret}}',
    'Verifier tool secret must be a complete template_variables header value',
  );

  // Prompt safety: caller-controlled values cannot open a placeholder or break the prompt
  assert(
    !/[{}"\n]/.test(cleanVar('x {{session_id}} "quoted"\nnew line', 100)),
    'cleanVar should strip braces, quotes and newlines',
  );
  assert(cleanVar('a'.repeat(500), 50).length === 50, 'cleanVar should bound the length');
  assert(
    VERIFIER_GREETING.includes('AI assistant'),
    'The Verifier greeting must disclose that it is an AI',
  );
  assert(
    VERIFIER_PROMPT.includes('AI assistant') && VERIFIER_PROMPT.includes('untrusted'),
    'The Verifier prompt must disclose AI and treat the claim as untrusted',
  );

  // Closing line is nameless and fits the 512-byte speak limit
  for (const v of [
    'confirmed_safe_family_not_caller',
    'family_confirms_call',
    'unreachable',
  ] as const) {
    const line = closingLine(v);
    assert(
      !!line && Buffer.byteLength(line) <= 512 && !line.includes('Alex'),
      `closing line for ${v} should be nameless and under 512 bytes`,
    );
  }
  assert(closingLine('pending') === null, 'there is no closing line while pending');

  // Claim derivation for the policy-triggered path
  const claimless = createSession('verifier-derive-test', '1');
  claimless.transcript.push({ speaker: 'caller', text: 'I need bail money', ts: 1 });
  claimless.scamType = { label: 'Grandchild in trouble', p: 0.8 };
  const derived = deriveClaim(claimless);
  assert(
    derived.claimedIdentity === 'a family member' && derived.claimSummary.includes('bail'),
    'deriveClaim should fall back to scam type and the latest caller line',
  );

  // Launch is idempotent and records the mode and agent id
  const session = createSession('verify-flow', '5');
  session.grandmaAgentId = 'mock-grandma';
  assert(await startVerification(session, 'policy') === true, 'first startVerification should start');
  assert(await startVerification(session, 'tool') === false, 'second startVerification is a no-op');
  await new Promise((r) => setTimeout(r, 10));
  assert(
    session.verifierMode === 'browser' &&
      session.verifierAgentId === 'mock-verifier-id' &&
      session.events.some((e) => e.type === 'calling_family'),
    'launcher result should be recorded on the session',
  );

  // reportVerification: auth, validation, mapping, speak, idempotency
  const spoken: { agentId: string; text: string; priority?: string }[] = [];
  const { agoraClient } = await import('../lib/server/agents');
  const agentsProto = Object.getPrototypeOf(agoraClient().agents) as {
    speak: (req: { agentId: string; text: string; priority?: string }) => Promise<unknown>;
  };
  const originalSpeak = agentsProto.speak;
  agentsProto.speak = async (req) => {
    spoken.push(req);
    return {};
  };
  const report = (payload: unknown, headers: Record<string, string> = TOOL_HEADERS) =>
    reportVerification(
      new Request('http://localhost:3000/api/tools/report-verification?session=verify-flow', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      }),
    );

  try {
    assert((await report({ result: 'unclear', note: '' }, {})).status === 401, 'report should require the secret');
    assert((await report({ result: 'maybe', note: '' })).status === 400, 'report should reject unknown results');
    assert(session.verification === 'pending', 'a rejected report must not change the state');

    const response = await report({
      result: 'family_safe_did_not_call',
      note: 'I am fine and did not call',
    });
    const body = await getJson(response);
    assert(response.status === 200 && body.ok === true, 'report should succeed');
    assert(
      (session.verification as string) === 'confirmed_safe_family_not_caller' &&
        session.verifyNote === 'I am fine and did not call' &&
        session.metrics.verifyDoneAt !== undefined &&
        session.events.some((e) => e.type === 'family_reached'),
      'report should map the result and record the note and timing',
    );
    assert(
      spoken.length === 1 &&
        spoken[0].agentId === 'mock-grandma' &&
        spoken[0].priority === 'INTERRUPT' &&
        spoken[0].text === closingLine('confirmed_safe_family_not_caller'),
      "report should push Grandma's closing line to her agent",
    );

    await report({ result: 'family_confirms_they_called', note: 'late' });
    assert(
      (session.verification as string) === 'confirmed_safe_family_not_caller' && spoken.length === 1,
      'the first result wins; later reports are ignored',
    );
  } finally {
    agentsProto.speak = originalSpeak;
  }

  // Watchdog: pending verification times out as unreachable
  const slow = createSession('verify-watchdog', '6');
  await startVerification(slow, 'tool');
  armWatchdog(slow, 20);
  await new Promise((r) => setTimeout(r, 80));
  assert(
    getSession('verify-watchdog')?.verification === 'unreachable' &&
      slow.events.some((e) => e.type === 'verification_unclear'),
    'the watchdog should mark unanswered verification unreachable',
  );

  // Stopping the Verifier must not end the caller's call; stopping Grandma ends it and stops both.
  const call = createSession('verify-stop', '7');
  call.grandmaAgentId = 'agent-g';
  call.verifierAgentId = 'agent-v';
  const stopped: string[] = [];
  const originalStop = AgoraClient.prototype.stopAgent;
  AgoraClient.prototype.stopAgent = async function (_agentId: string) {
    stopped.push(_agentId);
  } as typeof AgoraClient.prototype.stopAgent;
  const stop = (agent_id: string) =>
    stopConversation(
      new NextRequest('http://localhost:3000/api/stop-conversation', {
        method: 'POST',
        body: JSON.stringify({ agent_id }),
      }),
    );
  try {
    await stop('agent-v');
    assert(!call.endedAt, 'stopping the Verifier must not end the call');
    await stop('agent-g');
    assert(!!call.endedAt, 'stopping Grandma should end the call');
    assert(
      stopped.includes('agent-v') && stopped.includes('agent-g'),
      'stopping Grandma should also stop the Verifier',
    );
  } finally {
    AgoraClient.prototype.stopAgent = originalStop;
  }
}

async function verifyScenariosTrailAndDemo() {
  const { SCENARIOS, runScenario, scenarioPassed } = await import('../lib/server/scenarios');
  const { keywordScorer } = await import('../lib/server/risk');

  // Every scripted scenario: scams caught in time, benign calls never red, injection flagged.
  assert(
    SCENARIOS.filter((s) => s.kind === 'scam').length === 8 &&
      SCENARIOS.filter((s) => s.kind === 'benign').length === 5,
    'there should be 8 scam and 5 benign scenarios',
  );
  for (const scenario of SCENARIOS) {
    const result = await runScenario(scenario, keywordScorer);
    assert(scenarioPassed(result), `scenario "${scenario.name}" should meet its expectation`);
  }

  const { createSession, getSession } = await import('../lib/server/store');
  const { GET: getTrail } = await import('../app/api/session/[id]/trail/route');
  const { POST: simulate } = await import('../app/api/demo/simulate/route');

  const session = createSession('trail-demo-test', '8');
  session.transcript.push({ speaker: 'caller', text: 'hello', ts: 1 });

  // Trail export: full session incl. decisions, served as a download
  let response = await getTrail(new Request('http://localhost:3000/x'), {
    params: Promise.resolve({ id: 'trail-demo-test' }),
  });
  const trail = (await getJson(response)) as { session: { id: string; decisions: unknown[] } };
  assert(
    response.status === 200 &&
      trail.session.id === 'trail-demo-test' &&
      Array.isArray(trail.session.decisions) &&
      (response.headers.get('content-disposition') ?? '').startsWith('attachment'),
    'trail should download the full session including decisions',
  );
  response = await getTrail(new Request('http://localhost:3000/x'), {
    params: Promise.resolve({ id: 'nope' }),
  });
  assert(response.status === 404, 'trail should 404 for an unknown session');

  // Demo controls: disabled by default, then counted when used
  const post = (payload: unknown) =>
    simulate(
      new Request('http://localhost:3000/api/demo/simulate', {
        method: 'POST',
        body: JSON.stringify({ session: 'trail-demo-test', ...(payload as object) }),
      }),
    );
  delete process.env.DEMO_MODE;
  assert((await post({ action: 'start_verification' })).status === 403, 'demo controls are off by default');
  process.env.DEMO_MODE = 'true';
  try {
    assert((await post({ action: 'nope' })).status === 400, 'unknown demo action should be rejected');
    assert((await post({ action: 'caller_line', text: '' })).status === 400, 'empty caller line should be rejected');
    assert(getSession('trail-demo-test')?.manualInterventions === 0, 'rejected actions are not counted');

    assert((await post({ action: 'start_verification' })).status === 200, 'operator can start verification');
    assert((await post({ action: 'start_verification' })).status === 409, 'a second start is a conflict');
    assert(
      (await post({ action: 'verify_result', result: 'unclear' })).status === 200,
      'operator can set the verification result',
    );
    const after = getSession('trail-demo-test');
    assert(
      after?.verification === 'unreachable' && after.manualInterventions === 2,
      'accepted operator actions are counted',
    );
    assert(
      after.events.filter((e) => e.type === 'manual_intervention').length === 2,
      'each operator action is logged as an event',
    );
  } finally {
    delete process.env.DEMO_MODE;
  }
}

async function main() {
  const { setVerifierLauncher } = await import('../lib/server/verifier');
  // No test may start a real Verifier agent.
  setVerifierLauncher({
    mode: 'browser',
    start: async () => ({ agentId: 'mock-verifier-id' }),
  });

  await verifyGenerateAgoraTokenRoute();
  await verifyGenerateAgoraTokenReplacesZeroUid();
  await verifyChatCompletionsMissingEnv();
  await verifyChatCompletionsInvalidJson();
  await verifyChatCompletionsSseDone();
  await verifyInviteAgentValidation();
  await verifyInviteAgentSuccess();
  await verifyStopConversationValidation();
  await verifyStopConversationSuccess();
  await verifyGrandmaToolDefinitions();
  await verifyToolRoutes();
  await verifyInviteAgentRegistersSession();
  await verifyKeywordScorerAndPolicy();
  await verifyTranscriptAndStateRoutes();
  await verifyVerifierFlow();
  await verifyScenariosTrailAndDemo();

  console.log('API contract checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
