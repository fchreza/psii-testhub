"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Feedback, Field, Input } from "@/components/ui";
import { useFocusTrap } from "@/components/use-focus-trap";

type InfoAkun = { id: string; namaAkun: string; username: string };
type DrafAkun = { id: string | null; namaAkun: string; username: string; password: string };
type PasswordTerlihat = { id: string; nilai: string };

function urutkanAkun(accounts: InfoAkun[]) {
  return [...accounts].sort((a, b) => a.namaAkun.localeCompare(b.namaAkun, "id") || a.id.localeCompare(b.id));
}

export function AkunUjiProyek({
  projectId, bolehKelola,
}: { projectId: string; bolehKelola: boolean }) {
  const [akun, setAkun] = useState<InfoAkun[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [draf, setDraf] = useState<DrafAkun | null>(null);
  const [passwordTerlihat, setPasswordTerlihat] = useState<PasswordTerlihat | null>(null);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<InfoAkun | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [berhasil, setBerhasil] = useState<string | null>(null);
  const url = `/api/v1/proyek/${encodeURIComponent(projectId)}/akun-uji`;
  const dialogHapusRef = useFocusTrap<HTMLElement>(konfirmasiHapus !== null, () => setKonfirmasiHapus(null));

  const adaPerubahan = useMemo(() => {
    if (!draf || !draf.namaAkun.trim() || !draf.username.trim()) return false;
    if (!draf.id) return draf.password.length > 0;
    const lama = akun.find((item) => item.id === draf.id);
    if (!lama) return false;
    return draf.namaAkun.trim() !== lama.namaAkun
      || draf.username.trim() !== lama.username
      || draf.password.length > 0;
  }, [akun, draf]);

  const muatAkun = useCallback(async (signal?: AbortSignal) => {
    setMemuat(true);
    setGalat(null);
    try {
      const response = await fetch(url, { cache: "no-store", signal });
      const hasil = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(hasil.pesan ?? "Daftar akun uji tidak dapat dimuat.");
      const data: unknown = hasil.accounts;
      const accounts = Array.isArray(data) ? data.filter((item): item is InfoAkun =>
        item !== null && typeof item === "object"
        && typeof item.id === "string"
        && typeof item.namaAkun === "string"
        && typeof item.username === "string",
      ) : [];
      setAkun(urutkanAkun(accounts));
    } catch (error) {
      if (signal?.aborted) return;
      setGalat(error instanceof Error ? error.message : "Daftar akun uji tidak dapat dimuat.");
    } finally {
      if (!signal?.aborted) setMemuat(false);
    }
  }, [url]);

  useEffect(() => {
    const controller = new AbortController();
    void muatAkun(controller.signal);
    return () => controller.abort();
  }, [muatAkun]);

  function bukaTambah() {
    setGalat(null);
    setBerhasil(null);
    setPasswordTerlihat(null);
    setDraf({ id: null, namaAkun: "", username: "", password: "" });
  }

  function bukaUbah(item: InfoAkun) {
    setGalat(null);
    setBerhasil(null);
    setPasswordTerlihat(null);
    setDraf({ id: item.id, namaAkun: item.namaAkun, username: item.username, password: "" });
  }

  function tutupForm() {
    setDraf(null);
    setGalat(null);
  }

  async function tampilkanPassword(accountId: string) {
    setSibuk(true);
    setGalat(null);
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "lihat", accountId }), cache: "no-store",
      });
      const hasil = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(hasil.pesan ?? "Password akun uji tidak dapat dibuka.");
      if (typeof hasil.password !== "string") throw new Error("Respons password tidak sah.");
      setPasswordTerlihat({ id: accountId, nilai: hasil.password });
    } catch (error) {
      setGalat(error instanceof Error ? error.message : "Password akun uji tidak dapat dibuka.");
    } finally { setSibuk(false); }
  }

  async function simpan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sibuk || !draf || !adaPerubahan) return;
    setSibuk(true); setGalat(null); setBerhasil(null);
    try {
      const payload = {
        aksi: "simpan",
        ...(draf.id ? { accountId: draf.id } : {}),
        namaAkun: draf.namaAkun,
        username: draf.username,
        password: draf.password,
      };
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const hasil = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(hasil.pesan ?? "Akun uji gagal disimpan.");
      const baru = hasil.account as InfoAkun | undefined;
      if (!baru || typeof baru.id !== "string" || typeof baru.namaAkun !== "string" || typeof baru.username !== "string") {
        throw new Error("Respons akun uji tidak sah.");
      }
      setAkun((sebelumnya) => urutkanAkun(draf.id
        ? sebelumnya.map((item) => item.id === baru.id ? baru : item)
        : [...sebelumnya, baru]));
      setPasswordTerlihat(null);
      setDraf(null);
      setBerhasil(draf.id ? "Akun uji berhasil diperbarui secara terenkripsi." : "Akun uji berhasil ditambahkan secara terenkripsi.");
    } catch (error) {
      setGalat(error instanceof Error ? error.message : "Akun uji gagal disimpan.");
    } finally { setSibuk(false); }
  }

  async function hapusAkun() {
    if (sibuk || !konfirmasiHapus) return;
    const target = konfirmasiHapus;
    setSibuk(true); setGalat(null); setBerhasil(null);
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "hapus", accountId: target.id }),
      });
      const hasil = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(hasil.pesan ?? "Akun uji gagal dihapus.");
      setAkun((sebelumnya) => sebelumnya.filter((item) => item.id !== target.id));
      setPasswordTerlihat((sebelumnya) => sebelumnya?.id === target.id ? null : sebelumnya);
      setDraf((sebelumnya) => sebelumnya?.id === target.id ? null : sebelumnya);
      setKonfirmasiHapus(null);
      setBerhasil(`Akun “${target.namaAkun}” telah dihapus.`);
    } catch (error) {
      setGalat(error instanceof Error ? error.message : "Akun uji gagal dihapus.");
      setKonfirmasiHapus(null);
    } finally { setSibuk(false); }
  }

  return (
    <section aria-labelledby={`judul-akun-uji-${projectId}`} className="border-t border-garis px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`judul-akun-uji-${projectId}`} className="text-[13.5px] font-semibold text-tinta">
            Akun pengujian <span className="ml-1 text-[11.5px] font-normal text-tinta-3">opsional</span>
          </h3>
          <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-tinta-3">
            Simpan beberapa username dan password untuk lingkungan SIT/UAT. Hanya Admin, Internal PSII, dan penguji yang ditugaskan yang dapat melihatnya; Pimpinan tidak memiliki akses.
          </p>
        </div>
        {bolehKelola && !memuat && (
          <Button type="button" variant="secondary" onClick={draf ? tutupForm : bukaTambah}
            disabled={sibuk} className="min-h-9 px-3 py-1.5 text-[12.5px]">
            {draf ? "Tutup form" : "Tambah akun uji"}
          </Button>
        )}
      </div>

      {memuat ? (
        <p role="status" className="mt-3 text-[13px] text-tinta-3">Memuat akun uji…</p>
      ) : akun.length > 0 ? (
        <div className="mt-3 space-y-3" aria-label={`${akun.length} akun uji`}>
          {akun.map((item) => {
            const passwordAktif = passwordTerlihat?.id === item.id ? passwordTerlihat.nilai : null;
            return (
              <article key={item.id} aria-labelledby={`akun-uji-${item.id}`}
                className="rounded-lg border border-garis bg-kanvas/40 p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h4 id={`akun-uji-${item.id}`} className="min-w-0 break-words text-[13.5px] font-semibold text-tinta">
                    {item.namaAkun}
                  </h4>
                  {bolehKelola && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" onClick={() => bukaUbah(item)} disabled={sibuk}
                        aria-label={`Ubah akun ${item.namaAkun}`} className="min-h-8 px-2 py-1 text-[12px]">Ubah</Button>
                      <Button type="button" variant="danger-quiet" onClick={() => { setGalat(null); setKonfirmasiHapus(item); }} disabled={sibuk}
                        aria-label={`Hapus akun ${item.namaAkun}`} className="min-h-8 px-2 py-1 text-[12px]">Hapus</Button>
                    </div>
                  )}
                </div>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="min-w-0 rounded-md border border-garis bg-kartu px-3 py-2">
                    <dt className="text-[11.5px] font-medium text-tinta-3">Username</dt>
                    <dd className="mt-1 break-all text-[13.5px] font-medium text-tinta">{item.username}</dd>
                  </div>
                  <div className="min-w-0 rounded-md border border-garis bg-kartu px-3 py-2">
                    <dt className="text-[11.5px] font-medium text-tinta-3">Password</dt>
                    <dd className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      <code className="max-w-full break-all text-[13.5px] font-medium text-tinta">
                        {passwordAktif ?? "••••••••"}
                      </code>
                      <Button type="button" variant="ghost" disabled={sibuk}
                        aria-pressed={passwordAktif !== null}
                        onClick={() => passwordAktif === null ? void tampilkanPassword(item.id) : setPasswordTerlihat(null)}
                        className="min-h-8 px-2 py-1 text-[12px]">
                        {sibuk ? "Memuat…" : passwordAktif === null ? "Tampilkan password" : "Sembunyikan"}
                      </Button>
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-garis px-3 py-3 text-[13px] text-tinta-3">
          Belum ada akun uji untuk proyek ini.
        </p>
      )}

      {galat && <Feedback kind="error" className="mt-3">{galat}</Feedback>}
      {berhasil && <div role="status" aria-live="polite"><Feedback kind="success" className="mt-3">{berhasil}</Feedback></div>}

      {draf && bolehKelola && (
        <form onSubmit={simpan} className="mt-4 space-y-3 rounded-lg border border-garis bg-kanvas/40 p-3 sm:p-4" aria-busy={sibuk}>
          <h4 className="text-[13.5px] font-semibold text-tinta">{draf.id ? "Ubah akun uji" : "Tambah akun uji"}</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id={`akun-uji-nama-${projectId}`} label="Nama/keterangan akun" required>
              <Input id={`akun-uji-nama-${projectId}`} autoComplete="off" required maxLength={100}
                value={draf.namaAkun} onChange={(e) => setDraf({ ...draf, namaAkun: e.target.value })} disabled={sibuk} />
            </Field>
            <Field id={`akun-uji-username-${projectId}`} label="Username" required>
              <Input id={`akun-uji-username-${projectId}`} autoComplete="off" required maxLength={160}
                value={draf.username} onChange={(e) => setDraf({ ...draf, username: e.target.value })} disabled={sibuk} />
            </Field>
            <Field id={`akun-uji-password-${projectId}`} label={draf.id ? "Password baru" : "Password"} optional={Boolean(draf.id)} required={!draf.id}>
              <Input id={`akun-uji-password-${projectId}`} type="password" autoComplete="new-password"
                required={!draf.id} maxLength={256} value={draf.password}
                placeholder={draf.id ? "Kosongkan untuk mempertahankan password" : "Masukkan password akun uji"}
                onChange={(e) => setDraf({ ...draf, password: e.target.value })} disabled={sibuk} />
            </Field>
          </div>
          <p className="text-[12px] leading-relaxed text-tinta-3">
            Password dienkripsi sebelum disimpan. Saat mengubah akun, kosongkan password jika tidak ingin menggantinya.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" onClick={tutupForm} disabled={sibuk}
              className="min-h-9 px-3 py-1.5 text-[12.5px]">Batal</Button>
            <Button type="submit" variant="primary" disabled={!adaPerubahan || sibuk} busy={sibuk}
              className="min-h-9 px-3 py-1.5 text-[12.5px]">Simpan akun uji</Button>
          </div>
        </form>
      )}

      {konfirmasiHapus && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
          <button type="button" aria-label="Tutup konfirmasi hapus akun uji" disabled={sibuk}
            onClick={() => setKonfirmasiHapus(null)} className="absolute inset-0 bg-tinta/45 disabled:cursor-wait" />
          <section ref={dialogHapusRef} tabIndex={-1} role="alertdialog" aria-modal="true"
            aria-labelledby={`judul-hapus-akun-uji-${projectId}`}
            className="relative z-10 w-full max-w-md rounded-xl border border-garis bg-kartu p-5 shadow-2xl">
            <h4 id={`judul-hapus-akun-uji-${projectId}`} className="text-[16px] font-semibold text-tinta">Hapus akun uji?</h4>
            <p className="mt-2 text-[13px] leading-relaxed text-tinta-2">
              Username dan password terenkripsi untuk akun “{konfirmasiHapus.namaAkun}” akan dihapus. Jejak audit hanya mencatat ID akun, bukan nilainya.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" onClick={() => setKonfirmasiHapus(null)} disabled={sibuk}>Batal</Button>
              <Button type="button" variant="danger" onClick={() => void hapusAkun()} busy={sibuk}>Hapus akun uji</Button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
