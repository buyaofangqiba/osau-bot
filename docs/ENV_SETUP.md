# ENV_SETUP

## Scope
Environment and deployment setup for Phase 1 on Railway.

## Services
- App service: Discord bot worker (Node.js)
- Database service: Postgres

## Required Environment Variables
## Discord Core
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`

## Discord Channels
- `DISCORD_VERIFICATION_PARENT_CHANNEL_ID`
- `DISCORD_LEADERSHIP_CHANNEL_ID`
- `DISCORD_TECH_ADMIN_LOG_CHANNEL_ID`

## Discord Roles (Alliance Ranks)
- `DISCORD_ROLE_ID_LEADER`
- `DISCORD_ROLE_ID_DEPUTY`
- `DISCORD_ROLE_ID_WAR_MARSHALL`
- `DISCORD_ROLE_ID_TREASURER`
- `DISCORD_ROLE_ID_DIPLOMAT`
- `DISCORD_ROLE_ID_RECRUITER`
- `DISCORD_ROLE_ID_GENERAL`
- `DISCORD_ROLE_ID_SERGEANT`
- `DISCORD_ROLE_ID_MEMBER`
- `DISCORD_ROLE_ID_NOVICE`
- `DISCORD_ROLE_ID_VISITOR`
- `DISCORD_ALLIANCE_ROLE_MAP` (CSV of `<alliance_id>:<discord_role_id>`, example: `530061:1477379304529592602,10061:1477379331163689102`)
- `DISCORD_ROLE_ID_ALUMNI`

## API + Sync
- `GGE_API_BASE_URL` (default: `https://api.gge-tracker.com/api/v1`)
- `GGE_SERVER_CODE` (default: `WORLD2`)
- `SYNC_INTERVAL_HOURS` (default: `12`)
- `SYNC_ALLIANCE_IDS` (CSV, default: `530061,10061`)

## Database
- `DATABASE_URL` (Railway Postgres connection string)

## Safety + Ops
- `DENIED_CLAIM_RETENTION_DAYS` (default: `7`)
- `LOG_LEVEL` (default: `info`)

## Optional
- `NODE_ENV` (`production` in Railway)

## Discord Developer Portal Checklist
1. Enable `SERVER MEMBERS INTENT`.
2. Invite bot with required scopes/permissions:
- `bot`
- `applications.commands`
3. Ensure bot role has permission to:
- manage roles
- manage threads
- send messages/embed links in configured channels

## Discord Server Checklist
1. Verify role names exist and match ranks:
- `Novice`, `Member`, `Sergeant`, `General`, `Recruiter`, `Diplomat`, `Treasurer`, `War Marshall`, `Deputy`, `Leader`
2. Verify grouping roles exist:
- `Visitor`, `Dark Warriors`, `Ｌａ Ｍｕｅｒｔｅ`, `Alumni`
3. Group roles are mutually exclusive and should be sorted high enough for member-list grouping.
4. Ensure bot role sits above all rank and grouping roles it must assign.
5. Create/confirm channels:
- verification thread parent
- leadership claim review channel
- tech-admin-log channel
6. Capture IDs (developer mode) and set env vars.

## Railway Setup Checklist
1. Create project + bot service + Postgres service.
2. Set all env vars above.
3. Link `DATABASE_URL` from Postgres service.
4. Deploy app.
5. Check logs for:
- startup success
- command registration success
- first sync success

## First-Run Validation
1. `Bot online` message appears in tech-admin-log.
2. Manual `/sync now` succeeds.
3. Rank reconcile dry test on one linked user works.
4. New member join creates private verification thread.
5. New unlinked member gets `Visitor` role automatically.
6. Approval assigns correct alliance group + rank role and removes `Visitor`.
7. Linked rejoin restores alliance group + rank from stored link/player state.
8. Linked user outside tracked alliances gets `Alumni` on sync.
9. Denial removes thread and records short-lived audit.

## Common Setup Errors
- Missing intents: join events not received.
- Bot role too low: role assignment fails.
- Wrong channel ID: logs/approvals posted nowhere.
- Wrong `GGE_SERVER_CODE`: empty/invalid API responses.
