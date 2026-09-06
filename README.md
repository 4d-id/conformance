# @4d-id/conformance

Run the 4D-ID conformance suite against any resolver endpoint. This is the badge that means **4D-ID compliant**: a second implementation points this at its server and gets an independent, spec-defined verdict.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

```bash
npx @4d-id/conformance https://resolver.example.org
```

## What it does

It exercises a running resolver's [access operations](https://github.com/4d-id/spec/blob/main/openapi/openapi.yaml) and checks the specification's semantics: that identifiers match the canonical grammar, that emitted records validate against the JSON Schemas, that the context envelope is bounded and carries no raw geometry, that snapshots and watch behave, and more. It prints a per-test report and a profile-level verdict.

```
4D-ID conformance 2.3  ·  https://resolver.example.org

  PASS /conf/query/operations       resolve returned a valid 4D-ID with a snapshot
  PASS /conf/core/uri-form          identifier matches the canonical grammar
  PASS /conf/core/state-fields      state validates against the schema
  PASS /conf/core/timestamps        source and publish times present
  PASS /conf/core/genesis-anchor    entity resolves; identifier is opaque and stable
  PASS /conf/query/context-envelope envelope validates, bounded, snapshot-tagged, no raw geometry
  PASS /conf/scale/snapshot         snapshot carries an id and zone generations
  PASS /conf/scale/list-then-watch  watch returns a change list

  P1 Core: conforms
  Overall: all executed tests passed
  Coverage: 9 of 107 manifest tests executed
```

## Honest coverage

The suite reports exactly which of the specification's tests it executed and which it did not. Many of the 107 tests are functional checks that need a writable endpoint or a fuller harness (partition behaviour, merge and split, propagation under load); this tool runs the read-side and data-level tests that any resolver can be checked against, and lists the rest as **not run** rather than pretending coverage it does not have. Coverage grows as the tool does; the manifest is the full target.

## Options

```
4did-conformance <base-url> [--sample=registry:external_id] [--json]
```

- `--sample=registry:external_id` — the external identifier to resolve for the run (default `asset.register:TB-WH-01`, the reference sample). Point it at an identifier your endpoint actually has.
- `--json` — machine-readable report, for CI.

Exit code is non-zero if any executed test failed, so it drops into a pipeline.

## In CI

```yaml
- run: npx @4d-id/conformance https://staging.myresolver.example --json
```

## License

Apache-2.0. The test manifest is defined by the [4D-ID specification](https://github.com/4d-id/spec/blob/main/conformance/manifest.json).
