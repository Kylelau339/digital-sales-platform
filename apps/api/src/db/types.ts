import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface UsersTable {
  id: string;
  email: string;
  password_hash: string;
  auth_status: string;
  roles_json: string;
  display_name: string;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthSessionsTable {
  id: string;
  user_id: string;
  csrf_token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface TemplateProductsTable {
  id: string;
  seller_id: string;
  name_json: string;
  summary_json: string;
  category: string;
  tags_json: string;
  license_types_json: string;
  license_pricing_json: string;
  price_usd_cents: number;
  status: string;
  published_at: string | null;
  current_version_id: string | null;
  review_target_version_id: string | null;
  version: string;
  rating: number;
  rating_count: number;
  sales_recent_json: string;
  early_signal_json: string;
  ranking_updated_at: string | null;
  updated_at: string;
  created_at: string;
}

export interface TemplateVersionsTable {
  version_id: string;
  template_id: string;
  version: string;
  status: string;
  revision: number;
  package_license_json: string;
  license_text: string | null;
  scan_job_id: string | null;
  scan_status: string;
  conflict_flag: number;
  conflict_reasons_json: string;
  immutable: number;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
}

export interface TemplateFilesTable {
  file_id: string;
  version_id: string;
  kind: string;
  storage_key: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  artifact_status: Generated<string>;
}

export interface LicenseProofsTable {
  id: string;
  template_id: string;
  version_id: string;
  declaration_version: string;
  declaration_items_json: string;
  signer_json: string;
  sign_date: string;
  proof_files_json: string;
  proof_link: string | null;
  revision: number;
  file_review_status: string;
  url_authority_status: string;
  captured_at: string | null;
  page_summary: string | null;
  screenshot_sha256: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  conflict_flag: number;
  verification_status: string;
  created_at: string;
  updated_at: string;
}

export interface PreviewAssetsTable {
  id: string;
  template_id: string;
  version_id: string;
  kind: string;
  revision: number;
  storage_key: string;
  url: string | null;
  sha256: string;
  mime_type: string;
  size_bytes: number;
  license_name: string;
  license_source: string;
  license_source_url: string | null;
  license_status: string;
  proof_ref: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

export interface RefundPoliciesTable {
  id: string;
  version: string;
  window_days: number;
  eligible_json: string;
  exclusions_json: string;
  window_exempt_reasons_json: string;
  manual_review_required: number;
  is_active: number;
  created_at: string;
}

export interface OrdersTable {
  id: string;
  order_no: string;
  buyer_id: string;
  seller_id: string;
  template_id: string;
  version_id: string;
  license_type: string;
  license_price_factor: string;
  price_cents: number;
  pricing_currency: string;
  payment_currency: string;
  payment_amount_minor: number;
  quote_rate_json: string | null;
  quote_expires_at: string | null;
  quote_id: string | null;
  refund_policy_version: string;
  refund_policy_snapshot_json: string;
  platform_fee_bps: Generated<number>;
  platform_fee_cents: number;
  seller_amount_cents: number;
  tax_snapshot_json: string;
  payment_status: string;
  order_status: string;
  paid_at: string | null;
  idempotency_key: string;
  stripe_checkout_session_id: string | null;
  checkout_session_expires_at: string | null;

  created_at: string;
  updated_at: string;
}

export interface OrderItemsTable {
  order_id: string;
  template_id: string;
  version_id: string;
  license_type: string;
  price_cents: number;
}

export interface TransactionsTable {
  id: string;
  order_id: string;
  parent_transaction_id: string | null;
  provider: string;
  type: string;
  amount_minor: number;
  pricing_amount_usd_cents: number;
  currency: string;
  provider_transaction_id: string | null;
  event_id: string | null;
  idempotency_key: string | null;
  status: string;
  signature_verified: number;
  raw_event_hash: string | null;
  failure_reason: string | null;
  refund_request_id: string | null;
  created_at: string;
  processed_at: string | null;
  chain: string | null;
  tx_hash: string | null;
  from_address: string | null;
  to_address: string | null;
  confirmations: number | null;
  required_confirmations: number | null;
}

export interface EntitlementsTable {
  id: string;
  order_id: string;
  template_id: string;
  version_id: string;
  license_type: string;
  max_downloads: number;
  download_count: number;
  expires_at: string;
  status: string;
  reissued_from_id: string | null;
  reissued_to_id: string | null;
  revoke_reason_public: string | null;
  revoke_reason_internal: string | null;
  last_downloaded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplaintsTable {
  id: string;
  order_id: string;
  entitlement_id: string | null;
  template_id: string;
  version_id: string;
  reason: string;
  description: string;
  status: string;
  review_route: string;
  refund_decision: string;
  refund_amount_usd_cents: number | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefundRequestsTable {
  id: string;
  complaint_id: string;
  order_id: string;
  requested_by: string;
  amount_minor: number;
  currency: string;
  status: string;
  stripe_refund_id: string | null;
  stripe_payment_intent: string;
  idempotency_key: string;
  failure_reason: string | null;
  product_refund_cents: number;
  tax_refund_cents: number;
  platform_fee_reversal_cents: number;
  seller_reversal_cents: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateTakedownsTable {
  id: string;
  template_id: string;
  mode: string;
  reason: string;
  actor_id: string;
  previous_status: string;
  entitlements_revoked: number;
  created_at: string;
}

export interface EmailDeliveryLogsTable {
  id: string;
  user_id: string;
  recipient: string;
  kind: string;
  provider: string;
  status: string;
  provider_message_id: string | null;
  error_code: string | null;
  created_at: string;
}

export interface ComplaintEvidenceTable {
  id: string;
  complaint_id: string;
  kind: string;
  storage_key: string | null;
  source_url: string | null;
  sha256: string | null;
  description: string | null;
}

export interface ComplaintTimelineTable {
  id: string;
  complaint_id: string;
  event: string;
  actor_id: string | null;
  note: string | null;
  at: string;
}

export interface AuditLogsTable {
  id: string;
  actor_type: string;
  actor_id: string;
  actor_email_snapshot: string | null;
  action: string;
  target_type: string;
  target_id: string;
  diff_json: string;
  reason: string | null;
  request_id: string | null;
  ip: string | null;
  user_agent: string | null;
  at: string;
}

export interface ScanJobsTable {
  id: string;
  version_id: string;
  status: string;
  findings_json: string;
  package_license_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProofCapturesTable {
  id: string;
  proof_id: string;
  version_id: string;
  status: string;
  outcome: string;
  error_code: string | null;
  proof_link: string;
  final_url: string | null;
  source_domain: string | null;
  title: string | null;
  h1: string | null;
  page_summary: string | null;
  response_sha256: string | null;
  screenshot_sha256: string | null;
  captured_at: string;
  history_json: string;
}

export interface IdempotencyKeysTable {
  key: string;
  scope: string;
  request_hash: string;
  response_json: string | null;
  created_at: string;
}

export interface PaymentEventInboxTable {
  provider: string;
  event_id: string;
  event_type: string;
  payload_hash: string;
  status: string;
  received_at: string;
  processed_at: string | null;
  last_error: string | null;
}
export interface DownloadReservationsTable {
  id: string;
  entitlement_id: string;
  buyer_id: string;
  version_id: string;
  request_key: string;
  token_hash: string;
  status: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

export interface SchemaMigrationsTable {
  name: string;
  applied_at: string;
}

export interface EmailVerificationCodesTable {
  id: string;
  user_id: string;
  code_hash: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  attempts: number;
}

export interface SellerConnectedAccountsTable {
  seller_id: string;
  stripe_account_id: string;
  livemode: number;
  onboarding_status: string;
  capabilities_json: string;
  requirements_json: string;
  synced_at: string;
}
export interface ConnectAccountIntentsTable {
  id: string;
  seller_id: string;
  idempotency_key: string;
  stripe_account_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Database {
  email_delivery_logs: EmailDeliveryLogsTable;
  refund_requests: RefundRequestsTable;
  template_takedowns: TemplateTakedownsTable;
  email_verification_codes: EmailVerificationCodesTable;
  seller_connected_accounts: SellerConnectedAccountsTable;
  connect_account_intents: ConnectAccountIntentsTable;
  payment_event_inbox: PaymentEventInboxTable;
  download_reservations: DownloadReservationsTable;
  schema_migrations: SchemaMigrationsTable;
  users: UsersTable;
  auth_sessions: AuthSessionsTable;
  template_products: TemplateProductsTable;
  template_versions: TemplateVersionsTable;
  template_files: TemplateFilesTable;
  license_proofs: LicenseProofsTable;
  preview_assets: PreviewAssetsTable;
  refund_policies: RefundPoliciesTable;
  orders: OrdersTable;
  order_items: OrderItemsTable;
  transactions: TransactionsTable;
  entitlements: EntitlementsTable;
  complaints: ComplaintsTable;
  complaint_evidence: ComplaintEvidenceTable;
  complaint_timeline: ComplaintTimelineTable;
  audit_logs: AuditLogsTable;
  scan_jobs: ScanJobsTable;
  proof_captures: ProofCapturesTable;
  idempotency_keys: IdempotencyKeysTable;
}

export type UserRow = Selectable<UsersTable>;
export type NewUserRow = Insertable<UsersTable>;
export type UpdateUserRow = Updateable<UsersTable>;
export type Row<Table extends keyof Database> = Selectable<Database[Table]>;
export type Patch<Table extends keyof Database> = Updateable<Database[Table]>;
