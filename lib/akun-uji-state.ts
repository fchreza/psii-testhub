export function perluMuatAkunUji(dibuka: boolean, sudahMuat: boolean, sedangMemuat: boolean): boolean {
  return dibuka && !sudahMuat && !sedangMemuat;
}
