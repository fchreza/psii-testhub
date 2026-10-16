export const TABEL_WAJIB = [
  "th_users", "th_projects", "th_project_members", "th_modules", "th_scenarios",
  "th_evidence", "th_audit_logs", "th_password_resets", "th_evidence_uploads",
  "th_login_rate_limits", "th_project_test_accounts",
];

export const KOLOM_WAJIB: Record<string, string[]> = {
  th_users: ["id", "email", "nama", "peran", "aktif", "sesi_versi"],
  th_projects: ["id", "nama", "aplikasi", "modul", "jenis_pengujian"],
  th_project_members: ["project_id", "user_id"],
  th_modules: ["id", "project_id", "kode", "nama", "urutan"],
  th_scenarios: ["id", "project_id", "module_id", "kode", "fase", "judul", "langkah_pengujian", "hasil_diharapkan", "hasil_aktual", "penguji_id", "status", "catatan_tindak_lanjut", "siap_retest", "urutan", "diubah_pada"],
  th_evidence: ["id", "scenario_id", "path", "nama_asli", "tipe", "ukuran", "diunggah_oleh", "status", "deleted_at"],
  th_audit_logs: ["id", "user_id", "project_id", "scenario_id", "aksi", "kolom", "nilai_lama", "nilai_baru", "pada"],
  th_password_resets: ["user_id", "email_hash", "ip_hash", "token_hash", "dibuat_pada", "kedaluwarsa_pada", "digunakan_pada"],
  th_evidence_uploads: ["id", "user_id", "project_id", "scenario_id", "idempotency_key", "staging_path", "final_path", "nama_asli", "tipe", "ukuran", "status", "evidence_id", "expires_at", "staging_cleaned_at"],
  th_login_rate_limits: ["email_hash", "attempts", "window_started_at", "blocked_until", "updated_at"],
  th_project_test_accounts: ["project_id", "format_version", "nonce", "ciphertext", "auth_tag", "diubah_oleh", "dibuat_pada", "diubah_pada"],
};

export const INDEKS_WAJIB = [
  "th_users_email_unik", "th_scenarios_kode_unik", "th_scenarios_project_idx",
  "th_scenarios_penguji_idx", "th_scenarios_module_idx", "th_evidence_scenario_idx",
  "th_evidence_status_idx", "th_audit_project_idx", "th_audit_scenario_idx",
  "th_modules_project_idx", "th_members_user_idx", "th_password_resets_email_idx",
  "th_password_resets_ip_idx", "th_password_resets_user_idx", "th_password_resets_token_hash_key",
  "th_evidence_uploads_status_expiry_idx", "th_login_rate_limits_updated_idx",
  "th_project_test_accounts_pkey", "th_project_test_accounts_diubah_idx",
];

export type SkemaAktual = {
  tabel: Iterable<string>;
  kolom: Iterable<{ table_name: string; column_name: string }>;
  indeks: Iterable<string>;
  peran?: Iterable<string>;
};

/** Return daftar lengkap ketidakcocokan; caller harus fail closed bila tidak kosong. */
export function temukanKekuranganSkema(aktual: SkemaAktual): string[] {
  const tabel = new Set(aktual.tabel);
  const indeks = new Set(aktual.indeks);
  const kolom = new Map<string, Set<string>>();
  for (const item of aktual.kolom) {
    if (!kolom.has(item.table_name)) kolom.set(item.table_name, new Set());
    kolom.get(item.table_name)!.add(item.column_name);
  }
  const hilang: string[] = [];
  for (const nama of TABEL_WAJIB) if (!tabel.has(nama)) hilang.push(`tabel ${nama}`);
  for (const [namaTabel, namaKolom] of Object.entries(KOLOM_WAJIB)) {
    for (const nama of namaKolom) if (!kolom.get(namaTabel)?.has(nama)) hilang.push(`kolom ${namaTabel}.${nama}`);
  }
  for (const nama of INDEKS_WAJIB) if (!indeks.has(nama)) hilang.push(`indeks ${nama}`);
  const roleLama = new Set(["PM", "QA", "DEVELOPER", "BUSINESS_USER", "EKSTERNAL"]);
  for (const peran of aktual.peran ?? []) if (roleLama.has(peran)) hilang.push(`role legacy ${peran}`);
  return hilang;
}
