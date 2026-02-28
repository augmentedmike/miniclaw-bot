import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";

vi.mock("@web/handler.js", () => ({
  createRequestHandler: vi.fn(() => vi.fn()),
}));

describe("web server", () => {
  let mockServer: {
    listen: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      listen: vi.fn((_port: number, cb: () => void) => cb()),
      close: vi.fn((cb?: () => void) => cb?.()),
    };
    vi.spyOn(http, "createServer").mockReturnValue(mockServer as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PORT;
  });

  it("listens on default port 3000", async () => {
    delete process.env.PORT;
    const { startWebServer } = await import("@web/server.js");
    await startWebServer({
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });
    expect(mockServer.listen).toHaveBeenCalledWith(3000, expect.any(Function));
  });

  it("respects PORT env var", async () => {
    process.env.PORT = "8080";
    const { startWebServer } = await import("@web/server.js");
    await startWebServer({
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });
    expect(mockServer.listen).toHaveBeenCalledWith(8080, expect.any(Function));
  });
});
