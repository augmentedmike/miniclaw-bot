import type { IncomingMessage, ServerResponse } from "node:http";
import { runAgent } from "../agent.js";
import { HTML } from "./ui.js";
import { KANBAN_HTML } from "./kanban-ui.js";
import { listTasks, boardSummary } from "../kanban.js";
import type { MinicawConfig } from "../types.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

export function createRequestHandler(
  config: MinicawConfig,
): (req: IncomingMessage, res: ServerResponse) => void {
  return async (req, res) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    // CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    // Health check
    if (url === "/health" && method === "GET") {
      sendJson(res, 200, { ok: true });
      return;
    }

    // Serve chat UI
    if (url === "/" && method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(HTML),
      });
      res.end(HTML);
      return;
    }

    // Kanban board UI
    if (url === "/kanban" && method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(KANBAN_HTML),
      });
      res.end(KANBAN_HTML);
      return;
    }

    // Kanban API — JSON board data
    if (url === "/api/kanban" && method === "GET") {
      try {
        const tasks = listTasks();
        const summary = boardSummary();
        sendJson(res, 200, { tasks, summary });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJson(res, 500, { error: msg });
      }
      return;
    }

    // Chat endpoint — SSE streaming
    if (url === "/api/chat" && method === "POST") {
      let body: string;
      try {
        body = await readBody(req);
      } catch {
        sendJson(res, 400, { error: "Failed to read request body" });
        return;
      }

      let message: string;
      try {
        const parsed = JSON.parse(body);
        message = parsed?.message;
      } catch {
        sendJson(res, 400, { error: "Invalid JSON" });
        return;
      }

      if (!message || typeof message !== "string") {
        sendJson(res, 400, { error: "Missing or invalid 'message' field" });
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      const sendEvent = (data: unknown) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        await runAgent(
          [{ role: "user", content: message }],
          config,
          {
            channel: "api",
            userId: "default",
            onText: (text) => sendEvent({ type: "text", data: text }),
            onToolCall: (name, args) => sendEvent({ type: "tool", name, args }),
          },
        );
        sendEvent({ type: "done" });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        sendEvent({ type: "error", data: errMsg });
      }

      res.end();
      return;
    }

    // 404
    sendJson(res, 404, { error: "Not found" });
  };
}
