/**
 * Pure unit check for lib/performance helpers (no DB access).
 * Usage: npx tsx scripts/smoke-performance-logic.ts
 *
 * lib/db.ts throws at import when MONGODB_URI is missing even though we never
 * connect, so stub a dummy URI before dynamically importing the helpers.
 */
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/dummy";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`
  );
}

async function main() {
  const {
    startOfDay,
    endOfDay,
    toDateKey,
    clampPct,
    standardHoursPerDay,
    approvedLeaveDayKeys,
    expectedWorkingDays,
  } = await import("../lib/performance");

  // standardHoursPerDay
  check("std 9-6 = 9", standardHoursPerDay({ start: "09:00", end: "18:00" }), 9);
  check("std 10-7 = 9", standardHoursPerDay({ start: "10:00", end: "19:00" }), 9);
  check("std 8-6 = 10", standardHoursPerDay({ start: "08:00", end: "18:00" }), 10);
  check("std 9-5 = 8", standardHoursPerDay({ start: "9:00", end: "17:00" }), 8);
  check("std invalid -> 9", standardHoursPerDay({ start: "bad", end: "18:00" }), 9);
  check("std empty -> 9", standardHoursPerDay(undefined), 9);

  // toDateKey / start/endOfDay are local
  const aug = new Date(2026, 7, 11, 15, 30); // local Aug 11 2026
  check("toDateKey", toDateKey(aug), "2026-08-11");
  check("startOfDay hours", startOfDay(aug).getHours(), 0);
  check("endOfDay hours", endOfDay(aug).getHours(), 23);

  // clampPct
  check("clamp below", clampPct(-5), 0);
  check("clamp above", clampPct(120), 100);
  check("clamp mid", clampPct(42), 42);
  check("clamp NaN", clampPct(NaN), 0);

  // approvedLeaveDayKeys — approved Aug 10-12 (Mon-Wed), rejected Aug 5
  const from = new Date(2026, 7, 1);
  const to = new Date(2026, 7, 31);
  const leaves = [
    { startDate: new Date(2026, 7, 10), endDate: new Date(2026, 7, 12), status: "approved" },
    { startDate: new Date(2026, 7, 5), endDate: new Date(2026, 7, 5), status: "rejected" },
  ];
  check(
    "approvedLeaveDayKeys",
    Array.from(approvedLeaveDayKeys(leaves, from, to)).sort(),
    ["2026-08-10", "2026-08-11", "2026-08-12"]
  );

  // expectedWorkingDays over Aug 1-15 2026 (Aug 1=Sat, 2=Sun, 3-7=Mon-Fri, 8=Sat, 9=Sun, 10-14=Mon-Fri, 15=Sat)
  const range = { from: new Date(2026, 7, 1), to: new Date(2026, 7, 15) };
  const weekdays = expectedWorkingDays({
    ...range,
    workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    leaveDayKeys: new Set(),
  });
  check("working days Aug 1-15", weekdays, 10); // weekdays 3-7 + 10-14

  // minus approved leave Aug 10-12 -> 7
  const withLeave = expectedWorkingDays({
    ...range,
    workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    leaveDayKeys: new Set(["2026-08-10", "2026-08-11", "2026-08-12"]),
  });
  check("working days minus leave", withLeave, 7);

  // joining date caps the start (joins Aug 10)
  const withJoin = expectedWorkingDays({
    ...range,
    workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    leaveDayKeys: new Set(),
    joiningDate: new Date(2026, 7, 10),
  });
  check("working days from joining", withJoin, 5); // 10-14

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
