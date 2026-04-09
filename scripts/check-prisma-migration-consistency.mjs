import { execSync } from "node:child_process";

function sh(command) {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function getChangedFiles() {
  const baseRef = process.env.GITHUB_BASE_REF;
  const beforeSha = process.env.GITHUB_EVENT_BEFORE;
  const currentSha = process.env.GITHUB_SHA;

  try {
    if (baseRef) {
      const range = `origin/${baseRef}...HEAD`;
      return sh(`git diff --name-only ${range}`)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (beforeSha && currentSha && beforeSha !== "0000000000000000000000000000000000000000") {
      return sh(`git diff --name-only ${beforeSha} ${currentSha}`)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {
    // fall through to local fallback
  }

  try {
    return sh("git diff --name-only HEAD~1...HEAD")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const files = getChangedFiles();
const schemaChanged = files.includes("prisma/schema.prisma");
const migrationChanged = files.some((f) =>
  /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(f)
);

if (schemaChanged && !migrationChanged) {
  console.error(
    "Migration gate failed: prisma/schema.prisma changed without a matching migration SQL file under prisma/migrations/*/migration.sql."
  );
  process.exit(1);
}

if (migrationChanged && !schemaChanged) {
  console.warn(
    "Migration gate warning: migration SQL changed without prisma/schema.prisma update. Ensure this is intentional."
  );
}

console.log("Migration gate passed.");
