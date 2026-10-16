"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/indikator-proses";

export function TombolKeluar() {
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const router = useRouter();

  async function keluar() {
    if (sibuk) return;
    setSibuk(true);
    setGalat(null);
    try {
      const response = await fetch("/api/v1/keluar", { method: "POST" });
      if (!response.ok) throw new Error("Sesi belum dapat ditutup. Coba lagi.");
      router.replace("/masuk");
    } catch (error) {
      setGalat(error instanceof Error ? error.message : "Tidak dapat terhubung. Coba lagi.");
      setSibuk(false);
    }
  }

  return (
    <div className="text-right">
      <button type="button" disabled={sibuk} aria-busy={sibuk} onClick={() => void keluar()}
        className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13.5px] text-tinta-3 hover:bg-kanvas hover:text-tinta disabled:cursor-wait disabled:opacity-60">
        {sibuk && <Spinner className="h-3.5 w-3.5" />}{sibuk ? "Keluar…" : "Keluar"}
      </button>
      {galat && <p role="alert" className="mt-1 max-w-52 text-[11px] text-gagal">{galat}</p>}
    </div>
  );
}
