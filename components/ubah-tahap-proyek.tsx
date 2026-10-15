"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { faseUntukProyek, type FasePengujian } from "@/lib/fase-proyek";

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
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const router = useRouter();

  async function ubah(nilai: string) {
    if (nilai === tahap) return;
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch("/api/v1/proyek", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "ubah_tahap", projectId, tahap: nilai }),
      });
      const hasil = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(hasil.pesan ?? "Gagal mengubah tahap proyek."); return; }
      router.refresh();
    } catch {
      setPesan("Tidak dapat terhubung. Periksa koneksi lalu coba lagi.");
    } finally { setSibuk(false); }
  }

  return (
    <div>
      <label htmlFor={`tahap-${projectId}`} className="sr-only">Tahap proyek</label>
      <select id={`tahap-${projectId}`} value={tahap} disabled={sibuk} onChange={(e) => void ubah(e.target.value)}
        className="rounded-lg border border-garis bg-kartu px-3 py-2 text-[13px] font-semibold text-tinta-2 outline-none focus:border-aksi disabled:opacity-60">
        {TAHAP.filter(([value]) => !["SIT", "UAT"].includes(value)
          || faseUntukProyek(jenisPengujian).includes(value as FasePengujian))
          .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {pesan && <p role="alert" className="mt-1 max-w-[240px] text-[11.5px] text-gagal">{pesan}</p>}
    </div>
  );
}
