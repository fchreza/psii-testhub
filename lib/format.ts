import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Label dan warna untuk status uji. Satu sumber, dipakai di seluruh aplikasi. */
export const STATUS_UJI = {
  PENDING: { label: "Belum diuji", kelas: "bg-kanvas text-tinta-2", titik: "bg-garis-kuat" },
  PASS:    { label: "Lulus",       kelas: "bg-lulus-lembut text-lulus", titik: "bg-lulus" },
  FAIL:    { label: "Gagal",       kelas: "bg-gagal-lembut text-gagal", titik: "bg-gagal" },
  BLOCKED: { label: "Tertunda",    kelas: "bg-tertunda-lembut text-tertunda", titik: "bg-tertunda" },
} as const;

export type StatusUji = keyof typeof STATUS_UJI;

export function labelStatus(s: string): string {
  return STATUS_UJI[s as StatusUji]?.label ?? s;
}
