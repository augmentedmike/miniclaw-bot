import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readFileTool, writeFileTool, listDirectoryTool } from "@tools/files.js";

const toolContext = { toolCallId: "test", messages: [] as never[], abortSignal: new AbortController().signal };

describe("file tools", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("read_file", () => {
    it("reads a file", async () => {
      const filePath = path.join(tmpDir, "test.txt");
      fs.writeFileSync(filePath, "hello world");
      const result = await readFileTool.execute({ path: filePath, maxLines: undefined }, toolContext);
      expect(result).toBe("hello world");
    });

    it("respects maxLines", async () => {
      const filePath = path.join(tmpDir, "lines.txt");
      fs.writeFileSync(filePath, "line1\nline2\nline3\nline4\nline5");
      const result = await readFileTool.execute({ path: filePath, maxLines: 2 }, toolContext);
      expect(result).toContain("line1");
      expect(result).toContain("line2");
      expect(result).toContain("3 more lines");
    });

    it("returns error for missing file", async () => {
      const result = await readFileTool.execute({ path: "/nonexistent/file.txt", maxLines: undefined }, toolContext);
      expect(result).toContain("[error]");
    });
  });

  describe("write_file", () => {
    it("creates a new file", async () => {
      const filePath = path.join(tmpDir, "new.txt");
      const result = await writeFileTool.execute({ path: filePath, content: "hello" }, toolContext);
      expect(result).toContain("Wrote 5 bytes");
      expect(fs.readFileSync(filePath, "utf8")).toBe("hello");
    });

    it("creates parent directories", async () => {
      const filePath = path.join(tmpDir, "sub", "dir", "file.txt");
      await writeFileTool.execute({ path: filePath, content: "nested" }, toolContext);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe("list_directory", () => {
    it("lists directory contents", async () => {
      fs.writeFileSync(path.join(tmpDir, "a.txt"), "a");
      fs.mkdirSync(path.join(tmpDir, "subdir"));
      const result = await listDirectoryTool.execute({ path: tmpDir, recursive: undefined }, toolContext);
      expect(result).toContain("a.txt");
      expect(result).toContain("subdir/");
    });

    it("returns error for missing directory", async () => {
      const result = await listDirectoryTool.execute({ path: "/nonexistent/dir", recursive: undefined }, toolContext);
      expect(result).toContain("[error]");
    });

    it("lists recursively", async () => {
      fs.writeFileSync(path.join(tmpDir, "root.txt"), "r");
      fs.mkdirSync(path.join(tmpDir, "sub"));
      fs.writeFileSync(path.join(tmpDir, "sub", "nested.txt"), "n");
      const result = await listDirectoryTool.execute({ path: tmpDir, recursive: true }, toolContext);
      expect(result).toContain("root.txt");
      expect(result).toContain("sub/");
      expect(result).toContain("nested.txt");
    });

    it("returns empty directory message", async () => {
      const empty = path.join(tmpDir, "empty");
      fs.mkdirSync(empty);
      const result = await listDirectoryTool.execute({ path: empty, recursive: undefined }, toolContext);
      expect(result).toBe("(empty directory)");
    });
  });

  describe("read_file edge cases", () => {
    it("returns (empty file) for empty files", async () => {
      const filePath = path.join(tmpDir, "empty.txt");
      fs.writeFileSync(filePath, "");
      const result = await readFileTool.execute({ path: filePath, maxLines: undefined }, toolContext);
      expect(result).toBe("(empty file)");
    });

    it("returns full content when maxLines exceeds file length", async () => {
      const filePath = path.join(tmpDir, "short.txt");
      fs.writeFileSync(filePath, "one\ntwo");
      const result = await readFileTool.execute({ path: filePath, maxLines: 100 }, toolContext);
      expect(result).toBe("one\ntwo");
    });
  });

  describe("write_file error handling", () => {
    it("returns error when write fails (invalid path)", async () => {
      // Attempt to write to a path under a file (not a directory)
      const filePath = path.join(tmpDir, "afile.txt");
      fs.writeFileSync(filePath, "content");
      const badPath = path.join(filePath, "subdir", "nested.txt");
      const result = await writeFileTool.execute({ path: badPath, content: "test" }, toolContext);
      expect(result).toContain("[error]");
    });
  });

  describe("list_directory file size formatting", () => {
    it("formats KB sizes", async () => {
      const filePath = path.join(tmpDir, "medium.txt");
      // Create a file slightly larger than 1KB
      fs.writeFileSync(filePath, "x".repeat(2048));
      const result = await listDirectoryTool.execute({ path: tmpDir, recursive: undefined }, toolContext);
      expect(result).toContain("KB");
    });

    it("formats MB sizes", async () => {
      const filePath = path.join(tmpDir, "large.bin");
      // Create a file larger than 1MB
      fs.writeFileSync(filePath, Buffer.alloc(1024 * 1024 + 100));
      const result = await listDirectoryTool.execute({ path: tmpDir, recursive: undefined }, toolContext);
      expect(result).toContain("MB");
    });

    it("formats small byte sizes", async () => {
      const filePath = path.join(tmpDir, "tiny.txt");
      fs.writeFileSync(filePath, "hi");
      const result = await listDirectoryTool.execute({ path: tmpDir, recursive: undefined }, toolContext);
      expect(result).toContain("2B");
    });
  });

  describe("list_directory recursive edge cases", () => {
    it("returns empty directory message for recursive listing", async () => {
      const emptyDir = path.join(tmpDir, "emptyrecurse");
      fs.mkdirSync(emptyDir);
      const result = await listDirectoryTool.execute({ path: emptyDir, recursive: true }, toolContext);
      expect(result).toBe("(empty directory)");
    });
  });

  describe("list_directory stat error handling", () => {
    it("handles stat error gracefully for broken symlinks", async () => {
      // Create a broken symlink that readdir finds but stat fails on
      const brokenLink = path.join(tmpDir, "broken-link");
      fs.symlinkSync("/nonexistent/target/file", brokenLink);

      const result = await listDirectoryTool.execute({ path: tmpDir, recursive: undefined }, toolContext);
      // Should still list the entry without crashing, just without size info
      expect(result).toContain("broken-link");
    });
  });
});
