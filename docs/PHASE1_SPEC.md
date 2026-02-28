# O.S.A.U. Bot - Phase 1 Specification (Role Management + Linking)

## Goal
Provide reliable Discord role management driven by (gge-tracker documented) API endpoints for the World 2 server. Authorization flows through manual leadership approval for linking Discord users to their corresponding player account.

## Scope (Phase 1)
- Link Discord users to game players via claim + leadership approval.
- Assign and maintain alliance-group + alliance-rank Discord roles for linked users.
- Keep player/alliance metadata foundation for future analytics (Phase 2).
- Maintain audit logs (leadership flow + owner/dev diagnostics).

Out of scope in Phase 1:

- Event infographics and minimum score tracking automation.
- In-game chat/message relay or proactive gameplay integrations.

## Data Source
Base URL: `https://api.gge-tracker.com/api/v1`

Server header:
- `gge-server: WORLD2`

Tracked alliances (initial):
- `530061` - Dark Warriors
- `10061` - Ｌａ Ｍｕｅｒｔｅ

Primary endpoints:
- `GET /alliances/id/{allianceId}` for current roster and rank metadata.
- `GET /updates/alliances/{allianceId}/players` for join/leave deltas.
- `GET /updates/players/{playerId}/names` for name history enrichment.
- `GET /updates/players/{playerId}/alliances` for movement history.

## Rank Mapping
`alliance_rank` is numeric in live payloads.

Confirmed mapping:
- `0` -> Leader
- `1` -> Deputy
- `2` -> War Marshall
- `3` -> Treasurer
- `4` -> Diplomat
- `5` -> Recruiter
- `6` -> General
- `7` -> Sergeant
- `8` -> Member
- `9` -> Novice

## User Flow
1. User joins Discord server.
   Auto-role baseline:
   - If user is unlinked: assign `Visitor`.
   - If user is already linked: assign roles from linked player state (no visitor baseline).
2. Bot creates one private verification thread for unlinked users.
3. Bot shows in-thread verification controls for currently unlinked players from tracked alliances.
   UX detail:
   - Step 1 buttons: choose alliance (`Dark Warriors`, `La Muerte`, `Just Visiting`).
   - Step 2 dropdown: choose alliance rank bucket.
   - Step 3 dropdown: choose player from that alliance+rank bucket, sorted A-Z by display name.
   - Member list pagination uses `Prev`/`Next` buttons.
   - No user-facing slash-command fast path in v1; verification is thread-component driven.
4. User submits a claim.
5. Bot posts approval request in leadership channel (buttons: Approve / Deny).
6. Leadership approves or denies:
- Approve: create/update link; assign alliance-group role + current API rank role; send confirmation.
- Deny: no link; thread deleted.
7. Thread cleanup:
- Delete on approve/deny.
- Delete when Discord user leaves the server.
- Thread can be recreated if user rejoins.
- If user selects `just visiting`, delete thread immediately and do not create a claim.
- Log `just visiting` outcome to owner/dev log channel.
- Visitor role remains unchanged.

Group role policy:
- Group roles are mutually exclusive: `Visitor`, `Dark Warriors`, `Ｌａ Ｍｕｅｒｔｅ`, `Alumni`.
- Verification removes `Visitor` and assigns exactly one alliance group role.
- Moving between tracked alliances swaps group role directly (no `Alumni`).
- If linked player is no longer in tracked alliances, assign `Alumni` and remove alliance rank role.

## Permissions Model
Commands and moderation actions are leadership-only (Recruiter and above).

Leadership boundary:
- AR `0` through `5` are leadership-authorized.

Implementation rule:
- Use Discord role IDs in configuration (not names) for stable authorization.
- Discord role names in server match alliance ranks one-to-one (`Novice`, `Member`, etc.).

## Role Synchronization
Cadence:
- Automatic sync every 12 hours.
- Manual leadership command for emergency sync.

Behavior:
- Linked user role is reconciled against API rank and alliance group on each sync.
- Old alliance-rank role removed; new alliance-rank role applied.
- Group role is switched between `Dark Warriors` / `Ｌａ Ｍｕｅｒｔｅ` when tracked-alliance movement occurs.
- `Alumni` is applied only when linked player is outside tracked alliances.
- On Discord rejoin, roles are rebuilt from link + player state (unlinked users remain `Visitor`).
- Non-alliance utility roles left untouched.
- Rank changes are logged with date.

## Identity + Linking Rules
- Internal identity uses immutable `player_id` only.
- User-facing responses should display player names and alliance names, not OIDs.
- Name collisions are not possible due to the game's unique player_id requirements.
- Manual leadership override commands are available for force link/unlink/refresh.
- Manual `/link set` applies immediately (no second approval gate).

## Logging Channels
Leadership channel (low noise):
- New claim submitted
- Claim approved/denied

Owner/dev log channel (diagnostic):
- Sync start/end + summary counts
- Role change actions
- Player left/rejoined detection
- Errors/retries/failures
- Manual overrides executed
- `just visiting` exits
- All leadership commands/actions for audit and revert support

Logging topology:
- v1 supports one combined diagnostics channel by default.
- Optionally split into multiple log channels later if noise becomes high.

## Metadata Storage (Foundation)
Store for each player:
- `player_id`, current name, alliance, rank, levels, might, loot, honor, timestamps.

Store historical records:
- Name changes
- Alliance membership periods (`joined_at`, `left_at`)
- Rank change history (with date)

Design goal:
- Schema should be additive for future metadata dimensions (events, weekly scores, etc.).

## Suggested Phase 1 Commands (minimal)
Leadership:
- `/sync now`
- `/link set <player_name> <@discord_user>`
- `/link remove <player_name>`
- `/refresh`

Optional read command:
- `/alliance roster` (single command supporting tracked alliances)

## Reliability Requirements

- Idempotent sync logic (safe to rerun without duplicating history).
- Graceful handling of API/network failures with retry/backoff.
- Preserve links/history even if a player leaves tracked alliances.
- Preserve player links across alliance changes between tracked alliances unless explicitly unlinked.
- Retain denied-claim audit records for 7 days.

## Phase 2 Note (Charts)

Discord messages cannot host an interactive frontend UI.
Practical output options:
- Generated PNG chart attachments in Discord messages.
- External web dashboard link for interactive exploration.

## Phase 3 Note

Proactive in-game actions (chat relay, attack alerts from dedicated accounts) are intentionally deferred.
They require separate integration/auth assumptions and should not shape Phase 1 architecture.

## Deployment Inputs

- Discord IDs for guild, leadership channel, owner/dev log channel, and verification thread parent channel (provided via Railway env vars at deploy time).
- Final role-ID mapping for all 10 alliance rank roles (role names already confirmed one-to-one).
- Final role-ID mapping for group roles: `Visitor`, `Dark Warriors`, `Ｌａ Ｍｕｅｒｔｅ`, `Alumni`.
