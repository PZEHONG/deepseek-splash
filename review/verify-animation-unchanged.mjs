import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
const root = 'D:/deepseek开屏';
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'review/animation-before-window-reset.json'), 'utf8').replace(/^\uFEFF/, ''));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
for (const archive of [path.join(root, 'delivery/app.asar'), 'D:/dsh-latest-windows-x64/resources/app.asar']) {
  const bytes = fs.readFileSync(archive);
  const base = 8 + bytes.readUInt32LE(4);
  const tree = JSON.parse(bytes.subarray(16, 16 + bytes.readUInt32LE(12)).toString());
  for (const asset of baseline) {
    const name = path.basename(asset.Path);
    const entry = tree.files.renderer.files[name];
    const content = bytes.subarray(base + Number(entry.offset), base + Number(entry.offset) + entry.size);
    assert.equal(sha(content), asset.Hash, `${archive}: ${name} changed`);
    assert.equal(sha(fs.readFileSync(asset.Path)), asset.Hash, `${name}: source changed`);
  }
}
console.log('Video, poster and HTML animation remain byte-identical in the prepared and installed application.');
