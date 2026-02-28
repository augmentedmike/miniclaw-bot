import http from "node:http";
import { createRequestHandler } from "./handler.js";
import type { MinicawConfig } from "../types.js";

export async function startWebServer(config: MinicawConfig): Promise<void> {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  const handler = createRequestHandler(config);

  const server = http.createServer(handler);

  const shutdown = () => {
    console.log("\nStopping web server...");
    server.close(() => {
      console.log("Web server stopped.");
      process.exit(0);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await new Promise<void>((resolve) => {
    server.listen(port, () => {
      console.log(`Web server listening on http://localhost:${port}`);
      resolve();
    });
  });

  // Keep process alive — server.listen holds the event loop open
}
