"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/format";
import type { FasePengujian } from "@/lib/fase-proyek";

type Calon = { id: string; nama: string; email: string; peran: string };
type Anggota = Calon & { ditambahkan_pada?: string };

const namaPeran: Record<string, string> = {
  INTERNAL_KEMENKEU: "Internal Kemenkeu",
  EKSTERNAL_KEMENKEU: "Eksternal Kemenkeu",
};

export function KelolaAksesProyek({
  projectId, calon, anggotaAwal, faseTersedia,
}: { projectId: string; calon: Calon[]; anggotaAwal: Anggota[]; faseTersedia: FasePengujian[] }) {
  const [anggota, setAnggota] = useState(anggotaAwal);
  const [pilihan, setPilihan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ teks: string; galat?: boolean } | null>(null);
  const sudahDitugaskan = useMemo(() => new Set(anggota.map((x) => x.id)), [anggota]);
  const tersedia = calon.filter((x) => !sudahDitugaskan.has(x.id));

  async function kirim(aksi: "tambah" | "hapus", userId: string) {
    setPesan(null); setSibuk(true);
    try {
      const r = await fetch("/api/v1/anggota-proyek", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi, projectId, userId }),
      });
      const hasil = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan({ teks: hasil.pesan ?? "Gagal memperbarui akses.", galat: true }); return; }
      if (aksi === "tambah") {
        const pengguna = calon.find((x) => x.id === userId);
        if (pengguna) setAnggota((d) => [...d, pengguna].sort((a, b) => a.nama.localeCompare(b.nama, "id")));
        setPilihan("");
        setPesan({ teks: "Penguji sekarang dapat membuka tautan proyek setelah masuk." });
      } else {
        setAnggota((d) => d.filter((x) => x.id !== userId));
        setPesan({ teks: "Akses pengguna ke proyek ini telah dicabut." });
      }
    } catch {
      setPesan({ teks: "Tidak dapat terhubung. Periksa koneksi lalu coba lagi.", galat: true });
    } finally { setSibuk(false); }
  }

  async function salinTautan(fase: FasePengujian) {
    const url = `${window.location.origin}/proyek/${encodeURIComponent(projectId)}?fase=${fase}`;
    try {
      await navigator.clipboard.writeText(url);
      setPesan({ teks: `Tautan ${fase} disalin. Penerima harus masuk dengan akun yang sudah ditugaskan.` });
    } catch {
      setPesan({ teks: `Salin tautan ini: ${url}` });
    }
  }

  return (
    <section aria-labelledby="akses-proyek" className="mb-5 rounded-xl border border-garis bg-kartu p-4 shadow-sm shadow-tinta/[0.03] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.15em] text-aksi">Akses penguji</p>
          <h2 id="akses-proyek" className="mt-1 text-[16px] font-semibold text-tinta">Bagikan proyek secara terbatas</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-tinta-2">
            Tambahkan akun penguji, lalu bagikan tautan fase yang tersedia. Tautan bukan akses publik: pengguna wajib masuk dan terdaftar pada proyek ini.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {faseTersedia.map((fase) => (
            <button key={fase} type="button" onClick={() => void salinTautan(fase)}
              className="rounded-lg border border-garis px-3 py-2 text-[12.5px] font-semibold text-tinta-2 hover:border-garis-kuat hover:bg-kanvas">
              Salin tautan {fase}
            </button>
          ))}
        </div>
      </div>

      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (pilihan) void kirim("tambah", pilihan); }}>
        <label htmlFor="anggota-proyek" className="sr-only">Pilih akun penguji</label>
        <select id="anggota-proyek" value={pilihan} onChange={(e) => setPilihan(e.target.value)} disabled={sibuk || tersedia.length === 0}
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-garis-kuat bg-white px-3 text-[13px] text-tinta outline-none focus:border-aksi disabled:bg-kanvas">
          <option value="">{tersedia.length ? "Pilih akun penguji untuk ditugaskan…" : "Tidak ada akun penguji yang tersedia"}</option>
          {tersedia.map((x) => <option key={x.id} value={x.id}>{x.nama} · {namaPeran[x.peran] ?? x.peran} · {x.email}</option>)}
        </select>
        <button type="submit" disabled={!pilihan || sibuk} className="min-h-10 rounded-lg bg-aksi px-4 text-[13px] font-semibold text-white hover:bg-aksi/90 disabled:cursor-not-allowed disabled:opacity-50">
          {sibuk ? "Menyimpan…" : "Tugaskan penguji"}
        </button>
      </form>

      {pesan && <p role={pesan.galat ? "alert" : "status"} className={cn("mt-3 rounded-lg px-3 py-2 text-[12.5px] leading-relaxed", pesan.galat ? "border border-gagal bg-gagal-lembut text-gagal" : "bg-lulus-lembut text-lulus")}>{pesan.teks}</p>}

      <div className="mt-4 border-t border-garis pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[12.5px] font-semibold text-tinta">Penguji yang ditugaskan</h3>
          <span className="tabular text-[11.5px] text-tinta-3">{anggota.length} akun</span>
        </div>
        {anggota.length === 0 ? (
          <p className="rounded-lg border border-dashed border-garis px-3 py-4 text-center text-[12.5px] text-tinta-3">Belum ada penguji eksternal/Internal Kemenkeu yang ditugaskan.</p>
        ) : (
          <ul className="divide-y divide-garis">
            {anggota.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-1">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-tinta">{x.nama}</p>
                  <p className="truncate text-[11.5px] text-tinta-3">{x.email} · {namaPeran[x.peran] ?? x.peran}</p>
                </div>
                <button type="button" onClick={() => void kirim("hapus", x.id)} disabled={sibuk}
                  className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-gagal hover:bg-gagal-lembut disabled:opacity-50">
                  Cabut akses
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
