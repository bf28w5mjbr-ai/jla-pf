#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "fs/promises";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "public-assets";
const workspaceRoot = process.cwd();
const uploadsRoot = path.join(workspaceRoot, "public", "uploads");
const dryRun = process.argv.includes("--dry-run");

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const prisma = new PrismaClient();
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const p = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(p) : p;
    })
  );
  return files.flat();
}

function toObjectKey(absPath) {
  const rel = path.relative(path.join(workspaceRoot, "public"), absPath);
  const normalized = rel.split(path.sep).join("/").replace(/^uploads\//, "");
  return normalized
    .split("/")
    .map((part) => part.replace(/[^\w.\-/]/g, "_"))
    .join("/");
}

function buildPublicUrl(objectKey) {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectKey}`;
}

async function uploadLocalFiles() {
  const files = await walk(uploadsRoot);
  const mapping = new Map();
  for (const absPath of files) {
    const objectKey = toObjectKey(absPath);
    const bytes = await readFile(absPath);
    const newUrl = buildPublicUrl(objectKey);
    const oldUrl = `/${path.relative(path.join(workspaceRoot, "public"), absPath).split(path.sep).join("/")}`;
    mapping.set(oldUrl, newUrl);

    if (dryRun) continue;
    const { error } = await supabase.storage.from(bucket).upload(objectKey, bytes, {
      upsert: true,
      cacheControl: "3600",
    });
    if (error) {
      console.error(`upload failed: ${objectKey} -> ${error.message}`);
    } else {
      console.log(`uploaded: ${objectKey}`);
    }
  }
  return mapping;
}

async function updateDbUrls(mapping) {
  const convert = (v) => (typeof v === "string" && mapping.has(v) ? mapping.get(v) : v);

  const orgs = await prisma.organization.findMany({ select: { id: true, logoUrl: true } });
  for (const row of orgs) {
    const next = convert(row.logoUrl);
    if (next && next !== row.logoUrl && !dryRun) {
      await prisma.organization.update({ where: { id: row.id }, data: { logoUrl: next } });
    }
  }

  const clubs = await prisma.club.findMany({ select: { id: true, logoUrl: true } });
  for (const row of clubs) {
    const next = convert(row.logoUrl);
    if (next && next !== row.logoUrl && !dryRun) {
      await prisma.club.update({ where: { id: row.id }, data: { logoUrl: next } });
    }
  }

  const users = await prisma.user.findMany({ select: { id: true, profilePhotoUrl: true } });
  for (const row of users) {
    const next = convert(row.profilePhotoUrl);
    if (next && next !== row.profilePhotoUrl && !dryRun) {
      await prisma.user.update({ where: { id: row.id }, data: { profilePhotoUrl: next } });
    }
  }

  const attachments = await prisma.competitionAttachment.findMany({ select: { id: true, fileUrl: true } });
  for (const row of attachments) {
    const next = convert(row.fileUrl);
    if (next && next !== row.fileUrl && !dryRun) {
      await prisma.competitionAttachment.update({ where: { id: row.id }, data: { fileUrl: next } });
    }
  }

  const competitions = await prisma.competition.findMany({
    select: { id: true, cooperatorsLogos: true, grantsLogos: true },
  });
  for (const row of competitions) {
    const convLogos = (logos) =>
      Array.isArray(logos)
        ? logos.map((x) =>
            x && typeof x === "object" && typeof x.logoUrl === "string" && mapping.has(x.logoUrl)
              ? { ...x, logoUrl: mapping.get(x.logoUrl) }
              : x
          )
        : logos;

    const newCoop = convLogos(row.cooperatorsLogos);
    const newGrant = convLogos(row.grantsLogos);
    const changed =
      JSON.stringify(newCoop) !== JSON.stringify(row.cooperatorsLogos) ||
      JSON.stringify(newGrant) !== JSON.stringify(row.grantsLogos);

    if (changed && !dryRun) {
      await prisma.competition.update({
        where: { id: row.id },
        data: { cooperatorsLogos: newCoop, grantsLogos: newGrant },
      });
    }
  }
}

async function main() {
  console.log(dryRun ? "Running DRY RUN..." : "Running migration...");
  const mapping = await uploadLocalFiles();
  console.log(`mapped files: ${mapping.size}`);
  await updateDbUrls(mapping);
  console.log("done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

