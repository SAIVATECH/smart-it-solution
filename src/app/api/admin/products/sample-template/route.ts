import { NextResponse } from "next/server";
import * as xlsx from "xlsx";

export async function GET() {
  try {
    const sampleData = [
      {
        CATEGORY: "HD Camera",
        BRAND: "CP Plus",
        "MODEL NO": "CP-URC-DC24PL3C",
        DESCRIPTION: "2 MP Basic Dome Camera with Built-in Audio",
        PDC: 855.45,
        CDC: 800.0,
        STOCK: 100,
      },
      {
        CATEGORY: "HD Camera",
        BRAND: "CP Plus",
        "MODEL NO": "CP-URC-TC24PL3C",
        DESCRIPTION: "2 MP Basic Bullet Camera with Built-in Audio",
        PDC: 921.25,
        CDC: 860.0,
        STOCK: 100,
      },
      {
        CATEGORY: "HD Camera",
        BRAND: "Dahua",
        "MODEL NO": "DH-HAC-HDW1200TLQ",
        DESCRIPTION: "2 MP HDCVI IR Eyeball Camera",
        PDC: 950.0,
        CDC: 900.0,
        STOCK: 50,
      },
      {
        CATEGORY: "HD Camera",
        BRAND: "Hikvision",
        "MODEL NO": "DS-2CE56D0T-ITPFS",
        DESCRIPTION: "2 MP Audio Fixed Turret Camera",
        PDC: 980.0,
        CDC: 920.0,
        STOCK: 50,
      },
      {
        CATEGORY: "DVR",
        BRAND: "CP Plus",
        "MODEL NO": "CP-UVR-0401E1-CS",
        DESCRIPTION: "4 CH 1080P Mini 1U H.265+ DVR",
        PDC: 3562.19,
        CDC: 3300.0,
        STOCK: 25,
      },
      {
        CATEGORY: "DVR",
        BRAND: "Dahua",
        "MODEL NO": "DH-XVR1B04H-I",
        DESCRIPTION: "4 Channel Penta-brid 5M-N WizSense DVR",
        PDC: 3750.0,
        CDC: 3500.0,
        STOCK: 20,
      },
      {
        CATEGORY: "DVR",
        BRAND: "Hikvision",
        "MODEL NO": "iDS-7204HQHI-M1/S",
        DESCRIPTION: "4 CH AcuSense 1080P 1U DVR",
        PDC: 4200.0,
        CDC: 3950.0,
        STOCK: 15,
      },
      {
        CATEGORY: "Memory & Storage",
        BRAND: "SanDisk",
        "MODEL NO": "SDCZ50-064G-B35",
        DESCRIPTION: "Cruzer Blade 64GB USB 2.0 Flash Drive",
        PDC: 380.0,
        CDC: 350.0,
        STOCK: 200,
      },
      {
        CATEGORY: "Network Switch",
        BRAND: "TP-Link",
        "MODEL NO": "TL-SF1008D",
        DESCRIPTION: "8-Port 10/100Mbps Desktop Switch",
        PDC: 720.0,
        CDC: 680.0,
        STOCK: 40,
      },
    ];

    const worksheet = xlsx.utils.json_to_sheet(sampleData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Products Master");

    const excelBuffer = xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Smart_IT_Solutions_Product_Import_Template.xlsx"',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
