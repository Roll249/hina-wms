import { NextResponse } from "next/server";

/**
 * Trả về template CSV mẫu cho nhập kho
 */
export async function GET() {
  const csv = `upc,name,stock,price
101400,"Deštníky Praha - Krabice 12ks",100,1198.80
0105,"Gumová kachnička Prague 0105",50,69.90
2719/CER,"Šperkovnice Sova B velká červená",30,350.00
2719/MOD,"Šperkovnice Sova B velká modrá",30,350.00
`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="hina-wms-receipt-template.csv"',
    },
  });
}
