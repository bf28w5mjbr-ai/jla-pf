#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { readdir, rm } from "fs/promises";
import path from "path";

const prisma = new PrismaClient();
const workspaceRoot = process.cwd();
const uploadsRoot = path.join(workspaceRoot, "public", "uploads");
const dryRun = process.argv.includes("--dry-run");

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

async function collectReferencedLocalPaths() {
  const refs = new Set();
  const keep = (v) => {
    if (typeof v === "string" && v.startsWith("/uploads/")) refs.add(v);
  };

  const orgs = await prisma.organization.findMany({ select: { logoUrl: true } });
  orgs.forEach((r) => keep(r.logoUrl));

  const clubs = await prisma.club.findMany({ select: { logoUrl: true } });
  clubs.forEach((r) => keep(r.logoUrl));

  const users = await prisma.userProfile.findMany({ select: { profilePhotoUrl: true } });
  users.forEach((r) => keep(r.profilePhotoUrl));

  const atts = await prisma.competitionAttachment.findMany({ select: { fileUrl: true } });
  atts.forEach((r) => keep(r.fileUrl));

  const comps = await prisma.competition.findMany({
    select: { cooperatorsLogos: true, grantsLogos: true },
  });
  for (const c of comps) {
    const scan = (logos) => {
      if (!Array.isArray(logos)) return;
      for (const row of logos) {
        if (row && typeof row === "object" && typeof row.logoUrl === "string") {
          keep(row.logoUrl);
        }
      }
    };
    scan(c.cooperatorsLogos);
    scan(c.grantsLogos);
  }

  return refs;
}

async function main() {
  const referenced = await collectReferencedLocalPaths();
  const files = await walk(uploadsRoot);
  const deletable = [];

  for (const absPath of files) {
    const rel = "/" + path.relative(path.join(workspaceRoot, "public"), absPath).split(path.sep).join("/");
    if (!referenced.has(rel)) deletable.push(absPath);
  }

  console.log(`total files: ${files.length}`);
  console.log(`referenced local files: ${referenced.size}`);
  console.log(`deletable files: ${deletable.length}`);

  if (dryRun) {
    deletable.forEach((p) => console.log(`[dry-run] delete ${p}`));
    return;
  }

  for (const p of deletable) {
    await rm(p, { force: true });
    console.log(`deleted ${p}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

