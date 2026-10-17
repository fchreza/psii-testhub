"use client";

import { useId, useState } from "react";
import { Button, Feedback, Field, Input } from "@/components/ui";
import type { Modul, Skenario } from "@/components/tabel-skenario";

export function LembarSkenario({
  projectId, modul, skenario, jumlahPerModul, aktifId, bolehKelola, disabled = false, onPilih, onDibuat,
}: {
  projectId: string;
  modul: Modul[];
  skenario: Skenario[];
  jumlahPerModul: ReadonlyMap<string | null, number>;
  aktifId: string | null;
  bolehKelola: boolean;
  disabled?: boolean;
  onPilih: (id: string | null) => void;
  onDibuat: (modul: Modul) => void;
}) {
  const idNama = useId();
  const [formBuka, setFormBuka] = useState(false);
  const [nama, setNama] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const tanpaKelompok = jumlahPerModul.get(null) ?? 0;

  async function buat(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sibuk || !nama.trim()) return;
    setSibuk(true);
    setGalat(null);
    try {
      const response = await fetch(`/api/v1/proyek/${encodeURIComponent(projectId)}/modul`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama }),
      });
      const hasil = await response.json().catch(() => ({ pesan: "Respons server tidak dapat dibaca." }));
      if (!response.ok) {
        setGalat(hasil.pesan ?? "Lembar tidak dapat dibuat.");
        return;
      }
      const baru = hasil.modul as Modul | undefined;
      if (!baru || typeof baru.id !== "string") {
        setGalat("Respons pembuatan lembar tidak lengkap. Muat ulang proyek sebelum mencoba lagi.");
        return;
      }
      onDibuat(baru);
      setNama("");
      setFormBuka(false);
    } catch {
      setGalat("Tidak dapat terhubung. Lembar belum dibuat; periksa koneksi lalu coba lagi.");
    } finally {
      setSibuk(false);
    }
  }

  function navigasiTab(e: React.KeyboardEvent<HTMLButtonElement>) {
    const tombol = Array.from(
      e.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? [],
    );
    const index = tombol.indexOf(e.currentTarget);
    let tujuan = -1;
    if (e.key === "ArrowRight") tujuan = (index + 1) % tombol.length;
    else if (e.key === "ArrowLeft") tujuan = (index - 1 + tombol.length) % tombol.length;
    else if (e.key === "Home") tujuan = 0;
    else if (e.key === "End") tujuan = tombol.length - 1;
    if (tujuan >= 0 && tombol[tujuan]) {
      e.preventDefault();
      tombol[tujuan].focus();
      tombol[tujuan].click();
    }
  }

  return (
    <section aria-labelledby="judul-lembar-skenario" className="mb-4 overflow-hidden rounded-xl border border-garis bg-kartu shadow-xs shadow-tinta/3">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-garis px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id="judul-lembar-skenario" className="text-[14px] font-semibold text-tinta">Lembar skenario</h2>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-tinta-3">
            Pilih kelompok, modul, atau menu. Setiap lembar memiliki daftar skenarionya sendiri.
          </p>
          {disabled && <p role="status" className="mt-1.5 text-[12px] font-medium text-tertunda">Simpan atau buang draf sebelum berpindah lembar.</p>}
        </div>
        {bolehKelola && (
          <Button type="button" variant={formBuka ? "secondary" : "primary"}
            onClick={() => { setFormBuka((buka) => !buka); setGalat(null); }}
            disabled={disabled || sibuk} aria-expanded={formBuka} aria-controls="form-lembar-baru"
            title={disabled ? "Selesaikan atau buang draf sebelum mengganti lembar" : undefined}
            className="min-h-9 shrink-0 px-3 py-1.5 text-[12.5px]">
            {formBuka ? "Batal" : <><span aria-hidden="true" className="text-base leading-none">＋</span> Tambah lembar</>}
          </Button>
        )}
      </div>

      {(modul.length > 0 || tanpaKelompok > 0) ? (
        <div role="tablist" aria-label="Kelompok, modul, atau menu" className="flex flex-wrap gap-1.5 border-b border-garis bg-kanvas/50 px-3 py-2.5 sm:px-4">
          {modul.map((item) => {
            const dipilih = aktifId === item.id;
            const jumlah = jumlahPerModul.get(item.id) ?? 0;
            return (
              <button key={item.id} id={`tab-lembar-${item.id}`} type="button" role="tab"
                aria-selected={dipilih} aria-controls="panel-skenario-lembar" tabIndex={dipilih ? 0 : -1}
                onKeyDown={navigasiTab} onClick={() => onPilih(item.id)}
                disabled={disabled} title={disabled ? "Selesaikan atau buang draf sebelum mengganti lembar" : undefined}
                className={`inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-aksi-lembut disabled:cursor-not-allowed disabled:opacity-50 ${dipilih
                  ? "border-aksi/30 bg-kartu font-semibold text-aksi shadow-xs"
                  : "border-transparent bg-transparent text-tinta-2 hover:border-garis-kuat hover:bg-kartu hover:text-tinta"}`}>
                <span className="shrink-0 rounded bg-kanvas px-1.5 py-0.5 font-mono text-[11px] font-medium text-tinta-3">{item.kode}</span>
                <span className="min-w-0 truncate">{item.nama}</span>
                <span aria-label={`${jumlah} skenario`} className={`tabular shrink-0 rounded-full px-1.5 py-0.5 text-[11px] ${dipilih ? "bg-aksi-lembut text-aksi" : "bg-kanvas text-tinta-3"}`}>{jumlah}</span>
              </button>
            );
          })}
          {tanpaKelompok > 0 && (
            <button id="tab-lembar-tanpa-kelompok" type="button" role="tab"
              aria-selected={aktifId === null} aria-controls="panel-skenario-lembar" tabIndex={aktifId === null ? 0 : -1}
              onKeyDown={navigasiTab} onClick={() => onPilih(null)}
              disabled={disabled} title={disabled ? "Selesaikan atau buang draf sebelum mengganti lembar" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-aksi-lembut disabled:cursor-not-allowed disabled:opacity-50 ${aktifId === null
                ? "border-aksi/30 bg-kartu font-semibold text-aksi shadow-xs"
                : "border-transparent bg-transparent text-tinta-2 hover:border-garis-kuat hover:bg-kartu hover:text-tinta"}`}>
              <span className="text-tinta-3" aria-hidden="true">—</span>
              <span>Tanpa kelompok</span>
              <span aria-label={`${tanpaKelompok} skenario`} className={`tabular shrink-0 rounded-full px-1.5 py-0.5 text-[11px] ${aktifId === null ? "bg-aksi-lembut text-aksi" : "bg-kanvas text-tinta-3"}`}>{tanpaKelompok}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 text-[13px] text-tinta-2 sm:px-5">
          {bolehKelola
            ? "Buat lembar pertama sebelum menambahkan skenario. Satu lembar dapat berisi banyak skenario."
            : "Belum ada lembar skenario. Hubungi Admin atau Internal PSII untuk menyiapkan kelompok proyek."}
        </div>
      )}

      {formBuka && bolehKelola && (
        <form id="form-lembar-baru" onSubmit={(e) => void buat(e)} className="grid gap-3 bg-kartu px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-5">
          <Field id={idNama} label="Nama kelompok / modul / menu" required
            hint="Lembar ini akan tersedia untuk skenario pada tahap proyek yang sedang dipilih.">
            <Input id={idNama} aria-describedby={`${idNama}-hint`} autoFocus maxLength={200} value={nama} disabled={disabled || sibuk}
              placeholder="Contoh: Penyaluran TKD" onChange={(e) => setNama(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" busy={sibuk} disabled={disabled || !nama.trim()} className="w-full sm:w-auto">
            {sibuk ? "Membuat lembar…" : "Buat lembar"}
          </Button>
          {galat && <Feedback kind="error" className="sm:col-span-2">{galat}</Feedback>}
        </form>
      )}
    </section>
  );
}
