#!/usr/bin/env node
import { run, verdict } from "./conformance.mjs";
const args = process.argv.slice(2);
const base = args.find(a => !a.startsWith("--"));
const json = args.includes("--json");
const extArg = args.find(a => a.startsWith("--sample="));
const sample = extArg ? extArg.split("=")[1] : "asset.register:TB-WH-01";
if (!base) {
  console.error("usage: 4did-conformance <base-url> [--sample=registry:external_id] [--json]");
  console.error("example: 4did-conformance https://resolver.example.org");
  process.exit(2);
}
const report = await run({ base, sampleExternalId: sample });
const v = verdict(report);
if (json) { console.log(JSON.stringify({ report, verdict: v }, null, 2)); process.exit(report.failed.length ? 1 : 0); }
const C = { pass:"\x1b[32m", fail:"\x1b[31m", skip:"\x1b[33m", dim:"\x1b[90m", r:"\x1b[0m" };
console.log(`\n4D-ID conformance ${report.version}  ·  ${base}\n`);
for (const t of report.results) {
  const c = C[t.status] || "";
  console.log(`  ${c}${t.status.toUpperCase().padEnd(4)}${C.r} ${t.id}  ${C.dim}${t.detail||""}${C.r}`);
}
console.log(`\n  ${C.dim}not run (need a fuller harness or a writable endpoint): ${report.notRun.length} tests${C.r}`);
console.log(`\n  passed ${report.passed.length}  failed ${report.failed.length}  skipped ${report.skipped.length}`);
console.log(`\n  P1 Core: ${v.p1_core}`);
console.log(`  Overall: ${v.overall}`);
console.log(`  Coverage: ${v.coverage}\n`);
process.exit(report.failed.length ? 1 : 0);
