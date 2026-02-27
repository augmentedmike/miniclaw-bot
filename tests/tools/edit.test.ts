import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { editFileTool } from "@tools/edit.js";

const ctx = { toolCallId: "test", messages: [] as never[], abortSignal: new AbortController().signal };

describe("edit_file tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-edit-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("replaces a unique string", async () => {
    const file = path.join(tmpDir, "test.txt");
    fs.writeFileSync(file, "hello world\nfoo bar\n");
    const result = await editFileTool.execute(
      { path: file, old_string: "foo bar", new_string: "baz qux", replace_all: undefined },
      ctx,
    );
    expect(result).toContain("Replaced 1 occurrence");
    expect(fs.readFileSync(file, "utf8")).toBe("hello world\nbaz qux\n");
  });

  it("errors when old_string not found", async () => {
    const file = path.join(tmpDir, "test.txt");
    fs.writeFileSync(file, "hello world\n");
    const result = await editFileTool.execute(
      { path: file, old_string: "nonexistent", new_string: "x", replace_all: undefined },
      ctx,
    );
    expect(result).toContain("[error]");
    expect(result).toContain("not found");
  });

  it("errors when old_string has multiple matches without replace_all", async () => {
    const file = path.join(tmpDir, "test.txt");
    fs.writeFileSync(file, "aaa\nbbb\naaa\n");
    const result = await editFileTool.execute(
      { path: file, old_string: "aaa", new_string: "ccc", replace_all: undefined },
      ctx,
    );
    expect(result).toContain("[error]");
    expect(result).toContain("2 matches");
  });

  it("replaces all occurrences with replace_all", async () => {
    const file = path.join(tmpDir, "test.txt");
    fs.writeFileSync(file, "aaa\nbbb\naaa\n");
    const result = await editFileTool.execute(
      { path: file, old_string: "aaa", new_string: "ccc", replace_all: true },
      ctx,
    );
    expect(result).toContain("Replaced 2 occurrence");
    expect(fs.readFileSync(file, "utf8")).toBe("ccc\nbbb\nccc\n");
  });

  it("errors for nonexistent file", async () => {
    const result = await editFileTool.execute(
      { path: path.join(tmpDir, "nope.txt"), old_string: "a", new_string: "b", replace_all: undefined },
      ctx,
    );
    expect(result).toContain("[error]");
  });
});
