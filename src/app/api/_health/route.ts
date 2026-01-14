export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db";

export async function GET() {
  // 軽いクエリ（SELECT 1 相当）
  await prisma.$queryRaw`SELECT 1`;
  return NextResponse.json({ ok: true });
}
