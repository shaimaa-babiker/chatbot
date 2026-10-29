# Classification worker operations

The worker is an authenticated, bounded HTTP invocation at `POST /api/internal/classification-worker`. No scheduler is configured by this repository. An operator must configure a trusted scheduler or manually invoke the endpoint.

## Required configuration

- `DATABASE_URL`: the server-side application database URL already required by `lib/db.ts`.
- `GROQ_API_KEY` or one of `GROQ_API_KEY_1` through `GROQ_API_KEY_20`: credentials already read by `lib/groqPool.ts`.
- `CLASSIFICATION_WORKER_SECRET`: a high-entropy secret configured only in the server runtime and the trusted scheduler. Send it as `Authorization: Bearer <secret>`. Do not expose it to browser code.

The endpoint returns HTTP 503 until `CLASSIFICATION_WORKER_SECRET` is configured, and returns HTTP 401 without a matching bearer secret. The request body may be empty or may contain `{"maxRuns":10}`; the allowed range is 1–100.

Example manual invocation from a trusted operator environment:

```sh
curl --fail-with-body -X POST \
  -H "Authorization: Bearer $CLASSIFICATION_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  --data '{"maxRuns":10}' \
  "$APPLICATION_ORIGIN/api/internal/classification-worker"
```

Use a scheduler that supports authenticated HTTPS POST requests and configure a cadence appropriate for the application's load. This project does not establish a scheduler, cadence, or deployment secret. Until an operator configures and verifies one, queued runs are durable but processing and periodic reconciliation are not automatic.

Each tick reconciles up to 100 eligible post-rollout incoming messages, then claims at most the requested number of runs. Claims use database leases and fencing tokens; leases are renewed while processing, and expired attempts can be abandoned and reclaimed by a later tick. Provider and transient processing failures are retried subject to the run's database attempt limit; invalid source/taxonomy data and invalid provider output are dead-lettered. Worker output never writes `messages.enquiry_category`. Historical reclassification, taxonomy proposal application, review, and canonical selection are outside this worker.

The migration has not been applied or tested against PostgreSQL in this environment. Apply it only after validating the actual PostgreSQL version and schema in an approved disposable database, then verify this endpoint and scheduler end-to-end before relying on automatic processing.
