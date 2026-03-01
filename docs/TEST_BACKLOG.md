# Test Backlog

## Priority Model
- `P0`: production risk, likely to break user-visible bot behavior
- `P1`: important but less frequent/critical paths
- `P2`: low-risk glue/static config

## P0 (Do Next)
1. `src/discord/client.ts`
   - Command permission gate behavior.
   - Event wiring for join/leave + interaction handling.
   - Error fallback response path when interaction throws.
2. `src/api/ggeClient.ts`
   - Request path/header construction.
   - Non-2xx handling.
   - Retry behavior and terminal failure behavior.
3. `src/index.ts`
   - Startup orchestration smoke test.
   - Failure path if core dependency initialization throws.

## P1 (After P0)
1. `src/discord/componentRouteExecutor.ts`
   - Remaining uncovered branches (no-op thread guards and deny edge paths).
2. `src/services/syncService.ts`
   - Scheduler interval registration.
3. `src/services/linkService.ts`
   - Branch coverage for null/not-found edge handling.

## P2 (Defer)
1. `src/discord/commands.ts`
2. `src/logger.ts`
3. `src/db/pool.ts`
4. `src/types/gge.ts`

## Coverage Strategy
- Keep current global gates in Vitest.
- Raise overall thresholds only after `P0` is complete and stable.
- Favor behavior tests over snapshot/static-definition tests.
