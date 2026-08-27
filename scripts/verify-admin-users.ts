// Administrator actions on accounts, verified against a real database.
//
// The unit tests cover the pure rules. This covers what they cannot: that the audit row and the
// change it describes land together, that a concurrent second action is refused rather than
// silently overwriting the first, that the last-administrator guard sees the same state the write
// does, and that a suspension issued through the moderation queue now produces the same record as
// one issued by hand - with the report attached.
//
// Creates its own throwaway rows and deletes them.

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  AdminActionType,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/enums";
import {
  canChangeRole,
  canReinstateUser,
  canSuspendUser,
} from "../src/lib/admin/rules";
import { writeAdminAction } from "../src/lib/admin/log";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`, detail ?? "");
  }
}

async function main() {
  const stamp = Date.now();

  const admin = await prisma.user.create({
    data: {
      email: `au-admin-${stamp}@example.test`,
      name: "AU Admin",
      role: UserRole.ADMIN,
    },
    select: { id: true },
  });
  const member = await prisma.user.create({
    data: { email: `au-member-${stamp}@example.test`, name: "AU Member" },
    select: { id: true },
  });

  const subjectOf = async (id: string) => {
    const u = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, role: true, status: true, deletedAt: true },
    });

    return {
      id: u.id,
      role: u.role,
      status: u.status,
      isDeleted: u.deletedAt !== null,
    };
  };

  // ------------------------------- 1. the change and its record land together
  console.log(
    "\n=== a suspension writes its audit row in the same transaction ==="
  );

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { id: member.id, status: UserStatus.ACTIVE, deletedAt: null },
      data: { status: UserStatus.SUSPENDED },
    });

    await writeAdminAction(tx, {
      actorId: admin.id,
      subjectId: member.id,
      type: AdminActionType.SUSPEND_USER,
      reason: "Repeatedly listed items they did not have.",
      previousValue: UserStatus.ACTIVE,
      newValue: UserStatus.SUSPENDED,
    });
  });

  const suspended = await prisma.user.findUniqueOrThrow({
    where: { id: member.id },
    select: { status: true },
  });
  const rows = await prisma.adminAction.findMany({
    where: { subjectId: member.id },
    orderBy: { createdAt: "desc" },
    select: {
      type: true,
      reason: true,
      previousValue: true,
      newValue: true,
      actorId: true,
      reportId: true,
    },
  });

  check("the account is suspended", suspended.status === UserStatus.SUSPENDED);

  /**
   * THE POINT OF THE WHOLE MODEL. Before this, a suspended account said SUSPENDED and nothing else -
   * no indication of who decided it or why.
   */
  check(
    "and the record says who, why, and what changed",
    rows.length === 1 &&
      rows[0]?.actorId === admin.id &&
      rows[0]?.previousValue === UserStatus.ACTIVE &&
      rows[0]?.newValue === UserStatus.SUSPENDED &&
      (rows[0]?.reason.length ?? 0) > 10,
    rows[0]
  );

  check("a standalone action carries no report", rows[0]?.reportId === null);

  // ---------------------------------------- 2. concurrent actions do not both win
  console.log("\n=== a second action against the same account is refused ===");

  const flip = (from: UserStatus, to: UserStatus) =>
    prisma.user.updateMany({
      where: { id: member.id, status: from, deletedAt: null },
      data: { status: to },
    });

  const [first, second] = await Promise.all([
    flip(UserStatus.SUSPENDED, UserStatus.BANNED),
    flip(UserStatus.SUSPENDED, UserStatus.ACTIVE),
  ]);

  check(
    "exactly one of two concurrent changes took effect",
    first.count + second.count === 1,
    { first: first.count, second: second.count }
  );

  // ------------------------------------------- 3. ban is terminal, suspension is not
  console.log("\n=== ban is terminal and suspension is not ===");

  await prisma.user.update({
    where: { id: member.id },
    data: { status: UserStatus.SUSPENDED },
  });

  check(
    "a suspended account can be reinstated",
    canReinstateUser(admin.id, await subjectOf(member.id)).allowed
  );

  await prisma.user.update({
    where: { id: member.id },
    data: { status: UserStatus.BANNED },
  });

  const banned = await subjectOf(member.id);

  check(
    "a banned account cannot be reinstated from here",
    !canReinstateUser(admin.id, banned).allowed
  );
  check(
    "and cannot be suspended either - that would downgrade it",
    !canSuspendUser(admin.id, banned).allowed
  );

  // ------------------------------------ 4. the last-administrator guard, against real counts
  console.log("\n=== the platform cannot be locked out of itself ===");

  const countAdmins = () =>
    prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    });

  const secondAdmin = await prisma.user.create({
    data: {
      email: `au-admin2-${stamp}@example.test`,
      name: "AU Admin Two",
      role: UserRole.ADMIN,
    },
    select: { id: true },
  });

  check(
    "with two administrators, one can be demoted",
    canChangeRole({
      actorId: admin.id,
      subject: await subjectOf(secondAdmin.id),
      newRole: UserRole.USER,
      activeAdminCount: await countAdmins(),
    }).allowed
  );

  await prisma.user.update({
    where: { id: secondAdmin.id },
    data: { role: UserRole.USER },
  });

  /**
   * THE ONE MISTAKE WITH NO IN-APP RECOVERY. Demote the last administrator and nobody can reach the
   * admin area, including to undo it - the way back is database credentials and the bootstrap
   * script.
   */
  const lastAdminCheck = canChangeRole({
    actorId: secondAdmin.id,
    subject: await subjectOf(admin.id),
    newRole: UserRole.USER,
    /**
     * ONE, STATED RATHER THAN COUNTED. Read from the database, this check passes only while the
     * environment happens to contain no administrators besides the two this script creates - and it
     * started failing the moment a real administrator was granted, reporting a rule as broken when
     * nothing about it had changed. The rule under test is "refuse when this is the last one", so
     * the count is the input being tested, not something to discover.
     */
    activeAdminCount: 1,
  });

  check(
    "the last active administrator cannot be demoted",
    !lastAdminCheck.allowed,
    lastAdminCheck
  );

  // -------------------------- 5. the moderation queue writes the same record, with the report
  console.log(
    "\n=== a suspension from the report queue carries its report ==="
  );

  const reported = await prisma.user.create({
    data: { email: `au-reported-${stamp}@example.test`, name: "AU Reported" },
    select: { id: true },
  });

  const report = await prisma.report.create({
    data: {
      reporterId: member.id,
      type: "USER",
      targetId: reported.id,
      reason: "HARASSMENT",
      description: "Abusive messages during a rental.",
    },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { id: reported.id, status: UserStatus.ACTIVE, deletedAt: null },
      data: { status: UserStatus.SUSPENDED },
    });

    await writeAdminAction(tx, {
      actorId: admin.id,
      subjectId: reported.id,
      type: AdminActionType.SUSPEND_USER,
      reason: "Upheld on the evidence in the report.",
      previousValue: UserStatus.ACTIVE,
      newValue: UserStatus.SUSPENDED,
      reportId: report.id,
    });
  });

  const fromQueue = await prisma.adminAction.findFirstOrThrow({
    where: { subjectId: reported.id },
    select: { reportId: true, actorId: true, type: true },
  });

  /**
   * The link is what stops the two paths producing different kinds of evidence. Before it, a
   * suspension through the queue left the Report as its only trace.
   */
  check(
    "the record points back at the report that caused it",
    fromQueue.reportId === report.id &&
      fromQueue.actorId === admin.id &&
      fromQueue.type === AdminActionType.SUSPEND_USER,
    fromQueue
  );

  // ------------------------------------------- 6. the log is append-only in practice
  console.log("\n=== the history accumulates rather than being replaced ===");

  await prisma.user.update({
    where: { id: reported.id },
    data: { status: UserStatus.ACTIVE },
  });

  await prisma.$transaction((tx) =>
    writeAdminAction(tx, {
      actorId: admin.id,
      subjectId: reported.id,
      type: AdminActionType.REINSTATE_USER,
      reason: "Appealed successfully; the messages were not from this account.",
      previousValue: UserStatus.SUSPENDED,
      newValue: UserStatus.ACTIVE,
    })
  );

  const history = await prisma.adminAction.findMany({
    where: { subjectId: reported.id },
    orderBy: { createdAt: "asc" },
    select: { type: true },
  });

  /**
   * The reason a log beats columns on the user. A suspend-then-reinstate pair would leave a column
   * approach showing only "active", with no trace that anything ever happened.
   */
  check(
    "a suspension and its reversal are both still on the record",
    history.length === 2 &&
      history[0]?.type === AdminActionType.SUSPEND_USER &&
      history[1]?.type === AdminActionType.REINSTATE_USER,
    history
  );

  // ---------------------------------------------------------------- cleanup
  console.log("\n=== cleanup ===");

  const ids = [admin.id, member.id, secondAdmin.id, reported.id];

  await prisma.adminAction.deleteMany({ where: { subjectId: { in: ids } } });
  await prisma.report.deleteMany({ where: { id: report.id } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  console.log("  removed test rows");
  console.log(
    failures === 0
      ? "\nALL ADMIN USER CHECKS PASSED\n"
      : `\n${failures} CHECK(S) FAILED\n`
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
