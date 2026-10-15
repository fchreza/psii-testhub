"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type MetadataProyek = {
  nama: string;
  aplikasi: string | null;
  modul: string | null;
  modulAplikasi: string | null;
  unitBisnis: string | null;
  ruangLingkup: string | null;
  sumberAcuan: string | null;
  dasarRegulasi: string | null;
  lingkungan: string;
  alamatServer: string | null;
  tahunAnggaran: number | null;
  tanggalMulai: string | Date | null;
  targetSelesai: string | Date | null;
  versiDokumen: string | null;
  disusunOleh: string | null;
  statusDokumen: string | null;
};

type Draft = Record<Exclude<keyof MetadataProyek, "tanggalMulai" | "targetSelesai" | "tahunAnggaran">, string> & {
  tanggalMulai: string;
  targetSelesai: string;
  tahunAnggaran: string;
};

function tanggalInput(value: string | Date | null): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function buatDraft(nilai: MetadataProyek): Draft {
  return {
    ...nilai,
    aplikasi: nilai.aplikasi ?? "",
    modul: nilai.modul ?? "",
    modulAplikasi: nilai.modulAplikasi ?? "",
    unitBisnis: nilai.unitBisnis ?? "",
    ruangLingkup: nilai.ruangLingkup ?? "",
    sumberAcuan: nilai.sumberAcuan ?? "",
    dasarRegulasi: nilai.dasarRegulasi ?? "",
    alamatServer: nilai.alamatServer ?? "",
    versiDokumen: nilai.versiDokumen ?? "",
    disusunOleh: nilai.disusunOleh ?? "",
    statusDokumen: nilai.statusDokumen ?? "",
    tahunAnggaran: nilai.tahunAnggaran == null ? "" : String(nilai.tahunAnggaran),
    tanggalMulai: tanggalInput(nilai.tanggalMulai),
    targetSelesai: tanggalInput(nilai.targetSelesai),
  };
}

export function EditorMetadataProyek({ projectId, nilai }: { projectId: string; nilai: MetadataProyek }) {
  const [buka, setBuka] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => buatDraft(nilai));
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const router = useRouter();

  const set = (k: keyof Draft, v: string) => setDraft((x) => ({ ...x, [k]: v }));
  const tutup = () => {
    if (sibuk) return;
    setDraft(buatDraft(nilai)); setGalat(null); setBuka(false);
  };

  async function simpan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSibuk(true); setGalat(null);
    try {
      const body = {
        ...draft,
        tahunAnggaran: draft.tahunAnggaran.trim() ? Number(draft.tahunAnggaran) : null,
        tanggalMulai: draft.tanggalMulai || null,
        targetSelesai: draft.targetSelesai || null,
        aksi: "ubah_metadata", projectId,
      };
      const r = await fetch("/api/v1/proyek", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const hasil = await r.json().catch(() => ({}));
      if (!r.ok) { setGalat(hasil.pesan ?? "Gagal menyimpan metadata proyek."); return; }
      setBuka(false); router.refresh();
    } catch {
      setGalat("Tidak dapat terhubung. Periksa koneksi lalu coba lagi.");
    } finally { setSibuk(false); }
  }

  return (
    <>
      <button type="button" onClick={() => { setDraft(buatDraft(nilai)); setGalat(null); setBuka(true); }}
        className="rounded-lg border border-garis-kuat bg-kartu px-3 py-2 text-[13px] font-semibold text-tinta-2 hover:border-aksi hover:text-aksi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aksi">
        Ubah metadata
      </button>
      {buka && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Tutup editor metadata" onClick={tutup} className="absolute inset-0 bg-tinta/35" />
          <aside role="dialog" aria-modal="true" aria-labelledby="judul-editor-metadata"
            className="relative z-10 h-full w-full max-w-[720px] overflow-y-auto border-l border-garis bg-kartu shadow-xl">
            <form onSubmit={simpan} className="flex min-h-full flex-col">
              <header className="sticky top-0 z-10 border-b border-garis bg-kartu px-6 py-5 sm:px-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 id="judul-editor-metadata" className="text-[20px] font-bold tracking-tight text-tinta">Ubah metadata proyek</h2>
                    <p className="mt-1 text-[13px] text-tinta-2">Perubahan disimpan sebagai riwayat audit proyek.</p>
                  </div>
                  <button type="button" onClick={tutup} disabled={sibuk} aria-label="Tutup"
                    className="rounded-md px-2 py-1 text-lg leading-none text-tinta-3 hover:bg-kanvas disabled:opacity-50">×</button>
                </div>
              </header>
              <div className="flex-1 space-y-4 px-6 py-5 sm:px-8">
                <Isian label="Nama proyek" nilai={draft.nama} ubah={(v) => set("nama", v)} wajib />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Isian label="Aplikasi" nilai={draft.aplikasi} ubah={(v) => set("aplikasi", v)} />
                  <Isian label="Modul" nilai={draft.modul} ubah={(v) => set("modul", v)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Isian label="Unit bisnis / divisi" nilai={draft.unitBisnis} ubah={(v) => set("unitBisnis", v)} />
                </div>
                <Isian label="Ruang lingkup" nilai={draft.ruangLingkup} ubah={(v) => set("ruangLingkup", v)} banyak />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Isian label="Sumber acuan" nilai={draft.sumberAcuan} ubah={(v) => set("sumberAcuan", v)} />
                  <Isian label="Dasar regulasi" nilai={draft.dasarRegulasi} ubah={(v) => set("dasarRegulasi", v)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="metadata-lingkungan" className="mb-1 block text-[13px] font-medium text-tinta-2">Lingkungan uji</label>
                    <select id="metadata-lingkungan" value={draft.lingkungan} onChange={(e) => set("lingkungan", e.target.value)}
                      className="w-full rounded-md border border-garis-kuat bg-white px-3 py-2.5 text-[14px] outline-none focus:border-aksi focus-visible:ring-2 focus-visible:ring-aksi">
                      {["DEV", "SIT", "UAT", "PROD"].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <Isian label="Alamat pengujian" nilai={draft.alamatServer} ubah={(v) => set("alamatServer", v)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Isian label="Tahun anggaran" tipe="number" nilai={draft.tahunAnggaran} ubah={(v) => set("tahunAnggaran", v)} />
                  <Isian label="Tanggal mulai" tipe="date" nilai={draft.tanggalMulai} ubah={(v) => set("tanggalMulai", v)} />
                  <Isian label="Target selesai" tipe="date" nilai={draft.targetSelesai} ubah={(v) => set("targetSelesai", v)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Isian label="Versi dokumen" nilai={draft.versiDokumen} ubah={(v) => set("versiDokumen", v)} />
                  <Isian label="Disusun oleh" nilai={draft.disusunOleh} ubah={(v) => set("disusunOleh", v)} />
                  <Isian label="Status dokumen" nilai={draft.statusDokumen} ubah={(v) => set("statusDokumen", v)} />
                </div>
                {galat && <p role="alert" className="rounded-md border border-gagal bg-gagal-lembut px-3 py-2 text-[13px] text-gagal">{galat}</p>}
              </div>
              <footer className="sticky bottom-0 flex justify-end gap-3 border-t border-garis bg-kartu px-6 py-4 sm:px-8">
                <button type="button" disabled={sibuk} onClick={tutup}
                  className="rounded-md border border-garis-kuat px-4 py-2.5 text-[13.5px] font-medium text-tinta-2 hover:bg-kanvas disabled:opacity-50">Batal</button>
                <button type="submit" disabled={sibuk}
                  className="rounded-md bg-aksi px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-aksi/90 disabled:opacity-60">
                  {sibuk ? "Menyimpan…" : "Simpan perubahan"}
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}

function Isian({ label, nilai, ubah, tipe = "text", wajib = false, banyak = false }: {
  label: string; nilai: string; ubah: (v: string) => void; tipe?: string; wajib?: boolean; banyak?: boolean;
}) {
  const id = `meta-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-tinta-2">{label}{wajib && <span className="text-gagal"> *</span>}</label>
      {banyak ? <textarea id={id} rows={3} value={nilai} onChange={(e) => ubah(e.target.value)}
        className="w-full resize-y rounded-md border border-garis-kuat px-3 py-2.5 text-[14px] outline-none focus:border-aksi focus-visible:ring-2 focus-visible:ring-aksi" /> :
        <input id={id} type={tipe} required={wajib} value={nilai} onChange={(e) => ubah(e.target.value)}
          className="w-full rounded-md border border-garis-kuat px-3 py-2.5 text-[14px] outline-none focus:border-aksi focus-visible:ring-2 focus-visible:ring-aksi" />}
    </div>
  );
}
