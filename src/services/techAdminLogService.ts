import type { Client } from "discord.js";
import type { AppConfig } from "../config.js";
import type { AppLogger } from "../logger.js";

export class TechAdminLogService {
  constructor(
    private readonly client: Client,
    private readonly config: AppConfig,
    private readonly logger: AppLogger
  ) {}

  async log(message: string) {
    const channel = await this.client.channels.fetch(this.config.discord.techAdminLogChannelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      this.logger.warn("Tech-admin log channel not found or not text-based");
      return;
    }
    await channel.send({ content: message });
  }
}
