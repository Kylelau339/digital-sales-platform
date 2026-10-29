import type { PaymentCurrency } from '@shared/enums/domain.js';

export interface PaymentSessionRequest {
  orderId: string;
  currency: PaymentCurrency;
  amountMinor: number;
  idempotencyKey: string;
}

export interface PaymentProviderPort {
  createSession(request: PaymentSessionRequest): Promise<{ providerSessionId: string; expiresAt: string }>;
  verifyEvent(rawBody: Uint8Array, headers: Readonly<Record<string, string>>): Promise<{ eventId: string; orderId: string }>;
}
