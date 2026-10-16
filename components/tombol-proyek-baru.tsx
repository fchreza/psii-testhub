"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFocusTrap } from "@/components/use-focus-trap";
import { Button, Feedback, Field, Input, Select } from "@/components/ui";

/** Form proyek baru: hanya metadata yang dibutuhkan untuk memulai pengujian. */
export function TombolProyekBaru({ pic }: { pic: { id: string; nama: string }[] }) {
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const router = useRouter();
  const tutup = () => { if (!sibuk) setBuka(false); };
  const dialogRef = useFocusTrap<HTMLElement>(buka, tutup);

  const [f, setF] = useState({
    nama: "", pmId: "", aplikasi: "", modul: "", ruangLingkup: "", jenisPengujian: "",
    dasarRegulasi: "", alamatPengujian: "", tahunAnggaran: String(new Date().getFullYear()),
    tanggalMulai: "", targetSelesai: "",
  });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  if (!buka) {
    return <Button variant="primary" onClick={() => { setGalat(null); setBuka(true); }}>Proyek baru</Button>;
  }

  return (
    <>
      <button type="button" onClick={tutup} disabled={sibuk} aria-label="Tutup formulir proyek baru"
        className="fixed inset-0 z-30 bg-tinta/40 backdrop-blur-[2px] disabled:cursor-wait" />
      <aside ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="judul-proyek-baru"
        className="fixed right-0 top-0 z-40 flex h-screen w-full flex-col border-l border-garis bg-kartu shadow-2xl sm:max-w-[640px]">
        <form className="flex min-h-0 flex-1 flex-col" aria-busy={sibuk}
          onSubmit={async (e) => {
            e.preventDefault();
            setSibuk(true); setGalat(null);
            try {
              const r = await fetch("/api/v1/proyek", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  aksi: "tambah", ...f,
                  pmId: f.pmId || null,
                  tahunAnggaran: f.tahunAnggaran.trim() ? Number(f.tahunAnggaran) : null,
                  tanggalMulai: f.tanggalMulai || null,
                  targetSelesai: f.targetSelesai || null,
                }),
              });
              const hasil = await r.json().catch(() => ({ pesan: "Respons server tidak dapat dibaca." }));
              if (!r.ok) { setGalat(hasil.pesan ?? "Gagal menyimpan proyek."); return; }
              router.push(`/proyek/${hasil.id}`);
            } catch {
              setGalat("Tidak dapat terhubung. Proyek belum dibuat; coba lagi.");
            } finally { setSibuk(false); }
          }}>
          <header className="flex items-start justify-between gap-4 border-b border-garis px-5 py-4 sm:px-7">
            <div>
              <h2 id="judul-proyek-baru" className="text-[20px] font-bold tracking-tight text-tinta">Proyek baru</h2>
              <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-tinta-2">
                Pilih satu jenis pengujian. Proyek SIT hanya menampilkan SIT; proyek UAT hanya menampilkan UAT.
              </p>
            </div>
            <Button variant="ghost" onClick={tutup} disabled={sibuk} aria-label="Tutup" className="h-9 min-h-9 w-9 px-0 text-xl">×</Button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-7">
            <Field id="p-nama-proyek" label="Nama proyek" required>
              <Input id="p-nama-proyek" required maxLength={200} value={f.nama} placeholder="Penyesuaian OM-SPAN TKD sesuai PER-4/PB/2026"
                autoFocus onChange={(e) => set("nama", e.target.value)} />
            </Field>
            <Field id="p-pm-id" label="PIC" optional>
              <Select id="p-pm-id" value={f.pmId} onChange={(e) => set("pmId", e.target.value)}>
                <option value="">— Belum ditentukan —</option>
                {pic.map((orang) => <option key={orang.id} value={orang.id}>{orang.nama}</option>)}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Isian id="p-aplikasi" label="Aplikasi" nilai={f.aplikasi} ubah={(v) => set("aplikasi", v)}
                contoh="OM-SPAN TKD" maksimal={160} />
              <Isian id="p-modul" label="Modul" nilai={f.modul} ubah={(v) => set("modul", v)}
                contoh="Penyaluran TKD" maksimal={160} />
            </div>
            <Isian id="p-ruang-lingkup" label="Ruang lingkup" nilai={f.ruangLingkup} ubah={(v) => set("ruangLingkup", v)}
              contoh="Poin A s.d. F" maksimal={10000} />
            <Field id="p-jenis-pengujian" label="Jenis pengujian" required>
              <Select id="p-jenis-pengujian" required value={f.jenisPengujian} onChange={(e) => set("jenisPengujian", e.target.value)}>
                <option value="" disabled>Pilih SIT atau UAT</option>
                <option value="SIT">SIT</option>
                <option value="UAT">UAT</option>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Isian id="p-dasar-regulasi" label="Dasar regulasi" nilai={f.dasarRegulasi} ubah={(v) => set("dasarRegulasi", v)}
                contoh="PER-4/PB/2026" maksimal={200} />
              <Isian id="p-alamat-pengujian" label="Alamat pengujian" nilai={f.alamatPengujian} ubah={(v) => set("alamatPengujian", v)}
                contoh="https://tkd-dev.example.id" maksimal={300} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Isian id="p-tahun-anggaran" label="Tahun anggaran" tipe="number" nilai={f.tahunAnggaran} ubah={(v) => set("tahunAnggaran", v)}
                min={1900} max={2200} />
              <Isian id="p-tanggal-mulai" label="Tanggal mulai" tipe="date" nilai={f.tanggalMulai} ubah={(v) => set("tanggalMulai", v)} />
              <Isian id="p-target-selesai" label="Target selesai" tipe="date" nilai={f.targetSelesai} ubah={(v) => set("targetSelesai", v)} />
            </div>
            {galat && <Feedback kind="error">{galat}</Feedback>}
          </div>

          <footer className="flex justify-end gap-2 border-t border-garis bg-kartu/95 px-5 py-4 backdrop-blur-sm sm:px-7">
            <Button onClick={tutup} disabled={sibuk}>Batal</Button>
            <Button type="submit" variant="primary" busy={sibuk}>
              {sibuk ? "Menyimpan…" : "Simpan proyek"}
            </Button>
          </footer>
        </form>
      </aside>
    </>
  );
}

function Isian({
  id, label, nilai, ubah, contoh, tipe = "text", maksimal, min, max,
}: {
  id: string; label: string; nilai: string; ubah: (v: string) => void;
  contoh?: string; tipe?: string; maksimal?: number; min?: number; max?: number;
}) {
  return (
    <Field id={id} label={label}>
      <Input id={id} type={tipe} value={nilai} placeholder={contoh}
        maxLength={maksimal} min={min} max={max} step={tipe === "number" ? 1 : undefined}
        onChange={(e) => ubah(e.target.value)} />
    </Field>
  );
}
