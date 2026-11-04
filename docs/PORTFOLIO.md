# volta_ao_lago — technical portfolio notes

Source reviewed: `ad65af93e120435bd11998fb5141d4d6b25093a3` · 2026-11-04. These notes distinguish implemented behavior from next steps; they do not certify a production deployment.

## Purpose

Real-time race logistics and GPS tracking with transactional handovers and event delivery.

**Stack:** TypeScript, NestJS, Socket.IO, Redis, PostgreSQL/PostGIS, React.

**AI scope:** Event-driven systems; no ML or LLM implementation found.

## Evidence in this repository

- [backend/src/realtime/realtime.gateway.ts](../backend/src/realtime/realtime.gateway.ts): Realtime event gateway.
- [db/functions.sql](../db/functions.sql): Database functions for transactional operations.
- [backend/test/troca.integration.spec.ts](../backend/test/troca.integration.spec.ts): Database-backed handover integration tests.
- [.github/workflows/ci.yml](../.github/workflows/ci.yml): Build, lint and tests with a PostGIS service.

## Validation

```text
npm --workspace backend run test (requires an isolated database configured as in CI)
```

Use an isolated environment and synthetic data. Never run operational ingestion, scheduled jobs or live provider calls merely to demonstrate the project. Test presence is not the same as a successful test run.

## Known limits and next steps

- Architecture and event processing are relevant supporting skills, but do not establish ML training experience.
- Integration tests require an isolated PostGIS database; never point them at an operational race database.
- GPS and participant data need an anonymized demo dataset.

## Portfolio positioning

Public supporting project for realtime architecture and reliable data processing.

A reproducible AI evaluation should document a synthetic or anonymized dataset, baseline, expected outputs, failure cases, quality metrics, latency and cost. Training and evaluating a predictive model would be separate work; it is not claimed here.
