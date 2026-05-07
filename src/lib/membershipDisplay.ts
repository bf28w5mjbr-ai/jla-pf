/** クラブ・主催団体などで共通利用するメンバー役割の表示名 */
export function membershipRoleLabelJa(role: string): string {
  if (role === "ADMIN") return "管理者";
  if (role === "MEMBER") return "メンバー";
  return role;
}
