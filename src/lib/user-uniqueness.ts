import { prisma } from "@/server/db";

export async function findUserByNormalizedNameAndDob(params: {
  normalizedFamilyName: string;
  normalizedGivenName: string;
  dateOfBirth: Date;
}) {
  const { normalizedFamilyName, normalizedGivenName, dateOfBirth } = params;

  return prisma.user.findFirst({
    where: {
      profile: {
        is: {
          normalizedFamilyName,
          normalizedGivenName,
          dateOfBirth,
        },
      },
    },
  });
}