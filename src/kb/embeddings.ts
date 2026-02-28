/**
 * Local embedding via @huggingface/transformers.
 * Uses Xenova/all-MiniLM-L6-v2 — 384-dimensional, ONNX, runs entirely on CPU.
 * Model is lazy-loaded on first embed() call.
 */

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIM = 384;

let pipeline: Awaited<ReturnType<typeof getPipeline>> | null = null;

async function getPipeline() {
  const { pipeline: createPipeline } = await import("@huggingface/transformers");
  return createPipeline("feature-extraction", MODEL_NAME, {
    dtype: "fp32",
  });
}

/**
 * Generate a 384-dimensional embedding for the given text.
 * The model is loaded lazily on first call (~1-2s cold start, ~5ms thereafter).
 */
export async function embed(text: string): Promise<Float32Array> {
  if (!pipeline) {
    pipeline = await getPipeline();
  }
  const output = await pipeline(text, { pooling: "mean", normalize: true });
  return new Float32Array(output.data as ArrayLike<number>);
}

/** Check if the model is currently loaded. */
export function isModelLoaded(): boolean {
  return pipeline !== null;
}

/** Unload the model to free memory. */
export function unloadModel(): void {
  pipeline = null;
}
