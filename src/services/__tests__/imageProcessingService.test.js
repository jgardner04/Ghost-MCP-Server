import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: createMockContextLogger(),
}));

// Import under test (real sharp, real filesystem)
const { processImage } = await import('../imageProcessingService.js');

const tmpRoot = path.join(os.tmpdir(), `ghost-mcp-img-test-${Date.now()}`);
const fixtures = {};

async function makeRasterFixture(format, width, height = width) {
  const file = path.join(tmpRoot, `in-${format}-${width}.${format === 'jpeg' ? 'jpg' : format}`);
  await sharp({
    create: {
      width,
      height,
      channels: format === 'png' ? 4 : 3,
      background: { r: 10, g: 50, b: 150, alpha: 1 },
    },
  })
    [format]()
    .toFile(file);
  return file;
}

beforeAll(async () => {
  await fs.mkdir(tmpRoot, { recursive: true });

  fixtures.pngSmall = await makeRasterFixture('png', 800);
  fixtures.pngLarge = await makeRasterFixture('png', 2000);
  fixtures.jpegSmall = await makeRasterFixture('jpeg', 800);
  fixtures.jpegLarge = await makeRasterFixture('jpeg', 2000);
  fixtures.webpSmall = await makeRasterFixture('webp', 800);
  fixtures.webpLarge = await makeRasterFixture('webp', 2000);

  // SVG: write minimal vector source
  fixtures.svg = path.join(tmpRoot, 'in.svg');
  await fs.writeFile(
    fixtures.svg,
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#39f"/></svg>'
  );

  // GIF: sharp cannot reliably create animated GIFs across versions; use a
  // known-valid 1x1 transparent GIF89a byte sequence for a deterministic fixture.
  fixtures.gif = path.join(tmpRoot, 'in.gif');
  await fs.writeFile(
    fixtures.gif,
    Buffer.from(
      '47494638396101000100800000ffffff00000021f90401000001002c00000000010001000002024401003b',
      'hex'
    )
  );

  // ICO: minimal 1x1 ICO header (used only for passthrough byte comparison).
  fixtures.ico = path.join(tmpRoot, 'in.ico');
  await fs.writeFile(
    fixtures.ico,
    Buffer.from(
      '00000100010001010000010020003000000016000000280000000100000002000000010020000000000004000000000000000000000000000000000000000000000000000000000000000000000000',
      'hex'
    )
  );
});

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function metaOf(file) {
  return sharp(file).metadata();
}

describe('processImage — format passthrough', () => {
  it('PNG <= 1200: preserves format and passes through unmodified', async () => {
    const out = await processImage(fixtures.pngSmall, tmpRoot);
    expect(path.extname(out).toLowerCase()).toBe('.png');
    const m = await metaOf(out);
    expect(m.format).toBe('png');
    expect(m.width).toBe(800);
  });

  it('PNG > 1200: resized but still PNG (no JPEG conversion)', async () => {
    const out = await processImage(fixtures.pngLarge, tmpRoot);
    expect(path.extname(out).toLowerCase()).toBe('.png');
    const m = await metaOf(out);
    expect(m.format).toBe('png');
    expect(m.width).toBe(1200);
  });

  it('JPEG <= 1200: passes through as JPEG', async () => {
    const out = await processImage(fixtures.jpegSmall, tmpRoot);
    expect(path.extname(out).toLowerCase()).toMatch(/\.jpe?g$/);
    const m = await metaOf(out);
    expect(m.format).toBe('jpeg');
    expect(m.width).toBe(800);
  });

  it('JPEG > 1200: resized as JPEG', async () => {
    const out = await processImage(fixtures.jpegLarge, tmpRoot);
    const m = await metaOf(out);
    expect(m.format).toBe('jpeg');
    expect(m.width).toBe(1200);
  });

  it('WEBP <= 1200: passes through as WEBP', async () => {
    const out = await processImage(fixtures.webpSmall, tmpRoot);
    const m = await metaOf(out);
    expect(m.format).toBe('webp');
    expect(m.width).toBe(800);
  });

  it('WEBP > 1200: resized as WEBP', async () => {
    const out = await processImage(fixtures.webpLarge, tmpRoot);
    const m = await metaOf(out);
    expect(m.format).toBe('webp');
    expect(m.width).toBe(1200);
  });

  it('SVG: passthrough — output bytes identical to input (never touched by sharp)', async () => {
    const out = await processImage(fixtures.svg, tmpRoot);
    expect(path.extname(out).toLowerCase()).toBe('.svg');
    const [a, b] = await Promise.all([fs.readFile(fixtures.svg), fs.readFile(out)]);
    expect(a.equals(b)).toBe(true);
  });

  it('GIF: passthrough — output bytes identical to input (animation-safe)', async () => {
    const out = await processImage(fixtures.gif, tmpRoot);
    expect(path.extname(out).toLowerCase()).toBe('.gif');
    const [a, b] = await Promise.all([fs.readFile(fixtures.gif), fs.readFile(out)]);
    expect(a.equals(b)).toBe(true);
  });

  it('ICO: passthrough — output bytes identical to input', async () => {
    const out = await processImage(fixtures.ico, tmpRoot, { purpose: 'icon' });
    expect(path.extname(out).toLowerCase()).toBe('.ico');
    const [a, b] = await Promise.all([fs.readFile(fixtures.ico), fs.readFile(out)]);
    expect(a.equals(b)).toBe(true);
  });

  it('output path is distinct from input path', async () => {
    const out = await processImage(fixtures.pngSmall, tmpRoot);
    expect(out).not.toBe(fixtures.pngSmall);
  });
});

describe('processImage — validation & errors', () => {
  it('rejects missing inputPath', async () => {
    await expect(processImage(undefined, tmpRoot)).rejects.toThrow(/Invalid processing parameters/);
  });

  it('rejects missing outputDir', async () => {
    await expect(processImage(fixtures.pngSmall, undefined)).rejects.toThrow(
      /Invalid processing parameters/
    );
  });

  it('throws when input file does not exist', async () => {
    await expect(processImage('/nonexistent/xyz.png', tmpRoot)).rejects.toThrow(
      /Input file does not exist/
    );
  });

  it('wraps sharp failures with context', async () => {
    const bogus = path.join(tmpRoot, 'bogus.png');
    await fs.writeFile(bogus, 'not an image');
    await expect(processImage(bogus, tmpRoot)).rejects.toThrow(/Image processing failed/);
  });
});
