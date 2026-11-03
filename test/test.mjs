import assert from "node:assert/strict";
import { createServer } from "node:http";
import { run, verdict } from "../src/conformance.mjs";

const id = "4did:h3:8c2a100d2d0dbff:AAAAAAAAAAAAAAAAAAAAAA:20261103T000000Z";
const parent = "4did:h3:8000000000000ff:BBBBBBBBBBBBBBBBBBBBBB:20260101T000000Z";
const now = "2026-11-03T00:00:00Z";
const state = {
  id, parent,
  anchor: { variant: "h3", cell: "8c2a100d2d0dbff", resolution: 12 },
  pose: { position: [0, 0, 0], orientation: [0, 0, 0, 1] },
  time: { source: now, bound_s: 0, publish: now },
  sequence: 1, producer: "conformance:test", validity_s: 60,
  status: "active", motion_mode: "static", relations: []
};
const json = (res, status, value) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
};
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/resolve") return json(res, 200, { id, locator: "8c2a100d2d0dbff", snapshot_id: "snap:test" });
  if (url.pathname === `/entity/${encodeURIComponent(id)}/state` || decodeURIComponent(url.pathname) === `/entity/${id}/state`) return json(res, 200, state);
  if (decodeURIComponent(url.pathname) === `/entity/${id}`) return json(res, 200, { id, parent, status: "active", relations: [] });
  if (decodeURIComponent(url.pathname) === `/entity/${id}/context`) return json(res, 200, { id, parent, snapshot_id: "snap:test", pose: state.pose, as_of: now, relations: [], representations: [] });
  if (decodeURIComponent(url.pathname) === `/entity/${id}/representations`) return json(res, 200, []);
  if (url.pathname === "/snapshot") return json(res, 200, { snapshot_id: "snap:test", zones: [{ zone: "8c2a100d2d0dbff", generation: 1 }], reference_time: now, max_skew_s: 1, staleness_s: 0 });
  if (url.pathname === "/watch") return json(res, 200, []);
  return json(res, 404, { error: "not found" });
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  const report = await run({ base });
  const v = verdict(report);
  assert.ok(report.results.length >= 9, "executes the implemented endpoint checks");
  assert.equal(v.p1_core, "all implemented core checks pass");
  assert.equal(report.failed.length, 0);
  assert.ok(report.notRun.length > 0, "reports the unimplemented manifest checks");
  assert.match(v.coverage, /^9 of \d+ manifest tests executed$/);
  console.log("PASS:", v);
} finally {
  await new Promise(resolve => server.close(resolve));
}
