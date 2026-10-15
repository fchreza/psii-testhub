"use client";

import { useState } from "react";
import { cn } from "@/lib/format";

type Pengguna = {
  id: string; email: string; nama: string; jabatan: string | null;
  peran: string; aktif: boolean; dibuat_pada: string; jumlah_proyek: number;
};

const PERAN = ["ADMIN", "PIMPINAN", "INTERNAL_PSII", "INTERNAL_KEMENKEU", "EKSTERNAL_KEMENKEU"];
const KETERANGAN_PERAN: Record<string, string> = {
  ADMIN: "Akses penuh: dashboard, proyek, pengujian, dan administrasi pengguna.",
  PIMPINAN: "Dapat melihat seluruh proyek dan laporan; semua data bersifat baca-saja.",
  INTERNAL_PSII: "Dapat melihat dan mengelola seluruh proyek serta pengujian; tanpa akses administrasi pengguna.",
  INTERNAL_KEMENKEU: "Penguji yang hanya dapat membuka proyek yang ditugaskan kepadanya.",
  EKSTERNAL_KEMENKEU: "Penguji eksternal yang hanya dapat membuka proyek yang ditugaskan kepadanya.",
};

export function KelolaPengguna({
  daftarAwal, bolehKelola, sayaId,
}: { daftarAwal: Pengguna[]; bolehKelola: boolean; sayaId: string }) {
  const [daftar, setDaftar] = useState(daftarAwal);
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [peran, setPeran] = useState("INTERNAL_PSII");
  const [galat, setGalat] = useState<string | null>(null);
  const [sandiBaru, setSandiBaru] = useState<{ nama: string; sandi: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [penggunaEdit, setPenggunaEdit] = useState<Pengguna | null>(null);
  const [draftEdit, setDraftEdit] = useState({ nama: "", email: "", jabatan: "" });
  const [sibukEdit, setSibukEdit] = useState(false);

  const kirim = (body: Record<string, unknown>) => fetch("/api/v1/pengguna", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

  const simpanEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!penggunaEdit) return;
    setSibukEdit(true); setGalat(null);
    try {
      const r = await kirim({ aksi: "ubah", userId: penggunaEdit.id, ...draftEdit });
      const hasil = await r.json().catch(() => ({}));
      if (!r.ok) { setGalat(hasil.pesan ?? "Gagal menyimpan perubahan pengguna."); return; }
      setDaftar((d) => d.map((x) => x.id === penggunaEdit.id
        ? { ...x, nama: hasil.nama, email: hasil.email, jabatan: hasil.jabatan }
        : x));
      setPenggunaEdit(null); setGalat(null);
    } catch { setGalat("Tidak dapat terhubung. Periksa koneksi lalu coba lagi."); }
    finally { setSibukEdit(false); }
  };

  const tambah = async (e: React.FormEvent) => {
    e.preventDefault(); setSibuk(true); setGalat(null); setSandiBaru(null);
    try {
      const r = await kirim({ aksi: "tambah", email, nama, jabatan, peran });
      const hasil = await r.json().catch(() => ({}));
      if (!r.ok) { setGalat(hasil.pesan ?? "Gagal mendaftarkan akun."); return; }
      setDaftar((d) => [...d, {
        id: hasil.id, email: email.trim().toLowerCase(), nama: nama.trim(),
        jabatan: jabatan.trim() || null, peran, aktif: true,
        dibuat_pada: new Date().toISOString(), jumlah_proyek: 0,
      }]);
      setSandiBaru({ nama: nama.trim(), sandi: hasil.sandi });
      setNama(""); setEmail(""); setJabatan(""); setPeran("INTERNAL_PSII");
    } catch {
      setGalat("Tidak dapat terhubung. Periksa koneksi lalu coba lagi.");
    } finally { setSibuk(false); }
  };

  const ubahAktif = async (p: Pengguna) => {
    const aktifBaru = !p.aktif;
    setGalat(null);
    try {
      const r = await kirim({ aksi: aktifBaru ? "aktif" : "nonaktif", userId: p.id });
      const hasil = await r.json().catch(() => ({}));
      if (!r.ok) { setGalat(hasil.pesan ?? "Gagal mengubah status akun."); return; }
      setDaftar((d) => d.map((x) => x.id === p.id ? { ...x, aktif: aktifBaru } : x));
    } catch { setGalat("Tidak dapat terhubung. Periksa koneksi lalu coba lagi."); }
  };

  const ubahPeran = async (p: Pengguna, peranBaru: string) => {
    setGalat(null);
    try {
      const r = await kirim({ aksi: "ubah_peran", userId: p.id, peran: peranBaru });
      const hasil = await r.json().catch(() => ({}));
      if (!r.ok) { setGalat(hasil.pesan ?? "Gagal mengubah peran."); return; }
      setDaftar((d) => d.map((x) => x.id === p.id ? { ...x, peran: peranBaru } : x));
    } catch { setGalat("Tidak dapat terhubung. Periksa koneksi lalu coba lagi."); }
  };

  const resetSandi = async (p: Pengguna) => {
    setSandiBaru(null); setGalat(null);
    try {
      const r = await kirim({ aksi: "sandi_baru", userId: p.id });
      const hasil = await r.json().catch(() => ({}));
      if (!r.ok) { setGalat(hasil.pesan ?? "Gagal membuat sandi baru."); return; }
      setSandiBaru({ nama: p.nama, sandi: hasil.sandi });
    } catch { setGalat("Tidak dapat terhubung. Periksa koneksi lalu coba lagi."); }
  };

  return (
    <>
      {bolehKelola && (
        <section className="mb-6 rounded-xl border border-garis bg-kartu p-4 shadow-sm shadow-tinta/[0.03] sm:p-5">
          <div className="mb-4">
            <h2 className="text-[16px] font-semibold text-tinta">Daftarkan akun</h2>
            <p className="mt-1 text-[13px] text-tinta-3">Sandi awal dibuat otomatis dan hanya ditampilkan satu kali.</p>
          </div>
          <form onSubmit={tambah} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="u-nama" className="mb-1 block text-[13px] font-medium text-tinta-2">Nama</label>
              <input id="u-nama" required maxLength={120} value={nama} onChange={(e) => setNama(e.target.value)}
                className="w-full rounded-lg border border-garis-kuat bg-white px-3 py-2 text-[15px] outline-none focus:border-aksi" />
            </div>
            <div>
              <label htmlFor="u-email" className="mb-1 block text-[13px] font-medium text-tinta-2">Email</label>
              <input id="u-email" type="email" autoComplete="email" required maxLength={160} value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-garis-kuat bg-white px-3 py-2 text-[15px] outline-none focus:border-aksi" />
            </div>
            <div>
              <label htmlFor="u-jabatan" className="mb-1 block text-[13px] font-medium text-tinta-2">Jabatan</label>
              <input id="u-jabatan" maxLength={80} value={jabatan} onChange={(e) => setJabatan(e.target.value)}
                className="w-full rounded-lg border border-garis-kuat bg-white px-3 py-2 text-[15px] outline-none focus:border-aksi" />
            </div>
            <div>
              <label htmlFor="u-peran" className="mb-1 block text-[13px] font-medium text-tinta-2">Peran</label>
              <select id="u-peran" value={peran} onChange={(e) => setPeran(e.target.value)}
                className="w-full rounded-lg border border-garis-kuat bg-white px-3 py-2 text-[14px] outline-none focus:border-aksi">
                {PERAN.map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}
              </select>
            </div>
            <p className="rounded-lg bg-kanvas px-3 py-2 text-[12.5px] leading-relaxed text-tinta-2 sm:col-span-2 lg:col-span-3">
              {KETERANGAN_PERAN[peran]}
            </p>
            <button type="submit" disabled={sibuk}
              className="min-h-10 rounded-lg bg-aksi px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-aksi/90 disabled:cursor-wait disabled:opacity-60">
              {sibuk ? "Mendaftarkan…" : "Daftarkan pengguna"}
            </button>
          </form>

          {galat && <p role="alert" className="mt-3 rounded-lg border border-gagal bg-gagal-lembut px-3 py-2 text-[13.5px] text-gagal">{galat}</p>}
          {sandiBaru && (
            <div className="mt-4 rounded-lg border border-tertunda/40 bg-tertunda-lembut px-4 py-3" role="status">
              <p className="text-[13.5px] font-semibold text-tertunda">Sandi awal untuk {sandiBaru.nama} — salin sekarang</p>
              <p className="mt-2 select-all break-all font-mono text-[18px] font-bold tracking-wide text-tinta">{sandiBaru.sandi}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-tinta-2">Sandi tidak dapat dilihat lagi setelah berpindah dari halaman ini. Sampaikan kepada pengguna melalui kanal yang sesuai.</p>
            </div>
          )}
        </section>
      )}

      {galat && !bolehKelola && <p role="alert" className="mb-3 rounded-lg border border-gagal bg-gagal-lembut px-3 py-2 text-[13.5px] text-gagal">{galat}</p>}
      <div className="overflow-x-auto rounded-xl border border-garis bg-kartu shadow-sm shadow-tinta/[0.03]">
        <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
          <thead><tr className="border-b border-garis bg-kanvas text-left">
            <th scope="col" className="px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-tinta-3">Nama</th>
            <th scope="col" className="px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-tinta-3">Email</th>
            <th scope="col" className="px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-tinta-3">Peran</th>
            <th scope="col" className="px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-tinta-3">Status</th>
            {bolehKelola && <th scope="col" className="px-4 py-3 text-right text-[11.5px] font-semibold uppercase tracking-wide text-tinta-3">Tindakan</th>}
          </tr></thead>
          <tbody>
            {daftar.map((p) => (
              <tr key={p.id} className="border-b border-garis last:border-0 hover:bg-kanvas/50">
                <td className="px-4 py-3"><span className="font-semibold text-tinta">{p.nama}</span>{p.jabatan && <span className="mt-0.5 block text-[12px] text-tinta-3">{p.jabatan}</span>}</td>
                <td className="px-4 py-3 text-tinta-2">{p.email}</td>
                <td className="px-4 py-3">
                  <select value={p.peran} disabled={!bolehKelola || p.id === sayaId} onChange={(e) => void ubahPeran(p, e.target.value)} aria-label={`Peran ${p.nama}`}
                    className="max-w-[240px] rounded-md border border-garis bg-white px-2 py-1.5 text-[12px] font-medium text-tinta-2">
                    {PERAN.map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}
                  </select>
                  {["INTERNAL_KEMENKEU", "EKSTERNAL_KEMENKEU"].includes(p.peran) && <span className="mt-1 block text-[11.5px] text-tinta-3">{p.jumlah_proyek} proyek ditugaskan</span>}
                </td>
                <td className="px-4 py-3"><span className={cn("rounded-md px-2 py-1 text-[11.5px] font-semibold", p.aktif ? "bg-lulus-lembut text-lulus" : "bg-kanvas text-tinta-3")}>{p.aktif ? "Aktif" : "Nonaktif"}</span></td>
                {bolehKelola && <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button type="button" onClick={() => {
                    setDraftEdit({ nama: p.nama, email: p.email, jabatan: p.jabatan ?? "" });
                    setPenggunaEdit(p); setGalat(null);
                  }} className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-aksi hover:bg-aksi-lembut">
                    Edit
                  </button>
                  {p.id !== sayaId && <>
                    <button type="button" onClick={() => void resetSandi(p)} className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-tinta-2 hover:bg-kanvas">Sandi baru</button>
                    <button type="button" onClick={() => void ubahAktif(p)} className={cn("ml-1 rounded-md px-2.5 py-1.5 text-[12px] font-medium", p.aktif ? "text-gagal hover:bg-gagal-lembut" : "text-lulus hover:bg-lulus-lembut")}>{p.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                  </>}
                </td>}
              </tr>
            ))}
            {daftar.length === 0 && <tr><td colSpan={bolehKelola ? 5 : 4} className="px-4 py-12 text-center text-[13.5px] text-tinta-3">Belum ada pengguna. Daftarkan akun pertama di atas.</td></tr>}
          </tbody>
        </table>
      </div>
      {penggunaEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="judul-edit-pengguna"
            className="w-full max-w-lg rounded-xl border border-garis bg-kartu p-5 shadow-xl sm:p-6">
            <h2 id="judul-edit-pengguna" className="text-lg font-bold text-tinta">Edit pengguna</h2>
            <p className="mt-1 text-[13px] text-tinta-3">Peran akun dapat diubah melalui pilihan peran pada daftar.</p>
            <form onSubmit={simpanEdit} className="mt-4 space-y-3">
              <div>
                <label htmlFor="edit-pengguna-nama" className="mb-1 block text-[13px] font-medium text-tinta-2">Nama</label>
                <input id="edit-pengguna-nama" required maxLength={120} value={draftEdit.nama}
                  onChange={(e) => setDraftEdit((d) => ({ ...d, nama: e.target.value }))}
                  className="w-full rounded-lg border border-garis-kuat bg-white px-3 py-2.5 text-[14px] outline-none focus:border-aksi" />
              </div>
              <div>
                <label htmlFor="edit-pengguna-email" className="mb-1 block text-[13px] font-medium text-tinta-2">Email</label>
                <input id="edit-pengguna-email" type="email" autoComplete="email" required maxLength={160} value={draftEdit.email}
                  onChange={(e) => setDraftEdit((d) => ({ ...d, email: e.target.value }))}
                  className="w-full rounded-lg border border-garis-kuat bg-white px-3 py-2.5 text-[14px] outline-none focus:border-aksi" />
              </div>
              <div>
                <label htmlFor="edit-pengguna-jabatan" className="mb-1 block text-[13px] font-medium text-tinta-2">Jabatan</label>
                <input id="edit-pengguna-jabatan" maxLength={80} value={draftEdit.jabatan}
                  onChange={(e) => setDraftEdit((d) => ({ ...d, jabatan: e.target.value }))}
                  className="w-full rounded-lg border border-garis-kuat bg-white px-3 py-2.5 text-[14px] outline-none focus:border-aksi" />
              </div>
              {galat && <p role="alert" className="rounded-md border border-gagal bg-gagal-lembut px-3 py-2 text-[13px] text-gagal">{galat}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={sibukEdit} onClick={() => { setPenggunaEdit(null); setGalat(null); }}
                  className="rounded-lg border border-garis-kuat px-3.5 py-2 text-[13px] font-medium text-tinta-2 hover:bg-kanvas disabled:opacity-60">Batal</button>
                <button type="submit" disabled={sibukEdit}
                  className="rounded-lg bg-aksi px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-aksi/90 disabled:opacity-60">
                  {sibukEdit ? "Menyimpan…" : "Simpan perubahan"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
