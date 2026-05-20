import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Lifesaving certification graph definition (v1).
 * Kept explicit so UI/filter logic can evolve from the same source data.
 */
const instructorGlobalConditions = [
  "physically and mentally fit",
  "complies with JLA regulations",
  "valid certifications held",
  "has contributed or can contribute to lifesaving activities",
  "medical check within 1 year",
];

const instructorCertificationRules = [
  "only BLS held: at least one renewal",
  "multiple certifications held: at least 1 year since last certification",
];

const instructorEvaluation = ["written exam", "practical exam", "interview"];

const certifications = [
  {
    name: "選手登録",
    domain: "PlayerRegistration",
    level: "Registration",
    minAge: null,
    prerequisites: [],
    prerequisiteExpression: "",
    next: [],
    requiresExpiry: true,
    validityMonths: 12,
  },
  {
    name: "BLS",
    domain: "Foundation",
    level: "Base",
    minAge: 12,
    prerequisites: [],
    prerequisiteExpression: "",
    next: ["All Certifications"],
    requiresExpiry: false,
    validityMonths: null,
  },
  {
    name: "WaterSafety",
    domain: "Foundation",
    level: "Base",
    minAge: 12,
    prerequisites: [],
    prerequisiteExpression: "",
    next: ["All Certifications"],
    requiresExpiry: false,
    validityMonths: null,
  },
  {
    name: "BasicSurfLifesaver",
    domain: "Surf",
    level: "Basic",
    minAge: 15,
    prerequisites: ["BLS", "WaterSafety"],
    prerequisiteExpression: "BLS AND WaterSafety",
    next: ["AdvancedSurfLifesaver"],
    requiresExpiry: true,
    validityMonths: 24,
  },
  {
    name: "AdvancedSurfLifesaver",
    domain: "Surf",
    level: "Advanced",
    minAge: 16,
    prerequisites: ["BasicSurfLifesaver"],
    prerequisiteExpression: "BasicSurfLifesaver",
    next: ["Instructor"],
    requiresExpiry: true,
    validityMonths: 24,
  },
  {
    name: "PoolLifeguard",
    domain: "Pool",
    level: "Basic",
    minAge: 15,
    prerequisites: ["BLS", "WaterSafety"],
    prerequisiteExpression: "BLS AND WaterSafety",
    next: ["AdvancedPoolLifeguard"],
    requiresExpiry: true,
    validityMonths: 24,
  },
  {
    name: "AdvancedPoolLifeguard",
    domain: "Pool",
    level: "Advanced",
    minAge: 18,
    prerequisites: ["PoolLifeguard"],
    prerequisiteExpression: "PoolLifeguard",
    next: ["Instructor"],
    requiresExpiry: true,
    validityMonths: 24,
  },
  {
    name: "IRBCrew",
    domain: "IRB",
    level: "Basic",
    minAge: 18,
    prerequisites: ["BLS", "WaterSafety"],
    prerequisiteExpression: "BLS AND WaterSafety",
    next: ["IRBDriver"],
    requiresExpiry: true,
    validityMonths: 24,
  },
  {
    name: "IRBDriver",
    domain: "IRB",
    level: "Advanced",
    minAge: 19,
    prerequisites: ["IRBCrew"],
    prerequisiteExpression: "IRBCrew",
    next: ["Instructor"],
    requiresExpiry: true,
    validityMonths: 24,
  },
  {
    name: "Leader",
    domain: "Junior",
    level: "Advanced",
    minAge: 15,
    prerequisites: ["BasicSurfLifesaver", "PoolLifeguard"],
    prerequisiteExpression: "BasicSurfLifesaver OR PoolLifeguard",
    next: ["Instructor"],
    requiresExpiry: true,
    validityMonths: 24,
  },
  {
    name: "Instructor",
    domain: "CrossDomain",
    level: "Instructor",
    minAge: 20,
    prerequisites: ["AdvancedSurfLifesaver", "AdvancedPoolLifeguard", "IRBDriver", "Leader"],
    prerequisiteExpression: "AdvancedSurfLifesaver OR AdvancedPoolLifeguard OR IRBDriver OR Leader",
    next: [],
    requiresExpiry: true,
    validityMonths: 24,
  },
  {
    name: "PWRCCrew",
    domain: "PWRC",
    level: "Basic",
    minAge: 18,
    prerequisites: ["BasicSurfLifesaver", "BLS", "WaterSafety"],
    prerequisiteExpression: "BasicSurfLifesaver AND BLS AND WaterSafety",
    next: ["PWRCOperator"],
    requiresExpiry: true,
    validityMonths: 36,
  },
  {
    name: "PWRCOperator",
    domain: "PWRC",
    level: "Advanced",
    minAge: 18,
    prerequisites: ["PWRCCrew", "AdvancedSurfLifesaver"],
    prerequisiteExpression: "PWRCCrew AND AdvancedSurfLifesaver",
    next: ["PWRCAssistantInstructor"],
    requiresExpiry: false,
    validityMonths: null,
  },
  {
    name: "PWRCAssistantInstructor",
    domain: "PWRC",
    level: "Instructor-Assistant",
    minAge: 20,
    prerequisites: ["PWRCOperator"],
    prerequisiteExpression: "PWRCOperator",
    next: ["PWRCInstructor"],
    requiresExpiry: false,
    validityMonths: null,
  },
  {
    name: "PWRCInstructor",
    domain: "PWRC",
    level: "Instructor",
    minAge: 20,
    prerequisites: ["PWRCAssistantInstructor"],
    prerequisiteExpression: "PWRCAssistantInstructor",
    next: [],
    requiresExpiry: false,
    validityMonths: null,
  },
  {
    name: "RefereeC",
    domain: "Referee",
    level: "Entry",
    minAge: 16,
    prerequisites: [],
    prerequisiteExpression: "",
    next: ["RefereeB"],
    requiresExpiry: false,
    validityMonths: null,
  },
  {
    name: "RefereeB",
    domain: "Referee",
    level: "Intermediate",
    minAge: null,
    prerequisites: ["RefereeC"],
    prerequisiteExpression: "RefereeC",
    next: ["RefereeA"],
    requiresExpiry: false,
    validityMonths: null,
  },
  {
    name: "RefereeA",
    domain: "Referee",
    level: "Advanced",
    minAge: null,
    prerequisites: ["RefereeB"],
    prerequisiteExpression: "RefereeB",
    next: ["RefereeS"],
    requiresExpiry: false,
    validityMonths: null,
  },
  {
    name: "RefereeS",
    domain: "Referee",
    level: "Top",
    minAge: null,
    prerequisites: ["RefereeA"],
    prerequisiteExpression: "RefereeA",
    next: [],
    requiresExpiry: false,
    validityMonths: null,
  },
  {
    name: "BLSAssistantInstructor",
    domain: "BLS",
    level: "AssistantInstructor",
    minAge: 20,
    prerequisites: ["BLS"],
    prerequisiteExpression: "BLS",
    next: ["BLSInstructor"],
    requiresExpiry: true,
    validityMonths: 36,
    nonCertificationRequirements: ["can demonstrate BLS skills"],
    trainingHours: 28,
  },
  {
    name: "BLSInstructor",
    domain: "BLS",
    level: "Instructor",
    minAge: 20,
    prerequisites: ["BLSAssistantInstructor"],
    prerequisiteExpression: "BLSAssistantInstructor",
    next: [],
    requiresExpiry: true,
    validityMonths: 36,
  },
  {
    name: "WaterSafetyAssistantInstructor",
    domain: "WaterSafety",
    level: "AssistantInstructor",
    minAge: 20,
    prerequisites: ["WaterSafety", "BasicSurfLifesaver", "PoolLifeguard", "BLSAssistantInstructor"],
    prerequisiteExpression:
      "WaterSafety AND (BasicSurfLifesaver OR PoolLifeguard) AND BLSAssistantInstructor",
    next: ["WaterSafetyInstructor"],
    requiresExpiry: true,
    validityMonths: 36,
    nonCertificationRequirements: ["experience in rescue or instruction (>=1 year)"],
    trainingHours: 14,
  },
  {
    name: "WaterSafetyInstructor",
    domain: "WaterSafety",
    level: "Instructor",
    minAge: 20,
    prerequisites: ["WaterSafetyAssistantInstructor"],
    prerequisiteExpression: "WaterSafetyAssistantInstructor",
    next: [],
    requiresExpiry: true,
    validityMonths: 36,
  },
  {
    name: "SurfAssistantInstructor",
    domain: "Surf",
    level: "AssistantInstructor",
    minAge: 20,
    prerequisites: ["AdvancedSurfLifesaver", "WaterSafetyAssistantInstructor"],
    prerequisiteExpression: "AdvancedSurfLifesaver AND WaterSafetyAssistantInstructor",
    next: ["SurfInstructor"],
    requiresExpiry: true,
    validityMonths: 36,
    nonCertificationRequirements: ["practical rescue experience"],
    trainingHours: 21,
  },
  {
    name: "SurfInstructor",
    domain: "Surf",
    level: "Instructor",
    minAge: 20,
    prerequisites: ["SurfAssistantInstructor"],
    prerequisiteExpression: "SurfAssistantInstructor",
    next: [],
    requiresExpiry: true,
    validityMonths: 36,
  },
  {
    name: "PoolAssistantInstructor",
    domain: "Pool",
    level: "AssistantInstructor",
    minAge: 20,
    prerequisites: ["AdvancedPoolLifeguard", "WaterSafetyAssistantInstructor"],
    prerequisiteExpression: "AdvancedPoolLifeguard AND WaterSafetyAssistantInstructor",
    next: ["PoolInstructor"],
    requiresExpiry: true,
    validityMonths: 36,
    nonCertificationRequirements: ["practical pool rescue experience"],
    trainingHours: 21,
  },
  {
    name: "PoolInstructor",
    domain: "Pool",
    level: "Instructor",
    minAge: 20,
    prerequisites: ["PoolAssistantInstructor"],
    prerequisiteExpression: "PoolAssistantInstructor",
    next: [],
    requiresExpiry: true,
    validityMonths: 36,
  },
  {
    name: "IRBAssistantInstructor",
    domain: "IRB",
    level: "AssistantInstructor",
    minAge: 20,
    prerequisites: ["IRBDriver", "WaterSafetyAssistantInstructor"],
    prerequisiteExpression: "IRBDriver AND WaterSafetyAssistantInstructor",
    next: ["IRBInstructor"],
    requiresExpiry: true,
    validityMonths: 36,
    nonCertificationRequirements: ["IRB operational experience"],
    trainingHours: 14,
  },
  {
    name: "IRBInstructor",
    domain: "IRB",
    level: "Instructor",
    minAge: 20,
    prerequisites: ["IRBAssistantInstructor"],
    prerequisiteExpression: "IRBAssistantInstructor",
    next: [],
    requiresExpiry: true,
    validityMonths: 36,
  },
  {
    name: "JuniorAssistantInstructor",
    domain: "Junior",
    level: "AssistantInstructor",
    minAge: 20,
    prerequisites: ["Leader", "WaterSafetyAssistantInstructor"],
    prerequisiteExpression: "Leader AND WaterSafetyAssistantInstructor",
    next: ["JuniorInstructor"],
    requiresExpiry: true,
    validityMonths: 36,
    nonCertificationRequirements: ["junior instruction experience"],
    trainingHours: 14,
  },
  {
    name: "JuniorInstructor",
    domain: "Junior",
    level: "Instructor",
    minAge: 20,
    prerequisites: ["JuniorAssistantInstructor"],
    prerequisiteExpression: "JuniorAssistantInstructor",
    next: [],
    requiresExpiry: true,
    validityMonths: 36,
  },
];

const categoryMeta = {
  PlayerRegistration: "大会参加・選手登録（全選手が申請可能）",
  Foundation: "基礎資格（全領域の前提）",
  Surf: "サーフ領域",
  Pool: "プール領域",
  IRB: "IRB領域",
  Junior: "ジュニア領域",
  CrossDomain: "領域横断資格",
  PWRC: "PWRC領域（水上オートバイ救助）",
  Referee: "競技審判領域",
  BLS: "BLS指導者領域",
  WaterSafety: "ウォーターセーフティ指導者領域",
};

function buildHumanDescription(cert) {
  const lines = [];
  if (cert.level === "AssistantInstructor" || cert.level === "Instructor") {
    lines.push(`Instructor requirements include: ${instructorGlobalConditions.join(" | ")}`);
    lines.push(`Certification rules: ${instructorCertificationRules.join(" | ")}`);
    lines.push(`Evaluation: ${instructorEvaluation.join(" | ")}`);
  }
  if (Array.isArray(cert.nonCertificationRequirements) && cert.nonCertificationRequirements.length > 0) {
    lines.push(`Additional requirements: ${cert.nonCertificationRequirements.join(" | ")}`);
  }
  if (typeof cert.trainingHours === "number") {
    lines.push(`Training hours: ${cert.trainingHours}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

async function ensureCategoryMap() {
  const map = new Map();
  for (const [name, description] of Object.entries(categoryMeta)) {
    const existing = await prisma.qualificationCategory.findFirst({
      where: { name },
      select: { id: true },
    });
    if (existing) {
      map.set(name, existing.id);
      continue;
    }
    const created = await prisma.qualificationCategory.create({
      data: { name, description },
      select: { id: true },
    });
    map.set(name, created.id);
  }
  return map;
}

async function seedTemplates() {
  const categoryIdByName = await ensureCategoryMap();

  for (const cert of certifications) {
    const existing = await prisma.qualificationTemplate.findFirst({
      where: { kind: cert.name },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    const data = {
      categoryId: categoryIdByName.get(cert.domain) ?? null,
      kind: cert.name,
      name: cert.name,
      description: buildHumanDescription(cert),
      requiresExpiry: cert.requiresExpiry,
      validityMonths: cert.validityMonths,
      domain: cert.domain,
      level: cert.level,
      minAge: cert.minAge,
      prerequisiteExpression: cert.prerequisiteExpression || null,
      prerequisiteKinds: cert.prerequisites,
      nextKinds: cert.next,
    };

    if (existing) {
      await prisma.qualificationTemplate.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.qualificationTemplate.create({ data });
    }
  }
}

async function main() {
  await seedTemplates();
  const count = await prisma.qualificationTemplate.count();
  console.log(`Seed complete: qualificationTemplate=${count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
