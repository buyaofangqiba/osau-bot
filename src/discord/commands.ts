import {
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder
} from "discord.js";

export const COMMAND_DEFINITIONS: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder()
    .setName("sync")
    .setDescription("Sync commands")
    .addSubcommand((sub) => sub.setName("now").setDescription("Run sync immediately"))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link management commands")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Force link a player to a Discord user")
        .addStringOption((opt) =>
          opt.setName("player_name").setDescription("Player name").setRequired(true)
        )
        .addUserOption((opt) => opt.setName("user").setDescription("Discord user").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove an existing player link")
        .addStringOption((opt) =>
          opt.setName("player_name").setDescription("Player name").setRequired(true)
        )
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("alliance-roster")
    .setDescription("Read-only roster command placeholder")
    .toJSON()
];
