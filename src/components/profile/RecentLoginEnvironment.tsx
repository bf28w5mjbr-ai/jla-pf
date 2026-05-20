import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LoginEventRead } from "@/lib/userSecurity";
import { authLoginChannelLabel } from "@/lib/userSecurity";
import { maskIpForDisplay, truncateUserAgent } from "@/lib/securityDisplay";

type Props = {
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  lastLoginUa: string | null;
  recentEvents?: LoginEventRead[];
};

export default function RecentLoginEnvironment({
  lastLoginAt,
  lastLoginIp,
  lastLoginUa,
  recentEvents = [],
}: Props) {
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>最近のログイン環境</CardTitle>
        <CardDescription>
          最後に成功したログイン時に記録された情報です（端末・ブラウザの目安。厳密なデバイス指紋ではありません）。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-2">
          <p>
            <span className="text-muted-foreground">日時: </span>
            {lastLoginAt
              ? lastLoginAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
              : "まだ記録がありません"}
          </p>
          <p>
            <span className="text-muted-foreground">IP（マスク）: </span>
            {maskIpForDisplay(lastLoginIp)}
          </p>
          <p className="break-all">
            <span className="text-muted-foreground">ブラウザ情報: </span>
            {truncateUserAgent(lastLoginUa, 200)}
          </p>
        </div>

        {recentEvents.length > 0 ? (
          <div className="border-t border-border/80 pt-4">
            <p className="mb-3 text-xs font-medium text-muted-foreground">直近のログイン履歴</p>
            <ul className="space-y-3">
              {recentEvents.map((e) => (
                <li
                  key={e.id}
                  className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5"
                >
                  <p className="text-xs text-muted-foreground">
                    {e.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                    <span className="ml-2">{authLoginChannelLabel(e.channel)}</span>
                  </p>
                  <p className="mt-1">
                    <span className="text-muted-foreground">IP: </span>
                    {maskIpForDisplay(e.ipAddress)}
                  </p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {truncateUserAgent(e.userAgent, 120)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
