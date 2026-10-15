"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Formulir proyek baru.
 *
 * KENAPA MEMUAT METADATA COVER, bukan hanya nama:
 * Berkas contoh di kantor memuat Dasar Regulasi dan Lingkungan Uji di halaman
 * cover-nya, dan keduanya benar-benar menentukan:
 *   - Dasar Regulasi menentukan VERSI ATURAN yang diuji (PER-4/PB/2026 berbeda
 *     dari PER-3/PB/2025)
 *   - Lingkungan menentukan hasilnya boleh dipakai mengesahkan produksi atau tidak
 * Kalau tidak dikumpulkan sekarang, informasi itu hilang begitu proyek dibuat.
 */
export function TombolProyekBaru() {
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const router = useRouter();

  const [f, setF] = useState({
    nama: "", modulAplikasi: "", unitBisnis: "", ruangLingkup: "",
    sumberAcuan: "", dasarRegulasi: "", lingkungan: "DEV", alamatServer: "",
    tahunAnggaran: String(new Date().getFullYear()), tanggalMulai: "", targetSelesai: "",
  });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  if (!buka) {
    return (
      <button type="button" onClick={() => setBuka(true)}
        className="sentuh rounded-md bg-aksi px-4 text-[14px] font-medium text-white">
        Proyek baru
      </button>
    );
  }

  return (
    <>
      <button type="button" onClick={() => { if (!sibuk) setBuka(false); }} disabled={sibuk}
        aria-label="Tutup formulir"
        className="fixed inset-0 z-30 bg-tinta/10" />
      <aside role="dialog" aria-label="Proyek baru"
        className="fixed right-0 top-0 z-40 h-screen w-full overflow-y-auto border-l border-garis bg-kartu sm:w-[46%] sm:max-w-[640px]">
        <form className="px-7 py-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setSibuk(true); setGalat(null);
            try {
              const r = await fetch("/api/v1/proyek", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  aksi: "tambah", ...f,
                  tahunAnggaran: f.tahunAnggaran.trim() ? Number(f.tahunAnggaran) : null,
                  tanggalMulai: f.tanggalMulai || null,
                  targetSelesai: f.targetSelesai || null,
                }),
              });
              const hasil = await r.json().catch(() => ({ pesan: "Respons server tidak dapat dibaca." }));
              if (!r.ok) { setGalat(hasil.pesan ?? "Gagal menyimpan proyek."); return; }
              router.push(`/proyek/${hasil.id}`);
            } catch {
              setGalat("Tidak dapat terhubung. Proyek belum dibuat; coba lagi.");
            } finally { setSibuk(false); }
          }}>
          <h2 className="mb-1 text-[20px] font-bold tracking-tight text-tinta">Proyek baru</h2>
          <p className="mb-5 text-[13.5px] leading-relaxed text-tinta-2">
            Hanya nama yang wajib. Sisanya bisa dilengkapi nanti — tetapi Dasar Regulasi
            dan Lingkungan sebaiknya diisi sekarang, karena keduanya menentukan arti hasil ujinya.
          </p>

          <div className="space-y-4">
            <Isian label="Nama proyek" wajib nilai={f.nama} ubah={(v) => set("nama", v)}
              contoh="Penyesuaian OM-SPAN TKD sesuai PER-4/PB/2026" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Isian label="Modul / Aplikasi" nilai={f.modulAplikasi} ubah={(v) => set("modulAplikasi", v)} contoh="OM-SPAN TKD" />
              <Isian label="Unit bisnis / divisi" nilai={f.unitBisnis} ubah={(v) => set("unitBisnis", v)} contoh="Dit. PA" />
            </div>
            <Isian label="Ruang lingkup" nilai={f.ruangLingkup} ubah={(v) => set("ruangLingkup", v)}
              contoh="Poin A s.d. F" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Isian label="Sumber acuan" nilai={f.sumberAcuan} ubah={(v) => set("sumberAcuan", v)} contoh="UR-OMSPAN-TKD Juni 2026" />
              <Isian label="Dasar regulasi" nilai={f.dasarRegulasi} ubah={(v) => set("dasarRegulasi", v)} contoh="PER-4/PB/2026" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="p-lingkungan" className="mb-1 block text-[13.5px] font-medium text-tinta-2">
                  Lingkungan uji
                </label>
                <select id="p-lingkungan" value={f.lingkungan} onChange={(e) => set("lingkungan", e.target.value)}
                  className="w-full rounded-md border border-garis-kuat px-3 py-2 text-[16px] outline-none focus:border-aksi">
                  {["DEV","SIT","UAT","PROD"].map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
                <p className="mt-1 text-[12.5px] leading-relaxed text-tinta-3">
                  Hasil di DEV tidak boleh dipakai untuk mengesahkan produksi.
                </p>
              </div>
              <Isian label="Alamat server" nilai={f.alamatServer} ubah={(v) => set("alamatServer", v)} contoh="http://tkd-dev..." />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Isian label="Tahun anggaran" tipe="number" nilai={f.tahunAnggaran} ubah={(v) => set("tahunAnggaran", v)} />
              <Isian label="Tanggal mulai" tipe="date" nilai={f.tanggalMulai} ubah={(v) => set("tanggalMulai", v)} />
              <Isian label="Target selesai" tipe="date" nilai={f.targetSelesai} ubah={(v) => set("targetSelesai", v)} />
            </div>
          </div>

          {galat && (
            <p role="alert" className="mt-4 rounded-md border border-gagal bg-gagal-lembut px-3 py-2 text-[14px] text-gagal">
              {galat}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <button type="submit" disabled={sibuk}
              className="sentuh rounded-md bg-aksi px-5 text-[14.5px] font-medium text-white disabled:opacity-60">
              {sibuk ? "Menyimpan…" : "Simpan proyek"}
            </button>
            <button type="button" disabled={sibuk} onClick={() => setBuka(false)}
              className="sentuh rounded-md border border-garis px-4 text-[14px] text-tinta-2 hover:border-garis-kuat">
              Batal
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

function Isian({
  label, nilai, ubah, contoh, wajib, tipe = "text",
}: {
  label: string; nilai: string; ubah: (v: string) => void;
  contoh?: string; wajib?: boolean; tipe?: string;
}) {
  const id = `p-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13.5px] font-medium text-tinta-2">
        {label}{wajib && <span className="text-gagal"> *</span>}
      </label>
      <input id={id} type={tipe} required={wajib} value={nilai} placeholder={contoh}
        onChange={(e) => ubah(e.target.value)}
        className="w-full rounded-md border border-garis-kuat px-3 py-2 text-[16px] outline-none focus:border-aksi" />
    </div>
  );
}
