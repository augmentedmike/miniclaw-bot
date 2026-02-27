import { describe, expect, it } from "vitest";
import {
  detectEventDriven,
  detectAsyncFlow,
  detectProcessLifecycle,
  detectStateSwitching,
  detectErrorRecovery,
  scanFile,
  formatAscii,
  formatMermaid,
} from "./state-machine.js";

describe("state-machine", () => {
  describe("detectEventDriven", () => {
    it("detects event handler registrations", () => {
      const code = `
proc.on("data", (chunk) => { buffer += chunk; });
proc.on("close", (code) => { resolve(buffer); });
proc.on("error", (err) => { reject(err); });
`;
      const result = detectEventDriven(code, "test.ts");
      expect(result).not.toBeNull();
      expect(result!.states.length).toBeGreaterThanOrEqual(3);
      expect(result!.transitions.length).toBeGreaterThanOrEqual(3);
    });

    it("marks error events as error states", () => {
      const code = `
bot.on("message", handler);
bot.on("error", errorHandler);
`;
      const result = detectEventDriven(code, "test.ts");
      expect(result).not.toBeNull();
      const errorState = result!.states.find((s) => s.kind === "error");
      expect(errorState).toBeDefined();
    });

    it("marks close/end as terminal states", () => {
      const code = `
stream.on("data", onData);
stream.on("end", onEnd);
`;
      const result = detectEventDriven(code, "test.ts");
      expect(result).not.toBeNull();
      const terminal = result!.states.find((s) => s.kind === "terminal");
      expect(terminal).toBeDefined();
    });

    it("returns null for fewer than 2 events", () => {
      const code = `proc.on("data", handler);`;
      const result = detectEventDriven(code, "test.ts");
      expect(result).toBeNull();
    });
  });

  describe("detectAsyncFlow", () => {
    it("detects sequential await chains", () => {
      const code = `
export async function process() {
  const data = await loadData();
  const result = await transform(data);
  await saveResult(result);
}
`;
      const result = detectAsyncFlow(code, "test.ts");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("process_flow");
      expect(result!.states.length).toBeGreaterThanOrEqual(4); // start + 3 awaits + complete
    });

    it("detects try/catch in async flows", () => {
      const code = `
export async function fetchData() {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (err) {
    console.error(err);
  }
}
`;
      const result = detectAsyncFlow(code, "test.ts");
      expect(result).not.toBeNull();
      const errorState = result!.states.find((s) => s.kind === "error");
      expect(errorState).toBeDefined();
    });

    it("returns null for single await", () => {
      const code = `
export async function simple() {
  await doThing();
}
`;
      const result = detectAsyncFlow(code, "test.ts");
      expect(result).toBeNull();
    });
  });

  describe("detectProcessLifecycle", () => {
    it("detects spawn with stdout/stderr/close/error", () => {
      const code = `
const proc = spawn("ls", ["-la"]);
proc.stdout.on("data", (chunk) => {});
proc.stderr.on("data", (chunk) => {});
proc.on("close", (code) => {});
proc.on("error", (err) => {});
`;
      const result = detectProcessLifecycle(code, "test.ts");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("process_lifecycle");
      expect(result!.states.find((s) => s.name === "stdout_data")).toBeDefined();
      expect(result!.states.find((s) => s.name === "closed")).toBeDefined();
      expect(result!.states.find((s) => s.name === "error")).toBeDefined();
    });

    it("returns null when no spawn present", () => {
      const code = `const x = 1;`;
      const result = detectProcessLifecycle(code, "test.ts");
      expect(result).toBeNull();
    });
  });

  describe("detectStateSwitching", () => {
    it("detects state variable comparisons", () => {
      const code = `
if (state === "idle") startWork();
if (state === "running") waitForCompletion();
if (state === "done") cleanup();
`;
      const result = detectStateSwitching(code, "test.ts");
      expect(result).not.toBeNull();
      expect(result!.states.length).toBeGreaterThanOrEqual(3);
    });

    it("returns null for single state value", () => {
      const code = `if (status === "ok") proceed();`;
      const result = detectStateSwitching(code, "test.ts");
      expect(result).toBeNull();
    });
  });

  describe("detectErrorRecovery", () => {
    it("detects try/catch with fallback", () => {
      const code = `
try {
  await sendHtml(text);
} catch (err) {
  // fallback to plain text
  await sendPlain(text);
}
`;
      const result = detectErrorRecovery(code, "test.ts");
      expect(result).not.toBeNull();
      const fallbackState = result!.states.find((s) => s.name === "fallback");
      expect(fallbackState).toBeDefined();
    });

    it("detects try/catch with retry", () => {
      const code = `
try {
  await connect();
} catch (err) {
  // retry the connection
  await connect();
}
`;
      const result = detectErrorRecovery(code, "test.ts");
      expect(result).not.toBeNull();
      const retryTransition = result!.transitions.find((t) => t.trigger === "retry");
      expect(retryTransition).toBeDefined();
    });

    it("returns null with no try/catch", () => {
      const code = `const x = 1 + 2;`;
      const result = detectErrorRecovery(code, "test.ts");
      expect(result).toBeNull();
    });
  });

  describe("scanFile", () => {
    it("collects all detected machines from a file", () => {
      const code = `
const proc = spawn("echo", ["hi"]);
proc.stdout.on("data", () => {});
proc.on("close", () => {});
proc.on("error", () => {});

try { x(); } catch { /* fallback */ y(); }
`;
      const machines = scanFile(code, "test.ts");
      expect(machines.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("formatAscii", () => {
    it("formats machines as ASCII", () => {
      const machines = [{
        file: "test.ts",
        name: "test_flow",
        states: [
          { name: "start", kind: "initial" as const },
          { name: "running", kind: "normal" as const },
          { name: "done", kind: "terminal" as const },
        ],
        transitions: [
          { from: "start", to: "running", trigger: "begin" },
          { from: "running", to: "done", trigger: "finish" },
        ],
      }];
      const output = formatAscii(machines);
      expect(output).toContain("STATE MACHINE MAP");
      expect(output).toContain("test_flow");
      expect(output).toContain("●"); // initial
      expect(output).toContain("◉"); // terminal
    });

    it("shows empty message for no machines", () => {
      const output = formatAscii([]);
      expect(output).toContain("No state machines detected");
    });
  });

  describe("formatMermaid", () => {
    it("formats machines as Mermaid stateDiagram", () => {
      const machines = [{
        file: "test.ts",
        name: "test_flow",
        states: [
          { name: "start", kind: "initial" as const },
          { name: "error", kind: "error" as const },
          { name: "done", kind: "terminal" as const },
        ],
        transitions: [
          { from: "start", to: "done", trigger: "ok" },
          { from: "start", to: "error", trigger: "fail" },
        ],
      }];
      const output = formatMermaid(machines);
      expect(output).toContain("stateDiagram-v2");
      expect(output).toContain("[*] --> start");
      expect(output).toContain("done --> [*]");
      expect(output).toContain("<<error>>");
    });
  });
});
