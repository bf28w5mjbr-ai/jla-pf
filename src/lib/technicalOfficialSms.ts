import { getPublicAppUrl } from "@/lib/appBaseUrl";

/** リンク以外の固定文（SMS 全体は buildTechnicalOfficialInviteSmsMessage で組み立て） */
export function technicalOfficialInviteSmsBodyWithoutLink(params: {
  clubName: string;
  competitionName: string;
}): string {
  return `【Bluvium】テクニカルオフィシャルご協力のお願い

${params.clubName}より、大会「${params.competitionName}」のテクニカルオフィシャルとして
ご協力をお願いしたく、ご連絡申し上げます。

お手数ですが、下記リンクよりお手続きをお願いいたします。`;
}

export function buildTechnicalOfficialInviteUrl(token: string): string {
  const base = getPublicAppUrl().replace(/\/$/, "");
  return `${base}/invite/technical-official/${encodeURIComponent(token)}`;
}

export function buildTechnicalOfficialInviteSmsMessage(params: {
  clubName: string;
  competitionName: string;
  token: string;
}): string {
  const body = technicalOfficialInviteSmsBodyWithoutLink(params);
  const url = buildTechnicalOfficialInviteUrl(params.token);
  return `${body}\n\n${url}`;
}
