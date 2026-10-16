import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { klienMentah } from "@/db";
import { bolehAksesProyek, bolehKelolaAkunUji, bolehLihatAkunUji, wajibMasukApi, type Pengguna } from "@/lib/gerbang";
import { dekripsiAkunUji, enkripsiAkunUji, type PayloadTerenkripsiAkunUji } from "@/lib/enkripsi-akun-uji";
import { originSama } from "@/lib/validasi-bukti";

export const dynamic = "force-dynamic";
const ID_PROYEK = /^PRJ-\d{3,}$/;
const ID_AKUN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_CACHE = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };

type BarisAkunTerenkripsi = {
  id: string;
  nama_akun: string;
  format_version: number;
  nonce: Buffer;
  ciphertext: Buffer;
  auth_tag: Buffer;
};

type AkunAman = { id: string; namaAkun: string; username: string };
type Akses = { pengguna: Pengguna } | { response: NextResponse };

function jsonAman(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_CACHE });
}

async function cekAkses(projectId: string): Promise<Akses> {
  const auth = await wajibMasukApi();
  if ("tolak" in auth) return { response: auth.tolak };
  if (!ID_PROYEK.test(projectId)) return { response: jsonAman({ pesan: "ID proyek tidak sah." }, 400) };
  if (!(await bolehAksesProyek(auth.pengguna, projectId))) {
    return { response: jsonAman({ pesan: "Tidak punya akses ke proyek ini." }, 403) };
  }
  return { pengguna: auth.pengguna };
}

function dataAkun(projectId: string, row: BarisAkunTerenkripsi) {
  const payload: PayloadTerenkripsiAkunUji = {
    formatVersion: Number(row.format_version),
    nonce: row.nonce,
    ciphertext: row.ciphertext,
    authTag: row.auth_tag,
  };
  return dekripsiAkunUji(projectId, row.id, payload);
}

async function ambilSemuaBaris(projectId: string): Promise<BarisAkunTerenkripsi[]> {
  return await klienMentah.unsafe(
    `SELECT id::text AS id, nama_akun, format_version, nonce, ciphertext, auth_tag
     FROM th_project_test_accounts
     WHERE project_id = $1
     ORDER BY nama_akun, dibuat_pada, id`, [projectId],
  ) as unknown as BarisAkunTerenkripsi[];
}

async function ambilBaris(projectId: string, accountId: string): Promise<BarisAkunTerenkripsi | null> {
  const [row] = await klienMentah.unsafe(
    `SELECT id::text AS id, nama_akun, format_version, nonce, ciphertext, auth_tag
     FROM th_project_test_accounts
     WHERE project_id = $1 AND id = $2::uuid`, [projectId, accountId],
  ) as unknown as BarisAkunTerenkripsi[];
  return row ?? null;
}

function akunAman(projectId: string, row: BarisAkunTerenkripsi): AkunAman {
  const data = dataAkun(projectId, row);
  return { id: row.id, namaAkun: row.nama_akun, username: data.username };
}

function accountIdOpsional(value: unknown): { ok: true; id: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, id: null };
  return typeof value === "string" && ID_AKUN.test(value)
    ? { ok: true, id: value }
    : { ok: false };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const akses = await cekAkses(projectId);
  if ("response" in akses) return akses.response;
  if (!bolehLihatAkunUji(akses.pengguna.peran)) {
    return jsonAman({ pesan: "Akun uji tidak tersedia untuk peran ini." }, 403);
  }

  try {
    const accounts = (await ambilSemuaBaris(projectId)).map((row) => akunAman(projectId, row));
    // Password tidak pernah ikut daftar; password diambil per akun setelah aksi Tampilkan.
    return jsonAman({ accounts });
  } catch {
    return jsonAman({ pesan: "Daftar akun uji tidak dapat dibuka. Hubungi Admin." }, 500);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const akses = await cekAkses(projectId);
  if ("response" in akses) return akses.response;
  if (!originSama(req.headers.get("origin"), req.url)) {
    return jsonAman({ pesan: "Asal permintaan tidak sah." }, 403);
  }
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonAman({ pesan: "Jenis permintaan tidak didukung." }, 415);
  }

  const isi = await req.json().catch(() => null) as {
    aksi?: unknown; accountId?: unknown; namaAkun?: unknown; username?: unknown; password?: unknown;
  } | null;
  if (!isi || typeof isi.aksi !== "string") return jsonAman({ pesan: "Aksi akun uji tidak sah." }, 400);

  const parsedId = accountIdOpsional(isi.accountId);
  if (!parsedId.ok) return jsonAman({ pesan: "ID akun tidak sah." }, 400);

  if (isi.aksi === "lihat") {
    if (!bolehLihatAkunUji(akses.pengguna.peran)) {
      return jsonAman({ pesan: "Akun uji tidak tersedia untuk peran ini." }, 403);
    }
    if (!parsedId.id) return jsonAman({ pesan: "Pilih akun uji yang akan dibuka." }, 400);
    try {
      const row = await ambilBaris(projectId, parsedId.id);
      if (!row) return jsonAman({ pesan: "Akun uji tidak ditemukan." }, 404);
      return jsonAman({ password: dataAkun(projectId, row).password });
    } catch {
      return jsonAman({ pesan: "Password akun uji tidak dapat dibuka. Hubungi Admin." }, 500);
    }
  }

  if (!bolehKelolaAkunUji(akses.pengguna.peran)) {
    return jsonAman({ pesan: "Hanya Admin atau Internal PSII yang dapat mengelola akun uji." }, 403);
  }

  if (isi.aksi === "simpan") {
    if (typeof isi.namaAkun !== "string" || typeof isi.username !== "string" || typeof isi.password !== "string") {
      return jsonAman({ pesan: "Nama akun, username, dan password harus berupa teks." }, 400);
    }
    const namaAkun = isi.namaAkun.trim();
    const username = isi.username.trim();
    const passwordKirim = isi.password;
    if (!namaAkun || namaAkun.length > 100) {
      return jsonAman({ pesan: "Nama akun wajib diisi dan maksimal 100 karakter." }, 400);
    }
    if (!username || username.length > 160) {
      return jsonAman({ pesan: "Username wajib diisi dan maksimal 160 karakter." }, 400);
    }
    if (passwordKirim.length > 256) return jsonAman({ pesan: "Password maksimal 256 karakter." }, 400);
    if (!parsedId.id && !passwordKirim) {
      return jsonAman({ pesan: "Password wajib diisi untuk akun uji baru." }, 400);
    }

    try {
      const hasil = await klienMentah.begin(async (tx) => {
        const [project] = await tx.unsafe(
          `SELECT id FROM th_projects WHERE id = $1 FOR UPDATE`, [projectId],
        ) as unknown as { id: string }[];
        if (!project) return { kind: "project_not_found" as const };

        if (parsedId.id) {
          const [lama] = await tx.unsafe(
            `SELECT id::text AS id, nama_akun, format_version, nonce, ciphertext, auth_tag
             FROM th_project_test_accounts
             WHERE project_id = $1 AND id = $2::uuid FOR UPDATE`, [projectId, parsedId.id],
          ) as unknown as BarisAkunTerenkripsi[];
          if (!lama) return { kind: "account_not_found" as const };

          const password = passwordKirim || dataAkun(projectId, lama).password;
          const terenkripsi = enkripsiAkunUji(projectId, lama.id, { username, password });
          await tx.unsafe(
            `UPDATE th_project_test_accounts
             SET nama_akun = $3, format_version = $4, nonce = $5, ciphertext = $6,
                 auth_tag = $7, diubah_oleh = $8::uuid, diubah_pada = now()
             WHERE project_id = $1 AND id = $2::uuid`,
            [projectId, lama.id, namaAkun, terenkripsi.formatVersion, terenkripsi.nonce,
              terenkripsi.ciphertext, terenkripsi.authTag, akses.pengguna.id],
          );
          await tx.unsafe(
            `INSERT INTO th_audit_logs (user_id, project_id, aksi, kolom, nilai_lama, nilai_baru)
             VALUES ($1::uuid, $2, 'ubah_akun_uji', $3, 'tersedia', 'tersedia')`,
            [akses.pengguna.id, projectId, `akun_uji:${lama.id}`],
          );
          return { kind: "ok" as const, account: { id: lama.id, namaAkun, username } };
        }

        const accountId = randomUUID();
        const terenkripsi = enkripsiAkunUji(projectId, accountId, { username, password: passwordKirim });
        await tx.unsafe(
          `INSERT INTO th_project_test_accounts
             (id, project_id, nama_akun, format_version, nonce, ciphertext, auth_tag, diubah_oleh)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::uuid)`,
          [accountId, projectId, namaAkun, terenkripsi.formatVersion, terenkripsi.nonce,
            terenkripsi.ciphertext, terenkripsi.authTag, akses.pengguna.id],
        );
        await tx.unsafe(
          `INSERT INTO th_audit_logs (user_id, project_id, aksi, kolom, nilai_lama, nilai_baru)
           VALUES ($1::uuid, $2, 'tambah_akun_uji', $3, 'tidak_ada', 'tersedia')`,
          [akses.pengguna.id, projectId, `akun_uji:${accountId}`],
        );
        return { kind: "ok" as const, account: { id: accountId, namaAkun, username } };
      });

      if (hasil.kind === "project_not_found") return jsonAman({ pesan: "Proyek tidak ditemukan." }, 404);
      if (hasil.kind === "account_not_found") return jsonAman({ pesan: "Akun uji tidak ditemukan pada proyek ini." }, 404);
      revalidatePath(`/proyek/${projectId}`);
      return jsonAman({ ok: true, account: hasil.account });
    } catch {
      return jsonAman({ pesan: "Akun uji gagal disimpan. Periksa konfigurasi kunci dan coba lagi." }, 500);
    }
  }

  if (isi.aksi === "hapus") {
    if (!parsedId.id) return jsonAman({ pesan: "Pilih akun uji yang akan dihapus." }, 400);
    try {
      const hasil = await klienMentah.begin(async (tx) => {
        const [project] = await tx.unsafe(
          `SELECT id FROM th_projects WHERE id = $1 FOR UPDATE`, [projectId],
        ) as unknown as { id: string }[];
        if (!project) return { kind: "project_not_found" as const };
        const [lama] = await tx.unsafe(
          `SELECT id::text AS id FROM th_project_test_accounts
           WHERE project_id = $1 AND id = $2::uuid FOR UPDATE`, [projectId, parsedId.id],
        ) as unknown as { id: string }[];
        if (!lama) return { kind: "account_not_found" as const };
        await tx.unsafe(
          `DELETE FROM th_project_test_accounts WHERE project_id = $1 AND id = $2::uuid`,
          [projectId, parsedId.id],
        );
        await tx.unsafe(
          `INSERT INTO th_audit_logs (user_id, project_id, aksi, kolom, nilai_lama, nilai_baru)
           VALUES ($1::uuid, $2, 'hapus_akun_uji', $3, 'tersedia', 'dihapus')`,
          [akses.pengguna.id, projectId, `akun_uji:${parsedId.id}`],
        );
        return { kind: "deleted" as const };
      });

      if (hasil.kind === "project_not_found") return jsonAman({ pesan: "Proyek tidak ditemukan." }, 404);
      if (hasil.kind === "account_not_found") return jsonAman({ pesan: "Akun uji tidak ditemukan pada proyek ini." }, 404);
      revalidatePath(`/proyek/${projectId}`);
      return jsonAman({ ok: true, accountId: parsedId.id });
    } catch {
      return jsonAman({ pesan: "Akun uji gagal dihapus. Coba lagi." }, 500);
    }
  }

  return jsonAman({ pesan: "Aksi akun uji tidak dikenal." }, 400);
}
