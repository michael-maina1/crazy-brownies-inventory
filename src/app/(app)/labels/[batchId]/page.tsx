import { getBatchForLabel } from "@/db/queries/production";
import { notFound } from "next/navigation";
import { PrintTrigger } from "@/components/app/print-trigger";

/**
 * Print-preview page. N copies of a 50×30mm thermal label, each with a
 * server-rendered QR resolving to /b/<id>. Auto-fires window.print() on load.
 * For MVP this works with any printer the OS exposes via the system print
 * service; Web Bluetooth ESC/POS direct-printing is paid Phase-2-full.
 */
export default async function LabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ qty?: string }>;
}) {
  const { batchId } = await params;
  const { qty } = await searchParams;

  const batch = await getBatchForLabel(batchId);
  if (!batch) notFound();

  const count = Math.max(1, Math.min(parseInt(qty ?? `${batch.quantityBaked}`, 10) || 1, 200));
  const svgUrl = `/api/labels/${batchId}`;

  const fmtDate = (d: Date) =>
    d.toLocaleString("en-AE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="bg-muted/40 min-h-svh">
      <PrintTrigger />
      <div className="no-print p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold tracking-tight">Print labels</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {count} × <span className="font-medium text-foreground">{batch.productName}</span> · batch{" "}
          <code className="text-xs">{batch.batchCode}</code>. The print dialog should open
          automatically — if not,{" "}
          <button
            type="button"
            onClick={() => window.print()}
            className="underline underline-offset-2"
          >
            click here
          </button>
          .
        </p>
      </div>

      <div className="labels-grid">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="label">
            {/* The QR fills the left column. Server-rendered for crispness. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="qr" src={svgUrl} alt="QR" />
            <div className="meta">
              <div className="product">{batch.productName}</div>
              <div className="dates">
                <div>
                  <span className="label-key">Baked</span> {fmtDate(batch.bakedAt)}
                </div>
                <div>
                  <span className="label-key">Best by</span> {fmtDate(batch.expiresAt)}
                </div>
              </div>
              <div className="code">{batch.batchCode}</div>
              <div className="ribbon" />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @page { size: 50mm 30mm; margin: 0; }
        @media print {
          html, body { margin: 0; padding: 0; background: white; }
          .no-print { display: none !important; }
          .labels-grid { display: block; }
          .label { page-break-after: always; margin: 0; box-shadow: none; }
        }
        .labels-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, 50mm);
          gap: 8mm;
          padding: 6mm;
          justify-content: center;
        }
        .label {
          width: 50mm; height: 30mm; background: white;
          display: grid; grid-template-columns: 20mm 1fr;
          align-items: center; gap: 1mm; padding: 1.5mm;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          color: #111;
          box-shadow: 0 1px 2px rgba(0,0,0,0.06);
        }
        .label .qr { width: 18mm; height: 18mm; image-rendering: crisp-edges; }
        .label .meta { display: flex; flex-direction: column; gap: 0.5mm; min-width: 0; }
        .label .product { font-weight: 700; font-size: 8pt; line-height: 1.05; }
        .label .dates { font-size: 6pt; line-height: 1.2; font-variant-numeric: tabular-nums; }
        .label .label-key { color: #555; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em; font-size: 5pt; margin-right: 0.5mm; }
        .label .code { font-size: 5.5pt; opacity: 0.75; font-family: ui-monospace, monospace; }
        .label .ribbon { height: 1.2mm; background: var(--brand, #b8336a); border-radius: 0.4mm; margin-top: 0.5mm; }
      `}</style>
    </div>
  );
}
