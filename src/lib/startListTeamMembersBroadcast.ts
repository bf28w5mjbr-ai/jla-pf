const CHANNEL_PREFIX = "jla-pf:start-list:team-members:";

export function startListTeamMembersChannelName(competitionId: string): string {
  return `${CHANNEL_PREFIX}${competitionId}`;
}

export function notifyStartListTeamMembersChanged(competitionId: string): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(startListTeamMembersChannelName(competitionId));
    channel.postMessage({ type: "team-members-changed" as const });
    channel.close();
  } catch {
    // BroadcastChannel 非対応・ポリシー制限時は no-op（ポーリングにフォールバック）
  }
}

export function subscribeStartListTeamMembersChanged(
  competitionId: string,
  onChanged: () => void
): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(startListTeamMembersChannelName(competitionId));
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === "team-members-changed") onChanged();
    };
  } catch {
    return () => undefined;
  }

  return () => {
    channel?.close();
    channel = null;
  };
}
