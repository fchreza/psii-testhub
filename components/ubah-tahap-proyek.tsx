"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { faseUntukProyek, type FasePengujian } from "@/lib/fase-proyek";
import { Spinner } from "@/components/indikator-proses";
import { Select } from "@/components/ui";

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
  const router = useRouter();
  const [tahapAktif, setTahapAktif] = useState(tahap);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ teks: string; galat?: boolean } | null>(null);

  useEffect(() => setTahapAktif(tahap), [tahap]);
  useEffect(() => {
    if (!pesan || pesan.galat) return;
    const timer = window.setTimeout(() => setPesan(null), 5000);
    return () => window.clearTimeout(timer);
  }, [pesan]);

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
      window.dispatchEvent(new CustomEvent("proyek:tahap-berubah", { detail: { projectId, tahap: nilai } }));
      router.refresh();
    } catch {
      setTahapAktif(sebelumnya);
      setPesan({ teks: "Tidak dapat terhubung. Periksa koneksi lalu coba lagi.", galat: true });
    } finally { setSibuk(false); }
  }

  return (
    <div className="min-w-[190px]">
      <div className="flex items-center gap-2">
        <label htmlFor={`tahap-${projectId}`} className="sr-only">Tahap proyek</label>
        <Select id={`tahap-${projectId}`} value={tahapAktif} disabled={sibuk} aria-busy={sibuk}
          wrapClassName="w-auto" className="w-auto min-w-[185px] font-semibold text-tinta-2"
          onChange={(e) => void ubah(e.target.value)}>
          {TAHAP.filter(([value]) => !["SIT", "UAT"].includes(value)
            || faseUntukProyek(jenisPengujian).includes(value as FasePengujian))
            .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        {sibuk && <Spinner className="h-4 w-4 shrink-0 text-aksi" />}
      </div>
      {pesan && (
        <div className="pointer-events-none fixed inset-x-3 top-3 z-50 flex justify-end sm:inset-x-auto sm:right-6 sm:top-6">
          <div role={pesan.galat ? "alert" : "status"}
            aria-live={pesan.galat ? "assertive" : "polite"} aria-atomic="true"
            className={`pointer-events-auto w-full max-w-sm rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed shadow-lg ${
              pesan.galat ? "border-gagal/30 bg-gagal-lembut text-gagal" : "border-lulus/25 bg-lulus-lembut text-lulus"
            }`}>
            {pesan.teks}
          </div>
        </div>
      )}
    </div>
  );
}
