const assert = require('node:assert/strict');
const fs = require('node:fs');
const appDir = process.env.IMMICH_APP_DIR;
if (!appDir) {
  throw new Error('IMMICH_APP_DIR must point to the deployed Immich application');
}

// This script lives in the installer snapshot, not the deployed application.
// Resolve Sharp from the application explicitly so Node does not search only
// the snapshot's tests/node_modules hierarchy.
const sharp = require(require.resolve('sharp', { paths: [appDir] }));

async function encode(format) {
  const output = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#336699' },
  })[format]().toBuffer();
  assert.ok(output.length > 0, `${format} encode produced no data`);
  console.log(`${format}_bytes=${output.length}`);
}

async function main() {
  assert.ok(sharp.versions.vips, 'Sharp did not report a libvips runtime version');
  // Sharp exposes AVIF through libvips' HEIF loader/encoder alias rather than
  // as a separate `format.avif` entry. Require buffer output because that is
  // the path exercised by the encodes below.
  assert.equal(sharp.format.heif?.output?.buffer, true, 'Sharp lacks AVIF output support');
  assert.equal(sharp.format.jxl?.output?.buffer, true, 'Sharp lacks JPEG-XL output support');

  console.log(JSON.stringify({ versions: sharp.versions, simd: sharp.simd() }));
  await Promise.all(['jpeg', 'avif', 'jxl'].map(encode));
  assertLinkedToSystemLibs();
}

// After the encodes above every codec library is mapped into this process, so
// /proc/self/maps shows what actually got loaded (ldd only shows what the
// addon asks for). Sharp's prebuilt @img/sharp-libvips-* bundle reports the same
// version string as a matching system libvips, so versions alone cannot tell
// them apart.
function assertLinkedToSystemLibs() {
  const maps = fs.readFileSync('/proc/self/maps', 'utf8');
  const mapped = (re) => [...new Set(maps.split('\n').map((l) => l.split(/\s+/)[5]).filter((p) => p && re.test(p)))];

  const bundled = mapped(/sharp-libvips|\/@img\//);
  assert.deepEqual(bundled, [], `Sharp loaded its bundled prebuilt libvips: ${bundled}`);

  for (const lib of ['libvips-cpp', 'libheif', 'libjxl', 'libraw_r']) {
    const paths = mapped(new RegExp(`/${lib}\\.so`));
    assert.ok(paths.length > 0, `${lib} is not loaded in the Sharp process`);
    const outside = paths.filter((p) => !p.startsWith('/usr/local/lib/'));
    assert.deepEqual(outside, [], `${lib} loaded from outside /usr/local/lib: ${outside}`);
  }
  console.log('linkage=system /usr/local/lib');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
