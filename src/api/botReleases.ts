import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { fail } from '../server/errors';
import { audit } from '../server/audit';
import { isStaff } from '../server/staff';
import { LIMITS, RUNTIME_IDS, isTrustedUpload, listEntries, readEntry, commonRoot, validateArchive, validatePromptConfig, sha256Hex, type Report } from '../server/botArchive';
import { canManage, canTransition, isImmutable, SEMVER, type ReleaseStatus } from '../server/releasePolicy';

const one = (v: unknown) => String(Array.isArray(v) ? v[0] ?? '' : v ?? '');
const json = <T,>(s: unknown, d: T): T => { try { return s ? (JSON.parse(String(s)) as T) : d; } catch { return d; } };

const IssueZ = z.object({ level: z.enum(['error', 'warning', 'info']), code: z.string(), message: z.string(), file: z.string().optional() });
const ReportZ = z.object({
  ok: z.boolean(), checkedAt: z.string(), sha256: z.string(), archiveBytes: z.number(), fileCount: z.number(), totalBytes: z.number(),
  issues: z.array(IssueZ), manifest: z.record(z.unknown()).nullable(), dependencies: z.array(z.object({ name: z.string(), version: z.string() })), scanner: z.string(),
});
const FileZ = z.object({ url: z.string(), name: z.string(), size: z.number() });
const ReleaseZ = z.object({
  id: z.string(), listingId: z.string(), listingName: z.string(), version: z.string(), botType: z.enum(['Prompt', 'Code']), status: z.string(), releaseNotes: z.string(),
  runtime: z.string().nullable(), entryPoint: z.string().nullable(), promptConfig: z.string().nullable(),
  archiveName: z.string().nullable(), archiveSize: z.number().nullable(), archiveSha256: z.string().nullable(), hasArchive: z.boolean(),
  supportingFiles: z.array(FileZ), report: ReportZ.nullable(), files: z.array(z.object({ path: z.string(), size: z.number() })),
  reviewNotes: z.string().nullable(), reviewedAt: z.string().nullable(), publishedAt: z.string().nullable(), validatedAt: z.string().nullable(), createdAt: z.string(),
  live: z.boolean(), ownerId: z.string(),
});
type Release = z.infer<typeof ReleaseZ>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any> & { id: string };

function shape(r: Rec, l: Rec, withFiles: boolean): Release {
  const report = json<Report | null>(r.validationReport, null);
  return {
    id: r.id, listingId: l.id, listingName: l.name ?? 'Bot', version: r.version ?? '', botType: r.botType === 'Code' ? 'Code' : 'Prompt', status: r.status ?? 'Draft', releaseNotes: r.releaseNotes ?? '',
    runtime: r.runtime || null, entryPoint: r.entryPoint || null, promptConfig: r.promptConfig || null,
    archiveName: r.archiveName || null, archiveSize: r.archiveSize ?? null, archiveSha256: r.archiveSha256 || null, hasArchive: !!r.archiveUrl,
    supportingFiles: json<{ url: string; name: string; size: number }[]>(r.supportingFiles, []),
    report: report ? { ...report, files: undefined } as never : null,
    files: withFiles ? json(r.fileIndex, []) : [],
    reviewNotes: r.reviewNotes || null, reviewedAt: r.reviewedAt || null, publishedAt: r.publishedAt || null, validatedAt: r.validatedAt || null, createdAt: String(r.createdAt ?? ''),
    live: l.publishedReleaseId === r.id, ownerId: one(l.owner),
  };
}

/** Downloads a stored archive from Zite file storage, enforcing a byte cap and a timeout. */
async function fetchArchive(url: string): Promise<Uint8Array> {
  if (!isTrustedUpload(url)) throw fail('Archives must be uploaded through Chatting file storage.');
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) }).catch(() => { throw fail('Couldn’t reach file storage — try again.'); });
  if (!res.ok || !res.body) throw fail(`File storage returned HTTP ${res.status} for this archive.`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > LIMITS.archiveBytes) throw fail(`The archive is larger than ${LIMITS.archiveBytes / 1048576} MB.`);
  const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let n = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > LIMITS.archiveBytes) { await reader.cancel(); throw fail(`The archive is larger than ${LIMITS.archiveBytes / 1048576} MB.`); }
    chunks.push(value);
  }
  const out = new Uint8Array(n); let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

export default createEndpoint({
  description: 'Bot releases: create versions, upload and validate project archives, submit, review and publish',
  authenticated: true,
  inputSchema: z.object({
    action: z.enum(['list', 'get', 'create', 'update', 'startUpload', 'completeUpload', 'addFiles', 'removeFile', 'validate', 'submit', 'withdraw', 'publish', 'unpublish', 'download', 'readFile', 'queue', 'approve', 'reject']),
    listingId: z.string().max(64).optional(), releaseId: z.string().max(64).optional(),
    version: z.string().max(40).optional(), botType: z.enum(['Prompt', 'Code']).optional(), releaseNotes: z.string().max(5000).optional(),
    runtime: z.string().max(20).optional(), entryPoint: z.string().max(240).optional(), promptConfig: z.string().max(100000).optional(),
    fileName: z.string().max(240).optional(), size: z.number().int().nonnegative().optional(), url: z.string().max(1000).optional(),
    files: z.array(FileZ).max(20).optional(), path: z.string().max(240).optional(), notes: z.string().max(4000).optional(),
  }),
  outputSchema: z.object({
    releases: z.array(ReleaseZ), release: ReleaseZ.nullable(), limits: z.object({ archiveMB: z.number(), files: z.number(), unpackedMB: z.number() }),
    runtimes: z.array(z.string()), staff: z.boolean(), downloadUrl: z.string().nullable(), fileText: z.string().nullable(), fileTruncated: z.boolean(),
  }),
  execute: async ({ input, context }) => {
    const me = context.user.id;
    const staff = isStaff(context.user.email);
    const actor = { userId: me, staff };
    const out = {
      releases: [] as Release[], release: null as Release | null, limits: { archiveMB: LIMITS.archiveBytes / 1048576, files: LIMITS.files, unpackedMB: LIMITS.totalUncompressed / 1048576 },
      runtimes: RUNTIME_IDS as string[], staff, downloadUrl: null as string | null, fileText: null as string | null, fileTruncated: false,
    };
    const log = (summary: string, action: string, targetId: string, details?: Record<string, unknown>, severity: 'Info' | 'Notice' | 'Warning' = 'Info') =>
      audit({ summary, category: 'Bot', action, actorType: staff ? 'Staff' : 'User', actorId: me, actorLabel: context.user.email, targetType: 'BotRelease', targetId, details, severity });

    const listing = async (id?: string) => {
      const l = id ? await zite.botListings.findOne({ id }).catch(() => undefined) : undefined;
      if (!l) throw fail('Bot not found', 'NOT_FOUND');
      if (!canManage(one(l.owner), actor)) throw fail('You can only manage your own bots.', 'FORBIDDEN');
      return l as Rec;
    };
    const release = async () => {
      const r = input.releaseId ? await zite.botReleases.findOne({ id: input.releaseId }).catch(() => undefined) : undefined;
      if (!r) throw fail('Release not found', 'NOT_FOUND');
      const l = await listing(one(r.listing));
      return { r: r as Rec, l };
    };
    const move = async (r: Rec, l: Rec, to: ReleaseStatus, extra: Record<string, unknown> = {}) => {
      const report = json<Report | null>(r.validationReport, null);
      if (!canTransition(r.status as ReleaseStatus, to, actor, { validated: !!report?.ok, approvedBefore: !!r.publishedAt })) throw fail(`A ${r.status} release can’t move to ${to}.`, 'CONFLICT');
      return (await zite.botReleases.update({ id: r.id, record: { status: to, ...extra } as never })) as Rec;
    };
    const editable = (r: Rec) => { if (isImmutable(r.status)) throw fail('Submitted and published versions are immutable — create a new version instead.', 'CONFLICT'); };

    /** Runs validation against the stored archive (or prompt config) and records the report. */
    const runValidation = async (r: Rec, l: Rec): Promise<Rec> => {
      if (r.status !== 'Validating') r = await move(r, l, 'Validating');
      let report: Report;
      let fileIndex: unknown[] = [];
      try {
        if (r.botType === 'Code') {
          if (!r.archiveUrl) throw fail('Upload a project archive first.');
          const bytes = await fetchArchive(r.archiveUrl);
          if (r.archiveSha256 && (await sha256Hex(bytes)) !== r.archiveSha256) throw fail('The stored archive no longer matches its recorded checksum.');
          report = await validateArchive({ bytes, runtime: r.runtime ?? '', entryPoint: r.entryPoint ?? '', version: r.version ?? '' });
          fileIndex = report.files;
        } else {
          const v = validatePromptConfig(r.promptConfig ?? '');
          report = { ok: !v.issues.some((i) => i.level === 'error'), checkedAt: new Date().toISOString(), sha256: await sha256Hex(new TextEncoder().encode(r.promptConfig ?? '')), archiveBytes: 0, fileCount: 0, totalBytes: 0, issues: [...v.issues, { level: 'info', code: 'runtime', message: 'Runs on Chatting’s built-in responder — no uploaded code.' }], files: [], manifest: v.config as never, dependencies: [], scanner: 'Configuration checker v1' };
        }
      } catch (e) {
        const message = e instanceof Error ? (e as { userFacingMessage?: string }).userFacingMessage ?? e.message : 'Validation failed';
        report = { ok: false, checkedAt: new Date().toISOString(), sha256: r.archiveSha256 ?? '', archiveBytes: r.archiveSize ?? 0, fileCount: 0, totalBytes: 0, issues: [{ level: 'error', code: 'pipeline', message }], files: [], manifest: null, dependencies: [], scanner: 'Chatting static scanner v1' };
      }
      const { files: _f, ...stored } = report;
      void _f;
      const next = await zite.botReleases.update({ id: r.id, record: { status: report.ok ? 'Draft' : 'Failed', validationReport: JSON.stringify(stored), fileIndex: JSON.stringify(fileIndex), validatedAt: new Date().toISOString() } as never });
      await log(`Validated ${l.name} v${r.version}: ${report.ok ? 'passed' : 'failed'}`, 'release.validate', r.id, { errors: report.issues.filter((i) => i.level === 'error').length });
      return next as Rec;
    };

    /** Makes `r` the live version of the listing and keeps installed copies in sync. */
    const goLive = async (r: Rec, l: Rec) => {
      const { records: live } = await zite.botReleases.findAll({ filters: { listing: l.id, status: 'Published' } as never, limit: 20 });
      for (const o of live) if (o.id !== r.id) await zite.botReleases.update({ id: o.id, record: { status: 'Unpublished' } as never });
      const manifest = json<Record<string, unknown>>(r.manifest, {});
      await zite.botListings.update({ id: l.id, record: { publishedReleaseId: r.id, version: r.version, botType: r.botType, ...(l.status !== 'Removed' ? { status: 'Published' } : {}) } as never });
      const { records: installs } = await zite.bots.findAll({ filters: { listingId: l.id } as never, limit: 500 });
      for (const b of installs) { const kv = json<{ kv?: unknown }>(b.config, {}).kv; await zite.bots.update({ id: b.id, record: { config: JSON.stringify(r.botType === 'Prompt' ? { responder: json(r.promptConfig, {}), releaseId: r.id, kv } : { releaseId: r.id, manifest, kv }) } as never }); }
    };

    switch (input.action) {
      case 'queue': {
        if (!staff) throw fail('Only Chatting staff can review releases.', 'FORBIDDEN');
        const { records } = await zite.botReleases.findAll({ filters: { status: 'Pending Review' } as never, limit: 100 });
        for (const r of records) { const l = await zite.botListings.findOne({ id: one(r.listing) }).catch(() => undefined); if (l) out.releases.push(shape(r as Rec, l as Rec, false)); }
        return out;
      }
      case 'list': {
        const l = await listing(input.listingId);
        const { records } = await zite.botReleases.findAll({ filters: { listing: l.id } as never, limit: 200 });
        out.releases = records.map((r) => shape(r as Rec, l, false)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return out;
      }
      case 'get': {
        const { r, l } = await release();
        out.release = shape(r, l, true);
        return out;
      }
      case 'create': {
        const l = await listing(input.listingId);
        if (l.status === 'Removed' && !staff) throw fail('This bot was removed by Chatting staff.');
        const version = (input.version ?? '').trim();
        if (!SEMVER.test(version)) throw fail('Use a semantic version like 1.2.0.');
        const { records } = await zite.botReleases.findAll({ filters: { listing: l.id } as never, limit: 200 });
        if (records.some((x) => x.version === version)) throw fail(`Version ${version} already exists — versions are immutable, pick a new number.`, 'CONFLICT');
        if (records.length >= 100) throw fail('A bot can keep up to 100 versions.');
        const botType = input.botType ?? 'Prompt';
        if (botType === 'Code' && input.runtime && !RUNTIME_IDS.includes(input.runtime as never)) throw fail('Unsupported runtime');
        const r = await zite.botReleases.create({ record: {
          version, listing: l.id, uploadedBy: me, botType, status: 'Draft', releaseNotes: input.releaseNotes ?? '',
          runtime: botType === 'Code' ? input.runtime ?? 'node20' : null, entryPoint: botType === 'Code' ? (input.entryPoint ?? 'src/index.ts').replace(/^\.\//, '') : null,
          promptConfig: botType === 'Prompt' ? input.promptConfig ?? '{"commands":[],"keywords":[]}' : null, supportingFiles: '[]',
        } as never });
        await log(`Created ${l.name} v${version} (${botType})`, 'release.create', r.id);
        out.release = shape(r as Rec, l, true);
        return out;
      }
      case 'update': {
        const { r, l } = await release();
        editable(r);
        if (input.runtime && !RUNTIME_IDS.includes(input.runtime as never)) throw fail('Unsupported runtime');
        const patch: Record<string, unknown> = {};
        if (input.releaseNotes !== undefined) patch.releaseNotes = input.releaseNotes;
        if (r.botType === 'Code') { if (input.runtime) patch.runtime = input.runtime; if (input.entryPoint) patch.entryPoint = input.entryPoint.replace(/^\.\//, ''); }
        else if (input.promptConfig !== undefined) patch.promptConfig = input.promptConfig;
        // Any change to what gets run invalidates the previous report.
        if (patch.runtime || patch.entryPoint || patch.promptConfig !== undefined) { patch.validationReport = null; if (r.status === 'Failed') patch.status = 'Draft'; }
        const next = await zite.botReleases.update({ id: r.id, record: patch as never });
        out.release = shape(next as Rec, l, true);
        return out;
      }
      case 'startUpload': {
        const { r, l } = await release();
        editable(r);
        if (r.botType !== 'Code') throw fail('Prompt bots don’t take a code archive.');
        const name = input.fileName ?? '';
        if (!/\.zip$/i.test(name)) throw fail('Upload the project as a .zip archive.');
        if (!input.size || input.size > LIMITS.archiveBytes) throw fail(`The archive must be between 1 byte and ${LIMITS.archiveBytes / 1048576} MB.`);
        const next = r.status === 'Uploading' ? r : await move(r, l, 'Uploading');
        await log(`Started upload for ${l.name} v${r.version}`, 'release.upload_start', r.id, { name, size: input.size });
        out.release = shape(next, l, false);
        return out;
      }
      case 'completeUpload': {
        const { r, l } = await release();
        if (r.status !== 'Uploading') throw fail('Start the upload first.', 'CONFLICT');
        const url = input.url ?? '';
        if (!isTrustedUpload(url)) throw fail('Archives must be uploaded through Chatting file storage.');
        // Never trust the browser: download what was actually stored and verify it.
        const bytes = await fetchArchive(url).catch(async (e) => { await zite.botReleases.update({ id: r.id, record: { status: 'Failed' } as never }); throw e; });
        if (input.size !== undefined && bytes.length !== input.size) {
          await zite.botReleases.update({ id: r.id, record: { status: 'Failed' } as never });
          throw fail(`Upload incomplete: stored ${bytes.length} bytes, expected ${input.size}. Please re-upload.`);
        }
        const sha = await sha256Hex(bytes);
        const fileName = (input.fileName ?? 'project.zip').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
        const stored = await zite.botReleases.update({ id: r.id, record: { archiveUrl: url, archiveName: fileName, archiveSize: bytes.length, archiveSha256: sha, status: 'Validating', validationReport: null } as never });
        await log(`Uploaded archive for ${l.name} v${r.version}`, 'release.upload_complete', r.id, { size: bytes.length, sha256: sha });
        out.release = shape(await runValidation(stored as Rec, l), l, true);
        return out;
      }
      case 'addFiles': {
        const { r, l } = await release();
        editable(r);
        const cur = json<{ url: string; name: string; size: number }[]>(r.supportingFiles, []);
        const add = (input.files ?? []).filter((f) => isTrustedUpload(f.url)).map((f) => ({ url: f.url, name: f.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120), size: f.size }));
        if (add.length !== (input.files ?? []).length) throw fail('Files must be uploaded through Chatting file storage.');
        if (cur.length + add.length > 20) throw fail('Up to 20 supporting files per version.');
        const next = await zite.botReleases.update({ id: r.id, record: { supportingFiles: JSON.stringify([...cur, ...add]) } as never });
        await log(`Attached ${add.length} file(s) to ${l.name} v${r.version}`, 'release.files', r.id, { names: add.map((f) => f.name) });
        out.release = shape(next as Rec, l, true);
        return out;
      }
      case 'removeFile': {
        const { r, l } = await release();
        editable(r);
        const cur = json<{ url: string; name: string; size: number }[]>(r.supportingFiles, []);
        const next = await zite.botReleases.update({ id: r.id, record: { supportingFiles: JSON.stringify(cur.filter((f) => f.url !== input.url)) } as never });
        out.release = shape(next as Rec, l, true);
        return out;
      }
      case 'validate': {
        const { r, l } = await release();
        editable(r);
        out.release = shape(await runValidation(r, l), l, true);
        return out;
      }
      case 'submit': {
        const { r, l } = await release();
        if (!(input.releaseNotes ?? r.releaseNotes ?? '').trim()) throw fail('Add release notes before submitting.');
        const next = await move(r, l, 'Pending Review', input.releaseNotes ? { releaseNotes: input.releaseNotes } : {});
        await log(`Submitted ${l.name} v${r.version} for review`, 'release.submit', r.id, undefined, 'Notice');
        out.release = shape(next, l, true);
        return out;
      }
      case 'withdraw': {
        const { r, l } = await release();
        if (r.status !== 'Pending Review') throw fail('Only versions awaiting review can be withdrawn.', 'CONFLICT');
        const next = await zite.botReleases.update({ id: r.id, record: { status: 'Draft' } as never });
        await log(`Withdrew ${l.name} v${r.version} from review`, 'release.withdraw', r.id);
        out.release = shape(next as Rec, l, true);
        return out;
      }
      case 'approve': {
        if (!staff) throw fail('Only Chatting staff can approve releases.', 'FORBIDDEN');
        const { r, l } = await release();
        const next = await move(r, l, 'Published', { reviewedBy: me, reviewedAt: new Date().toISOString(), publishedAt: new Date().toISOString(), reviewNotes: input.notes ?? null });
        await goLive(next, l);
        await log(`Approved and published ${l.name} v${r.version}`, 'release.approve', r.id, { notes: input.notes }, 'Notice');
        out.release = shape(next, { ...l, publishedReleaseId: r.id }, true);
        return out;
      }
      case 'reject': {
        if (!staff) throw fail('Only Chatting staff can reject releases.', 'FORBIDDEN');
        const { r, l } = await release();
        if (!(input.notes ?? '').trim()) throw fail('Tell the developer why it was rejected.');
        const wasLive = l.publishedReleaseId === r.id;
        const next = await move(r, l, 'Rejected', { reviewedBy: me, reviewedAt: new Date().toISOString(), reviewNotes: input.notes });
        if (wasLive) await zite.botListings.update({ id: l.id, record: { publishedReleaseId: null, status: l.status === 'Removed' ? 'Removed' : 'Draft' } as never });
        await log(`Rejected ${l.name} v${r.version}`, 'release.reject', r.id, { notes: input.notes }, 'Warning');
        out.release = shape(next, l, true);
        return out;
      }
      case 'publish': {
        // Developer rollback to a previously approved version (or staff re-publish).
        const { r, l } = await release();
        if (l.status === 'Removed') throw fail('This bot was removed by Chatting staff.');
        const next = await move(r, l, 'Published');
        await goLive(next, l);
        await log(`Rolled ${l.name} to v${r.version}`, 'release.rollback', r.id, undefined, 'Notice');
        out.release = shape(next, { ...l, publishedReleaseId: r.id }, true);
        return out;
      }
      case 'unpublish': {
        const { r, l } = await release();
        const next = await move(r, l, 'Unpublished');
        if (l.publishedReleaseId === r.id) await zite.botListings.update({ id: l.id, record: { publishedReleaseId: null, status: l.status === 'Removed' ? 'Removed' : 'Draft' } as never });
        await log(`Unpublished ${l.name} v${r.version}`, 'release.unpublish', r.id, undefined, 'Notice');
        out.release = shape(next, { ...l, publishedReleaseId: null }, true);
        return out;
      }
      case 'download': {
        const { r, l } = await release();
        if (!r.archiveUrl) throw fail('This version has no archive.');
        await log(`Downloaded source of ${l.name} v${r.version}`, 'release.download', r.id);
        out.downloadUrl = r.archiveUrl;
        return out;
      }
      case 'readFile': {
        const { r } = await release();
        if (!r.archiveUrl) throw fail('This version has no archive.');
        const bytes = await fetchArchive(r.archiveUrl);
        const entries = listEntries(bytes).filter((e) => !e.isDir && !e.isSymlink);
        const root = commonRoot(entries.map((e) => e.path));
        const e = entries.find((x) => x.path.slice(root.length) === input.path);
        if (!e) throw fail('File not found in archive', 'NOT_FOUND');
        const data = await readEntry(bytes, e);
        const cap = 200 * 1024;
        if (data.slice(0, 8000).includes(0)) { out.fileText = '(binary file — download the archive to inspect it)'; return out; }
        out.fileText = new TextDecoder().decode(data.subarray(0, cap));
        out.fileTruncated = data.length > cap;
        return out;
      }
    }
    return out;
  },
});
