import { prisma } from "@/server/db";

export async function findUserByPhoneCandidates(candidates: string[]) {
  const values = [...new Set(candidates.filter(Boolean))];
  if (values.length === 0) return null;

  return prisma.user.findFirst({
    where: {
      OR: values.map((phoneNumber) => ({ phoneNumber })),
    },
  });
}

export async function findUserByNormalizedNameAndDob(params: {
  normalizedFamilyName: string;
  normalizedGivenName: string;
  dateOfBirth: Date;
}) {
  const { normalizedFamilyName, normalizedGivenName, dateOfBirth } = params;

  return prisma.user.findFirst({
    where: {
      normalizedFamilyName,
      normalizedGivenName,
      dateOfBirth,
    },
  });
}