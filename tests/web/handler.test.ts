import { describe, expect, it, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

vi.mock("@src/agent.js", () => ({
  runAgent: vi.fn(async (_msgs, _config, options) => {
    options?.onText?.("Hello ");
    options?.onText?.("world");
    options?.onToolCall?.("shell_exec", { command: "ls" });
    return {
      text: "Hello world",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "Hello world" },
      ],
    };
  }),
}));

vi.mock("@web/ui.js", () => ({
  HTML: "<html>test</html>",
}));

function createMockReq(method: string, url: string, body?: string): IncomingMessage {
  const { EventEmitter } = require("node:events");
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  if (body !== undefined) {
    process.nextTick(() => {
      req.emit("data", Buffer.from(body));
      req.emit("end");
    });
  } else {
    process.nextTick(() => req.emit("end"));
  }
  return req;
}

function createMockRes(): ServerResponse & {
  _status: number;
  _headers: Record<string, string>;
  _body: string;
} {
  const res = {
    _status: 0,
    _headers: {} as Record<string, string>,
    _body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      res._status = status;
      if (headers) Object.assign(res._headers, headers);
      return res;
    },
    write(chunk: string) {
      res._body += chunk;
      return true;
    },
    end(chunk?: string) {
      if (chunk) res._body += chunk;
    },
  } as any;
  return res;
}

describe("web request handler", () => {
  let handler: (req: IncomingMessage, res: ServerResponse) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { createRequestHandler } = await import("@web/handler.js");
    handler = createRequestHandler({
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });
  });

  it("GET / returns HTML", async () => {
    const req = createMockReq("GET", "/");
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._headers["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(res._body).toBe("<html>test</html>");
  });

  it("GET /health returns { ok: true }", async () => {
    const req = createMockReq("GET", "/health");
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body)).toEqual({ ok: true });
  });

  it("OPTIONS returns 204", async () => {
    const req = createMockReq("OPTIONS", "/api/chat");
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(204);
    expect(res._headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("unknown route returns 404", async () => {
    const req = createMockReq("GET", "/nope");
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(404);
    expect(JSON.parse(res._body)).toEqual({ error: "Not found" });
  });

  it("POST /api/chat streams SSE with text, tool, done events", async () => {
    const req = createMockReq("POST", "/api/chat", JSON.stringify({ message: "hi" }));
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._headers["Content-Type"]).toBe("text/event-stream");

    const events = res._body
      .split("\n\n")
      .filter(Boolean)
      .map((line: string) => JSON.parse(line.replace("data: ", "")));

    expect(events).toEqual([
      { type: "text", data: "Hello " },
      { type: "text", data: "world" },
      { type: "tool", name: "shell_exec", args: { command: "ls" } },
      { type: "done" },
    ]);
  });

  it("POST /api/chat passes channel: 'api' to runAgent", async () => {
    const { runAgent } = await import("@src/agent.js");
    const req = createMockReq("POST", "/api/chat", JSON.stringify({ message: "hi" }));
    const res = createMockRes();
    await handler(req, res);

    expect(runAgent).toHaveBeenCalledWith(
      [{ role: "user", content: "hi" }],
      expect.any(Object),
      expect.objectContaining({ channel: "api" }),
    );
  });

  it("POST /api/chat with missing message returns 400", async () => {
    const req = createMockReq("POST", "/api/chat", JSON.stringify({ foo: "bar" }));
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(JSON.parse(res._body).error).toMatch(/missing/i);
  });

  it("POST /api/chat with invalid JSON returns 400", async () => {
    const req = createMockReq("POST", "/api/chat", "not json{");
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(JSON.parse(res._body).error).toMatch(/invalid json/i);
  });

  it("POST /api/chat with empty message returns 400", async () => {
    const req = createMockReq("POST", "/api/chat", JSON.stringify({ message: "" }));
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("POST /api/chat with non-string message returns 400", async () => {
    const req = createMockReq("POST", "/api/chat", JSON.stringify({ message: 123 }));
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("agent error sends SSE error event instead of crashing", async () => {
    const { runAgent } = await import("@src/agent.js");
    (runAgent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("LLM exploded"));

    const req = createMockReq("POST", "/api/chat", JSON.stringify({ message: "boom" }));
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    const events = res._body
      .split("\n\n")
      .filter(Boolean)
      .map((line: string) => JSON.parse(line.replace("data: ", "")));

    const errorEvent = events.find((e: any) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent.data).toBe("LLM exploded");
  });
});
