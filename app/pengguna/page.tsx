import { redirect } from "next/navigation";
import { wajibAdminAtauPimpinan } from "@/lib/gerbang";

export const dynamic = "force-dynamic";

export default async function HalamanPenggunaLama() {
  await wajibAdminAtauPimpinan();
  redirect("/dashboard/admin/pengguna");
}
