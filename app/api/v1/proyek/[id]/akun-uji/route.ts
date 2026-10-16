import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { klienMentah } from "@/db";
import { bolehAksesProyek, bolehKelolaAkunUji, bolehLihatAkunUji, wajibMasukApi, type Pengguna } from "@/lib/gerbang";
import { dekripsiAkunUji, enkripsiAkunUji, type PayloadTerenkripsiAkunUji } from "@/lib/enkripsi-akun-uji";
import { originSama } from "@/lib/validasi-bukti";

export const dynamic = "force-dynamic";
const ID_PROYEK = /^PRJ-\d{3,}$/;
const NO_CACHE = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };

type BarisAkunTerenkripsi = {
  format_version: number;
  nonce: Buffer;
  ciphertext: Buffer;
  auth_tag: Buffer;
};

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
  return dekripsiAkunUji(projectId, payload);
}

async function ambilBaris(projectId: string): Promise<BarisAkunTerenkripsi | null> {
  const [row] = (await klienMentah.unsafe(
    `SELECT format_version, nonce, ciphertext, auth_tag
     FROM th_project_test_accounts WHERE project_id = $1`, [projectId],
  )) as unknown as BarisAkunTerenkripsi[];
  return row ?? null;
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
    const row = await ambilBaris(projectId);
    if (!row) return jsonAman({ ada: false, username: "" });
    const akun = dataAkun(projectId, row);
    // Sandi tidak ikut pada respons awal; minta lagi setelah pengguna memilih Tampilkan.
    return jsonAman({ ada: true, username: akun.username });
  } catch {
    return jsonAman({ pesan: "Akun uji tidak dapat dibuka. Hubungi Admin." }, 500);
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
    aksi?: unknown; username?: unknown; password?: unknown;
  } | null;
  if (!isi || typeof isi.aksi !== "string") return jsonAman({ pesan: "Aksi akun uji tidak sah." }, 400);

  if (isi.aksi === "lihat") {
    if (!bolehLihatAkunUji(akses.pengguna.peran)) {
      return jsonAman({ pesan: "Akun uji tidak tersedia untuk peran ini." }, 403);
    }
    try {
      const row = await ambilBaris(projectId);
      if (!row) return jsonAman({ pesan: "Akun uji belum diisi." }, 404);
      return jsonAman({ password: dataAkun(projectId, row).password });
    } catch {
      return jsonAman({ pesan: "Sandi akun uji tidak dapat dibuka. Hubungi Admin." }, 500);
    }
  }

  if (!bolehKelolaAkunUji(akses.pengguna.peran)) {
    return jsonAman({ pesan: "Hanya Admin atau Internal PSII yang dapat mengelola akun uji." }, 403);
  }

  if (isi.aksi === "simpan") {
    if (typeof isi.username !== "string" || typeof isi.password !== "string") {
      return jsonAman({ pesan: "Username dan password harus berupa teks." }, 400);
    }
    const username = isi.username.trim();
    const passwordKirim = isi.password;
    if (!username || username.length > 160) {
      return jsonAman({ pesan: "Username wajib diisi dan maksimal 160 karakter." }, 400);
    }
    if (passwordKirim.length > 256) return jsonAman({ pesan: "Password maksimal 256 karakter." }, 400);

    try {
      const hasil = await klienMentah.begin(async (tx) => {
        const [project] = (await tx.unsafe(
          `SELECT id FROM th_projects WHERE id = $1 FOR UPDATE`, [projectId],
        )) as unknown as { id: string }[];
        if (!project) return { kind: "not_found" as const };

        const [lama] = (await tx.unsafe(
          `SELECT format_version, nonce, ciphertext, auth_tag
           FROM th_project_test_accounts WHERE project_id = $1 FOR UPDATE`, [projectId],
        )) as unknown as BarisAkunTerenkripsi[];
        let password = passwordKirim;
        if (!password) {
          if (!lama) return { kind: "password_required" as const };
          password = dataAkun(projectId, lama).password;
        }

        const terenkripsi = enkripsiAkunUji(projectId, { username, password });
        await tx.unsafe(
          `INSERT INTO th_project_test_accounts
             (project_id, format_version, nonce, ciphertext, auth_tag, diubah_oleh)
           VALUES ($1, $2, $3, $4, $5, $6::uuid)
           ON CONFLICT (project_id) DO UPDATE SET
             format_version = EXCLUDED.format_version,
             nonce = EXCLUDED.nonce,
             ciphertext = EXCLUDED.ciphertext,
             auth_tag = EXCLUDED.auth_tag,
             diubah_oleh = EXCLUDED.diubah_oleh,
             diubah_pada = now()`,
          [projectId, terenkripsi.formatVersion, terenkripsi.nonce, terenkripsi.ciphertext, terenkripsi.authTag, akses.pengguna.id],
        );
        await tx.unsafe(
          `INSERT INTO th_audit_logs (user_id, project_id, aksi, kolom, nilai_lama, nilai_baru)
           VALUES ($1::uuid, $2, 'ubah_akun_uji', 'akun_uji', $3, 'tersedia')`,
          [akses.pengguna.id, projectId, lama ? "tersedia" : "kosong"],
        );
        return { kind: "ok" as const, username };
      });

      if (hasil.kind === "not_found") return jsonAman({ pesan: "Proyek tidak ditemukan." }, 404);
      if (hasil.kind === "password_required") return jsonAman({ pesan: "Password wajib diisi saat pertama kali membuat akun uji." }, 400);
      revalidatePath(`/proyek/${projectId}`);
      return jsonAman({ ok: true, ada: true, username: hasil.username });
    } catch {
      return jsonAman({ pesan: "Akun uji gagal disimpan. Periksa konfigurasi kunci dan coba lagi." }, 500);
    }
  }

  if (isi.aksi === "hapus") {
    try {
      const hasil = await klienMentah.begin(async (tx) => {
        const [project] = (await tx.unsafe(
          `SELECT id FROM th_projects WHERE id = $1 FOR UPDATE`, [projectId],
        )) as unknown as { id: string }[];
        if (!project) return { kind: "not_found" as const };
        const [lama] = (await tx.unsafe(
          `SELECT project_id FROM th_project_test_accounts WHERE project_id = $1 FOR UPDATE`, [projectId],
        )) as unknown as { project_id: string }[];
        if (!lama) return { kind: "unchanged" as const };
        await tx.unsafe(`DELETE FROM th_project_test_accounts WHERE project_id = $1`, [projectId]);
        await tx.unsafe(
          `INSERT INTO th_audit_logs (user_id, project_id, aksi, kolom, nilai_lama, nilai_baru)
           VALUES ($1::uuid, $2, 'hapus_akun_uji', 'akun_uji', 'tersedia', 'dihapus')`,
          [akses.pengguna.id, projectId],
        );
        return { kind: "deleted" as const };
      });
      if (hasil.kind === "not_found") return jsonAman({ pesan: "Proyek tidak ditemukan." }, 404);
      revalidatePath(`/proyek/${projectId}`);
      return jsonAman({ ok: true, ada: false });
    } catch {
      return jsonAman({ pesan: "Akun uji gagal dihapus. Coba lagi." }, 500);
    }
  }

  return jsonAman({ pesan: "Aksi akun uji tidak dikenal." }, 400);
}
