# n8n Integration — Implementation Plan

## Context

Miniclaw currently has no way to schedule future actions, react to external events, or orchestrate multi-step workflows outside its inference loop. Every complex task (research, summarize, store) runs as a chain of tool calls inside a single conversation turn — expensive in tokens and non-repeatable.

n8n running locally on `localhost:5678` solves this. It gives the agent temporal agency (schedule triggers), environmental awareness (RSS/email/webhook triggers), digital embodiment (400+ integrations), and multi-step pipeline execution — all for a single HTTP POST per invocation instead of dozens of inference-loop tool calls.

See `docs/n8n-integration-research.md` for the full strategic rationale.

## Architecture

```
Miniclaw                          n8n (:5678)
  |                                  |
  |-- POST /webhook/{path} -------->|  (sync or async)
  |<-- JSON result ------------------|
  |                                  |
  |-- GET/POST /api/v1/* ---------->|  (workflow management)
  |<-- JSON -------------------------|
  |                                  |
  |<-- POST callback_url -----------|  (async results / scheduled triggers)
```

Two interfaces:
- **Webhooks** (`/webhook/{path}`): trigger workflows, optionally wait for result
- **REST API** (`/api/v1/*`): CRUD workflows, list executions, health check

Credentials stored in vault (`api-key/n8n`, `credential/n8n-webhook-secret`), fallback to env vars `N8N_API_KEY` and `N8N_WEBHOOK_SECRET`. Base URL from `N8N_BASE_URL` env var, default `http://localhost:5678`.

## New Files

| File | Purpose |
|---|---|
| `src/n8n/types.ts` | N8NWorkflow, N8NExecution, N8NClientConfig, ScheduleWorkflowOptions |
| `src/n8n/client.ts` | HTTP client class — webhook calls, REST API, health check, credential loading |
| `src/tools/n8n.ts` | Agent tools: n8n_call, n8n_trigger, n8n_schedule, n8n_list_workflows, n8n_get_execution |
| `src/n8n-cli.ts` | CLI: call, trigger, workflows, executions, execution, health |
| `tests/n8n/client.test.ts` | Client tests with mocked fetch |
| `tests/tools/n8n.test.ts` | Tool tests with mocked client |

## Modified Files

| File | Change |
|---|---|
| `src/agent.ts` | Import + register 5 n8n tools in createTools() |
| `package.json` | Add `"n8n": "tsx src/n8n-cli.ts"` script |
| `build.mjs` | Add n8n-cli.ts build entry |
| `tsconfig.base.json` | Add `@n8n/*` path mapping |
| `vitest.config.ts` | Add `@n8n` resolve alias |
| `tests/agent.test.ts` | Update expected tool count from 25 to 30 |

## Types — `src/n8n/types.ts`

```typescript
type N8NWorkflow = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  tags: Array<{ id: string; name: string }>;
};

type N8NExecution = {
  id: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt: string | null;
  workflowId: string;
  status: "waiting" | "running" | "success" | "error" | "canceled";
  data?: Record<string, unknown>;
};

type N8NClientConfig = {
  baseUrl: string;               // default "http://localhost:5678"
  apiKey?: string;
  webhookSecret?: string;
  timeouts: {
    syncWebhook: number;         // 30_000
    asyncWebhook: number;        // 5_000
    api: number;                 // 10_000
  };
};

type ScheduleWorkflowOptions = {
  name: string;
  cronExpression?: string;       // recurring
  triggerAt?: string;            // ISO date, one-shot
  callbackUrl: string;
  payload: Record<string, unknown>;
};
```

## Client — `src/n8n/client.ts`

Class `N8NClient` using native `fetch()` with `AbortSignal.timeout()` (same pattern as `src/tools/web.ts`).

**Credential loading** — static method, vault-first with env fallback:
```typescript
static loadCredentials(): { apiKey?: string; webhookSecret?: string } {
  // 1. Try vaultGet("api-key", "n8n") and vaultGet("credential", "n8n-webhook-secret")
  // 2. Fallback to process.env.N8N_API_KEY and process.env.N8N_WEBHOOK_SECRET
}
```

**Methods:**

| Method | HTTP | Endpoint | Timeout |
|---|---|---|---|
| `callWebhook(path, payload)` | POST | `/webhook/{path}` | 30s |
| `triggerWebhook(path, payload)` | POST | `/webhook/{path}` | 5s |
| `listWorkflows()` | GET | `/api/v1/workflows` | 10s |
| `getWorkflow(id)` | GET | `/api/v1/workflows/{id}` | 10s |
| `createWorkflow(def)` | POST | `/api/v1/workflows` | 10s |
| `activateWorkflow(id)` | POST | `/api/v1/workflows/{id}/activate` | 10s |
| `deactivateWorkflow(id)` | POST | `/api/v1/workflows/{id}/deactivate` | 10s |
| `deleteWorkflow(id)` | DELETE | `/api/v1/workflows/{id}` | 10s |
| `listExecutions(workflowId?)` | GET | `/api/v1/executions` | 10s |
| `getExecution(id)` | GET | `/api/v1/executions/{id}` | 10s |
| `health()` | GET | `/api/v1/workflows?limit=1` | 5s |
| `createScheduledWorkflow(opts)` | composite | create + activate | 10s |

**Headers:**
- Webhook: `Content-Type: application/json` + `X-Webhook-Secret: {secret}` (if set)
- API: `Content-Type: application/json` + `X-N8N-API-KEY: {key}`

**`createScheduledWorkflow`** builds a minimal 2-node workflow:
1. Schedule Trigger node (`n8n-nodes-base.scheduleTrigger`) with cron or one-shot
2. HTTP Request node (`n8n-nodes-base.httpRequest`) that POSTs to `callbackUrl` with `payload`

Then calls `createWorkflow()` + `activateWorkflow()`.

## Agent Tools — `src/tools/n8n.ts`

Lazy singleton client, created on first tool call. Uses `formatToolError()` from `src/tools/util.js`.

**5 tools:**

### `n8n_call` — sync webhook
```
parameters: { path: string, payload?: Record<string, unknown> }
→ JSON.stringify(result, null, 2)
```
Use for: research pipelines, data lookups, anything that returns a result.

### `n8n_trigger` — async fire-and-forget
```
parameters: { path: string, payload?: Record<string, unknown> }
→ "Workflow triggered: {message}"
```
Use for: email sends, notifications, long-running pipelines.

### `n8n_schedule` — create scheduled workflow
```
parameters: {
  name: string,
  cron?: string,             // e.g. "0 9 * * 1"
  trigger_at?: string,       // ISO date
  callback_url: string,
  payload?: Record<string, unknown>
}
→ "Scheduled workflow created: ID {id}, name '{name}'"
```
Use for: reminders, periodic checks, delayed actions.

### `n8n_list_workflows` — list all workflows
```
parameters: {}
→ "{id}: {name} (active|inactive) [tags]" per line
```

### `n8n_get_execution` — check execution status
```
parameters: { execution_id: string }
→ formatted status block with output data if present
```

## CLI — `src/n8n-cli.ts`

Following `src/kb-cli.ts` pattern: `extractFlag()`, `usage()`, `main()` with switch.

| Command | Args | Description |
|---|---|---|
| `call` | `<path> [json]` | Sync webhook call, prints JSON result |
| `trigger` | `<path> [json]` | Async trigger, prints confirmation |
| `workflows` | | List all workflows |
| `executions` | `[--workflow <id>]` | List recent executions |
| `execution` | `<id>` | Show execution detail |
| `health` | | Check n8n connectivity |

## Tests

### `tests/n8n/client.test.ts`
- Mock `fetch` via `vi.stubGlobal("fetch", mockFetch)`
- Mock vault via `vi.mock("@src/vault.js", ...)`
- Test: webhook calls send correct headers/body, API calls use API key, health check, timeouts, credential loading fallback

### `tests/tools/n8n.test.ts`
- Mock `@n8n/client.js` — replace N8NClient with a mock class
- Test: each tool returns correct format, handles errors gracefully, passes payloads correctly

## Implementation Order

1. `tsconfig.base.json` + `vitest.config.ts` — add `@n8n` alias
2. `src/n8n/types.ts` — pure types
3. `src/n8n/client.ts` — HTTP client
4. `src/tools/n8n.ts` — agent tools
5. `tests/n8n/client.test.ts` + `tests/tools/n8n.test.ts`
6. `src/n8n-cli.ts`
7. `src/agent.ts` — register tools
8. `package.json` + `build.mjs` + `tests/agent.test.ts`

## Verification

```bash
# Tests
npx vitest run tests/n8n/
npx vitest run tests/tools/n8n.test.ts
npx vitest run  # full suite — expect 30 tools in agent test

# Build
npm run build

# CLI (requires n8n running on localhost:5678)
npm run n8n -- health
npm run n8n -- workflows
npm run n8n -- call test-webhook '{"hello":"world"}'

# Vault setup for credentials
npm run vault -- set api-key n8n
npm run vault -- set credential n8n-webhook-secret
```

## Design Decisions

1. **Vault-first credentials** — consistent with how agent gets API keys. Env var fallback for dev/CI.
2. **Lazy client singleton** — created on first tool call, reused for session. No startup cost if n8n tools aren't used.
3. **Native fetch()** — no new deps. Matches web.ts pattern.
4. **formatToolError()** — consistent error formatting with file/web/shell tools.
5. **No new npm deps** — everything uses built-in fetch and existing vault.
6. **Generous timeouts** — 30s for sync webhooks (workflows can be complex), 5s for async (should return immediately).
7. **5 tools not 3** — list_workflows and get_execution are essential for the agent to discover and monitor workflows, not just fire them.
