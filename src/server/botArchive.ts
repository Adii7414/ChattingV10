/**
 * Static inspection of an uploaded bot project (.zip). Pure functions only — no database, no network —
 * so the same code runs in the endpoint Worker and in the automated tests.
 *
 * Nothing in here ever executes uploaded code. Files are read as bytes, decompressed with hard caps,
 * and inspected as text.
 */

export const LIMITS = {
  archiveBytes: 20 * 1024 * 1024, // upload cap for the .zip itself
  files: 2000,
  totalUncompressed: 100 * 1024 * 1024,
  fileUncompressed: 10 * 1024 * 1024,
  ratio: 200, // max uncompressed:compressed per entry (archive-bomb guard)
  depth: 24,
  pathLength: 240,
  scanTextBytes: 1024 * 1024, // text files bigger than this are listed but not content-scanned
  scanTotalBytes: 40 * 1024 * 1024,
};

export const RUNTIMES = {
  'node20': { lang: 'JavaScript / TypeScript', exts: ['.js', '.mjs', '.cjs', '.ts', '.mts'], depFile: 'package.json' },
  'node22': { lang: 'JavaScript / TypeScript', exts: ['.js', '.mjs', '.cjs', '.ts', '.mts'], depFile: 'package.json' },
  'python3.11': { lang: 'Python', exts: ['.py'], depFile: 'requirements.txt' },
  'python3.12': { lang: 'Python', exts: ['.py'], depFile: 'requirements.txt' },
  'deno2': { lang: 'TypeScript (Deno)', exts: ['.ts', '.js'], depFile: null },
} as const;
export type Runtime = keyof typeof RUNTIMES;
export const RUNTIME_IDS = Object.keys(RUNTIMES) as Runtime[];
export const MANIFEST_FILE = 'chatting-bot.json';
export const SUPPORTED_API_VERSIONS = ['1'];

const BLOCKED_EXT = ['.exe', '.dll', '.so', '.dylib', '.bin', '.com', '.scr', '.msi', '.bat', '.cmd', '.ps1', '.vbs', '.jar', '.apk', '.app', '.deb', '.rpm', '.pyc', '.node', '.wasm'];
const TEXT_EXT = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.tsx', '.jsx', '.py', '.json', '.md', '.txt', '.yml', '.yaml', '.toml', '.cfg', '.ini', '.env', '.sh', '.html', '.css', '.lock', ''];

export type Entry = { path: string; size: number; compressedSize: number; method: number; crc: number; localOffset: number; isDir: boolean; isSymlink: boolean; encrypted: boolean };
export type Issue = { level: 'error' | 'warning' | 'info'; code: string; message: string; file?: string };
export type FileRow = { path: string; size: number };
export type Report = {
  ok: boolean; checkedAt: string; sha256: string; archiveBytes: number; fileCount: number; totalBytes: number;
  issues: Issue[]; files: FileRow[]; manifest: Record<string, unknown> | null; dependencies: { name: string; version: string }[];
  scanner: string;
};

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b: Uint8Array) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export async function sha256Hex(b: Uint8Array) {
  const d = await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export class ArchiveError extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } }

/** Checks one archive path. Returns an error message, or null when it is safe. */
export function unsafePath(p: string): string | null {
  if (!p) return 'Empty file name';
  if (p.includes('\0') || /[\x00-\x1f]/.test(p)) return 'Control characters in file name';
  if (p.includes('\\')) return 'Backslash in path (Windows-style paths are not allowed)';
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return 'Absolute path';
  const parts = p.replace(/\/$/, '').split('/');
  if (parts.some((s) => s === '..')) return 'Path traversal ("..")';
  if (parts.some((s) => s === '' )) return 'Empty path segment';
  if (parts.length > LIMITS.depth) return 'Folder nesting is too deep';
  if (p.length > LIMITS.pathLength) return 'Path is too long';
  return null;
}

/** Reads the zip central directory without decompressing anything. Throws ArchiveError on any structural problem. */
export function listEntries(b: Uint8Array): Entry[] {
  if (b.length < 22) throw new ArchiveError('not_zip', 'This file is too small to be a .zip archive.');
  if (u32(b, 0) !== 0x04034b50 && u32(b, 0) !== 0x06054b50) throw new ArchiveError('not_zip', 'This file is not a .zip archive.');
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ArchiveError('corrupt', 'The archive is damaged: its file directory is missing.');
  if (u16(b, eocd + 4) !== 0 || u16(b, eocd + 6) !== 0) throw new ArchiveError('multipart', 'Split / multi-part archives are not supported.');
  const count = u16(b, eocd + 10);
  const cdSize = u32(b, eocd + 12);
  const cdOff = u32(b, eocd + 16);
  if (count === 0xffff || cdOff === 0xffffffff) throw new ArchiveError('zip64', 'ZIP64 archives are not supported. Keep the project under 20 MB.');
  if (count > LIMITS.files) throw new ArchiveError('too_many_files', `The archive has ${count} files; the limit is ${LIMITS.files}.`);
  if (cdOff + cdSize > eocd) throw new ArchiveError('corrupt', 'The archive is damaged: directory points outside the file.');
  const out: Entry[] = [];
  const seen = new Set<string>();
  let o = cdOff;
  const dec = new TextDecoder('utf-8', { fatal: false });
  for (let i = 0; i < count; i++) {
    if (o + 46 > b.length || u32(b, o) !== 0x02014b50) throw new ArchiveError('corrupt', 'The archive is damaged: bad directory entry.');
    const madeBy = u16(b, o + 4); const flags = u16(b, o + 8); const method = u16(b, o + 10);
    const crc = u32(b, o + 16); const compressedSize = u32(b, o + 20); const size = u32(b, o + 24);
    const nl = u16(b, o + 28); const el = u16(b, o + 30); const cl = u16(b, o + 32);
    const ext = u32(b, o + 38); const localOffset = u32(b, o + 42);
    const path = dec.decode(b.subarray(o + 46, o + 46 + nl));
    o += 46 + nl + el + cl;
    if (path.startsWith('__MACOSX/') || path.endsWith('.DS_Store')) continue;
    const bad = unsafePath(path);
    if (bad) throw new ArchiveError('unsafe_path', `${bad}: "${path.slice(0, 120)}"`);
    const key = path.toLowerCase();
    if (seen.has(key)) throw new ArchiveError('duplicate', `The archive lists "${path}" more than once.`);
    seen.add(key);
    const unix = madeBy >> 8 === 3;
    const mode = ext >>> 16;
    out.push({ path, size, compressedSize, method, crc, localOffset, isDir: path.endsWith('/'), isSymlink: unix && (mode & 0xf000) === 0xa000, encrypted: (flags & 1) === 1 });
  }
  return out;
}

/** Decompresses one entry with a hard output cap and verifies its CRC. */
export async function readEntry(b: Uint8Array, e: Entry, cap = LIMITS.fileUncompressed): Promise<Uint8Array> {
  const o = e.localOffset;
  if (o + 30 > b.length || u32(b, o) !== 0x04034b50) throw new ArchiveError('corrupt', `Damaged entry header: ${e.path}`);
  const start = o + 30 + u16(b, o + 26) + u16(b, o + 28);
  const end = start + e.compressedSize;
  if (end > b.length) throw new ArchiveError('corrupt', `Truncated data: ${e.path}`);
  const raw = b.subarray(start, end);
  let data: Uint8Array;
  if (e.method === 0) data = raw;
  else if (e.method === 8) {
    const stream = new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = []; let n = 0;
    for (;;) {
      const { value, done } = await reader.read().catch(() => { throw new ArchiveError('corrupt', `Corrupt compressed data: ${e.path}`); });
      if (done) break;
      n += value.length;
      if (n > cap || n > e.size) { await reader.cancel(); throw new ArchiveError('bomb', `${e.path} expands beyond its declared size — possible archive bomb.`); }
      chunks.push(value);
    }
    data = new Uint8Array(n); let p = 0; for (const c of chunks) { data.set(c, p); p += c.length; }
  } else throw new ArchiveError('method', `Unsupported compression in ${e.path}. Use standard zip (deflate).`);
  if (data.length !== e.size) throw new ArchiveError('corrupt', `Size mismatch in ${e.path}.`);
  if (crc32(data) !== e.crc) throw new ArchiveError('crc', `Checksum mismatch in ${e.path} — the archive is corrupted.`);
  return data;
}

/** If every file sits inside one top-level folder (common when zipping a folder), returns that prefix. */
export function commonRoot(paths: string[]) {
  const firsts = new Set(paths.map((p) => p.split('/')[0]));
  if (firsts.size !== 1) return '';
  const only = [...firsts][0];
  return paths.every((p) => p.startsWith(`${only}/`)) ? `${only}/` : '';
}

export const SECRET_PATTERNS: { code: string; label: string; re: RegExp }[] = [
  { code: 'private_key', label: 'Private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----/ },
  { code: 'aws_key', label: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { code: 'github_token', label: 'GitHub token', re: /\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{30,}\b/ },
  { code: 'slack_token', label: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { code: 'stripe_key', label: 'Stripe secret key', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { code: 'openai_key', label: 'OpenAI API key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { code: 'google_key', label: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { code: 'chatting_token', label: 'Chatting bot token', re: /\bcbt_[A-Za-z0-9]{20,}\b/ },
  { code: 'signing_secret', label: 'Chatting signing secret', re: /\bwhsec_[A-Za-z0-9]{20,}\b/ },
  { code: 'db_url', label: 'Database URL with password', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^:\s/]+:[^@\s]{3,}@/ },
];

const MALWARE_PATTERNS: { code: string; label: string; re: RegExp }[] = [
  { code: 'miner', label: 'Crypto-miner pool address', re: /stratum\+(?:tcp|ssl):\/\//i },
  { code: 'pipe_shell', label: 'Downloads and pipes a script into a shell', re: /(?:curl|wget)[^\n|]{0,200}\|\s*(?:ba|z)?sh\b/ },
  { code: 'reverse_shell', label: 'Reverse shell', re: /\/dev\/tcp\/\d|nc\s+-e\s+\/bin\/(?:ba)?sh|socket\.socket\([^)]*\)[\s\S]{0,200}subprocess[\s\S]{0,80}\/bin\/sh/ },
  { code: 'obfuscated_eval', label: 'Evaluates obfuscated / base64 code', re: /eval\s*\(\s*(?:atob|Buffer\.from|base64\.b64decode|unescape)\s*\(/ },
  { code: 'host_secrets', label: 'Reads host credential files', re: /\/etc\/shadow|\.ssh\/id_rsa|\/proc\/self\/environ|\.aws\/credentials/ },
];

/** Known-vulnerable versions: anything strictly below `fixed` is flagged. Curated from public advisories. */
export const VULNERABLE: Record<'npm' | 'pypi', Record<string, { fixed: string; advisory: string }>> = {
  npm: {
    lodash: { fixed: '4.17.21', advisory: 'Prototype pollution / command injection (CVE-2021-23337)' },
    minimist: { fixed: '1.2.6', advisory: 'Prototype pollution (CVE-2021-44906)' },
    axios: { fixed: '1.7.4', advisory: 'SSRF / credential leakage (CVE-2024-39338)' },
    'node-fetch': { fixed: '2.6.7', advisory: 'Header exposure on redirect (CVE-2022-0235)' },
    jsonwebtoken: { fixed: '9.0.0', advisory: 'Signature validation bypass (CVE-2022-23529)' },
    ws: { fixed: '8.17.1', advisory: 'Denial of service (CVE-2024-37890)' },
    'follow-redirects': { fixed: '1.15.6', advisory: 'Credential leakage (CVE-2024-28849)' },
    express: { fixed: '4.20.0', advisory: 'Open redirect / XSS (CVE-2024-43796)' },
    semver: { fixed: '7.5.2', advisory: 'ReDoS (CVE-2022-25883)' },
    tar: { fixed: '6.2.1', advisory: 'Denial of service (CVE-2024-28863)' },
    'event-stream': { fixed: '99.0.0', advisory: 'Compromised package (flatmap-stream malware)' },
  },
  pypi: {
    requests: { fixed: '2.32.0', advisory: 'Certificate verification bypass (CVE-2024-35195)' },
    urllib3: { fixed: '1.26.19', advisory: 'Proxy-Authorization leak (CVE-2024-37891)' },
    pyyaml: { fixed: '5.4', advisory: 'Arbitrary code execution (CVE-2020-14343)' },
    jinja2: { fixed: '3.1.4', advisory: 'XSS (CVE-2024-34064)' },
    aiohttp: { fixed: '3.9.4', advisory: 'Path traversal / XSS (CVE-2024-23334)' },
    cryptography: { fixed: '42.0.4', advisory: 'NULL dereference (CVE-2024-26130)' },
    pillow: { fixed: '10.3.0', advisory: 'Buffer overflow (CVE-2024-28219)' },
  },
};

const nums = (v: string) => (v.match(/\d+(?:\.\d+)*/)?.[0] ?? '').split('.').map(Number);
/** True when version `a` is strictly lower than `b` (numeric parts only). */
export function lowerThan(a: string, b: string) {
  const x = nums(a); const y = nums(b);
  if (!x.length || Number.isNaN(x[0])) return false;
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const p = x[i] ?? 0; const q = y[i] ?? 0; if (p !== q) return p < q; }
  return false;
}
const extOf = (p: string) => { const n = p.split('/').pop() ?? ''; const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i).toLowerCase() : ''; };

const isElfPeMacho = (d: Uint8Array) =>
  (d[0] === 0x7f && d[1] === 0x45 && d[2] === 0x4c && d[3] === 0x46) || (d[0] === 0x4d && d[1] === 0x5a) ||
  [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(u32(d, 0) >>> 0) || [0xfeedface, 0xfeedfacf].includes(((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0);

export type ValidateInput = { bytes: Uint8Array; runtime: string; entryPoint: string; version: string };

/** Runs every static check on a project archive and returns a full report. Never throws for bad input — problems become issues. */
export async function validateArchive(input: ValidateInput): Promise<Report> {
  const issues: Issue[] = [];
  const add = (level: Issue['level'], code: string, message: string, file?: string) => issues.push({ level, code, message, ...(file ? { file } : {}) });
  const report: Report = { ok: false, checkedAt: new Date().toISOString(), sha256: await sha256Hex(input.bytes), archiveBytes: input.bytes.length, fileCount: 0, totalBytes: 0, issues, files: [], manifest: null, dependencies: [], scanner: 'Chatting static scanner v1 (signature + heuristic rules, curated advisory list)' };

  if (input.bytes.length > LIMITS.archiveBytes) { add('error', 'too_large', `The archive is ${(input.bytes.length / 1048576).toFixed(1)} MB; the limit is ${LIMITS.archiveBytes / 1048576} MB.`); return report; }

  let entries: Entry[];
  try { entries = listEntries(input.bytes); } catch (e) { add('error', e instanceof ArchiveError ? e.code : 'corrupt', e instanceof Error ? e.message : 'Unreadable archive'); return report; }

  const files = entries.filter((e) => !e.isDir);
  if (!files.length) { add('error', 'empty', 'The archive contains no files.'); return report; }
  let total = 0;
  for (const e of entries) {
    if (e.isSymlink) add('error', 'symlink', 'Symbolic links are not allowed in bot projects.', e.path);
    if (e.encrypted) add('error', 'encrypted', 'Password-protected entries cannot be reviewed.', e.path);
    if (e.isDir) continue;
    total += e.size;
    if (e.size > LIMITS.fileUncompressed) add('error', 'file_too_large', `Expands to ${(e.size / 1048576).toFixed(1)} MB; max per file is ${LIMITS.fileUncompressed / 1048576} MB.`, e.path);
    if (e.compressedSize > 0 && e.size / e.compressedSize > LIMITS.ratio && e.size > 1024 * 1024) add('error', 'bomb', `Compression ratio ${Math.round(e.size / e.compressedSize)}:1 is suspicious (possible archive bomb).`, e.path);
    if (BLOCKED_EXT.includes(extOf(e.path))) add('error', 'blocked_type', `Compiled binaries / executables (${extOf(e.path)}) are not allowed — ship source only.`, e.path);
    if (/(^|\/)node_modules\//.test(e.path) || /(^|\/)(?:\.venv|venv|__pycache__)\//.test(e.path)) add('error', 'vendored_deps', 'Installed dependency folders must not be uploaded — declare dependencies in the manifest instead.', e.path);
    if (/(^|\/)\.env(\.|$)/.test(e.path) && !/\.example$|\.sample$|\.template$/.test(e.path)) add('error', 'env_file', 'Environment files hold secrets — upload a .env.example instead.', e.path);
  }
  if (total > LIMITS.totalUncompressed) add('error', 'too_large_unpacked', `Unpacks to ${(total / 1048576).toFixed(0)} MB; the limit is ${LIMITS.totalUncompressed / 1048576} MB.`);
  report.fileCount = files.length; report.totalBytes = total;
  const root = commonRoot(files.map((f) => f.path));
  report.files = files.map((f) => ({ path: f.path.slice(root.length), size: f.size })).sort((a, b) => a.path.localeCompare(b.path));
  if (issues.some((i) => i.level === 'error' && ['bomb', 'too_large_unpacked'].includes(i.code))) return finish(report);

  // Decompress and inspect content (capped). Verifies every entry's CRC along the way.
  const byPath = new Map<string, Uint8Array>();
  let scanned = 0;
  for (const f of files) {
    const rel = f.path.slice(root.length);
    try {
      const needContent = TEXT_EXT.includes(extOf(rel)) && f.size <= LIMITS.scanTextBytes && scanned + f.size <= LIMITS.scanTotalBytes;
      const data = await readEntry(input.bytes, f);
      if (isElfPeMacho(data)) add('error', 'binary', 'Native executable detected — ship source only.', rel);
      if (needContent) { scanned += f.size; byPath.set(rel, data); }
    } catch (e) { add('error', e instanceof ArchiveError ? e.code : 'corrupt', e instanceof Error ? e.message : 'Unreadable entry', rel); }
  }
  if (TEXT_EXT.length && files.some((f) => f.size > LIMITS.scanTextBytes && TEXT_EXT.includes(extOf(f.path)))) add('warning', 'not_scanned', 'Some large text files were too big to content-scan and will be flagged for manual review.');

  const text = (p: string) => { const d = byPath.get(p); return d ? new TextDecoder().decode(d) : null; };

  for (const [p] of byPath) {
    const t = text(p) ?? '';
    for (const s of SECRET_PATTERNS) if (s.re.test(t)) add('error', `secret_${s.code}`, `${s.label} found in source. Remove it, rotate it, and inject it at runtime as a secret instead.`, p);
    for (const m of MALWARE_PATTERNS) if (m.re.test(t)) add('error', `malware_${m.code}`, `Flagged by the security scanner: ${m.label}.`, p);
  }

  // Manifest
  const mt = text(MANIFEST_FILE);
  let manifest: Record<string, unknown> | null = null;
  if (mt === null) add('error', 'manifest_missing', `Add a ${MANIFEST_FILE} file at the project root (see the Code-bot guide).`);
  else {
    try { const v = JSON.parse(mt); if (v && typeof v === 'object' && !Array.isArray(v)) manifest = v; else throw new Error(); } catch { add('error', 'manifest_json', `${MANIFEST_FILE} is not valid JSON.`, MANIFEST_FILE); }
  }
  report.manifest = manifest;
  const runtime = input.runtime;
  const entry = input.entryPoint.replace(/^\.\//, '');
  if (manifest) {
    const api = String(manifest.apiVersion ?? '');
    if (!api) add('error', 'api_missing', `${MANIFEST_FILE} must declare "apiVersion".`, MANIFEST_FILE);
    else if (!SUPPORTED_API_VERSIONS.includes(api)) add('error', 'api_version', `apiVersion "${api}" is not supported. Supported: ${SUPPORTED_API_VERSIONS.join(', ')}.`, MANIFEST_FILE);
    if (manifest.version && String(manifest.version) !== input.version) add('error', 'version_mismatch', `Manifest version "${manifest.version}" does not match the release version "${input.version}".`, MANIFEST_FILE);
    if (manifest.runtime && String(manifest.runtime) !== input.runtime) add('error', 'runtime_mismatch', `Manifest runtime "${manifest.runtime}" differs from the selected runtime "${input.runtime}".`, MANIFEST_FILE);
    if (manifest.entry && String(manifest.entry).replace(/^\.\//, '') !== input.entryPoint.replace(/^\.\//, '')) add('error', 'entry_mismatch', `Manifest entry "${manifest.entry}" differs from the entry point you entered.`, MANIFEST_FILE);
    if (!Array.isArray(manifest.permissions)) add('warning', 'perms_missing', 'Declare the "permissions" your bot needs so admins can review them.', MANIFEST_FILE);
    if (!Array.isArray(manifest.events)) add('warning', 'events_missing', 'Declare the "events" your bot handles.', MANIFEST_FILE);
  }

  const rt = RUNTIMES[runtime as Runtime];
  if (!rt) add('error', 'runtime', `Unsupported runtime "${runtime}". Supported: ${RUNTIME_IDS.join(', ')}.`);
  if (unsafePath(entry)) add('error', 'entry_path', `Entry point "${entry}" is not a valid relative path.`);
  else if (!report.files.some((f) => f.path === entry)) add('error', 'entry_missing', `Entry point "${entry}" was not found in the archive.`);
  else if (rt && !(rt.exts as readonly string[]).includes(extOf(entry))) add('error', 'entry_ext', `Entry point "${entry}" doesn't match runtime ${runtime} (${rt.exts.join(', ')}).`);

  // Dependencies
  if (rt?.depFile === 'package.json') {
    const pj = text('package.json');
    if (pj === null) add('error', 'deps_missing', 'Node projects must include a package.json declaring dependencies.');
    else {
      try {
        const v = JSON.parse(pj) as { dependencies?: Record<string, string>; scripts?: Record<string, string> };
        for (const [n, ver] of Object.entries(v.dependencies ?? {})) report.dependencies.push({ name: n, version: String(ver) });
        for (const s of ['preinstall', 'install', 'postinstall']) if (v.scripts?.[s]) add('error', 'install_script', `package.json "${s}" scripts are not allowed — they run code at install time.`, 'package.json');
        for (const d of report.dependencies) if (/^(?:git\+|git:|https?:|file:|link:)/.test(d.version)) add('error', 'dep_source', `Dependency "${d.name}" must come from the npm registry, not "${d.version}".`, 'package.json');
      } catch { add('error', 'deps_json', 'package.json is not valid JSON.', 'package.json'); }
    }
    if (entry.endsWith('.ts') && !report.files.some((f) => f.path === 'tsconfig.json')) add('warning', 'tsconfig', 'TypeScript entry without a tsconfig.json — default compiler options will apply.');
    if (!report.files.some((f) => /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(f.path))) add('warning', 'lockfile', 'No lockfile found — dependency versions will not be reproducible.');
  } else if (rt?.depFile === 'requirements.txt') {
    const rq = text('requirements.txt');
    if (rq === null) add('warning', 'deps_missing', 'No requirements.txt — only the Python standard library will be available.');
    else for (const line of rq.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))) {
      if (/^(?:-e|git\+|https?:|--index-url|--extra-index-url|-f\b)/.test(line)) { add('error', 'dep_source', `"${line}" — dependencies must come from PyPI.`, 'requirements.txt'); continue; }
      const m = line.match(/^([A-Za-z0-9_.-]+)\s*(?:[=<>~!]=?\s*([^;\s]+))?/);
      if (m) report.dependencies.push({ name: m[1].toLowerCase(), version: m[2] ?? '*' });
      if (m && !m[2]) add('warning', 'unpinned', `"${m[1]}" is not pinned to a version.`, 'requirements.txt');
    }
  }
  const eco = rt?.depFile === 'package.json' ? 'npm' : rt?.depFile === 'requirements.txt' ? 'pypi' : null;
  if (eco) for (const d of report.dependencies) {
    const v = VULNERABLE[eco][d.name.toLowerCase()];
    if (v && d.version !== '*' && lowerThan(d.version.replace(/^[\^~>=<\s]+/, ''), v.fixed)) add('error', 'vulnerable_dep', `${d.name}@${d.version} is vulnerable: ${v.advisory}. Upgrade to ${v.fixed} or later.`, rt?.depFile ?? undefined);
  }
  if (!report.files.some((f) => /^readme(\.md|\.txt)?$/i.test(f.path))) add('warning', 'readme', 'Add a README so reviewers and users understand the bot.');
  add('info', 'execution', 'Static checks only — uploaded code was never executed during validation.');
  return finish(report);
}

function finish(r: Report) { r.ok = !r.issues.some((i) => i.level === 'error'); return r; }

/** Validates a prompt/configuration bot's config (runs on Chatting's built-in responder; no code). */
export type PromptConfig = { greeting?: string; commands: { name: string; reply: string }[]; keywords: { match: string; reply: string }[] };
export function validatePromptConfig(raw: string): { config: PromptConfig | null; issues: Issue[] } {
  const issues: Issue[] = [];
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return { config: null, issues: [{ level: 'error', code: 'config_json', message: 'Configuration is not valid JSON.' }] }; }
  const o = (v ?? {}) as Record<string, unknown>;
  const commands = Array.isArray(o.commands) ? o.commands : [];
  const keywords = Array.isArray(o.keywords) ? o.keywords : [];
  const cfg: PromptConfig = { greeting: typeof o.greeting === 'string' ? o.greeting.slice(0, 1000) : undefined, commands: [], keywords: [] };
  for (const c of commands as Record<string, unknown>[]) {
    const name = String(c?.name ?? '').replace(/^\//, '');
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) issues.push({ level: 'error', code: 'command_name', message: `Command "${name}" must be 1–32 lowercase letters, numbers, - or _.` });
    else if (!String(c?.reply ?? '').trim()) issues.push({ level: 'error', code: 'command_reply', message: `Command /${name} needs a reply.` });
    else cfg.commands.push({ name, reply: String(c.reply).slice(0, 2000) });
  }
  for (const k of keywords as Record<string, unknown>[]) {
    const match = String(k?.match ?? '').trim();
    if (match.length < 2 || !String(k?.reply ?? '').trim()) issues.push({ level: 'error', code: 'keyword', message: `Keyword rules need a trigger (2+ chars) and a reply.` });
    else cfg.keywords.push({ match: match.slice(0, 60).toLowerCase(), reply: String(k.reply).slice(0, 2000) });
  }
  if (cfg.commands.length > 40) issues.push({ level: 'error', code: 'too_many', message: 'Up to 40 commands.' });
  if (cfg.keywords.length > 40) issues.push({ level: 'error', code: 'too_many', message: 'Up to 40 keyword rules.' });
  if (!cfg.commands.length && !cfg.keywords.length && !cfg.greeting) issues.push({ level: 'error', code: 'empty', message: 'Add at least one command, keyword rule or greeting.' });
  const all = JSON.stringify(cfg);
  for (const s of SECRET_PATTERNS) if (s.re.test(all)) issues.push({ level: 'error', code: `secret_${s.code}`, message: `${s.label} found in the configuration — remove it.` });
  return { config: issues.some((i) => i.level === 'error') ? null : cfg, issues };
}

export const TRUSTED_UPLOAD_HOSTS = ['uploads.zite.com', 'eu-uploads.zite.com'];
export function isTrustedUpload(url: string) {
  try { const u = new URL(url); return u.protocol === 'https:' && TRUSTED_UPLOAD_HOSTS.includes(u.hostname); } catch { return false; }
}
