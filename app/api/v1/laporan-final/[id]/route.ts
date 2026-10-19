import { klienMentah } from "@/db";
import { wajibMasukApi } from "@/lib/gerbang";
import { handlerPdfLaporan } from "@/lib/laporan-final-pdf-api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = handlerPdfLaporan({ db: klienMentah, auth: wajibMasukApi });
