type ParsedTemplateMeta = {
  domain: string | null;
  level: string | null;
  minAge: number | null;
  prerequisiteExpression: string | null;
  nextKinds: string[];
};

type QualificationTemplateMetaSource = {
  description?: string | null;
  domain?: string | null;
  level?: string | null;
  minAge?: number | null;
  prerequisiteExpression?: string | null;
  nextKinds?: string[] | readonly string[] | null;
};

const LEGACY_TEMPLATE_META_LINE_PREFIXES = [
  "Domain:",
  "Level:",
  "MinAge:",
  "Prerequisites:",
  "Next:",
  "GlobalMinAge:",
  "GlobalConditions:",
  "CertificationRules:",
  "Evaluation:",
  "NonCertificationRequirements:",
  "TrainingHours:",
];

export function normalizeQualificationKind(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-./()（）・]+/g, "");
}

/** @deprecated QualificationTemplate の構造化カラムを正とする。旧 description メタ移行用のみ。 */
export function parseQualificationTemplateMeta(
  description: string | null | undefined
): ParsedTemplateMeta {
  if (!description) {
    return {
      domain: null,
      level: null,
      minAge: null,
      prerequisiteExpression: null,
      nextKinds: [],
    };
  }

  const lines = description.split("\n").map((line) => line.trim());
  const pick = (prefix: string) =>
    lines.find((line) => line.toLowerCase().startsWith(prefix.toLowerCase())) ?? null;

  const domainLine = pick("Domain:");
  const levelLine = pick("Level:");
  const minAgeLine = pick("MinAge:");
  const prerequisitesLine = pick("Prerequisites:");
  const nextLine = pick("Next:");

  const domain = domainLine ? domainLine.replace(/^Domain:\s*/i, "").trim() : null;
  const level = levelLine ? levelLine.replace(/^Level:\s*/i, "").trim() : null;
  const minAgeRaw = minAgeLine ? minAgeLine.replace(/^MinAge:\s*/i, "").trim() : "";
  const minAge = /^\d+$/.test(minAgeRaw) ? Number(minAgeRaw) : null;
  const prerequisiteRaw = prerequisitesLine
    ? prerequisitesLine.replace(/^Prerequisites:\s*/i, "").trim()
    : "";
  const prerequisiteExpression =
    prerequisiteRaw && prerequisiteRaw.toLowerCase() !== "none" ? prerequisiteRaw : null;
  const nextRaw = nextLine ? nextLine.replace(/^Next:\s*/i, "").trim() : "";
  const nextKinds =
    nextRaw && nextRaw.toLowerCase() !== "none"
      ? nextRaw
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : [];

  return { domain, level, minAge, prerequisiteExpression, nextKinds };
}

function nonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveQualificationTemplateMeta(
  template: QualificationTemplateMetaSource
): ParsedTemplateMeta {
  const nextKinds = Array.isArray(template.nextKinds)
    ? template.nextKinds.map((value) => value.trim()).filter((value) => value.length > 0)
    : [];

  return {
    domain: nonEmptyString(template.domain),
    level: nonEmptyString(template.level),
    minAge: typeof template.minAge === "number" ? template.minAge : null,
    prerequisiteExpression: nonEmptyString(template.prerequisiteExpression),
    nextKinds,
  };
}

export function stripLegacyQualificationTemplateMetaLines(
  description: string | null | undefined
): string | null {
  if (!description) return null;
  const lines = description
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      return !LEGACY_TEMPLATE_META_LINE_PREFIXES.some((prefix) =>
        line.toLowerCase().startsWith(prefix.toLowerCase())
      );
    });
  return lines.length > 0 ? lines.join("\n") : null;
}

export function isQualificationExpired(expiryDate: Date | null | undefined): boolean {
  if (!expiryDate) return false;
  return expiryDate.getTime() < Date.now();
}

export function evaluatePrerequisiteExpression(
  expression: string,
  hasKind: (kind: string) => boolean
): boolean {
  const tokens = expression.match(/\(|\)|AND|OR|[A-Za-z0-9_]+/gi) ?? [];
  let index = 0;

  function peek(): string | null {
    return index < tokens.length ? tokens[index]! : null;
  }

  function consume(): string {
    const token = tokens[index];
    index += 1;
    return token ?? "";
  }

  function parseFactor(): boolean {
    const token = peek();
    if (!token) return false;
    if (token === "(") {
      consume();
      const value = parseOr();
      if (peek() === ")") consume();
      return value;
    }
    if (/^(AND|OR)$/i.test(token)) {
      consume();
      return false;
    }
    consume();
    return hasKind(token);
  }

  function parseAnd(): boolean {
    let value = parseFactor();
    while (peek() && /^AND$/i.test(peek()!)) {
      consume();
      value = value && parseFactor();
    }
    return value;
  }

  function parseOr(): boolean {
    let value = parseAnd();
    while (peek() && /^OR$/i.test(peek()!)) {
      consume();
      value = value || parseAnd();
    }
    return value;
  }

  const result = parseOr();
  return result;
}
