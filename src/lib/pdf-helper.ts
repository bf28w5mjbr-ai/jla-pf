import type { ComponentProps, ReactElement } from "react";
import { Document, renderToBuffer } from "@react-pdf/renderer";
import { uploadPdfToS3 } from "@/lib/s3";
import { registerPdfJapaneseFonts } from "@/lib/registerPdfFonts";

export async function generatePdfBuffer(component: ReactElement): Promise<Buffer> {
  registerPdfJapaneseFonts();
  return renderToBuffer(component as ReactElement<ComponentProps<typeof Document>>);
}

export async function generateAndUploadPdf(params: {
  component: ReactElement;
  folder: 'invoices' | 'receipts' | 'certificates';
  basename: string;
  metadata?: Record<string, string>;
}): Promise<{ url: string; filename: string }> {
  const pdfBuffer = await generatePdfBuffer(params.component)
  const filename = `${params.basename}.pdf`
  const url = await uploadPdfToS3({
    folder: params.folder,
    filename,
    pdfBuffer,
    metadata: params.metadata,
  })
  return { url, filename }
}
