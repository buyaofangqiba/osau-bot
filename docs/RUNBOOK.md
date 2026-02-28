# RUNBOOK

## Purpose
Operational procedures for Phase 1 incidents, maintenance, and rollback/recovery.

## Commands (Leadership)
- `/sync now`: immediate full sync and role reconcile.
- `/refresh`: catch-all refresh/reconcile pass.
- `/link set <player_name> <@discord_user>`: manual link (applies immediately).
- `/link remove <player_name>`: manual unlink.

## Normal Operations
## Daily/Periodic
1. Confirm scheduled sync executes every 12h.
2. Scan tech-admin-log for:
- API failures
- role assignment failures
- repeated claim/approval errors

## Claim Handling
1. User joins -> thread created.
2. User picks alliance via buttons, then rank via dropdown, then player via dropdown.
3. Bot posts claim review in leadership channel with `Approve` / `Deny` buttons.
4. Leadership approves/denies in leadership channel.
5. On approve:
- link stored by `player_id`
- alliance group role + rank role assigned from current API state
6. On deny:
- thread deleted
- denied claim retained for 7 days

## Incident Playbooks
## A. Role Assignment Failed
Symptoms:
- approval succeeded but user role unchanged

Actions:
1. Check bot role hierarchy is above target rank role.
2. Verify target role ID env var is correct.
3. Run `/refresh`.
4. If still failing, manually set role in Discord and log incident.

## B. API Unavailable or Invalid Responses
Symptoms:
- sync fails repeatedly

Actions:
1. Confirm `GGE_API_BASE_URL` and `GGE_SERVER_CODE` env vars.
2. Retry with `/sync now`.
3. If outage persists, pause manual interventions unless urgent.
4. Resume normal flow when API recovers.

## C. Wrong User Linked
Symptoms:
- approved claim mapped to wrong Discord user/player

Actions:
1. Run `/link remove <player_name>`.
2. Recreate correct link with `/link set <player_name> <@discord_user>`.
3. Run `/refresh` to ensure correct role state.
4. Record correction in tech-admin-log.

## D. Member Leaves Alliance
Expected behavior:
- link remains preserved
- role/rank updates according to current API state during sync

If behavior deviates:
1. Run `/refresh`.
2. Check player current alliance via API-linked metadata.
3. Verify rank-role mapping and fallback role behavior.

## E. Verification Thread Issues
Symptoms:
- no thread on join
- stale thread not closing

Actions:
1. Verify required Discord intents and channel permissions.
2. Check for errors in tech-admin-log.
3. Ask user to leave/rejoin server as temporary recovery.

## Rollback + Recovery Strategy
Policy:
- Rollback access is owner-only.
- Rollback scope is link/unlink actions only.
- Rank/role rollback is out of scope because rank authority is API-driven.
- Rollback window is 7 days.
- Every rollback action must include a reason and is logged to tech-admin-log.

Implementation direction:
1. Store reversible command history for `/link set` and `/link remove` (before/after snapshots).
2. Provide owner-only rollback commands:
- `/rollback link`
- `/rollback unlink`
3. Rollback target selection should support date/command window selection (not just last action).
4. Rollback must run in preview mode first and show impacted records before execution.
5. Rollback execution requires explicit typed confirmation (for example: `CONFIRM`).
6. Refuse rollback when state drift is detected after the target action; require manual fix.

Corruption recovery focus:
- Prioritize recovery for bot-approved link state if DB data is scrambled/corrupted.
- Keep enough audit history to rebuild links from known-good events.

## Audit Retention
- Denied claim records: 7 days.
- Operational logs: keep as long as practical for debugging (or export periodically).

## Maintenance Tasks
1. Validate env vars after any Discord channel/role changes.
2. Re-test `/sync now` after deployment.
3. Check scheduled job health weekly.

## Open Rollback Questions
- None for current rollback policy.
