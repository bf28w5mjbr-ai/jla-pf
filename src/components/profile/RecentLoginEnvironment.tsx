import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { maskIpForDisplay, truncateUserAgent } from "@/lib/securityDisplay";

type Props = {
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  lastLoginUa: string | null;
};

export default function RecentLoginEnvironment({
  lastLoginAt,
  lastLoginIp,
  lastLoginUa,
}: Props) {
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>最近のログイン環境</CardTitle>
        <CardDescription>
          最後に成功したログイン時に記録された情報です（端末・ブラウザの目安。厳密なデバイス指紋ではありません）。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
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
      </CardContent>
    </Card>
  );
}
