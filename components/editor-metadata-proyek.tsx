"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFocusTrap } from "@/components/use-focus-trap";
import { Button, Feedback, Field, Input, Select, Textarea } from "@/components/ui";
import { labelJenisPengujian } from "@/lib/fase-proyek";

type MetadataProyek = {
  nama: string;
  aplikasi: string | null;
  modul: string | null;
  jenisPengujian: string;
  ruangLingkup: string | null;
  dasarRegulasi: string | null;
  alamatPengujian: string | null;
  tahunAnggaran: number | null;
  tanggalMulai: string | Date | null;
  targetSelesai: string | Date | null;
  pmId: string | null;
};

type PIC = { id: string; nama: string };
type Draft = {
  nama: string;
  aplikasi: string;
  modul: string;
  jenisPengujian: string;
  ruangLingkup: string;
  dasarRegulasi: string;
  alamatPengujian: string;
  pmId: string;
  tahunAnggaran: string;
  tanggalMulai: string;
  targetSelesai: string;
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
    ruangLingkup: nilai.ruangLingkup ?? "",
    dasarRegulasi: nilai.dasarRegulasi ?? "",
    alamatPengujian: nilai.alamatPengujian ?? "",
    pmId: nilai.pmId ?? "",
    tahunAnggaran: nilai.tahunAnggaran == null ? "" : String(nilai.tahunAnggaran),
    tanggalMulai: tanggalInput(nilai.tanggalMulai),
    targetSelesai: tanggalInput(nilai.targetSelesai),
  };
}

export function EditorMetadataProyek({
  projectId, nilai, pic,
}: { projectId: string; nilai: MetadataProyek; pic: PIC[] }) {
  const [buka, setBuka] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => buatDraft(nilai));
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [berhasil, setBerhasil] = useState<string | null>(null);
  const [konfirmasiBuang, setKonfirmasiBuang] = useState(false);
  const asal = useRef<Draft>(buatDraft(nilai));
  const router = useRouter();
  const kotor = JSON.stringify(draft) !== JSON.stringify(asal.current);

  const set = (k: keyof Draft, v: string) => setDraft((x) => ({ ...x, [k]: v }));
  const tutupSekarang = () => {
    setDraft(buatDraft(nilai));
    asal.current = buatDraft(nilai);
    setGalat(null);
    setKonfirmasiBuang(false);
    setBuka(false);
  };
  const tutup = () => {
    if (sibuk) return;
    if (kotor) { setKonfirmasiBuang(true); return; }
    tutupSekarang();
  };
  const dialogRef = useFocusTrap<HTMLElement>(buka && !konfirmasiBuang, tutup);
  const konfirmasiRef = useFocusTrap<HTMLElement>(konfirmasiBuang, () => setKonfirmasiBuang(false));

  function bukaEditor() {
    const awal = buatDraft(nilai);
    asal.current = awal;
    setDraft(awal);
    setGalat(null);
    setBerhasil(null);
    setKonfirmasiBuang(false);
    setBuka(true);
  }

  async function simpan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!kotor || sibuk) return;
    setSibuk(true);
    setGalat(null);
    try {
      const body = {
        aksi: "ubah_metadata",
        projectId,
        nama: draft.nama,
        aplikasi: draft.aplikasi,
        modul: draft.modul,
        pmId: draft.pmId || null,
        ruangLingkup: draft.ruangLingkup,
        dasarRegulasi: draft.dasarRegulasi,
        alamatServer: draft.alamatPengujian,
        tahunAnggaran: draft.tahunAnggaran.trim() ? Number(draft.tahunAnggaran) : null,
        tanggalMulai: draft.tanggalMulai || null,
        targetSelesai: draft.targetSelesai || null,
      };
      const response = await fetch("/api/v1/proyek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const hasil = await response.json().catch(() => ({}));
      if (!response.ok) {
        setGalat(hasil.pesan ?? "Gagal menyimpan metadata proyek.");
        return;
      }
      setBuka(false);
      setBerhasil("Informasi proyek berhasil diperbarui.");
      router.refresh();
    } catch {
      setGalat("Tidak dapat terhubung. Periksa koneksi lalu coba lagi.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={bukaEditor}>Ubah informasi</Button>
      {berhasil && <Feedback kind="success" className="mt-2">{berhasil}</Feedback>}

      {buka && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Tutup editor informasi proyek" onClick={tutup} disabled={sibuk}
            className="absolute inset-0 bg-tinta/40 backdrop-blur-[2px] disabled:cursor-wait" />
          <aside ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="judul-editor-metadata"
            className="relative z-10 flex h-full w-full max-w-[680px] flex-col border-l border-garis bg-kartu shadow-2xl">
            <form onSubmit={simpan} className="flex min-h-0 flex-1 flex-col" aria-busy={sibuk}>
              <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-garis bg-kartu/95 px-5 py-4 backdrop-blur sm:px-7">
                <div>
                  <h2 id="judul-editor-metadata" className="text-[19px] font-bold tracking-tight text-tinta">Ubah informasi proyek</h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-tinta-3">Sunting informasi yang digunakan pada form proyek.</p>
                </div>
                <Button variant="ghost" onClick={tutup} disabled={sibuk} aria-label="Tutup" className="h-9 min-h-9 w-9 px-0 text-xl">×</Button>
              </header>

              <div className="relative flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
                <section aria-label="Informasi utama" className="space-y-4">
                  <Field id="metadata-nama" label="Nama proyek" required>
                    <Input id="metadata-nama" required autoFocus maxLength={200} value={draft.nama}
                      onChange={(e) => set("nama", e.target.value)} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="metadata-pic" label="PIC" optional>
                      <Select id="metadata-pic" value={draft.pmId} onChange={(e) => set("pmId", e.target.value)}>
                        <option value="">— Belum ditentukan —</option>
                        {pic.map((orang) => <option key={orang.id} value={orang.id}>{orang.nama}</option>)}
                      </Select>
                    </Field>
                    <div className="min-w-0">
                      <p className="mb-1.5 text-[13px] font-medium text-tinta-2">Jenis pengujian</p>
                      <p className="flex h-10 items-center rounded-lg border border-garis bg-kanvas px-3 text-[14px] font-medium text-tinta-2">
                        {labelJenisPengujian(draft.jenisPengujian)}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="metadata-aplikasi" label="Aplikasi">
                      <Input id="metadata-aplikasi" maxLength={160} value={draft.aplikasi}
                        onChange={(e) => set("aplikasi", e.target.value)} />
                    </Field>
                    <Field id="metadata-modul" label="Modul">
                      <Input id="metadata-modul" maxLength={160} value={draft.modul}
                        onChange={(e) => set("modul", e.target.value)} />
                    </Field>
                  </div>
                  <Field id="metadata-ruang-lingkup" label="Ruang lingkup">
                    <Textarea id="metadata-ruang-lingkup" rows={3} maxLength={10000} value={draft.ruangLingkup}
                      onChange={(e) => set("ruangLingkup", e.target.value)} />
                  </Field>
                </section>

                <section aria-label="Regulasi dan alamat pengujian" className="space-y-4 border-t border-garis pt-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="metadata-dasar-regulasi" label="Dasar regulasi">
                      <Input id="metadata-dasar-regulasi" maxLength={200} value={draft.dasarRegulasi}
                        onChange={(e) => set("dasarRegulasi", e.target.value)} />
                    </Field>
                    <Field id="metadata-alamat-pengujian" label="Alamat pengujian">
                      <Input id="metadata-alamat-pengujian" maxLength={300} value={draft.alamatPengujian}
                        onChange={(e) => set("alamatPengujian", e.target.value)} />
                    </Field>
                  </div>
                </section>

                <section aria-label="Jadwal proyek" className="space-y-4 border-t border-garis pt-5">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field id="metadata-tahun-anggaran" label="Tahun anggaran">
                      <Input id="metadata-tahun-anggaran" type="number" min={1900} max={2200} step={1}
                        value={draft.tahunAnggaran} onChange={(e) => set("tahunAnggaran", e.target.value)} />
                    </Field>
                    <Field id="metadata-tanggal-mulai" label="Tanggal mulai">
                      <Input id="metadata-tanggal-mulai" type="date" value={draft.tanggalMulai}
                        onChange={(e) => set("tanggalMulai", e.target.value)} />
                    </Field>
                    <Field id="metadata-target-selesai" label="Target selesai">
                      <Input id="metadata-target-selesai" type="date" value={draft.targetSelesai}
                        onChange={(e) => set("targetSelesai", e.target.value)} />
                    </Field>
                  </div>
                </section>

                {galat && <Feedback kind="error">{galat}</Feedback>}
              </div>

              {konfirmasiBuang && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-tinta/30 p-4">
                  <section ref={konfirmasiRef} tabIndex={-1} role="alertdialog" aria-labelledby="judul-buang-draf"
                    className="w-full max-w-sm rounded-xl border border-garis bg-kartu p-5 shadow-2xl">
                    <h3 id="judul-buang-draf" className="text-[16px] font-semibold text-tinta">Buang perubahan?</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-tinta-2">Perubahan yang belum disimpan akan hilang.</p>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button autoFocus onClick={() => setKonfirmasiBuang(false)}>Lanjutkan mengedit</Button>
                      <Button variant="danger" onClick={tutupSekarang}>Buang perubahan</Button>
                    </div>
                  </section>
                </div>
              )}

              <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-garis bg-kartu/95 px-5 py-4 backdrop-blur sm:px-7">
                <p className="text-[12px] text-tinta-3">{kotor ? "Ada perubahan yang belum disimpan." : "Belum ada perubahan."}</p>
                <div className="flex justify-end gap-2">
                  <Button onClick={tutup} disabled={sibuk}>Batal</Button>
                  <Button type="submit" variant="primary" busy={sibuk} disabled={!kotor}>
                    {sibuk ? "Menyimpan…" : "Simpan perubahan"}
                  </Button>
                </div>
              </footer>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
