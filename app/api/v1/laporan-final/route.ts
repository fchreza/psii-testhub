import { klienMentah } from "@/db";
import { wajibMasukApi } from "@/lib/gerbang";
import { buatPdfLaporan } from "@/lib/laporan-final-pdf";
import { handlerLaporan } from "@/lib/laporan-final-api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const { GET, POST } = handlerLaporan({ db: klienMentah, auth: wajibMasukApi, pdf: buatPdfLaporan });
