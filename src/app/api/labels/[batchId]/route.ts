import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getBatchForLabel } from "@/db/queries/production";

/**
 * Server-renders an SVG QR code that points at the public /b/<id> page.
 * No auth — the SVG itself is meaningless without the rest of the printed
 * label, and the URL it encodes is already the public page. Returns 404 if
 * the batch doesn't exist (defense against UUID enumeration).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;

  const batch = await getBatchForLabel(batchId);
  if (!batch) return new NextResponse("Not found", { status: 404 });

  const proto = process.env.VERCEL_URL ? "https" : "http";
  const host =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `${proto}://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const url = `${host}/b/${batchId}`;

  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
  });

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
