import type { ReactElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { uploadPdfToS3 } from '@/lib/s3'

export async function generatePdfBuffer(component: ReactElement): Promise<Buffer> {
  return renderToBuffer(component as any)
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
