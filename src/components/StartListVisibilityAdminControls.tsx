import { StartListPublicToggleButton } from "@/components/StartListPublicToggleButton";

type Props = {
  canManage: boolean;
  organizationId: string;
  competitionId: string;
  initialVisible: boolean;
};

/**
 * スタートリスト全体の公開／非公開トグル（主催 org 管理者のみ）。
 * サーバー側で canManage を検証してからクライアントボタンをマウントする。
 */
export function StartListVisibilityAdminControls({
  canManage,
  organizationId,
  competitionId,
  initialVisible,
}: Props) {
  if (!canManage) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/15 px-2 py-1.5 sm:px-2.5">
      <span className="max-w-[10rem] text-[11px] leading-tight text-muted-foreground sm:max-w-none">
        スタートリスト全体
      </span>
      <StartListPublicToggleButton
        canManage
        organizationId={organizationId}
        competitionId={competitionId}
        initialVisible={initialVisible}
      />
    </div>
  );
}
