#!/usr/bin/env node
/**
 * Pre-flight spike for the image-upload plan.
 *
 * Runs real probes against a real Ghost instance and prints a
 * pass/fail report. Exits 0 if every probe resolved (not necessarily
 * passed — read the report), 1 if env is missing or something crashed.
 *
 * What it checks:
 *   1. Does @tryghost/admin-api forward `purpose` and `ref` on
 *      images.upload, or does it silently drop unknown fields?
 *   2. What are Ghost's actual max lengths for
 *      posts.feature_image_alt and posts.feature_image_caption?
 *
 * Usage:
 *   # Option A — use repo .env
 *   cp .env.example .env  # set GHOST_ADMIN_API_URL + GHOST_ADMIN_API_KEY
 *   node scripts/spike-image-upload.js
 *
 *   # Option B — inline, from any console with creds
 *   GHOST_ADMIN_API_URL=https://your-site.ghost.io \
 *   GHOST_ADMIN_API_KEY=YOUR_KEY \
 *     node scripts/spike-image-upload.js
 *
 * Side effects on the target Ghost:
 *   - uploads one 64x64 PNG (orphaned; Ghost has no delete-image endpoint)
 *   - creates and immediately deletes ~26 draft posts during the
 *     binary-search for alt/caption length limits
 */
import 'dotenv/config';
import GhostAdminAPI from '@tryghost/admin-api';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

const REF = `spike-ref-${Date.now()}`;

function pass(label, detail = '') {
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}
function fail(label, detail = '') {
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}
function info(label, detail = '') {
  console.log(`  · ${label}${detail ? ` — ${detail}` : ''}`);
}

function refDidRoundTrip(result, expected) {
  if (!result) return false;
  if (result.ref === expected) return true;
  if (Array.isArray(result) && result[0]?.ref === expected) return true;
  if (Array.isArray(result?.images) && result.images[0]?.ref === expected) return true;
  return false;
}

async function makeSquarePng() {
  const p = path.join(os.tmpdir(), `spike-${Date.now()}.png`);
  await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 1 } },
  })
    .png()
    .toFile(p);
  return p;
}

async function probePurposeAndRef(api) {
  console.log('\n── Probe 1: purpose + ref forwarding ──');
  const file = await makeSquarePng();
  try {
    const result = await api.images.upload({ file, purpose: 'icon', ref: REF });
    info('SDK accepted the call');
    console.log('  raw response:', JSON.stringify(result));
    if (refDidRoundTrip(result, REF)) {
      pass('ref round-trips', 'proceed via SDK for both purpose and ref');
      return 'sdk-ok';
    }
    fail('ref not echoed', 'SDK likely drops unknown fields — fall back to raw multipart POST');
    return 'sdk-drops-fields';
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.log('  error:', msg);
    if (/icon/i.test(msg) && /(square|size|dimension|format)/i.test(msg)) {
      pass('server-side icon validation fired', 'purpose IS forwarded; ref support still unknown');
      return 'purpose-only';
    }
    fail('generic failure', 'cannot confirm purpose/ref support from this response');
    return 'unknown';
  } finally {
    fs.unlink(file, () => {});
  }
}

async function measureMaxLength(probe, { lo = 0, hi = 5000 } = {}) {
  let maxOk = -1;
  let probes = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    probes += 1;

    const accepted = await probe(mid);
    if (accepted) {
      maxOk = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { maxOk, probes };
}

function makePostFieldProbe(api, field) {
  return async (len) => {
    try {
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
    } catch {
      return false;
    }
  };
}

async function probeFieldLimits(api) {
  console.log('\n── Probe 2: feature_image_alt / _caption max length ──');
  for (const field of ['feature_image_alt', 'feature_image_caption']) {
    const { maxOk, probes } = await measureMaxLength(makePostFieldProbe(api, field));
    if (maxOk > 0) {
      pass(`${field}`, `max accepted = ${maxOk} chars (${probes} probes)`);
    } else {
      fail(`${field}`, 'Ghost rejected every length — check creds / permissions');
    }
  }
}

function assertEnv() {
  const missing = ['GHOST_ADMIN_API_URL', 'GHOST_ADMIN_API_KEY'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    console.error('Set them via .env or inline before `node scripts/spike-image-upload.js`.');
    process.exit(1);
  }
}

async function main() {
  assertEnv();
  console.log(`Target: ${process.env.GHOST_ADMIN_API_URL}`);

  const api = new GhostAdminAPI({
    url: process.env.GHOST_ADMIN_API_URL,
    key: process.env.GHOST_ADMIN_API_KEY,
    version: 'v5.0',
  });

  const purposeResult = await probePurposeAndRef(api);
  await probeFieldLimits(api);

  console.log('\n── Summary ──');
  switch (purposeResult) {
    case 'sdk-ok':
      console.log('PR 2 path: use SDK — api.images.upload({file, purpose, ref})');
      break;
    case 'purpose-only':
      console.log('PR 2 path: SDK forwards purpose but drops ref — either');
      console.log('  (a) accept ref loss and rely on purpose, or');
      console.log('  (b) fall back to raw multipart in src/services/images.js');
      break;
    case 'sdk-drops-fields':
    case 'unknown':
    default:
      console.log('PR 2 path: raw multipart POST to /ghost/api/admin/images/upload/');
      console.log('  (reuse auth helper in src/services/ghostApiClient.js)');
  }
  console.log('\nFeed the _alt / _caption numbers into src/schemas/common.js (PR 3).');
}

main().catch((e) => {
  console.error('\nSpike crashed:', e);
  process.exit(1);
});
