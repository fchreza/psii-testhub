import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Kunci ke direktori proyek ini.
   *
   * KENAPA: `npx vercel link` menulis `.vercel/` di akar yang dikenalnya. Kalau
   * suatu saat proyek ini berada di dalam folder induk yang juga punya
   * konfigurasi Vercel, akar yang terdeteksi bisa salah dan build memakai
   * berkas dari proyek lain — kegagalan yang membingungkan karena buildnya
   * "berhasil" tapi isinya bukan proyek ini.
   */
  outputFileTracingRoot: __dirname,
};
export default nextConfig;
