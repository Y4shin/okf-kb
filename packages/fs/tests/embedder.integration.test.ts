import { describe, it, expect } from 'vitest';
import { TransformersEmbedder } from '../src/embedder.js';

// Opt-in integration test: exercises the real @xenova/transformers pipeline.
// Skipped unless KB_TEST_REAL_EMBEDDER=1 is set, since it may download a
// ~100-300MB model on first run. All other tests use FakeEmbedder.
const enabled = process.env.KB_TEST_REAL_EMBEDDER === '1';

describe.skipIf(!enabled)('TransformersEmbedder (integration, opt-in)', () => {
  it('embeds text into a non-trivial vector', async () => {
    const embedder = new TransformersEmbedder();
    const vec = await embedder.embed('hello world, this is a knowledge base note.');
    expect(Array.isArray(vec)).toBe(true);
    expect(vec.length).toBeGreaterThan(0);
    expect(vec.some((v) => v !== 0)).toBe(true);
  }, 120_000);
});
