/**
 * Stripe ダッシュボード返金を EntryCheckoutSession.payload に同期する。
 *
 *   pnpm exec tsx --env-file=.env scripts/reconcile-competition-stripe-refunds.ts <competitionId>
 *   pnpm exec tsx --env-file=.env scripts/reconcile-competition-stripe-refunds.ts <competitionId> --dry-run
 */
import { reconcileCompetitionEntryCheckoutRefundsFromStripe } from "../src/lib/entryCheckoutStripeRefund";
import { prisma } from "../src/server/db";

async function main() {
  const competitionId = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  if (!competitionId) {
    console.error("Usage: tsx scripts/reconcile-competition-stripe-refunds.ts <competitionId> [--dry-run]");
    process.exit(1);
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { id: true, name: true },
  });
  if (!competition) {
    console.error("Competition not found:", competitionId);
    process.exit(1);
  }

  console.log(`Competition: ${competition.name} (${competition.id})`);
  if (dryRun) {
    const count = await prisma.entryCheckoutSession.count({
      where: {
        competitionId,
        stripePaymentIntentId: { not: null },
        status: { in: ["COMPLETED", "DISPUTED", "DISPUTE_LOST"] },
      },
    });
    console.log(`Would scan ${count} checkout session(s) via Stripe API.`);
    return;
  }

  const result = await reconcileCompetitionEntryCheckoutRefundsFromStripe(competitionId);
  console.log(`Scanned ${result.scanned} payment intent(s), updated ${result.updated} session(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
