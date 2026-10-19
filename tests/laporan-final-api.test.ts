import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import { NextResponse } from "next/server";
import { handlerLaporan } from "../lib/laporan-final-api";
import { handlerPdfLaporan } from "../lib/laporan-final-pdf-api";
import { bacaSumberLaporan } from "../lib/laporan-final-data";
import type { SnapshotLaporan } from "../lib/laporan-final-types";

const MIGRASI = [
  "db/migrasi-001.sql", "db/migrasi-002-peran.sql", "db/migrasi-003-pemulihan-sandi.sql",
  "db/migrasi-004-jenis-pengujian.sql", "db/migrasi-005-ketahanan-operasional.sql",
  "db/migrasi-006-akun-uji.sql", "db/migrasi-007-multi-akun-uji.sql", "db/migrasi-008-laporan-final.sql",
];
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PDF_BYTES = Buffer.from("%PDF-1.7\nsynthetic-final-report-pdf\n%%EOF\n");
type Peran = "ADMIN" | "PIMPINAN" | "INTERNAL_PSII" | "INTERNAL_KEMENKEU" | "EKSTERNAL_KEMENKEU";
// No queries are sent through this driver: use its actual public JSON wrapper
// and configured JSONB serializer, then execute the encoded value in PGlite.
const jsonDriver = postgres("postgres://synthetic:synthetic@127.0.0.1:1/synthetic");
after(() => jsonDriver.end());
type Queryable = { json: typeof jsonDriver.json; unsafe: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]> };
type Adapter = Queryable & { begin: (options: string, fn: (tx: Queryable) => Promise<Response>) => Promise<Response> };

async function queryRows<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

async function rig(options: { failAudit?: boolean } = {}) {
  const raw = new PGlite();
  for (const file of MIGRASI) await raw.exec(readFileSync(file, "utf8"));
  let queries = 0;
  const jsonBindings: { type: number; value: unknown }[] = [];
  const wrap = (connection: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (sql: string) => Promise<unknown> }): Queryable => ({
    json: jsonDriver.json,
    async unsafe(sql, params = []) {
      queries++;
      // PGlite does not implement advisory locks. The real transaction and all
      // report/source SQL still run against PGlite; only this lock is a no-op.
      if (/pg_advisory_xact_lock\s*\(/i.test(sql)) return [];
      if (options.failAudit && /INSERT INTO th_audit_logs/i.test(sql)) {
        // Fail with a real SQL error AFTER inserting the report, not before it.
        return (await connection.query("INSERT INTO th_audit_logs (aksi) VALUES (NULL)")).rows;
      }
      const encoded = [...params];
      for (const match of sql.matchAll(/\$(\d+)::jsonb\b/gi)) {
        const index = Number(match[1]) - 1;
        const parameter = encoded[index];
        const typed = parameter && typeof parameter === "object" && "type" in parameter && "value" in parameter
          ? parameter as { type: number; value: unknown } : null;
        // postgres-js ParameterDescription fills an untyped string's OID
        // from the explicit ::jsonb cast before Bind applies this serializer.
        const type = typed?.type ?? 3802;
        const value = typed ? typed.value : parameter;
        jsonBindings.push({ type, value });
        encoded[index] = jsonDriver.options.serializers[type](value);
      }
      return (await connection.query(sql, encoded)).rows;
    },
  });
  const db: Adapter = {
    ...wrap(raw),
    async begin(options, callback) {
      return raw.transaction(async tx => {
        // Match the production transaction contract before executing its SQL.
        const isolation = options.includes("repeatable read") ? "REPEATABLE READ" : "READ COMMITTED";
        const readonly = options.includes("read only") ? " READ ONLY" : "";
        await tx.exec(`SET TRANSACTION ISOLATION LEVEL ${isolation}${readonly}`);
        return callback(wrap(tx));
      });
    },
  };
  await raw.query("INSERT INTO th_users (id,email,nama,peran) VALUES ($1,'synthetic@example.test','Penguji Synthetic','ADMIN')", [USER_ID]);
  let role: Peran | null = "ADMIN";
  let authCalls = 0;
  const auth = async () => {
    authCalls++;
    if (!role) return { tolak: NextResponse.json({ pesan: "Belum masuk" }, { status: 401 }) };
    return { pengguna: { id: USER_ID, email: "synthetic@example.test", nama: "Penguji Synthetic", jabatan: null, peran: role } };
  };
  let rendered: SnapshotLaporan[] = [];
  const pdf = async (snapshot: SnapshotLaporan) => { rendered.push(snapshot); return Buffer.from(PDF_BYTES); };
  const laporan = handlerLaporan({ db: db as never, auth: auth as never, pdf: pdf as never });
  const pdfHandler = handlerPdfLaporan({ db: db as never, auth: auth as never });
  return {
    raw, db, laporan, pdfHandler, setRole(value: Peran | null) { role = value; },
    get jsonBindings() { return jsonBindings; }, get queries() { return queries; }, get authCalls() { return authCalls; }, get rendered() { return rendered; },
  };
}

function req(path: string, init?: RequestInit) { return new Request(`http://localhost${path}`, init); }
async function body(response: Response) { return await response.json() as Record<string, any>; }
async function seedProject(r: Awaited<ReturnType<typeof rig>>, id = "PRJ-101", options: { jenis?: string; tahap?: string } = {}) {
  const jenis = options.jenis ?? "UAT", tahap = options.tahap ?? "SELESAI";
  await r.raw.query(`INSERT INTO th_projects (id,nama,aplikasi,jenis_pengujian,tahap,lingkungan,ruang_lingkup)
    VALUES ($1,'Proyek UAT sintetis','Aplikasi Sintetis',$2,$3,'UAT','Cakupan contoh')`, [id, jenis, tahap]);
  const moduleRow = await queryRows<{ id: string }>(r.raw, "INSERT INTO th_modules (project_id,kode,nama,urutan) VALUES ($1,'A','Modul A',1) RETURNING id", [id]);
  const moduleId = moduleRow[0].id;
  await r.raw.query(`INSERT INTO th_scenarios (project_id,module_id,kode,fase,judul,hasil_diharapkan,hasil_aktual,status,urutan)
    VALUES ($1,$2,'UAT-01','UAT','Kasus lulus','Ekspektasi','Berhasil','PASS',1),
           ($1,$2,'UAT-02','UAT','Kasus gagal','Ekspektasi','Gagal','FAIL',2),
           ($1,NULL,'UAT-03','UAT','Belum dipetakan','Ekspektasi',NULL,'PENDING',3),
           ($1,$2,'SIT-01','SIT','Harus dikecualikan','Ekspektasi','Hasil SIT','FAIL',4)`, [id, moduleId]);
  return { moduleId };
}

test("unauthenticated requests return 401 before any database query", async t => {
  const r = await rig(); t.after(() => r.raw.close());
  r.setRole(null);
  assert.equal((await r.laporan.GET(req("/api/laporan-final?projectId=PRJ-101"))).status, 401);
  assert.equal((await r.laporan.POST(req("/api/laporan-final", { method: "POST", body: "{}" }))).status, 401);
  assert.equal((await r.pdfHandler(req("/api/laporan-final/00000000-0000-4000-8000-000000000000"), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) })).status, 401);
  assert.equal(r.queries, 0);
});

test("testers are forbidden on GET, POST and PDF before any report/source query", async t => {
  const r = await rig(); t.after(() => r.raw.close());
  for (const role of ["INTERNAL_KEMENKEU", "EKSTERNAL_KEMENKEU"] as const) {
    r.setRole(role);
    const startQueries = r.queries;
    assert.equal((await r.laporan.GET(req("/api/laporan-final?projectId=PRJ-101"))).status, 403, `${role} GET`);
    assert.equal((await r.laporan.POST(req("/api/laporan-final", { method: "POST", body: JSON.stringify({ aksi: "pratinjau", projectId: "PRJ-101" }) }))).status, 403, `${role} POST`);
    assert.equal((await r.pdfHandler(req("/api/laporan-final/00000000-0000-4000-8000-000000000000"), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) })).status, 403, `${role} PDF`);
    assert.equal(r.queries, startQueries, `${role} forbidden requests must not query DB`);
  }
  assert.equal(r.rendered.length, 0);
});

test("Pimpinan may list and download reports but cannot preview or generate", async t => {
  const r = await rig(); t.after(() => r.raw.close());
  await seedProject(r);
  const preview = await r.laporan.POST(req("/api/laporan-final", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "pratinjau", projectId: "PRJ-101" }) }));
  const previewData = await body(preview);
  const generated = await r.laporan.POST(req("/api/laporan-final", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "generate", projectId: "PRJ-101", konfirmasi: true, sidikSumber: previewData.sidikSumber }) }));
  assert.equal(generated.status, 201);
  const id = (await body(generated)).id as string;
  r.setRole("PIMPINAN");
  const getResponse = await r.laporan.GET(req("/api/laporan-final?projectId=PRJ-101"));
  assert.equal(getResponse.status, 200);
  assert.equal((await body(getResponse)).bolehGenerate, false);
  const noWrite = await r.laporan.POST(req("/api/laporan-final", { method: "POST", body: JSON.stringify({ aksi: "pratinjau", projectId: "PRJ-101" }) }));
  assert.equal(noWrite.status, 403);
  const download = await r.pdfHandler(req(`/api/laporan-final/${id}`), { params: Promise.resolve({ id }) });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), PDF_BYTES);
});

test("eligibility requires UAT or SIT_UAT at SELESAI; rejected previews create no report", async t => {
  const r = await rig(); t.after(() => r.raw.close());
  for (const [id, jenis, tahap] of [["PRJ-111", "UAT", "UAT"], ["PRJ-112", "SIT_UAT", "WAITING_SIGNOFF"], ["PRJ-113", "SIT", "SELESAI"]]) {
    await seedProject(r, id, { jenis, tahap });
    const res = await r.laporan.POST(req("/api/laporan-final", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "pratinjau", projectId: id }) }));
    assert.equal(res.status, 409, `${jenis}/${tahap}`);
  }
  assert.equal((await queryRows<{ n: number }>(r.raw, "SELECT count(*)::int AS n FROM th_final_reports"))[0].n, 0);
});

test("preview is read-only; generate demands explicit confirmation and a well-formed preview token", async t => {
  const r = await rig(); t.after(() => r.raw.close());
  await seedProject(r);
  const previewReq = () => req("/api/laporan-final", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "pratinjau", projectId: "PRJ-101" }) });
  const preview = await r.laporan.POST(previewReq());
  assert.equal(preview.status, 200);
  const data = await body(preview);
  assert.equal(data.versiBerikutnya, 1);
  assert.match(data.sidikSumber, /^[a-f0-9]{64}$/);
  assert.equal((await queryRows<{ n: number }>(r.raw, "SELECT count(*)::int AS n FROM th_final_reports"))[0].n, 0);
  const base = { aksi: "generate", projectId: "PRJ-101", sidikSumber: data.sidikSumber };
  for (const payload of [base, { ...base, konfirmasi: true, sidikSumber: "not-a-token" }]) {
    const rejected = await r.laporan.POST(req("/api/laporan-final", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
    assert.equal(rejected.status, 400);
  }
  assert.equal(r.rendered.length, 0);
  assert.equal((await queryRows<{ n: number }>(r.raw, "SELECT count(*)::int AS n FROM th_final_reports"))[0].n, 0);
});

test("stale preview conflicts; new immutable version captures current data; GET detects later staleness", async t => {
  const r = await rig(); t.after(() => r.raw.close());
  await seedProject(r);
  const post = (payload: unknown) => r.laporan.POST(req("/api/laporan-final", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
  const preview1 = await body(await post({ aksi: "pratinjau", projectId: "PRJ-101" }));
  await r.raw.query("UPDATE th_projects SET nama='Proyek diperbarui sebelum terbit' WHERE id='PRJ-101'");
  assert.equal((await post({ aksi: "generate", projectId: "PRJ-101", konfirmasi: true, sidikSumber: preview1.sidikSumber })).status, 409);
  assert.equal((await queryRows<{ n: number }>(r.raw, "SELECT count(*)::int AS n FROM th_final_reports"))[0].n, 0);

  const currentPreview = await body(await post({ aksi: "pratinjau", projectId: "PRJ-101" }));
  const v1 = await post({ aksi: "generate", projectId: "PRJ-101", konfirmasi: true, sidikSumber: currentPreview.sidikSumber });
  assert.equal(v1.status, 201);
  const first = await body(v1);
  assert.equal(first.versi, 1);
  assert.equal(r.rendered[0].proyek.nama, "Proyek diperbarui sebelum terbit");
  assert.equal((await post({ aksi: "generate", projectId: "PRJ-101", konfirmasi: true, sidikSumber: currentPreview.sidikSumber })).status, 409, "same-preview replay cannot produce another version");

  const preview2 = await body(await post({ aksi: "pratinjau", projectId: "PRJ-101" }));
  await r.raw.query("UPDATE th_scenarios SET hasil_aktual='hasil baru setelah versi pertama' WHERE project_id='PRJ-101' AND kode='UAT-01'");
  const beforeV2 = await post({ aksi: "generate", projectId: "PRJ-101", konfirmasi: true, sidikSumber: preview2.sidikSumber });
  assert.equal(beforeV2.status, 409, "source edit after preview invalidates the token");
  const finalPreview2 = await body(await post({ aksi: "pratinjau", projectId: "PRJ-101" }));
  assert.equal(finalPreview2.versiBerikutnya, 2);
  const v2 = await post({ aksi: "generate", projectId: "PRJ-101", konfirmasi: true, sidikSumber: finalPreview2.sidikSumber });
  assert.equal(v2.status, 201);
  const second = await body(v2);
  assert.equal(second.versi, 2);
  const rows = await queryRows<{ versi: number; snapshot: SnapshotLaporan }>(r.raw, "SELECT versi,snapshot FROM th_final_reports WHERE project_id='PRJ-101' ORDER BY versi");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].snapshot.proyek.nama, "Proyek diperbarui sebelum terbit");
  assert.equal(rows[0].snapshot.modul[0].skenario[0].aktual, "Berhasil", "older snapshot remains unchanged");
  assert.equal(rows[1].snapshot.modul[0].skenario[0].aktual, "hasil baru setelah versi pertama");

  await r.raw.query("UPDATE th_projects SET ruang_lingkup='perubahan setelah versi dua' WHERE id='PRJ-101'");
  const list = await body(await r.laporan.GET(req("/api/laporan-final?projectId=PRJ-101")));
  assert.equal(list.versi.length, 2);
  assert.deepEqual(list.versi.map((x: { versi: number; perluPembaruan: boolean }) => [x.versi, x.perluPembaruan]), [[2, true], [1, true]]);
});

test("PDF endpoint validates IDs, returns not found, and serves exact persisted bytes inline or as attachment", async t => {
  const r = await rig(); t.after(() => r.raw.close());
  await seedProject(r);
  const preview = await body(await r.laporan.POST(req("/api/laporan-final", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "pratinjau", projectId: "PRJ-101" }) })));
  const generated = await body(await r.laporan.POST(req("/api/laporan-final", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "generate", projectId: "PRJ-101", konfirmasi: true, sidikSumber: preview.sidikSumber }) })));
  const id = generated.id as string;
  for (const [url, idParam] of [["/api/laporan-final/bad", "bad"], ["/api/laporan-final/00000000-0000-4000-8000-000000000000", "00000000-0000-4000-8000-000000000000"]]) {
    const notFound = await r.pdfHandler(req(url), { params: Promise.resolve({ id: idParam }) });
    assert.equal(notFound.status, 404);
    assert.match(notFound.headers.get("Cache-Control") ?? "", /no-store/);
  }
  for (const [suffix, disposition] of [["", "inline"], ["?unduh=1", "attachment"]]) {
    const response = await r.pdfHandler(req(`/api/laporan-final/${id}${suffix}`), { params: Promise.resolve({ id }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/pdf");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.match(response.headers.get("Content-Disposition") ?? "", new RegExp(`^${disposition}; filename=\\"PRJ-101-laporan-final-uat-v1\\.pdf\\"$`));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), PDF_BYTES);
  }
});

test("GET validates project IDs and reports missing projects without leaking report data", async t => {
  const r = await rig(); t.after(() => r.raw.close());
  const invalid = await r.laporan.GET(req("/api/laporan-final?projectId=bad"));
  assert.equal(invalid.status, 400);
  const absent = await r.laporan.GET(req("/api/laporan-final?projectId=PRJ-999"));
  assert.equal(absent.status, 404);
  assert.match(absent.headers.get("Cache-Control") ?? "", /no-store/);
});

test("actual source reader includes only UAT, groups unassigned scenarios, computes counts, and excludes credentials/addresses/URLs/storage keys", async t => {
  const r = await rig(); t.after(() => r.raw.close());
  await seedProject(r);
  await r.raw.query("UPDATE th_projects SET ruang_lingkup='token=secret-value https://private.example/path api_key=key-value' WHERE id='PRJ-101'");
  await r.raw.query("UPDATE th_projects SET alamat_server='https://server-address-secret.invalid' WHERE id='PRJ-101'");
  const scenarioId = (await queryRows<{ id: string }>(r.raw, "SELECT id FROM th_scenarios WHERE project_id='PRJ-101' AND kode='UAT-01'"))[0].id;
  await r.raw.query("INSERT INTO th_evidence (scenario_id,path,nama_asli) VALUES ($1,'s3://private-bucket/private-key','credential-file.png')", [scenarioId]);
  const current = await bacaSumberLaporan(r.db, "PRJ-101");
  assert.ok(current);
  assert.deepEqual(current.sumber.hitungan, { total: 3, lulus: 1, gagal: 1, tertunda: 0, belum: 1 });
  assert.equal(current.sumber.modul.length, 2, "named module and unassigned bucket both represented");
  const byCode = Object.fromEntries(current.sumber.modul.map(m => [m.kode, m]));
  assert.deepEqual(byCode.A.skenario.map(s => s.kode), ["UAT-01", "UAT-02"]);
  assert.equal(byCode.A.hitungan.total, 2);
  assert.equal(byCode["—"].nama, "Belum dipetakan ke modul");
  assert.deepEqual(byCode["—"].skenario.map(s => s.kode), ["UAT-03"]);
  assert.equal(byCode["—"].hitungan.belum, 1);
  assert.ok(current.sumber.peringatan.some(w => /1 skenario belum dipetakan/.test(w)));
  const serialized = JSON.stringify(current.sumber);
  for (const secret of ["private.example", "secret-value", "key-value", "server-address-secret", "private-bucket", "private-key", "credential-file.png"]) {
    assert.equal(serialized.includes(secret), false, `forbidden source value leaked: ${secret}`);
  }
  assert.equal(byCode.A.skenario[0].bukti.length, 1, "only an internal evidence reference is exposed");
});


test("postgres-js JSONB binding stores an object, not a double-encoded JSON string, together with its audit", async t => {
  const r = await rig(); t.after(() => r.raw.close());
  await seedProject(r);
  const post = (payload: unknown) => r.laporan.POST(req("/api/laporan-final", { method: "POST", body: JSON.stringify(payload) }));
  const preview = await body(await post({ aksi: "pratinjau", projectId: "PRJ-101" }));
  const generated = await post({ aksi: "generate", projectId: "PRJ-101", konfirmasi: true, sidikSumber: preview.sidikSumber });
  assert.equal(generated.status, 201);
  assert.equal(r.jsonBindings.length, 1);
  assert.equal(r.jsonBindings[0].type, 3802);
  assert.equal(typeof r.jsonBindings[0].value, "object", "the driver's typed JSON value must receive the snapshot itself, not JSON.stringify(snapshot)");
  const [stored] = await queryRows<{ kind: string; snapshot: SnapshotLaporan; pdf: Uint8Array }>(r.raw,
    "SELECT jsonb_typeof(snapshot) AS kind,snapshot,pdf FROM th_final_reports WHERE project_id='PRJ-101'");
  assert.equal(stored.kind, "object");
  assert.deepEqual(stored.snapshot, r.rendered[0]);
  assert.deepEqual(Buffer.from(stored.pdf), PDF_BYTES);
  assert.equal((await queryRows<{ n: number }>(r.raw, "SELECT count(*)::int AS n FROM th_audit_logs WHERE aksi='buat_laporan_final'"))[0].n, 1);
});

test("the former pre-stringified postgres-js JSONB binding reproduces 23514 locally and rolls back without a report or audit", async t => {
  const r = await rig(); t.after(() => r.raw.close());
  await seedProject(r);
  await assert.rejects(r.db.begin("isolation level repeatable read", async tx => {
    await tx.unsafe(`INSERT INTO th_final_reports
      (project_id,versi,dibuat_pada,dibuat_oleh,nama_penyusun,sidik_sumber,snapshot,pdf)
      VALUES ('PRJ-101',1,now(),$1::uuid,'Sintetis',$2,$3::jsonb,$4::bytea)`,
      [USER_ID, "a".repeat(64), JSON.stringify({ synthetic: true }), PDF_BYTES]);
    return new Response(null, { status: 201 });
  }), (error: unknown) => {
    const e = error as { code?: string; constraint?: string; constraint_name?: string };
    assert.equal(e.code, "23514");
    assert.equal(e.constraint_name ?? e.constraint, "th_final_reports_snapshot_check");
    return true;
  });
  assert.equal((await queryRows<{ n: number }>(r.raw, "SELECT count(*)::int AS n FROM th_final_reports"))[0].n, 0);
  assert.equal((await queryRows<{ n: number }>(r.raw, "SELECT count(*)::int AS n FROM th_audit_logs WHERE aksi='buat_laporan_final'"))[0].n, 0);
});

test("audit failure rolls back the newly inserted JSON/PDF snapshot and returns only safe correlated diagnostics", async t => {
  const failure = { failAudit: true };
  const r = await rig(failure); t.after(() => r.raw.close());
  const log = t.mock.method(console, "error", () => {});
  await seedProject(r);
  const correlationId = "zz5fx-1792381087406-58fcc57b1ee0";
  const post = (payload: unknown) => r.laporan.POST(req("/api/laporan-final", { method: "POST",
    headers: { "x-vercel-id": correlationId }, body: JSON.stringify(payload) }));
  const preview = await body(await post({ aksi: "pratinjau", projectId: "PRJ-101" }));
  const response = await post({ aksi: "generate", projectId: "PRJ-101", konfirmasi: true, sidikSumber: preview.sidikSumber });
  assert.equal(response.status, 503);
  const result = await body(response);
  assert.equal(result.correlationId, correlationId);
  assert.match(result.pesan, /Buka ulang pratinjau/);
  assert.doesNotMatch(result.pesan, /migrasi/i);
  assert.equal(r.rendered.length, 1, "PDF was rendered before transaction rollback");
  assert.equal(r.jsonBindings.length, 1, "snapshot insertion was attempted before audit failure");
  assert.equal((await queryRows<{ n: number }>(r.raw, "SELECT count(*)::int AS n FROM th_final_reports"))[0].n, 0);
  assert.equal((await queryRows<{ n: number }>(r.raw, "SELECT count(*)::int AS n FROM th_audit_logs WHERE aksi='buat_laporan_final'"))[0].n, 0);
  const metadata = log.mock.calls[0].arguments[1];
  assert.equal(metadata.code, "23502");
  assert.equal(metadata.table, "th_audit_logs");
  assert.equal(metadata.correlationId, correlationId);
  assert.deepEqual(Object.keys(metadata).sort(), ["code", "constraint", "correlationId", "table"]);
  assert.doesNotMatch(JSON.stringify(log.mock.calls[0].arguments), /Proyek UAT sintetis|Aplikasi Sintetis|Ekspektasi|synthetic-final-report-pdf|INSERT INTO/);
  failure.failAudit = false;
  const freshPreview = await body(await post({ aksi: "pratinjau", projectId: "PRJ-101" }));
  assert.equal(freshPreview.versiBerikutnya, 1, "rollback must not consume a report version");
  const retry = await post({ aksi: "generate", projectId: "PRJ-101", konfirmasi: true, sidikSumber: freshPreview.sidikSumber });
  assert.equal(retry.status, 201);
  assert.equal((await body(retry)).versi, 1);
  assert.equal((await queryRows<{ n: number }>(r.raw, "SELECT count(*)::int AS n FROM th_final_reports"))[0].n, 1);
  assert.equal((await queryRows<{ n: number }>(r.raw, "SELECT count(*)::int AS n FROM th_audit_logs WHERE aksi='buat_laporan_final'"))[0].n, 1);
});
