#!/usr/bin/env node
/**
 * Pre-flight spike for the image-upload plan.
 *
 * Verifies two things the plan depends on:
 *   1. Whether @tryghost/admin-api forwards `purpose` and `ref` on images.upload.
 *   2. Ghost's actual limits on posts.feature_image_alt and feature_image_caption.
 *
 * Usage:
 *   cp .env.example .env   # set GHOST_ADMIN_API_URL + GHOST_ADMIN_API_KEY
 *   node scripts/spike-image-upload.js
 *
 * Reports results to stdout. Nothing is written to Ghost permanently except:
 *   - one uploaded test image (orphaned; Ghost has no delete endpoint)
 *   - one draft post that the script attempts to delete at the end
 */
import 'dotenv/config';
import GhostAdminAPI from '@tryghost/admin-api';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

const api = new GhostAdminAPI({
  url: process.env.GHOST_ADMIN_API_URL,
  key: process.env.GHOST_ADMIN_API_KEY,
  version: 'v5.0',
});

async function makeSquarePng() {
  const p = path.join(os.tmpdir(), `spike-${Date.now()}.png`);
  await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 1 } },
  })
    .png()
    .toFile(p);
  return p;
}

async function testPurposeAndRef() {
  console.log('\n=== Test 1: purpose + ref forwarding ===');
  const file = await makeSquarePng();
  try {
    const result = await api.images.upload({ file, purpose: 'icon', ref: 'spike-ref-123' });
    console.log('Raw result:', JSON.stringify(result, null, 2));
    const refEchoed = result?.ref === 'spike-ref-123' || result?.[0]?.ref === 'spike-ref-123';
    console.log(
      refEchoed ? 'RESULT: ref round-trips ✓' : 'RESULT: ref NOT echoed — SDK drops it ✗'
    );
    console.log('-> If ref came back, purpose is probably forwarded too. Proceed via SDK.');
    console.log('-> If ref missing, fall back to raw multipart POST in src/services/images.js.');
  } catch (err) {
    console.log('Upload failed:', err.message);
    console.log('If error mentions "icon requires square" → purpose IS forwarded (good).');
    console.log('If error is generic validation → purpose likely ignored.');
  } finally {
    fs.unlink(file, () => {});
  }
}

async function testAltCaptionLimits() {
  console.log('\n=== Test 2: alt / caption length limits ===');
  const tryLength = async (field, len) => {
    const post = await api.posts.add(
      {
        title: `spike-${field}-${len}`,
        status: 'draft',
        html: '<p>spike</p>',
        [field]: 'x'.repeat(len),
        feature_image: 'https://static.ghost.org/v5.0.0/images/publication-cover.jpg',
      },
      { source: 'html' }
    );
    await api.posts.delete({ id: post.id });
    return true;
  };
  for (const field of ['feature_image_alt', 'feature_image_caption']) {
    let lo = 0,
      hi = 5000,
      maxOk = 0;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      try {
        await tryLength(field, mid);
        maxOk = mid;
        lo = mid + 1;
      } catch {
        hi = mid - 1;
      }
    }
    console.log(`${field}: max accepted length = ${maxOk}`);
  }
}

(async () => {
  if (!process.env.GHOST_ADMIN_API_URL || !process.env.GHOST_ADMIN_API_KEY) {
    console.error('Set GHOST_ADMIN_API_URL and GHOST_ADMIN_API_KEY in .env first.');
    process.exit(1);
  }
  await testPurposeAndRef();
  await testAltCaptionLimits();
})().catch((e) => {
  console.error('Spike failed:', e);
  process.exit(1);
});
