# Task 4 — Role-Based Microservice API Ecosystem

Modular multi-tier backend: JWT RBAC auth, an API gateway enforcing role tiers, an async transaction flow via RabbitMQ (no DB lock during the request), and Docker Compose with separate per-tier networks.

## Services
| Service | Port | Role |
|---|---|---|
| `auth-service` | 3001 | Register/login, issues JWTs carrying `role` (admin/manager/customer) |
| `api-gateway` | 3000 | Single entry point; verifies JWT, enforces RBAC, forwards to backends |
| `transaction-service` | 3002 | Accepts transactions (202), publishes to RabbitMQ queue |
| `worker` | — | Consumes queue, writes processed transactions to shared store |
| `rabbitmq` | 5672/15672 | Async message broker |

## Networks (per-tier, via Docker Compose)
`auth-net`, `txn-net`, `api-net`, `broker-net`. The gateway is the only service on `api-net` and is the sole cross-tier entry point. Data is shared through the `app-data` volume mounted by `transaction-service` and `worker`.

## Run
```bash
docker compose up -d --build
# or copy .env.example to .env and set JWT_SECRET first
```

## Verify endpoints (automated, against http://localhost:3000)
```bash
node verify-endpoints.js
```
Prints a PASS/FAIL summary: register/login (all roles), 401 on bad credentials & missing token, 202 async transaction accept, worker processing, customer sees own transactions, admin sees all, 404 on missing id.

## Design decisions (smallest complete build)
- File-based store (`transactions.json`, `users.json`) instead of a database — no new dependency, satisfies "coordinate transactions without DB locks" because the HTTP request returns 202 the moment the message is enqueued; the worker writes to disk asynchronously.
- Shared named volume `app-data` so the worker's writes are readable by `transaction-service` (containers otherwise have isolated filesystems).
- Retry-with-backoff on RabbitMQ connect so services survive broker startup races.

## Risks / known limits
- `users.json`/`transactions.json` are plain files with no locking — fine for this mini-project; not safe for concurrent multi-instance writes under heavy load (would need a real DB with row locking).
- JWT secret defaults to `dev-secret-change-me`; set `JWT_SECRET` in `.env` for any non-dev use.
- `worker`/transaction-service single-instance scale would corrupt the shared file; scale needs a real database.
