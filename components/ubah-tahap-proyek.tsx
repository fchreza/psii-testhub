"use client";

import { useEffect, useState } from "react";
import { faseUntukProyek, type FasePengujian } from "@/lib/fase-proyek";
import { Spinner } from "@/components/indikator-proses";

const TAHAP = [
  ["PERSIAPAN", "Persiapan"],
  ["SIT", "Sedang SIT"],
  ["UAT", "Sedang UAT"],
  ["WAITING_SIGNOFF", "Menunggu tanda tangan"],
  ["SELESAI", "Selesai"],
];

export function UbahTahapProyek({ projectId, tahap, jenisPengujian }: {
  projectId: string; tahap: string; jenisPengujian: string;
}) {
  const [tahapAktif, setTahapAktif] = useState(tahap);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ teks: string; galat?: boolean } | null>(null);

  useEffect(() => setTahapAktif(tahap), [tahap]);

  async function ubah(nilai: string) {
    if (nilai === tahapAktif || sibuk) return;
    const sebelumnya = tahapAktif;
    setTahapAktif(nilai);
    setSibuk(true);
    setPesan(null);
    try {
      const r = await fetch("/api/v1/proyek", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "ubah_tahap", projectId, tahap: nilai }),
      });
      const hasil = await r.json().catch(() => ({}));
      if (!r.ok) {
        setTahapAktif(sebelumnya);
        setPesan({ teks: hasil.pesan ?? "Gagal mengubah tahap proyek.", galat: true });
        return;
      }
      setPesan({ teks: "Tahap proyek berhasil diperbarui." });
    } catch {
      setTahapAktif(sebelumnya);
      setPesan({ teks: "Tidak dapat terhubung. Periksa koneksi lalu coba lagi.", galat: true });
    } finally { setSibuk(false); }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <label htmlFor={`tahap-${projectId}`} className="sr-only">Tahap proyek</label>
        <select id={`tahap-${projectId}`} value={tahapAktif} disabled={sibuk} aria-busy={sibuk}
          onChange={(e) => void ubah(e.target.value)}
          className="rounded-lg border border-garis bg-kartu px-3 py-2 text-[13px] font-semibold text-tinta-2 outline-none focus:border-aksi disabled:cursor-wait disabled:opacity-60">
          {TAHAP.filter(([value]) => !["SIT", "UAT"].includes(value)
            || faseUntukProyek(jenisPengujian).includes(value as FasePengujian))
            .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {sibuk && <Spinner className="h-4 w-4 text-aksi" />}
      </div>
      {pesan && <p role={pesan.galat ? "alert" : "status"} className={`mt-1 max-w-[240px] text-[11.5px] ${pesan.galat ? "text-gagal" : "text-lulus"}`}>{pesan.teks}</p>}
    </div>
  );
}
