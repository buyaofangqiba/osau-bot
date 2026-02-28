# GGE Tracker API Catalog

Source: normalized from local `docs.txt` OpenAPI dump (version string in dump: `26.02.15-beta`).
Base URL: `https://api.gge-tracker.com/api/v1`

## Global Conventions
- Required header for server-scoped endpoints: `gge-server: <SERVER_CODE>`
- Current server for this project: `WORLD2`
- Common pagination fields (where applicable): `pagination.current_page`, `pagination.total_pages`, `pagination.current_items_count`, `pagination.total_items_count`
- Typical query sorting style: `orderBy=<field>&orderType=ASC|DESC`

## Core Endpoints For Phase 1
| Method | Path | Purpose |
|---|---|---|
| GET | `/alliances/id/{allianceId}` | Current alliance roster with `player_id`, `player_name`, `alliance_rank`, stats |
| GET | `/updates/alliances/{allianceId}/players` | Join/leave updates for alliance members |
| GET | `/updates/players/{playerId}/names` | Player name history |
| GET | `/updates/players/{playerId}/alliances` | Player alliance movement history |
| GET | `/players` | Search/list players with filters and pagination |
| GET | `/players/{playerName}` | Resolve a player by name |
| POST | `/players` | Batch lookup players by IDs |
| GET | `/alliances` | Paginated alliance list (supports sort by might, loot, etc.) |
| GET | `/servers` | Supported server codes |
| GET | `/` | API/server status and last update timestamps |

## Full Endpoint Inventory

### Assets + Localization
| Method | Path | Summary |
|---|---|---|
| GET | `/assets/images/{image}` | Get a specific rendered image for a Goodgame Empire asset |
| GET | `/assets/common/{asset}` | Get specific Goodgame Empire asset |
| GET | `/assets/items` | Get current Goodgame Empire items |
| GET | `/languages/{lang}` | Get specific Goodgame Empire translations |

### Status + Servers
| Method | Path | Summary |
|---|---|---|
| GET | `/` | Get gge-tracker API status and latest updates |
| GET | `/servers` | Retrieve the list of gge-tracker supported servers |

### Events + Grand Tournament
| Method | Path | Summary |
|---|---|---|
| GET | `/events/list` | Retrieve the list of events (Beyond the Horizon and Outer Realms) |
| GET | `/events/{eventType}/{id}/players` | Retrieve paginated player ranking for a specific event |
| GET | `/events/{eventType}/{id}/data` | Retrieve detailed statistics for a specific event |
| GET | `/grand-tournament/dates` | Retrieve the list of Grand Tournament event dates |
| GET | `/grand-tournament/alliances` | Retrieve Grand Tournament alliance rankings |
| GET | `/grand-tournament/alliance/{allianceId}/{eventId}` | Retrieve Grand Tournament analysis for a specific alliance |
| GET | `/grand-tournament/search` | Search alliances in the Grand Tournament |

### Updates + Server Activity
| Method | Path | Summary |
|---|---|---|
| GET | `/updates/alliances/{allianceId}/players` | Retrieve players who joined or left an alliance |
| GET | `/updates/players/{playerId}/names` | Retrieve the name change history of a player |
| GET | `/updates/players/{playerId}/alliances` | Retrieve the alliance change history of a player |
| GET | `/dungeons` | Retrieve the state of dungeons |
| GET | `/server/movements` | Retrieve player castle movement history |
| GET | `/server/renames` | Retrieve player and alliance renames history |
| GET | `/server/statistics` | Retrieve global server statistics |

### Statistics
| Method | Path | Summary |
|---|---|---|
| GET | `/statistics/alliance/{allianceId}` | Retrieve statistical data for an alliance |
| GET | `/statistics/alliance/{allianceId}/pulse` | Retrieve alliance might pulse statistics |
| GET | `/statistics/ranking/player/{playerId}` | Retrieve ranking and progression statistics for a player |
| GET | `/statistics/player/{playerId}` | Retrieve player event statistics |
| GET | `/statistics/player/{playerId}/{eventName}/{duration}` | Retrieve player event stats for one event and duration |

### Cartography + Castle
| Method | Path | Summary |
|---|---|---|
| GET | `/cartography/size/{size}` | Retrieve cartography information based on the size |
| GET | `/cartography/name/{allianceName}` | Retrieve cartography info for alliance by name |
| GET | `/cartography/id/{allianceId}` | Retrieve cartography info for alliance by ID |
| GET | `/castle/analysis/{castleId}` | Retrieve realtime castle analysis for a specific castle |
| GET | `/castle/search/{playerName}` | Retrieve realtime castle information for a player by name |

### Alliances + Players
| Method | Path | Summary |
|---|---|---|
| GET | `/alliances/id/{allianceId}` | Retrieve detailed information about an alliance by ID |
| GET | `/alliances/name/{allianceName}` | Retrieve alliance statistics by name |
| GET | `/alliances` | Retrieve paginated alliances with sortable metrics |
| GET | `/top-players/{playerId}` | Retrieve top players' statistics for a specific player |
| GET | `/players` | Retrieve paginated players with filters |
| POST | `/players` | Retrieve multiple players by IDs |
| GET | `/players/{playerName}` | Retrieve detailed information about a player by name |

## Known Live Values For This Project
- `gge-server`: `WORLD2`
- Alliance IDs:
  - `530061` = `Dark Warriors`
  - `10061` = `Ｌａ Ｍｕｅｒｔｅ`

## Notes
- API docs dump contains some duplicated sections; endpoint list above is deduplicated.
- Unicode alliance/player names are expected; store IDs as source-of-truth and names as mutable display fields.
