'use client';

import AgoraRTC, { AgoraRTCProvider } from 'agora-rtc-react';

type RtcClient = ReturnType<typeof AgoraRTC.createClient>;

// One RTC client per page load, created lazily. A module-level singleton survives StrictMode's
// simulated unmount/remount (useMemo would create two clients). This module is only loaded in the
// browser, via next/dynamic({ ssr: false }).
let rtcClient: RtcClient | undefined;
function getRtcClient(): RtcClient {
  rtcClient ??= AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
  return rtcClient;
}

// The AgoraVoiceAI toolkit is initialized inside ConversationComponent after the RTC join
// succeeds, so this wrapper only needs to provide the RTC client.
export default function AgoraProvider({ children }: { children: React.ReactNode }) {
  return <AgoraRTCProvider client={getRtcClient()}>{children}</AgoraRTCProvider>;
}
