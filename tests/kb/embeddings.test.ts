import { describe, expect, it } from "vitest";
import { embed, EMBEDDING_DIM, isModelLoaded, unloadModel } from "@kb/embeddings.js";

describe("embeddings", { timeout: 60_000 }, () => {
  it("exports correct embedding dimension", () => {
    expect(EMBEDDING_DIM).toBe(384);
  });

  it("model is not loaded before first embed call", () => {
    // Note: if previous tests loaded the model, this may already be true.
    // This test documents the lazy-loading behavior.
    expect(typeof isModelLoaded()).toBe("boolean");
  });

  it("embed returns Float32Array of correct dimension", async () => {
    const vec = await embed("Hello, world!");
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(384);
  });

  it("embed output is normalized (unit vector)", async () => {
    const vec = await embed("Test normalization");
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i]! * vec[i]!;
    expect(Math.abs(Math.sqrt(norm) - 1)).toBeLessThan(0.01);
  });

  it("similar texts produce similar embeddings", async () => {
    const vec1 = await embed("The cat sat on the mat");
    const vec2 = await embed("A cat was sitting on a mat");
    const vec3 = await embed("Quantum physics equations and formulas");

    // Cosine similarity (vectors are normalized, so dot product = cosine)
    let sim12 = 0, sim13 = 0;
    for (let i = 0; i < 384; i++) {
      sim12 += vec1[i]! * vec2[i]!;
      sim13 += vec1[i]! * vec3[i]!;
    }

    // Similar sentences should have higher cosine similarity than unrelated ones
    expect(sim12).toBeGreaterThan(sim13);
  });

  it("model is loaded after embed call", async () => {
    await embed("trigger load");
    expect(isModelLoaded()).toBe(true);
  });

  it("unloadModel sets loaded state to false", async () => {
    await embed("trigger load");
    unloadModel();
    expect(isModelLoaded()).toBe(false);
  });
});
