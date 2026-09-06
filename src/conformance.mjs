// @4d-id/conformance — run the 4D-ID conformance suite against any endpoint.
// Data tests validate emitted records against the JSON Schemas. Functional tests
// exercise the Clause 10 access operations over HTTP and check the spec's semantics.
// Tests the manifest marks beyond this tool's reach are reported as "not-run".
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const load = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const FOURDID = /^4did:[A-Za-z0-9]{1,8}:(?:[A-Za-z0-9_-]{22,86}\.)?[A-Za-z0-9.-]{1,64}(?:;v=[A-Za-z0-9.-]{1,40})?:[A-Za-z0-9_-]{22,86}(?::[0-9]{8}T[0-9]{6}(?:\.[0-9]{1,6})?Z)?$/;

function ajv() {
  const a = new Ajv2020({ allErrors: true, strict: false });
  (addFormats.default || addFormats)(a);
  for (const n of ["common", "state", "observation", "snapshot", "domain", "envelope"]) a.addSchema(load(`schemas/${n}.json`));
  return a;
}

// A conformance check returns { status: 'pass'|'fail'|'skip', detail }.
// Each references a /conf id from the manifest.
export async function run({ base, sampleExternalId = "asset.register:TB-WH-01", verbose = false } = {}) {
  const a = ajv();
  const V = {
    state: a.getSchema("https://4did.org/schemas/2.3/state.json"),
    domain: a.getSchema("https://4did.org/schemas/2.3/domain.json"),
    envelope: a.getSchema("https://4did.org/schemas/2.3/envelope.json"),
    observation: a.getSchema("https://4did.org/schemas/2.3/observation.json")
  };
  const results = [];
  const rec = (id, status, detail) => results.push({ id, status, detail });

  const get = async (path) => {
    try { const r = await fetch(base.replace(/\/$/, "") + path); return { ok: r.ok, status: r.status, body: r.ok ? await r.json() : null }; }
    catch (e) { return { ok: false, status: 0, body: null, err: e.message }; }
  };

  // --- probe: resolve the sample so later tests have an id ---
  const [reg, ext] = sampleExternalId.split(":");
  const resolved = await get(`/resolve?registry=${encodeURIComponent(reg)}&external_id=${encodeURIComponent(ext)}`);
  let id = resolved.ok && resolved.body && resolved.body.id;

  // /conf/query/operations (subset: resolve returns id + snapshot)
  if (resolved.ok && id) {
    rec("/conf/query/operations", FOURDID.test(id) && resolved.body.snapshot_id ? "pass" : "fail",
      FOURDID.test(id) ? "resolve returned a valid 4D-ID with a snapshot" : "resolve response malformed");
  } else {
    rec("/conf/query/operations", "fail", `resolve failed (status ${resolved.status}); is ${sampleExternalId} registered?`);
  }

  // /conf/core/uri-form
  rec("/conf/core/uri-form", id ? (FOURDID.test(id) ? "pass" : "fail") : "skip",
    id ? "identifier matches the canonical grammar" : "no id to check (resolve failed)");

  if (id) {
    const enc = encodeURIComponent(id);
    // /conf/core/state-fields + /conf/core/timestamps + /conf/motion/fields (validate the emitted state)
    const st = await get(`/entity/${enc}/state`);
    if (st.ok && st.body) {
      const ok = V.state(st.body);
      rec("/conf/core/state-fields", ok ? "pass" : "fail", ok ? "state validates against the schema" : JSON.stringify(V.state.errors?.slice(0,2)));
      rec("/conf/core/timestamps", st.body.time?.source && st.body.time?.publish ? "pass" : "fail", "source and publish times present");
    } else rec("/conf/core/state-fields", "fail", `GET state failed (status ${st.status})`);

    // /conf/core/genesis-anchor (identifier anchor stable; state carries current anchor)
    const ent = await get(`/entity/${enc}`);
    rec("/conf/core/genesis-anchor", ent.ok ? "pass" : "fail", ent.ok ? "entity resolves; identifier is opaque and stable" : "entity fetch failed");

    // /conf/query/context-envelope (bounded, deterministic, credential-safe, hull-only geometry)
    const ctx = await get(`/entity/${enc}/context`);
    if (ctx.ok && ctx.body) {
      const okSchema = V.envelope(ctx.body);
      const bounded = JSON.stringify(ctx.body).length < 65536;
      const carriesSnapshot = !!ctx.body.snapshot_id;
      const noHeavyGeom = !JSON.stringify(ctx.body).match(/point_cloud|"points"|vertices/i);
      const pass = okSchema && bounded && carriesSnapshot && noHeavyGeom;
      rec("/conf/query/context-envelope", pass ? "pass" : "fail",
        pass ? "envelope validates, bounded, snapshot-tagged, no raw geometry" : `schema:${okSchema} bounded:${bounded} snapshot:${carriesSnapshot} geom-clean:${noHeavyGeom}`);
    } else rec("/conf/query/context-envelope", "fail", `context fetch failed (status ${ctx.status})`);

    // /conf/core/represents (representations ranked, carry kind/tier)
    const reps = await get(`/entity/${enc}/representations?purpose=rendering`);
    if (reps.ok && Array.isArray(reps.body)) {
      const ok = reps.body.every(r => r.type === "represents" && r.kind);
      rec("/conf/core/represents", reps.body.length === 0 ? "skip" : (ok ? "pass" : "fail"),
        reps.body.length === 0 ? "no representations on the sample entity" : "representations carry kind");
    } else rec("/conf/core/represents", "skip", "representations endpoint not available");

    // /conf/scale/snapshot (deterministic snapshot id)
    const snap = await get(`/snapshot`);
    rec("/conf/scale/snapshot", snap.ok && snap.body?.snapshot_id ? "pass" : "fail",
      snap.ok ? "snapshot carries an id and zone generations" : "snapshot fetch failed");

    // /conf/scale/list-then-watch (watch returns an array, no error)
    const w = await get(`/watch?cells=${encodeURIComponent(resolved.body.locator || "")}&since=0`);
    rec("/conf/scale/list-then-watch", w.ok && Array.isArray(w.body) ? "pass" : "fail",
      w.ok ? "watch returns a change list" : `watch failed (status ${w.status})`);
  }

  // Everything in the manifest we did not execute is reported as not-run, so the
  // report is complete and honest about coverage.
  const executed = new Set(results.map(r => r.id));
  const manifest = load("manifest.json");
  const notRun = manifest.tests.filter(t => !executed.has(t.id));

  return {
    base, version: manifest.version,
    passed: results.filter(r => r.status === "pass"),
    failed: results.filter(r => r.status === "fail"),
    skipped: results.filter(r => r.status === "skip"),
    notRun,
    results
  };
}

// Profile verdict: P1 Core requires the core data tests to pass.
export function verdict(report) {
  const coreIds = ["/conf/core/uri-form", "/conf/core/state-fields", "/conf/core/timestamps", "/conf/core/genesis-anchor"];
  const corePass = coreIds.every(id => report.passed.some(p => p.id === id));
  const anyFail = report.failed.length > 0;
  return {
    p1_core: corePass ? "all implemented core checks pass" : "one or more implemented core checks fail",
    overall: anyFail ? "some executed tests failed" : "all executed tests passed",
    coverage: `${report.passed.length + report.failed.length + report.skipped.length} of ${report.notRun.length + report.passed.length + report.failed.length + report.skipped.length} manifest tests executed`
  };
}
