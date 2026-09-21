import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { parseWorkbook } from "@/lib/workbook";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const local = url.searchParams.get("local") === "1";

    if (local) {
      const path = join(process.cwd(), "2011Movies.xlsx");
      const file = await readFile(path);
      return NextResponse.json(parseWorkbook(file, "2011Movies.xlsx"));
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload an .xlsx file." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    return NextResponse.json(parseWorkbook(buffer, file.name));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
