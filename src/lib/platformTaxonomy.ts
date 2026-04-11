export const PLATFORM_ROLE_SEGMENTS = {
  INDIVIDUAL: "INDIVIDUAL",
  CLUB: "CLUB",
  ORGANIZER: "ORGANIZER",
  ASSOCIATION: "ASSOCIATION",
} as const;

export type PlatformRoleSegment =
  (typeof PLATFORM_ROLE_SEGMENTS)[keyof typeof PLATFORM_ROLE_SEGMENTS];

export const PLATFORM_FEATURE_SEGMENTS = {
  COMPETITION: "COMPETITION",
  QUALIFICATION: "QUALIFICATION",
  CAREER: "CAREER",
} as const;

export type PlatformFeatureSegment =
  (typeof PLATFORM_FEATURE_SEGMENTS)[keyof typeof PLATFORM_FEATURE_SEGMENTS];

export const PLATFORM_ROLE_SEGMENT_LABELS: Record<PlatformRoleSegment, string> = {
  INDIVIDUAL: "個人",
  CLUB: "クラブ",
  ORGANIZER: "大会開催者",
  ASSOCIATION: "協会",
};

export const PLATFORM_FEATURE_SEGMENT_LABELS: Record<
  PlatformFeatureSegment,
  string
> = {
  COMPETITION: "大会",
  QUALIFICATION: "資格講習",
  CAREER: "キャリア",
};

export const PLATFORM_OPERATOR_ROLES = {
  PF_ADMIN: "PF_ADMIN",
} as const;

export type PlatformOperatorRole =
  (typeof PLATFORM_OPERATOR_ROLES)[keyof typeof PLATFORM_OPERATOR_ROLES];

export type RoleLike =
  | "USER"
  | "ORG_ADMIN"
  | PlatformOperatorRole
  | string;

export function derivePlatformRoleSegments(input: {
  userRole?: RoleLike;
  isClubAdmin?: boolean;
  isAssociationAdmin?: boolean;
  organizationCount?: number;
}): PlatformRoleSegment[] {
  const { userRole, isClubAdmin = false, isAssociationAdmin = false, organizationCount = 0 } = input;
  const segments = new Set<PlatformRoleSegment>([PLATFORM_ROLE_SEGMENTS.INDIVIDUAL]);

  if (isClubAdmin) {
    segments.add(PLATFORM_ROLE_SEGMENTS.CLUB);
  }

  if (organizationCount > 0 || userRole === "ORG_ADMIN") {
    segments.add(PLATFORM_ROLE_SEGMENTS.ORGANIZER);
  }

  if (isAssociationAdmin) {
    segments.add(PLATFORM_ROLE_SEGMENTS.ASSOCIATION);
  }

  if (userRole === "PF_ADMIN") {
    segments.add(PLATFORM_ROLE_SEGMENTS.ORGANIZER);
    segments.add(PLATFORM_ROLE_SEGMENTS.ASSOCIATION);
  }

  return Array.from(segments);
}
