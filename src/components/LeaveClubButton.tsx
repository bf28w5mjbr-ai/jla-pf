"use client";

/**
 * 旧「クラブから退会」ボタン。所属解除はクラブ管理者のみ可能となったため、
 * 説明テキストのみ表示する。
 */
export default function LeaveClubButton(_props: { clubId: string; clubName: string }) {
  return (
    <p className="max-w-xl text-xs text-muted-foreground">
      所属の解除はクラブ管理者がメンバー管理から行います。ご自身での退会操作はできません。
    </p>
  );
}
