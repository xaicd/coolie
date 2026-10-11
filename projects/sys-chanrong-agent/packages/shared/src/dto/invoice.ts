import type { AuditBaseColumns } from "./audit-base.js";

/** 发票验真状态（对齐 cr_invoice_asset.verification_status）。 */
export type InvoiceVerificationStatus = "VALID" | "INVALID" | "PENDING";

/** 多模态单证与增值税发票台账 DTO。 */
export interface InvoiceAssetDto extends AuditBaseColumns {
  enterpriseId: string;
  invoiceCode: string;
  invoiceNumber: string;
  billingDate: string;
  buyerName: string;
  sellerName: string;
  amountWithoutTax: number;
  taxAmount: number;
  totalAmount: number;
  ocrRawData: Record<string, unknown>;
  verificationStatus: InvoiceVerificationStatus;
}

/** 发票 OCR 结果入库请求 DTO。 */
export interface CreateInvoiceAssetRequest {
  enterpriseId: string;
  invoiceCode: string;
  invoiceNumber: string;
  billingDate: string;
  buyerName: string;
  sellerName: string;
  amountWithoutTax: number;
  taxAmount: number;
  totalAmount: number;
  ocrRawData: Record<string, unknown>;
}
