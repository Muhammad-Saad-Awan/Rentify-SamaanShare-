// ============================================================================
// SamaanShare - grant the administrator role
// ============================================================================
// THE BOOTSTRAP PROBLEM THIS SOLVES. Every route under /admin is gated by
// `requireAdmin()`, and the role can only be changed from the members screen -
// which is itself under /admin. With no administrator in the database, nothing
// in the admin area is reachable by anybody, including the control that would
// fix it. As of 18 August 2026 this database had zero.
//
// WHY THIS IS A SCRIPT AND NOT A PAGE. The obvious alternative is to let the
// first promotion happen through the UI when no administrator exists yet. That
// means shipping a web path that grants administrator rights based on a row
// count - a condition that is wrong once, briefly, and catastrophically, and
// that exists in production forever to guard against a state which occurs once.
// Running this requires database credentials, which is the correct bar.
//
// WHAT IT RECORDS. An AdminAction row with a NULL actor. There is no
// administrator to attribute the first grant to - that is the whole problem -
// and recording a fiction would be worse than recording the gap. This is the
// only thing in the codebase that writes a null actor.
//
// DRY RUN BY DEFAULT, like cleanup:uploads and clean:demo. Granting is not
// destructive, but it is the most consequential change available, so it should
// not be one typo away.
//
//   npm run admin:grant -- someone@example.com            # report only
//   npm run admin:grant -- someone@example.com --confirm  # apply
// ============================================================================

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  AdminActionType,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/enums";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const args = process.argv.slice(2);
const shouldApply = args.includes("--confirm");
const email = args
  .find((arg) => !arg.startsWith("--"))
  ?.trim()
  .toLowerCase();

async function main() {
  if (!email) {
    console.log(
      "\nUsage: npm run admin:grant -- someone@example.com [--confirm]\n"
    );
    process.exitCode = 1;

    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      deletedAt: true,
    },
  });

  if (!user) {
    console.log(`\nNo account with the address ${email}.`);
    console.log("The person must register first; this only changes a role.\n");
    process.exitCode = 1;

    return;
  }

  const existingAdmins = await prisma.user.count({
    where: {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
  });

  console.log(`\naccount        : ${user.name ?? "(no name)"} <${user.email}>`);
  console.log(`current role   : ${user.role}`);
  console.log(`current status : ${user.status}`);
  console.log(`active admins  : ${existingAdmins}`);

  /**
   * The same rule the in-app action enforces: a suspended or banned account cannot be promoted.
   *
   * Handing administrator rights to an account moderation has acted against is the one combination
   * that turns a moderation mistake into a loss of control - and a script is not a licence to skip
   * the check, it is where skipping it would be least visible.
   */
  if (user.deletedAt) {
    console.log("\nREFUSING: that account has been deleted.\n");
    process.exitCode = 1;

    return;
  }

  if (user.status !== UserStatus.ACTIVE) {
    console.log(
      `\nREFUSING: that account is ${user.status}. Reinstate it first if that is intended.\n`
    );
    process.exitCode = 1;

    return;
  }

  if (user.role === UserRole.ADMIN) {
    console.log("\nAlready an administrator. Nothing to do.\n");

    return;
  }

  if (!shouldApply) {
    console.log("\nDRY RUN. Nothing was changed.");
    console.log(
      `Re-run with --confirm to make ${user.email} an administrator.\n`
    );

    return;
  }

  await prisma.$transaction(async (tx) => {
    // Guarded on the role just read, so a concurrent change is refused rather than overwritten.
    const changed = await tx.user.updateMany({
      where: { id: user.id, role: UserRole.USER, deletedAt: null },
      data: { role: UserRole.ADMIN },
    });

    if (changed.count === 0) {
      throw new Error("That account changed while this was running.");
    }

    await tx.adminAction.create({
      data: {
        // Null: see the header. There is nobody to attribute the first grant to.
        subjectId: user.id,
        type: AdminActionType.CHANGE_ROLE,
        reason:
          existingAdmins === 0
            ? "Bootstrap grant: no administrator existed, applied via scripts/grant-admin.ts."
            : "Granted via scripts/grant-admin.ts by an operator with database access.",
        previousValue: UserRole.USER,
        newValue: UserRole.ADMIN,
      },
    });
  });

  console.log(`\n${user.email} is now an administrator.`);
  console.log(
    "Recorded in admin_actions with no actor - see the script header.\n"
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
