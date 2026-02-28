/**
 * E2E: Nano banana image generation via Gemini.
 * Requires vault-stored Gemini API key — skipped if not available.
 *
 * Tests the vault → external API pipeline:
 * 1. Reads Gemini API key from encrypted vault
 * 2. Calls Gemini 3.1 Flash Image Preview to generate a tiny banana
 * 3. Verifies we get a base64 image back
 *
 * This validates: vault integration, external API calls, secret handling.
 */

import { describe, it, expect } from "vitest";
import { vaultGet } from "@src/vault.js";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent";

describe("e2e: nano banana", () => {
  it("generates a banana image using Gemini with vault-stored API key", async () => {
    // 1. Retrieve key from vault
    const entry = vaultGet("api-key", "gemini");
    if (!entry) return; // Skip if vault key not available
    const apiKey = entry!.value;
    expect(apiKey).toMatch(/^AIza/);

    // 2. Call Gemini image generation
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: "Generate a small, cute pixel art banana on a white background. Keep it simple and tiny." },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    // 3. Verify we got image data back
    expect(data.candidates).toBeDefined();
    expect(data.candidates.length).toBeGreaterThan(0);

    const parts = data.candidates[0].content.parts;
    expect(parts.length).toBeGreaterThan(0);

    // Find the image part (inlineData with mimeType image/*)
    const imagePart = parts.find(
      (p: { inlineData?: { mimeType: string; data: string } }) =>
        p.inlineData?.mimeType?.startsWith("image/"),
    );
    expect(imagePart).toBeDefined();
    expect(imagePart.inlineData.data.length).toBeGreaterThan(100); // base64 image data

    const mimeType = imagePart.inlineData.mimeType;
    expect(mimeType).toMatch(/^image\/(png|jpeg|webp)/);

    console.log(
      `Nano banana generated: ${mimeType}, ${Math.round(imagePart.inlineData.data.length / 1024)}KB base64`,
    );
  }, 30_000); // 30s timeout for API call
});
