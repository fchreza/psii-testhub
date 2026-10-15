"use client";

import { useState } from "react";
import { cn } from "@/lib/format";

type Pengguna = {
  id: string; email: string; nama: string; jabatan: string | null;
  peran: string; aktif: boolean; dibuat_pada: string; jumlah_proyek: number;
};

const PERAN = ["ADMIN","PIMPINAN","PM","QA","DEVELOPER","BUSINESS_USER","EKSTERNAL"];

const KETERANGAN_PERAN: Record<string, string> = {
  ADMIN: "Mengelola pengguna dan semua proyek",
  PIMPINAN: "Melihat semua, mengesahkan Berita Acara",
  PM: "Membuat proyek, mengatur jadwal dan penyetuju",
  QA: "Menyusun dan mengeksekusi skenario SIT",
  DEVELOPER: "Menindaklanjuti skenario gagal/tertunda",
  BUSINESS_USER: "Mengeksekusi skenario UAT",
  EKSTERNAL: "Hanya proyek yang ia menjadi anggotanya",
};

export function KelolaPengguna({
  daftarAwal, bolehKelola, sayaId,
}: { daftarAwal: Pengguna[]; bolehKelola: boolean; sayaId: string }) {
  const [daftar, setDaftar] = useState(daftarAwal);
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [peran, setPeran] = useState("QA");
  const [galat, setGalat] = useState<string | null>(null);
  const [sandiBaru, setSandiBaru] = useState<{ nama: string; sandi: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const kirim = (body: Record<string, unknown>) =>
    fetch("/api/v1/pengguna", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const tambah = async (e: React.FormEvent) => {
    e.preventDefault();
    setSibuk(true); setGalat(null); setSandiBaru(null);
    const r = await kirim({ aksi: "tambah", email, nama, jabatan, peran });
    setSibuk(false);
    if (!r.ok) {
      const { pesan } = await r.json().catch(() => ({ pesan: "Gagal menambah" }));
      setGalat(pesan); return;
    }
    const { id, sandi } = await r.json();
    setDaftar((d) => [...d, {
      id, email: email.trim().toLowerCase(), nama: nama.trim(),
      jabatan: jabatan.trim() || null, peran, aktif: true,
      dibuat_pada: new Date().toISOString(), jumlah_proyek: 0,
    }]);
    setSandiBaru({ nama: nama.trim(), sandi });
    setNama(""); setEmail(""); setJabatan(""); setPeran("QA");
  };

  const ubahAktif = async (p: Pengguna) => {
    const aksi = p.aktif ? "nonaktif" : "aktif";
    // Ubah tampilan dulu, kembalikan kalau gagal — supaya tidak ada keadaan
    // "terlihat nonaktif padahal masih bisa masuk".
    setDaftar((d) => d.map((x) => (x.id === p.id ? { ...x, aktif: !x.aktif } : x)));
    const r = await kirim({ aksi, userId: p.id });
    if (!r.ok) {
      setDaftar((d) => d.map((x) => (x.id === p.id ? { ...x, aktif: p.aktif } : x)));
      const { pesan } = await r.json().catch(() => ({ pesan: "Gagal mengubah status" }));
      setGalat(pesan);
    }
  };

  const ubahPeran = async (p: Pengguna, peranBaru: string) => {
    const lama = p.peran;
    setDaftar((d) => d.map((x) => (x.id === p.id ? { ...x, peran: peranBaru } : x)));
    const r = await kirim({ aksi: "ubah_peran", userId: p.id, peran: peranBaru });
    if (!r.ok) {
      setDaftar((d) => d.map((x) => (x.id === p.id ? { ...x, peran: lama } : x)));
      setGalat("Gagal mengubah peran");
    }
  };

  const resetSandi = async (p: Pengguna) => {
    setSandiBaru(null); setGalat(null);
    const r = await kirim({ aksi: "sandi_baru", userId: p.id });
    if (!r.ok) { setGalat("Gagal membuat sandi baru"); return; }
    const { sandi } = await r.json();
    setSandiBaru({ nama: p.nama, sandi });
  };

  return (
    <>
      {bolehKelola && (
        <section className="mb-7 rounded-lg border border-garis bg-kartu p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-tinta">Daftarkan pengguna</h2>
          <form onSubmit={tambah} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="u-nama" className="mb-1 block text-[13.5px] font-medium text-tinta-2">Nama</label>
              <input id="u-nama" required value={nama} onChange={(e) => setNama(e.target.value)}
                className="w-full rounded-md border border-garis-kuat px-3 py-2 text-[16px] outline-none focus:border-aksi" />
            </div>
            <div>
              <label htmlFor="u-email" className="mb-1 block text-[13.5px] font-medium text-tinta-2">Email</label>
              <input id="u-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-garis-kuat px-3 py-2 text-[16px] outline-none focus:border-aksi" />
            </div>
            <div>
              <label htmlFor="u-jabatan" className="mb-1 block text-[13.5px] font-medium text-tinta-2">Jabatan</label>
              <input id="u-jabatan" value={jabatan} onChange={(e) => setJabatan(e.target.value)}
                placeholder="Boleh dikosongkan"
                className="w-full rounded-md border border-garis-kuat px-3 py-2 text-[16px] outline-none focus:border-aksi" />
            </div>
            <div>
              <label htmlFor="u-peran" className="mb-1 block text-[13.5px] font-medium text-tinta-2">Peran</label>
              <select id="u-peran" value={peran} onChange={(e) => setPeran(e.target.value)}
                className="w-full rounded-md border border-garis-kuat px-3 py-2 text-[16px] outline-none focus:border-aksi">
                {PERAN.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <p className="text-[13px] leading-relaxed text-tinta-3 sm:col-span-2 lg:col-span-3">
              {KETERANGAN_PERAN[peran]}
            </p>
            <div>
              <button type="submit" disabled={sibuk}
                className="sentuh w-full rounded-md bg-aksi text-[14px] font-medium text-white disabled:opacity-60">
                {sibuk ? "Mendaftarkan…" : "Daftarkan"}
              </button>
            </div>
          </form>

          {galat && (
            <p role="alert" className="mt-3 rounded-md border border-gagal bg-gagal-lembut px-3 py-2 text-[14px] text-gagal">
              {galat}
            </p>
          )}

          {sandiBaru && (
            <div className="mt-4 rounded-md border border-tertunda bg-tertunda-lembut px-4 py-3">
              <p className="text-[14px] font-medium text-tertunda">
                Sandi untuk {sandiBaru.nama} — catat sekarang, tidak bisa dilihat lagi
              </p>
              <p className="mt-1.5 select-all font-mono text-[18px] font-bold tracking-wide text-tinta">
                {sandiBaru.sandi}
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-tinta-2">
                Sampaikan ke yang bersangkutan. Hanya sidik sandinya yang tersimpan, jadi
                sandi ini tidak bisa ditampilkan lagi — kalau hilang, buat yang baru.
              </p>
            </div>
          )}
        </section>
      )}

      <div className="overflow-x-auto rounded-lg border border-garis bg-kartu">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-garis bg-kanvas text-left">
              <th className="px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-tinta-3">Nama</th>
              <th className="px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-tinta-3">Email</th>
              <th className="px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-tinta-3">Peran</th>
              <th className="px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-tinta-3">Status</th>
              {bolehKelola && <th className="px-4 py-2.5"><span className="sr-only">Tindakan</span></th>}
            </tr>
          </thead>
          <tbody>
            {daftar.map((p) => (
              <tr key={p.id} className="border-b border-garis last:border-0">
                <td className="px-4 py-2.5">
                  <span className="font-medium text-tinta">{p.nama}</span>
                  {p.jabatan && <span className="block text-[12.5px] text-tinta-3">{p.jabatan}</span>}
                </td>
                <td className="px-4 py-2.5 text-tinta-2">{p.email}</td>
                <td className="px-4 py-2.5">
                  {bolehKelola ? (
                    <select value={p.peran} onChange={(e) => void ubahPeran(p, e.target.value)}
                      aria-label={`Peran ${p.nama}`}
                      className="rounded border border-garis-kuat bg-kartu px-2 py-1 text-[13.5px] text-tinta-2">
                      {PERAN.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  ) : (
                    <span className="text-tinta-2">{p.peran}</span>
                  )}
                  {p.peran === "EKSTERNAL" && (
                    <span className="mt-0.5 block text-[12px] text-tinta-3">
                      {p.jumlah_proyek} proyek
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className={cn(
                    "rounded px-2 py-0.5 text-[12.5px] font-medium",
                    p.aktif ? "bg-lulus-lembut text-lulus" : "bg-kanvas text-tinta-3",
                  )}>
                    {p.aktif ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                {bolehKelola && (
                  <td className="px-4 py-2.5 text-right">
                    <button type="button" onClick={() => void resetSandi(p)}
                      className="rounded px-2 py-1 text-[13px] text-tinta-2 hover:bg-kanvas">
                      Sandi baru
                    </button>
                    {p.id !== sayaId && (
                      <button type="button" onClick={() => void ubahAktif(p)}
                        className={cn("ml-1 rounded px-2 py-1 text-[13px]",
                          p.aktif ? "text-gagal hover:bg-gagal-lembut" : "text-lulus hover:bg-lulus-lembut")}>
                        {p.aktif ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {daftar.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[14px] text-tinta-2">
                  Belum ada pengguna terdaftar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
