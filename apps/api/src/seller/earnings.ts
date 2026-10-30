import type { Kysely } from 'kysely';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { Database } from '../db/types.js';

export interface EarningsSummary {
  grossSalesCents: number;
  platformFeeCents: number;
  refundsCents: number;
  netEarningsCents: number;
  taxCollectedCents: number;
  orderCount: number;
  unitCount: number;
}

export interface EarningsSeriesPoint extends EarningsSummary { date: string; }
export interface EarningsTemplateRow extends EarningsSummary { templateId: string; name: { zh: string; en: string } | null; }

function day(value: string): string { return value.slice(0, 10); }
function parseDate(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, `${label} must be YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, `${label} is not a valid date.`);
  return date;
}

function emptySummary(): EarningsSummary { return { grossSalesCents: 0, platformFeeCents: 0, refundsCents: 0, netEarningsCents: 0, taxCollectedCents: 0, orderCount: 0, unitCount: 0 }; }
function add(target: EarningsSummary, source: Partial<EarningsSummary>): void {
  target.grossSalesCents += source.grossSalesCents ?? 0;
  target.platformFeeCents += source.platformFeeCents ?? 0;
  target.refundsCents += source.refundsCents ?? 0;
  target.netEarningsCents += source.netEarningsCents ?? 0;
  target.taxCollectedCents += source.taxCollectedCents ?? 0;
  target.orderCount += source.orderCount ?? 0;
  target.unitCount += source.unitCount ?? 0;
}

export function createEarningsService(db: Kysely<Database>, clock: () => Date = () => new Date()) {
  return {
    async get(sellerId: string, fromInput: string | undefined, toInput: string | undefined) {
      const now = clock();
      const today = now.toISOString().slice(0, 10);
      const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const fromDate = parseDate(fromInput ?? defaultFrom, 'from');
      const toDate = parseDate(toInput ?? today, 'to');
      if (toDate.getTime() <= fromDate.getTime()) throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, 'to must be after from.');
      if (toDate.getTime() - fromDate.getTime() > 366 * 24 * 60 * 60 * 1000) throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, 'The earnings range cannot exceed 366 days.');
      const from = fromDate.toISOString();
      const to = new Date(toDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const orders = await db.selectFrom('orders').select(['id', 'order_no', 'template_id', 'license_type', 'paid_at', 'price_cents', 'platform_fee_cents', 'seller_amount_cents', 'tax_snapshot_json', 'payment_status']).where('seller_id', '=', sellerId).where('paid_at', '>=', from).where('paid_at', '<', to).where('payment_status', 'in', ['paid', 'partially_refunded', 'refunded']).orderBy('paid_at', 'desc').execute();
      const refunds = await db.selectFrom('refund_requests').innerJoin('orders', 'orders.id', 'refund_requests.order_id').select(['refund_requests.id', 'refund_requests.order_id', 'refund_requests.seller_reversal_cents', 'refund_requests.platform_fee_reversal_cents', 'refund_requests.tax_refund_cents', 'refund_requests.created_at', 'orders.template_id']).where('orders.seller_id', '=', sellerId).where('refund_requests.status', '=', 'succeeded').where('refund_requests.created_at', '>=', from).where('refund_requests.created_at', '<', to).execute();
      const templateIds = [...new Set([...orders.map(order => order.template_id), ...refunds.map(refund => refund.template_id)])];
      const templateRows = templateIds.length ? await db.selectFrom('template_products').select(['id', 'name_json']).where('id', 'in', templateIds).execute() : [];
      const templateNames = new Map(templateRows.map(row => [row.id, JSON.parse(row.name_json)]));

      const summary = emptySummary();
      const series = new Map<string, EarningsSeriesPoint>();
      const templates = new Map<string, EarningsTemplateRow>();
      const seriesPoint = (date: string): EarningsSeriesPoint => {
        const existing = series.get(date);
        if (existing) return existing;
        const point = { date, ...emptySummary() } as EarningsSeriesPoint;
        series.set(date, point);
        return point;
      };
      const templateRow = (templateId: string): EarningsTemplateRow => {
        const existing = templates.get(templateId);
        if (existing) return existing;
        const row = { templateId, name: templateNames.get(templateId) ?? null, ...emptySummary() } as EarningsTemplateRow;
        templates.set(templateId, row);
        return row;
      };

      for (const order of orders) {
        const tax = Number((JSON.parse(order.tax_snapshot_json ?? '{}') as { amountTax?: number }).amountTax ?? 0);
        const sale = { grossSalesCents: order.price_cents, platformFeeCents: order.platform_fee_cents, netEarningsCents: order.seller_amount_cents, taxCollectedCents: Number.isFinite(tax) ? tax : 0, orderCount: 1, unitCount: 1, refundsCents: 0 };
        add(summary, sale);
        add(seriesPoint(day(order.paid_at ?? order.id)), sale);
        add(templateRow(order.template_id), sale);
      }
      for (const refund of refunds) {
        const reversal = { refundsCents: refund.seller_reversal_cents, netEarningsCents: -refund.seller_reversal_cents, grossSalesCents: 0, platformFeeCents: 0, taxCollectedCents: -refund.tax_refund_cents, orderCount: 0, unitCount: 0 };
        add(summary, reversal);
        add(seriesPoint(day(refund.created_at)), reversal);
        add(templateRow(refund.template_id), reversal);
      }

      const recentOrders = orders.slice(0, 20).map(order => ({ orderNo: order.order_no, paidAt: order.paid_at, templateId: order.template_id, templateName: templateNames.get(order.template_id) ?? null, licenseType: order.license_type, priceCents: order.price_cents, platformFeeCents: order.platform_fee_cents, sellerAmountCents: order.seller_amount_cents, paymentStatus: order.payment_status }));

      return { currency: 'USD', from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10), summary, series: [...series.values()].sort((a, b) => a.date.localeCompare(b.date)), templates: [...templates.values()].sort((a, b) => b.netEarningsCents - a.netEarningsCents), recentOrders };
    }
  };
}
