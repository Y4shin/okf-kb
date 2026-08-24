// Embedder implementations: TransformersEmbedder (real, in-process @xenova/transformers)
// and FakeEmbedder (deterministic hash -> fixed-dim vector, no model download; used in tests).
import type { Embedder, Vector } from '@kb/core';
import { createHash } from 'node:crypto';

const FAKE_DIM = 32;

/** Deterministic, no-download embedder for tests: hashes the text into a fixed-dim vector. */
export class FakeEmbedder implements Embedder {
  constructor(private readonly dim: number = FAKE_DIM) {}

  async embed(text: string): Promise<Vector> {
    const vec = new Array<number>(this.dim).fill(0);
    // Bag-of-words hashing: each word nudges several dims, so texts sharing
    // vocabulary end up with higher cosine similarity than unrelated texts.
    const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const w of words) {
      const h = createHash('sha256').update(w).digest();
      for (let i = 0; i < 4; i++) {
        const idx = h[i] % this.dim;
        const sign = h[i + 4] % 2 === 0 ? 1 : -1;
        vec[idx] += sign;
      }
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

export interface TransformersEmbedderOptions {
  model?: string;
  cacheDir?: string;
}

/** In-process, offline @xenova/transformers embedder. Lazy-loads the pipeline
 * on first embed() call; caches the model under the given cacheDir (.kb/). */
export class TransformersEmbedder implements Embedder {
  private readonly model: string;
  private readonly cacheDir?: string;
  private pipelinePromise: Promise<(text: string, opts?: unknown) => Promise<{ data: Float32Array | number[] }>> | null = null;

  constructor(opts: TransformersEmbedderOptions = {}) {
    this.model = opts.model ?? 'Xenova/all-MiniLM-L6-v2';
    this.cacheDir = opts.cacheDir;
  }

  private async getPipeline() {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        const { pipeline, env } = await import('@xenova/transformers');
        if (this.cacheDir) {
          env.cacheDir = this.cacheDir;
        }
        env.allowRemoteModels = env.allowRemoteModels ?? true;
        const pipe = await pipeline('feature-extraction', this.model);
        return pipe as unknown as (text: string, opts?: unknown) => Promise<{ data: Float32Array | number[] }>;
      })();
    }
    return this.pipelinePromise;
  }

  async embed(text: string): Promise<Vector> {
    const pipe = await this.getPipeline();
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Iterable<number>);
  }
}
