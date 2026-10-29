import { z } from 'zod';
import * as E from '../enums/domain.js';
import { normalizeUtcIso } from '../time.js';
import { decimalFactor } from '../money.js';
import { DomainError, ERROR_CODES } from '../contracts/errors.js';

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, 'Domain validation failed.', { issues: result.error.issues });
  return result.data;
}
export function decode<T>(schema: z.ZodType<T>, text: string): T {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, 'Invalid stored JSON.'); }
  return validate(schema, value);
}
export const keySchema = z.string().trim().min(1);
export const timestampSchema = z.string().transform((value, ctx) => {
  try { return normalizeUtcIso(value); } catch { ctx.addIssue({ code: 'custom', message: 'Expected a valid timezone-aware ISO timestamp.' }); return z.NEVER; }
});
export const minorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const decimalSchema = z.string().refine(value => { try { decimalFactor(value); return true; } catch { return false; } }, 'Expected a positive decimal string.');
export const localizedSchema = z.object({ zh: z.string(), en: z.string() }).strict();
export const hashSchema = z.string().regex(/^[a-fA-F0-9]{64}$/);
export const licenseSchema = z.enum(E.LICENSE_TYPES);
export const reasonSchema = z.enum(E.COMPLAINT_REASONS);
export const packageLicenseSchema = z.object({ parserStatus: z.enum(E.PARSER_STATUSES), file: z.string().nullable(), detected: z.string().nullable(), excerpt: z.string().nullable(), rulesetVersion: z.string().default('license-rules-v1.0.0'), matchedRuleIds: z.array(z.string()).default([]), semantic: z.object({ commercialUse: z.enum(['allowed', 'prohibited', 'unknown']), sourceRedistribution: z.enum(['allowed', 'prohibited', 'unknown']), derivativeResale: z.enum(['allowed', 'prohibited', 'unknown']), personalUse: z.enum(['allowed', 'prohibited', 'unknown']), attribution: z.enum(['allowed', 'prohibited', 'unknown']) }).default({ commercialUse: 'unknown', sourceRedistribution: 'unknown', derivativeResale: 'unknown', personalUse: 'unknown', attribution: 'unknown' }) }).strict();
export const fileSchema = z.object({ fileId: keySchema, kind: z.enum(E.FILE_KINDS), storageKey: keySchema, filename: keySchema, mimeType: keySchema, sizeBytes: minorSchema, sha256: hashSchema }).strict();
export const filesSchema = z.array(fileSchema).refine(files => new Set(files.map(file => file.fileId)).size === files.length, 'Duplicate file IDs.');
export const pricingSchema = z.object({ licenseType: licenseSchema, factor: decimalSchema, priceUsdCents: minorSchema }).strict();
export const snapshotSchema = z.object({ windowDays: minorSchema, eligible: z.array(keySchema), exclusions: z.array(keySchema), windowExemptReasons: z.array(reasonSchema), manualReviewRequired: z.boolean() }).strict();
export const policySchema = snapshotSchema.extend({ id: keySchema, version: keySchema, isActive: z.boolean(), createdAt: timestampSchema });
export const createPolicySchema = snapshotSchema.extend({ id: keySchema, version: keySchema, createdAt: timestampSchema });
export const userSchema = z.object({ id: keySchema, email: z.email().toLowerCase(), passwordHash: keySchema, authStatus: z.enum(E.AUTH_STATUSES), roles: z.array(z.enum(E.USER_ROLES)).min(1), displayName: keySchema, emailVerifiedAt: timestampSchema.nullable(), createdAt: timestampSchema, updatedAt: timestampSchema });
export const sessionSchema = z.object({ id: keySchema, userId: keySchema, csrfTokenHash: keySchema, expiresAt: timestampSchema, revokedAt: timestampSchema.nullable(), createdAt: timestampSchema });
export const productSchema = z.object({ id: keySchema, sellerId: keySchema, name: localizedSchema, summary: localizedSchema, category: keySchema, licenseTypes: z.array(licenseSchema).min(1), licensePricing: z.array(pricingSchema).min(1), priceUsdCents: minorSchema, status: z.enum(E.TEMPLATE_STATUSES), publishedAt: timestampSchema.nullable(), currentVersionId: keySchema.nullable(), reviewTargetVersionId: keySchema.nullable().default(null), version: keySchema, rating: z.number().min(0).max(5), salesRecent: minorSchema, updated: timestampSchema, createdAt: timestampSchema });
export const versionSchema = z.object({ versionId: keySchema, templateId: keySchema, version: keySchema, status: z.enum(E.TEMPLATE_VERSION_STATUSES).default('draft'), revision: minorSchema.default(1), files: filesSchema, packageLicense: packageLicenseSchema, licenseText: z.string().nullable(), scanJobId: keySchema.nullable(), scanStatus: z.enum(E.SCAN_STATUSES), conflictFlag: z.boolean(), conflictReasons: z.array(z.string()), immutable: z.boolean(), createdAt: timestampSchema, submittedAt: timestampSchema.nullable(), approvedAt: timestampSchema.nullable() });
export const quoteSchema = z.object({ usdToUsdt: decimalSchema, source: keySchema, capturedAt: timestampSchema }).strict();
export const itemSchema = z.object({ templateId: keySchema, versionId: keySchema, licenseType: licenseSchema, priceCents: minorSchema }).strict();
export const orderSchema = z.object({
  id: keySchema, orderNo: keySchema, buyerId: keySchema, sellerId: keySchema, templateId: keySchema, versionId: keySchema,
  licenseType: licenseSchema, licensePriceFactor: decimalSchema, priceCents: minorSchema, pricingCurrency: z.literal('USD'),
  paymentCurrency: z.enum(E.PAYMENT_CURRENCIES), paymentAmountMinor: minorSchema, quoteRate: quoteSchema.nullable(), quoteExpiresAt: timestampSchema.nullable(), quoteId: keySchema.nullable(), platformFeeCents: minorSchema, sellerAmountCents: minorSchema, taxSnapshot: z.record(z.string(), z.json()),
  refundPolicyVersion: keySchema, refundPolicySnapshot: snapshotSchema, items: z.tuple([itemSchema]), paymentStatus: z.enum(E.PAYMENT_STATUSES), orderStatus: z.enum(E.ORDER_STATUSES), paidAt: timestampSchema.nullable(), createdAt: timestampSchema, updatedAt: timestampSchema
}).superRefine((order, ctx) => {
  const item = order.items[0];
  if (item.templateId !== order.templateId || item.versionId !== order.versionId || item.licenseType !== order.licenseType || item.priceCents !== order.priceCents) ctx.addIssue({ code: 'custom', message: 'Order item does not match the order.' });
  if (order.paymentCurrency === 'USD' && order.paymentAmountMinor !== order.priceCents) ctx.addIssue({ code: 'custom', message: 'USD amount must equal the price in cents.' });
  if (order.paymentCurrency === 'USDT' && (!order.quoteRate || !order.quoteExpiresAt)) ctx.addIssue({ code: 'custom', message: 'USDT requires a decimal quote and expiry.' });
});
export const entitlementSchema = z.object({ id: keySchema, orderId: keySchema, templateId: keySchema, versionId: keySchema, licenseType: licenseSchema, maxDownloads: z.literal(10), downloadCount: minorSchema.max(10), expiresAt: timestampSchema, status: z.enum(E.ENTITLEMENT_STATUSES), reissuedFromId: keySchema.nullable(), reissuedToId: keySchema.nullable(), revokeReasonPublic: z.string().nullable(), revokeReasonInternal: z.string().nullable(), createdAt: timestampSchema, updatedAt: timestampSchema });
export const timelineSchema = z.array(z.object({ event: keySchema, actorId: keySchema.nullable(), note: z.string().nullable(), at: timestampSchema }));
export const complaintSchema = z.object({ id: keySchema, orderId: keySchema, entitlementId: keySchema.nullable(), templateId: keySchema, versionId: keySchema, reason: reasonSchema, description: keySchema, status: z.enum(E.COMPLAINT_STATUSES), reviewRoute: z.enum(E.REVIEW_ROUTES), refundDecision: z.enum(E.REFUND_DECISIONS), refundAmountUsdCents: minorSchema.nullable(), timeline: timelineSchema, createdAt: timestampSchema, updatedAt: timestampSchema });
export const auditSchema = z.object({ id: keySchema, actor: z.object({ type: z.enum(['user', 'system']), id: keySchema, emailSnapshot: z.string().nullable() }), action: keySchema, targetType: keySchema, targetId: keySchema, diff: z.array(z.object({ field: keySchema, before: z.json(), after: z.json() }).strict()).min(1), reason: z.string().nullable(), requestId: z.string().nullable(), ip: z.string().nullable(), userAgent: z.string().nullable(), at: timestampSchema });
export const previewSummarySchema = z.object({ aggregateStatus: z.enum(['pending', 'passed', 'failed', 'manual_review']), assets: z.array(z.object({ assetId: keySchema, kind: z.enum(['cover', 'preview_video', 'preview_image']), sha256: hashSchema, licenseName: keySchema, sourceUrl: z.url().nullable(), proofRef: keySchema.nullable(), reviewStatus: z.enum(E.PREVIEW_LICENSE_STATUSES), reviewNotes: z.string().nullable() })), unlicensedAssetIds: z.array(keySchema) });
export const proofSchema = z.object({ id: keySchema, templateId: keySchema, versionId: keySchema, declarationVersion: keySchema, declarationItems: z.array(z.object({ code: keySchema, accepted: z.boolean(), acceptedAt: timestampSchema.nullable() })), signer: z.object({ name: keySchema, accountId: keySchema }), signDate: z.iso.date(), proofFiles: z.array(z.object({ proofFileId: keySchema, originalName: keySchema, storageKey: keySchema, sha256: hashSchema })), proofLink: z.url().nullable(), revision: minorSchema.default(1), urlAuthorityStatus: z.enum(E.URL_AUTHORITY_STATUSES), capturedAt: timestampSchema.nullable(), pageSummary: z.string().max(2000).nullable(), screenshotSha256: hashSchema.nullable(), reviewerId: keySchema.nullable(), reviewedAt: timestampSchema.nullable(), conflictFlag: z.boolean(), verificationStatus: z.enum(E.VERIFICATION_STATUSES), previewAssetLicenseSummary: previewSummarySchema });
export const previewSchema = z.object({ id: keySchema, templateId: keySchema, versionId: keySchema, kind: z.enum(E.PREVIEW_KINDS), revision: minorSchema.default(1), storageKey: keySchema, url: z.url().nullable(), sha256: hashSchema, mimeType: keySchema, sizeBytes: minorSchema, licenseName: keySchema, licenseSource: keySchema, licenseSourceUrl: z.url().nullable(), licenseStatus: z.enum(E.PREVIEW_LICENSE_STATUSES), proofRef: keySchema.nullable(), reviewerId: keySchema.nullable(), reviewedAt: timestampSchema.nullable(), reviewNotes: z.string().nullable(), createdAt: timestampSchema });

export const createProductSchema = productSchema.pick({ id: true, sellerId: true, name: true, summary: true, category: true, licenseTypes: true, licensePricing: true, priceUsdCents: true, version: true }).extend({ now: timestampSchema }).strict().superRefine((product, ctx) => {
  const types = product.licenseTypes;
  if (new Set(types).size !== types.length || product.licensePricing.length !== types.length || new Set(product.licensePricing.map(p => p.licenseType)).size !== types.length || product.licensePricing.some(p => !types.includes(p.licenseType))) ctx.addIssue({ code: 'custom', message: 'License types and prices must match exactly.' });
});
export const draftPatchSchema = z.object({ name: localizedSchema.optional(), summary: localizedSchema.optional(), category: keySchema.optional(), priceUsdCents: minorSchema.optional() }).strict();
export const createVersionSchema = z.object({ versionId: keySchema, templateId: keySchema, version: keySchema, files: filesSchema, packageLicense: packageLicenseSchema, licenseText: z.string().nullable(), now: timestampSchema }).strict();
export const createOrderSchema = z.object({ id: keySchema, orderNo: keySchema, buyerId: keySchema, sellerId: keySchema, templateId: keySchema, versionId: keySchema, licenseType: licenseSchema, licensePriceFactor: decimalSchema, priceCents: minorSchema, paymentCurrency: z.enum(E.PAYMENT_CURRENCIES), paymentAmountMinor: minorSchema, quoteId: keySchema.nullable().optional().transform(value => value ?? null), quoteRate: quoteSchema.nullable(), quoteExpiresAt: timestampSchema.nullable(), platformFeeCents: minorSchema, sellerAmountCents: minorSchema, taxSnapshot: z.record(z.string(), z.json()), idempotencyKey: keySchema, now: timestampSchema }).strict().superRefine((order, ctx) => {
  if (BigInt(order.platformFeeCents) + BigInt(order.sellerAmountCents) !== BigInt(order.priceCents)) ctx.addIssue({ code: 'custom', message: 'Order allocations must equal price.' });
  if (order.paymentCurrency === 'USD' && (order.paymentAmountMinor !== order.priceCents || order.quoteRate !== null || order.quoteExpiresAt !== null)) ctx.addIssue({ code: 'custom', message: 'USD uses cents without a quote.' });
  if (order.paymentCurrency === 'USDT' && (!order.quoteRate || !order.quoteExpiresAt || Date.parse(order.quoteExpiresAt) <= Date.parse(order.now) || Date.parse(order.quoteRate.capturedAt) > Date.parse(order.now))) ctx.addIssue({ code: 'custom', message: 'USDT requires a current quote and expiry.' });
});
export const createComplaintSchema = z.object({ id: keySchema, orderId: keySchema, entitlementId: keySchema.nullable(), templateId: keySchema, versionId: keySchema, reason: reasonSchema, description: keySchema, reviewRoute: z.enum(E.REVIEW_ROUTES), actorId: keySchema, now: timestampSchema }).strict();
export const complaintRequestSchema = z.object({ buyerId: keySchema, orderId: keySchema, entitlementId: keySchema.nullable().optional(), reason: reasonSchema, description: keySchema, now: timestampSchema.optional() });
