"use client";

import { useMemo, useState } from "react";
import type { FasePengujian } from "@/lib/fase-proyek";
import { Button, Feedback, Select } from "@/components/ui";

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
  const [sibukAksi, setSibukAksi] = useState<string | null>(null);
  const [salinSibuk, setSalinSibuk] = useState<FasePengujian | null>(null);
  const sibuk = sibukAksi !== null;
  const [pesan, setPesan] = useState<{ teks: string; galat?: boolean; peringatan?: boolean } | null>(null);
  const sudahDitugaskan = useMemo(() => new Set(anggota.map((x) => x.id)), [anggota]);
  const tersedia = calon.filter((x) => !sudahDitugaskan.has(x.id));

  async function kirim(aksi: "tambah" | "hapus", userId: string) {
    if (sibukAksi) return;
    setPesan(null); setSibukAksi(`${aksi}:${userId}`);
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
    } finally { setSibukAksi(null); }
  }

  async function salinTautan(fase: FasePengujian) {
    if (salinSibuk) return;
    const url = `${window.location.origin}/proyek/${encodeURIComponent(projectId)}?fase=${fase}`;
    setPesan(null); setSalinSibuk(fase);
    try {
      await navigator.clipboard.writeText(url);
      setPesan({ teks: `Tautan ${fase} disalin. Penerima harus masuk dengan akun yang sudah ditugaskan.` });
    } catch {
      setPesan({ teks: `Salin tautan ini: ${url}`, peringatan: true });
    } finally { setSalinSibuk(null); }
  }

  return (
    <section aria-labelledby="akses-proyek" className="mb-5 rounded-xl border border-garis bg-kartu p-4 shadow-xs shadow-tinta/3 sm:p-5">
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
            <Button key={fase} onClick={() => void salinTautan(fase)}
              disabled={salinSibuk !== null} busy={salinSibuk === fase} className="text-[12.5px]">
              {salinSibuk === fase ? "Menyalin…" : `Salin tautan ${fase}`}
            </Button>
          ))}
        </div>
      </div>

      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (pilihan) void kirim("tambah", pilihan); }}>
        <label htmlFor="anggota-proyek" className="sr-only">Pilih akun penguji</label>
        <Select id="anggota-proyek" value={pilihan} onChange={(e) => setPilihan(e.target.value)} disabled={sibuk || tersedia.length === 0}
          wrapClassName="min-w-0 flex-1" className="text-[13px]">
          <option value="">{tersedia.length ? "Pilih akun penguji untuk ditugaskan…" : "Tidak ada akun penguji yang tersedia"}</option>
          {tersedia.map((x) => <option key={x.id} value={x.id}>{x.nama} · {namaPeran[x.peran] ?? x.peran} · {x.email}</option>)}
        </Select>
        <Button type="submit" variant="primary" disabled={!pilihan} busy={sibuk} className="shrink-0 text-[13px]">
          {sibuk ? "Menyimpan…" : "Tugaskan penguji"}
        </Button>
      </form>

      {pesan && <Feedback kind={pesan.galat ? "error" : pesan.peringatan ? "warning" : "success"} className="mt-3">{pesan.teks}</Feedback>}

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
                <Button variant="danger-quiet" onClick={() => void kirim("hapus", x.id)} disabled={sibuk}
                  busy={sibukAksi === `hapus:${x.id}`} className="min-h-9 px-2.5 py-1.5 text-[12px]">
                  {sibukAksi === `hapus:${x.id}` ? "Mencabut akses…" : "Cabut akses"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
