import { emptyWorkspace, type CatalogClient, type TemplateItem } from './models';
export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export interface SessionUser { id: string; email: string; displayName: string; roles: string[]; authStatus: string; }
let csrfToken: string | null = null;
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && typeof options.body === 'string') headers.set('Content-Type', 'application/json');
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(`/api/v1${path}`, { ...options, headers, credentials: 'include' });
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = body as { code?: string; message?: string } | null;
    throw new ApiError(response.status, error?.code ?? 'HTTP_ERROR', error?.message ?? `HTTP ${response.status}`);
  }
  return body as T;
}
export const httpClient: CatalogClient = {
  async listTemplates(signal) {
    const result = await request<{ items: TemplateItem[]; total: number }>('/templates', signal ? { signal } : {});
    if (!result || !Array.isArray(result.items) || typeof result.total !== 'number') throw new ApiError(502, 'INVALID_RESPONSE', 'Invalid catalogue response');
    // The backend contract uses approved. Legacy live is converted only inside the fixture adapter.
    return { items: result.items.filter(item => item.status === 'approved'), total: result.total };
  },
  async workspace() {
    try {
      const [reviews, entitlements] = await Promise.all([
        request<{ items: Array<Record<string, unknown>> }>('/admin/reviews'),
        request<{ items: import('./models').LibraryItem[] }>('/entitlements')
      ]);
      return { ...emptyWorkspace(), entitlements: entitlements.items, submissions: reviews.items.map(item => ({ id: String(item.versionId), title: { en: String(item.versionId) }, seller: '', submittedAt: '', parserStatus: '', scanStatus: '', scanJobId: '', conflictFlag: false, conflictReasons: [], urlAuthorityStatus: '', pageSummary: null, packageLicense: { file: null, excerpt: null } })) };
    } catch {
      try {
        const entitlements = await request<{ items: import('./models').LibraryItem[] }>('/entitlements');
        return { ...emptyWorkspace(), entitlements: entitlements.items };
      } catch { return emptyWorkspace(); }
    }
  }
};
export const commerceClient = {
  async checkout(templateId: string, licenseType: string, idempotencyKey: string) {
    return request<{ orderId: string; checkoutSessionId: string; url: string }>('/checkout/sessions', {
      method: 'POST', headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ templateId, licenseType })
    });
  },
  async entitlements() {
    return request<{ items: import('./models').LibraryItem[] }>('/entitlements');
  },
  async download(entitlementId: string) {
    const key = crypto.randomUUID();
    try {
      return await request<{ token?: string; downloadUrl?: string }>(`/entitlements/${encodeURIComponent(entitlementId)}/download`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({}) });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      return request<{ token?: string; downloadUrl?: string }>(`/entitlements/${encodeURIComponent(entitlementId)}/downloads`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({}) });
    }
  }
};
export const connectClient = {
  async createAccount(idempotencyKey: string) { return request<{ stripe_account_id: string; onboarding_status: string }>('/seller/connect/account', { method: 'POST', body: JSON.stringify({ idempotencyKey }) }); },
  async status() { return request<{ account: { stripe_account_id: string; onboarding_status: string } | null }>('/seller/connect/status'); },
  async onboardingLink() { return request<{ url: string }>('/seller/connect/onboarding-link', { method: 'POST', body: JSON.stringify({}) }); }
};
export const sellerClient = {
  async earnings(from?: string, to?: string) {
    const query = new URLSearchParams(); if (from) query.set('from', from); if (to) query.set('to', to);
    return request<import('./models').SellerEarnings>(`/seller/earnings${query.size ? `?${query.toString()}` : ''}`);
  }
};
export const complaintClient = {
  async list() { return request<{ items: import('./models').ComplaintItem[]; total: number }>('/complaints'); },
  async create(input: { orderId: string; entitlementId?: string | null; reason: string; description: string }, idempotencyKey: string) {
    return request<{ complaint: import('./models').ComplaintItem }>('/complaints', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input) });
  }
};
export const adminClient = {
  async reviews() { return request<{ items: Array<Record<string, unknown>> }>('/admin/reviews'); },
  async complaints() { return request<{ items: import('./models').AdminComplaintItem[]; total: number }>('/admin/complaints'); },
  async complaint(id: string) { return request<Record<string, unknown>>(`/admin/complaints/${encodeURIComponent(id)}`); },
  async approveRefund(id: string, input: { amountUsdCents: number; reason: string }, idempotencyKey: string) { return request(`/admin/complaints/${encodeURIComponent(id)}/refund/approve`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input) }); },
  async rejectRefund(id: string, input: { reason: string }, idempotencyKey: string) { return request(`/admin/complaints/${encodeURIComponent(id)}/refund/reject`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input) }); },
  async takedown(id: string, input: { mode: 'suspend' | 'remove'; reason: string }, idempotencyKey: string) { return request(`/admin/templates/${encodeURIComponent(id)}/takedown`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input) }); },
  async templates() { return request<{ items: Array<{ id: string; name: import('./models').LocalText; status: string; priceUsdCents: number; version: string; currentVersionId: string | null; sellerId: string; updatedAt: string }> }>('/admin/templates?status=approved'); },
  async audit() { return request<{ items: Array<Record<string, unknown>> }>('/admin/audit'); }
};
export const authClient = {
  async restore(): Promise<SessionUser | null> {
    try {
      const { user } = await request<{ user: SessionUser }>('/auth/me');
      const result = await request<{ csrfToken: string }>('/auth/csrf');
      csrfToken = result.csrfToken;
      return user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { csrfToken = null; return null; }
      throw error;
    }
  },
  async authenticate(mode: 'login' | 'register', input: { email: string; password: string; displayName?: string }): Promise<SessionUser> {
    const result = await request<{ user: SessionUser; csrfToken: string }>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(input) });
    csrfToken = result.csrfToken;
    return result.user;
  },
  async verifyEmail(code: string): Promise<SessionUser> { const result = await request<{ user: SessionUser }>('/auth/email-verification/verify', { method: 'POST', body: JSON.stringify({ code }) }); return result.user; },
  async resendVerification(): Promise<void> { await request('/auth/email-verification/send', { method: 'POST', body: JSON.stringify({}) }); },
  async logout() { await request('/auth/logout', { method: 'POST' }); csrfToken = null; }
};
