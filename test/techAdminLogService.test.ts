import { describe, expect, it, vi } from "vitest";
import { TechAdminLogService } from "../src/services/techAdminLogService.js";

function createConfig() {
  return {
    discord: {
      techAdminLogChannelId: "tech-log-1"
    }
  } as any;
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as any;
}

describe("TechAdminLogService", () => {
  it("sends message when channel is text-based", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          isTextBased: () => true,
          send
        })
      }
    } as any;
    const logger = createLogger();
    const service = new TechAdminLogService(client, createConfig(), logger);

    await service.log("hello");

    expect(client.channels.fetch).toHaveBeenCalledWith("tech-log-1");
    expect(send).toHaveBeenCalledWith({ content: "hello" });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns when channel cannot be fetched", async () => {
    const client = {
      channels: {
        fetch: vi.fn().mockRejectedValue(new Error("missing"))
      }
    } as any;
    const logger = createLogger();
    const service = new TechAdminLogService(client, createConfig(), logger);

    await service.log("hello");

    expect(logger.warn).toHaveBeenCalledWith("Tech-admin log channel not found or not text-based");
  });

  it("warns when channel is not text-based", async () => {
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          isTextBased: () => false
        })
      }
    } as any;
    const logger = createLogger();
    const service = new TechAdminLogService(client, createConfig(), logger);

    await service.log("hello");

    expect(logger.warn).toHaveBeenCalledWith("Tech-admin log channel not found or not text-based");
  });
});
