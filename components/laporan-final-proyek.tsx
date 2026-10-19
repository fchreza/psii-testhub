"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Feedback } from "@/components/ui";
import { useFocusTrap } from "@/components/use-focus-trap";
import type { HitunganLaporan, PratinjauLaporan, SumberLaporan, VersiLaporan } from "@/lib/laporan-final-types";

type DaftarResponse = { eligible: boolean; bolehGenerate: boolean; versi: VersiLaporan[] };
type HasilGenerate = { id: string; versi: number };

const KOSONG: HitunganLaporan = { total: 0, lulus: 0, gagal: 0, tertunda: 0, belum: 0 };
const JUMLAH: [keyof HitunganLaporan, string][] = [
  ["total", "Total"], ["lulus", "Lulus"], ["gagal", "Gagal"], ["tertunda", "Tertunda"], ["belum", "Belum diuji"],
];

function tanggal(nilai: string | null | undefined, termasukWaktu = false) {
  if (!nilai) return "—";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(nilai);
  const date = new Date(dateOnly ? `${nilai}T12:00:00` : nilai);
  return Number.isNaN(date.getTime()) ? nilai : new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium", ...(termasukWaktu && !dateOnly ? { timeStyle: "short" as const } : {}),
  }).format(date);
}
function teksError(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "pesan" in data && typeof data.pesan === "string") return data.pesan;
  return fallback;
}
async function bacaJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}
function hrefPdf(id: string, unduh = false) {
  return `/api/v1/laporan-final/${encodeURIComponent(id)}${unduh ? "?unduh=1" : ""}`;
}

function Rekap({ hitungan }: { hitungan: HitunganLaporan }) {
  return <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
    {JUMLAH.map(([key, label]) => <div key={key} className="rounded-md border border-garis bg-kanvas/60 px-3 py-2">
      <dt className="text-[11px] font-medium text-tinta-3">{label}</dt>
      <dd className="mt-0.5 text-[17px] font-semibold tabular text-tinta">{hitungan[key]}</dd>
    </div>)}
  </dl>;
}

function InfoIdentitas({ sumber }: { sumber: SumberLaporan }) {
  const p = sumber.proyek;
  const info: [string, string | null][] = [
    ["ID proyek", p.id], ["Aplikasi", p.aplikasi], ["Jenis pengujian", p.jenisPengujian],
    ["Tahap saat pratinjau", p.tahap], ["Unit", p.unit], ["PIC", p.pic],
    ["Lingkungan", p.lingkungan], ["Ruang lingkup", p.ruangLingkup],
    ["Mulai", p.tanggalMulai], ["Target selesai", p.targetSelesai], ["Selesai pada", p.selesaiPada],
    ["Dasar regulasi", p.dasarRegulasi],
  ];
  return <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
    {info.map(([label, value]) => <div key={label} className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-tinta-3">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] leading-relaxed text-tinta-2">{label === "Mulai" || label === "Target selesai" ? tanggal(value) : label === "Selesai pada" ? tanggal(value, true) : value || "—"}</dd>
    </div>)}
  </dl>;
}

function hitungAktualKosong(sumber: SumberLaporan) {
  return sumber.modul.flatMap((modul) => modul.skenario
    .filter((skenario) => !skenario.aktual?.trim())
    .map((skenario) => `${modul.kode} · ${skenario.kode} — ${skenario.judul}`));
}

export function LaporanFinalProyek({ projectId, bolehGenerate }: { projectId: string; bolehGenerate: boolean }) {
  const [daftar, setDaftar] = useState<DaftarResponse | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [dialogTerbuka, setDialogTerbuka] = useState(false);
  const [memuatPratinjau, setMemuatPratinjau] = useState(false);
  const [pratinjau, setPratinjau] = useState<PratinjauLaporan | null>(null);
  const [galatPratinjau, setGalatPratinjau] = useState("");
  const [diakui, setDiakui] = useState(false);
  const [membuat, setMembuat] = useState(false);
  const [galatGenerate, setGalatGenerate] = useState("");
  const [berhasil, setBerhasil] = useState<HasilGenerate | null>(null);
  const urutanMuat = useRef(0);
  const dialogRef = useFocusTrap<HTMLDivElement>(dialogTerbuka, () => tutupPratinjau());

  const muatDaftar = useCallback(async (senyap = false) => {
    const ini = ++urutanMuat.current;
    if (!senyap) { setMemuat(true); setGalat(""); }
    try {
      const query = new URLSearchParams({ projectId });
      const response = await fetch(`/api/v1/laporan-final?${query}`, { cache: "no-store" });
      const data = await bacaJson<DaftarResponse & { pesan?: string }>(response);
      if (!response.ok) throw new Error(teksError(data, "Daftar laporan final tidak dapat dimuat."));
      if (ini === urutanMuat.current) { setDaftar(data); setGalat(""); }
    } catch (error) {
      if (ini === urutanMuat.current) setGalat(error instanceof Error ? error.message : "Daftar laporan final tidak dapat dimuat.");
    } finally {
      if (ini === urutanMuat.current) setMemuat(false);
    }
  }, [projectId]);

  useEffect(() => {
    void muatDaftar();
    const segarkan = () => { if (document.visibilityState === "visible") void muatDaftar(true); };
    window.addEventListener("focus", segarkan);
    document.addEventListener("visibilitychange", segarkan);
    window.addEventListener("proyek:tahap-berubah", segarkan);
    return () => {
      urutanMuat.current++;
      window.removeEventListener("focus", segarkan);
      document.removeEventListener("visibilitychange", segarkan);
      window.removeEventListener("proyek:tahap-berubah", segarkan);
    };
  }, [muatDaftar]);

  function tutupPratinjau() {
    if (memuatPratinjau || membuat) return;
    setDialogTerbuka(false);
    setDiakui(false);
    setGalatPratinjau("");
    setGalatGenerate("");
  }

  async function bukaPratinjau() {
    setDialogTerbuka(true);
    setPratinjau(null);
    setDiakui(false);
    setGalatPratinjau("");
    setGalatGenerate("");
    setMemuatPratinjau(true);
    try {
      // Recheck eligibility and immutable versions immediately before preview.
      const query = new URLSearchParams({ projectId });
      const daftarResponse = await fetch(`/api/v1/laporan-final?${query}`, { cache: "no-store" });
      const daftarTerbaru = await bacaJson<DaftarResponse & { pesan?: string }>(daftarResponse);
      if (!daftarResponse.ok) throw new Error(teksError(daftarTerbaru, "Status kelayakan laporan tidak dapat diperiksa."));
      setDaftar(daftarTerbaru);
      if (!daftarTerbaru.eligible || !daftarTerbaru.bolehGenerate) throw new Error("Laporan belum dapat dibuat. Pastikan proyek berada pada tahap Selesai dan memenuhi syarat UAT.");
      const response = await fetch("/api/v1/laporan-final", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "pratinjau", projectId }),
      });
      const data = await bacaJson<PratinjauLaporan & { pesan?: string }>(response);
      if (!response.ok) throw new Error(teksError(data, "Pratinjau laporan final tidak dapat dibuat."));
      setPratinjau(data);
    } catch (error) {
      setGalatPratinjau(error instanceof Error ? error.message : "Pratinjau laporan final tidak dapat dibuat.");
    } finally { setMemuatPratinjau(false); }
  }

  async function buatLaporan() {
    if (!pratinjau || !diakui || membuat) return;
    setMembuat(true);
    setGalatGenerate("");
    try {
      const response = await fetch("/api/v1/laporan-final", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "generate", projectId, sidikSumber: pratinjau.sidikSumber, konfirmasi: true }),
      });
      const data = await bacaJson<HasilGenerate & { pesan?: string }>(response);
      if (!response.ok) throw new Error(teksError(data, "Laporan final tidak dapat dibuat."));
      setBerhasil(data);
      setDialogTerbuka(false);
      setDiakui(false);
      await muatDaftar(true);
    } catch (error) {
      setGalatGenerate(error instanceof Error ? error.message : "Laporan final tidak dapat dibuat.");
    } finally { setMembuat(false); }
  }

  return <section aria-labelledby={`laporan-final-title-${projectId}`} className="mb-6 overflow-hidden rounded-lg border border-garis bg-kartu shadow-xs">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-garis px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-aksi">Dokumen UAT</p>
        <h2 id={`laporan-final-title-${projectId}`} className="mt-1 text-[17px] font-semibold text-tinta">Laporan final</h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-tinta-3">Versi yang dibuat tersimpan sebagai snapshot dan tidak berubah saat data proyek diperbarui.</p>
      </div>
      {bolehGenerate && daftar?.eligible && daftar.bolehGenerate && <Button onClick={() => void bukaPratinjau()} disabled={memuat}>
        Generate Laporan Final
      </Button>}
    </div>
    <div className="space-y-3 px-4 py-4 sm:px-5">
      {berhasil && <Feedback kind="success">
        Laporan final versi {berhasil.versi} berhasil dibuat. <a className="font-semibold underline underline-offset-2" href={hrefPdf(berhasil.id, true)}>Unduh PDF</a>
      </Feedback>}
      {galat && <Feedback kind="error">{galat} <button type="button" className="ml-1 font-semibold underline underline-offset-2" onClick={() => void muatDaftar()}>Coba lagi</button></Feedback>}
      {memuat && !daftar ? <div role="status" aria-live="polite" className="py-3 text-[13px] text-tinta-3">Memuat daftar laporan final…</div> : null}
      {daftar && <>
        {!daftar.eligible && <p className="rounded-md bg-kanvas px-3.5 py-3 text-[13px] leading-relaxed text-tinta-2">Laporan final tersedia untuk proyek UAT setelah tahap proyek selesai. Versi terdahulu tetap dapat diakses di bawah.</p>}
        {daftar.versi.length === 0 ? <p className="py-2 text-[13px] text-tinta-3">Belum ada versi laporan final.</p> :
          <ul className="divide-y divide-garis" aria-label="Versi laporan final">
            {daftar.versi.map((versi) => <li key={versi.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[14px] font-semibold text-tinta">Versi {versi.versi}</h3>
                  {versi.perluPembaruan && <span className="rounded-sm border border-tertunda/30 bg-tertunda-lembut px-2 py-0.5 text-[11px] font-semibold text-tertunda">Perlu pembaruan</span>}
                </div>
                <p className="mt-1 text-[12px] text-tinta-3">Dibuat {tanggal(versi.dibuatPada)} · {versi.dibuatOleh}</p>
                {versi.perluPembaruan && <p className="mt-1 text-[12px] text-tertunda">Data proyek berubah sejak versi ini dibuat.</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <a className="inline-flex min-h-10 items-center justify-center rounded-lg border border-garis-kuat bg-kartu px-3 text-[13px] font-semibold text-tinta-2 hover:border-aksi/50 hover:text-aksi focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-aksi-lembut" href={hrefPdf(versi.id)} target="_blank" rel="noopener noreferrer">Lihat PDF</a>
                <a className="inline-flex min-h-10 items-center justify-center rounded-lg bg-aksi px-3 text-[13px] font-semibold text-white hover:bg-aksi/90 focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-aksi-lembut" href={hrefPdf(versi.id, true)}>Unduh</a>
              </div>
            </li>)}
          </ul>}
        <div className="flex justify-end border-t border-garis pt-3">
          <button type="button" className="min-h-9 rounded px-2 text-[12px] font-medium text-aksi hover:bg-aksi-lembut focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-aksi-lembut" onClick={() => void muatDaftar()} disabled={memuat}>Perbarui daftar</button>
        </div>
      </>}
    </div>

    {dialogTerbuka && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-tinta/45 p-0 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) tutupPratinjau(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="pratinjau-laporan-title" tabIndex={-1} className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-xl border border-garis bg-kartu shadow-2xl sm:max-h-[90dvh] sm:rounded-xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-garis px-4 py-4 sm:px-6">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-aksi">Pemeriksaan sebelum dibuat</p><h2 id="pratinjau-laporan-title" className="mt-1 text-[18px] font-semibold text-tinta">Pratinjau laporan final</h2></div>
          <button type="button" onClick={tutupPratinjau} disabled={memuatPratinjau || membuat} aria-label="Tutup pratinjau" className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-tinta-2 hover:bg-kanvas focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-aksi-lembut disabled:opacity-50"><span aria-hidden="true" className="text-2xl leading-none">×</span></button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {memuatPratinjau && <div role="status" className="py-8 text-center text-[13px] text-tinta-3">Menyiapkan pratinjau dari data proyek terbaru…</div>}
          {galatPratinjau && <Feedback kind="error">{galatPratinjau}</Feedback>}
          {pratinjau && <>
            <div><h3 className="mb-3 text-[14px] font-semibold text-tinta">Identitas proyek</h3><div className="mb-3"><p className="text-[11px] font-medium uppercase tracking-wide text-tinta-3">Nama proyek</p><p className="mt-0.5 text-[15px] font-semibold text-tinta">{pratinjau.sumber.proyek.nama}</p></div><InfoIdentitas sumber={pratinjau.sumber} /></div>
            <div><h3 className="mb-3 text-[14px] font-semibold text-tinta">Rekap hasil · seluruh modul UAT</h3><Rekap hitungan={pratinjau.sumber.hitungan ?? KOSONG} /></div>
            <div>
              <h3 className="mb-2 text-[14px] font-semibold text-tinta">Rincian per modul</h3>
              <div className="overflow-x-auto rounded-md border border-garis">
                <table className="w-full min-w-[620px] border-collapse text-left text-[12px]">
                  <caption className="sr-only">Jumlah hasil skenario menurut modul</caption>
                  <thead className="bg-kanvas text-tinta-2"><tr><th scope="col" className="px-3 py-2.5 font-semibold">Modul</th>{JUMLAH.map(([key, label]) => <th key={key} scope="col" className="px-3 py-2.5 text-right font-semibold">{label}</th>)}</tr></thead>
                  <tbody className="divide-y divide-garis">{pratinjau.sumber.modul.map((modul) => <tr key={modul.id ?? modul.kode}><th scope="row" className="max-w-[260px] px-3 py-2.5 font-medium text-tinta"><span className="block truncate">{modul.kode} · {modul.nama}</span></th>{JUMLAH.map(([key]) => <td key={key} className="px-3 py-2.5 text-right tabular text-tinta-2">{modul.hitungan[key]}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-[14px] font-semibold text-tinta">Peringatan &amp; data yang perlu diperiksa</h3>
              {(() => {
                const aktualKosong = hitungAktualKosong(pratinjau.sumber);
                const peringatan = [...pratinjau.sumber.peringatan, ...(aktualKosong.length ? [`${aktualKosong.length} skenario belum memiliki hasil aktual.`] : [])];
                return peringatan.length ? <div className="space-y-2"><ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-tertunda">{peringatan.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                  {aktualKosong.length > 0 && <details className="rounded-md border border-tertunda/25 bg-tertunda-lembut/40 px-3 py-2 text-[12px] text-tinta-2"><summary className="cursor-pointer font-semibold">Tampilkan skenario tanpa hasil aktual ({aktualKosong.length})</summary><ul className="mt-2 list-disc space-y-1 pl-5">{aktualKosong.map((item) => <li key={item}>{item}</li>)}</ul></details>}</div>
                  : <p className="text-[13px] text-lulus">Tidak ada peringatan yang dilaporkan.</p>;
              })()}
            </div>
            <div className="rounded-md border border-aksi/20 bg-aksi-lembut/60 px-3.5 py-3">
              <h3 className="text-[13px] font-semibold text-tinta">Kesimpulan</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-tinta-2">{pratinjau.sumber.kesimpulan}</p>
              <p className="mt-2 border-t border-aksi/15 pt-2 text-[12px] leading-relaxed text-tinta-2">Tahap selesai menandakan UAT telah ditutup, bukan bahwa semua skenario lulus. Kesimpulan dan rekomendasi harus dibaca bersama jumlah lulus, gagal, tertunda, belum diuji, serta peringatan di atas.</p>
            </div>
            <p className="text-[12px] text-tinta-3">Versi berikutnya: <span className="font-semibold tabular text-tinta-2">{pratinjau.versiBerikutnya}</span></p>
          </>}
        </div>
        {bolehGenerate && pratinjau && <div className="shrink-0 space-y-3 border-t border-garis bg-kanvas/50 px-4 py-4 sm:px-6">
          {galatGenerate && <Feedback kind="error">{galatGenerate}</Feedback>}
          <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-tinta-2">
            <input type="checkbox" checked={diakui} onChange={(event) => setDiakui(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#1570ef] focus-visible:ring-4 focus-visible:ring-aksi-lembut" />
            <span>Saya telah meninjau isi dan peringatan. Saya memahami laporan ini adalah snapshot UAT, dan status UAT selesai tidak berarti semua skenario lulus.</span>
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={tutupPratinjau} disabled={membuat}>Batal</Button>
            <Button variant="primary" onClick={() => void buatLaporan()} disabled={!diakui} busy={membuat}>Buat laporan final</Button>
          </div>
        </div>}
      </div>
    </div>}
  </section>;
}
