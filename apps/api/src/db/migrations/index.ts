import { sql, type Kysely } from 'kysely';
import { hardenM0, undoM0Hardening } from './harden-m0.js';
import type { Database } from '../types.js';

export interface Migration {
  name: string;
  up(db: Kysely<Database>): Promise<void>;
  down?(db: Kysely<Database>): Promise<void>;
}

const migrations: Migration[] = [
  {
    name: '0001_auth_users_sessions',
    async up(db) {
      await db.schema.createTable('users').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('email', 'text', col => col.notNull().unique())
        .addColumn('password_hash', 'text', col => col.notNull())
        .addColumn('auth_status', 'text', col => col.notNull().defaultTo('pending_email'))
        .addColumn('roles_json', 'text', col => col.notNull())
        .addColumn('display_name', 'text', col => col.notNull())
        .addColumn('email_verified_at', 'text')
        .addColumn('created_at', 'text', col => col.notNull())
        .addColumn('updated_at', 'text', col => col.notNull())
        .execute();
      await db.schema.createTable('auth_sessions').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('user_id', 'text', col => col.notNull().references('users.id').onDelete('cascade'))
        .addColumn('csrf_token_hash', 'text', col => col.notNull())
        .addColumn('expires_at', 'text', col => col.notNull())
        .addColumn('revoked_at', 'text')
        .addColumn('created_at', 'text', col => col.notNull())
        .execute();
      await db.schema.createIndex('idx_auth_sessions_user').ifNotExists().on('auth_sessions').column('user_id').execute();
    }
  },
  {
    name: '0002_templates_versions_proofs_previews',
    async up(db) {
      await db.schema.createTable('template_products').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('seller_id', 'text', col => col.notNull().references('users.id'))
        .addColumn('name_json', 'text', col => col.notNull())
        .addColumn('summary_json', 'text', col => col.notNull())
        .addColumn('category', 'text', col => col.notNull())
        .addColumn('tags_json', 'text', col => col.notNull())
        .addColumn('license_types_json', 'text', col => col.notNull())
        .addColumn('license_pricing_json', 'text', col => col.notNull())
        .addColumn('price_usd_cents', 'integer', col => col.notNull())
        .addColumn('status', 'text', col => col.notNull().defaultTo('draft'))
        .addColumn('published_at', 'text')
        .addColumn('current_version_id', 'text')
        .addColumn('version', 'text', col => col.notNull())
        .addColumn('rating', 'real', col => col.notNull().defaultTo(0))
        .addColumn('rating_count', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('sales_recent_json', 'text', col => col.notNull())
        .addColumn('early_signal_json', 'text', col => col.notNull())
        .addColumn('ranking_updated_at', 'text')
        .addColumn('updated_at', 'text', col => col.notNull())
        .addColumn('created_at', 'text', col => col.notNull())
        .execute();
      await db.schema.createTable('template_versions').ifNotExists()
        .addColumn('version_id', 'text', col => col.primaryKey())
        .addColumn('template_id', 'text', col => col.notNull().references('template_products.id').onDelete('cascade'))
        .addColumn('version', 'text', col => col.notNull())
        .addColumn('files_json', 'text', col => col.notNull())
        .addColumn('package_license_json', 'text', col => col.notNull())
        .addColumn('license_text', 'text')
        .addColumn('scan_job_id', 'text')
        .addColumn('scan_status', 'text', col => col.notNull().defaultTo('pending'))
        .addColumn('conflict_flag', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('conflict_reasons_json', 'text', col => col.notNull())
        .addColumn('immutable', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('created_at', 'text', col => col.notNull())
        .addColumn('submitted_at', 'text')
        .addColumn('approved_at', 'text')
        .execute();
      await db.schema.createTable('template_files').ifNotExists()
        .addColumn('file_id', 'text', col => col.primaryKey())
        .addColumn('version_id', 'text', col => col.notNull().references('template_versions.version_id').onDelete('cascade'))
        .addColumn('kind', 'text', col => col.notNull())
        .addColumn('storage_key', 'text', col => col.notNull())
        .addColumn('filename', 'text', col => col.notNull())
        .addColumn('mime_type', 'text', col => col.notNull())
        .addColumn('size_bytes', 'integer', col => col.notNull())
        .addColumn('sha256', 'text', col => col.notNull())
        .execute();
      await db.schema.createTable('license_proofs').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('template_id', 'text', col => col.notNull().references('template_products.id'))
        .addColumn('version_id', 'text', col => col.notNull().references('template_versions.version_id'))
        .addColumn('declaration_version', 'text', col => col.notNull())
        .addColumn('declaration_items_json', 'text', col => col.notNull())
        .addColumn('signer_json', 'text', col => col.notNull())
        .addColumn('sign_date', 'text', col => col.notNull())
        .addColumn('proof_files_json', 'text', col => col.notNull())
        .addColumn('proof_link', 'text')
        .addColumn('url_authority_status', 'text', col => col.notNull().defaultTo('pending'))
        .addColumn('captured_at', 'text')
        .addColumn('page_summary', 'text')
        .addColumn('screenshot_sha256', 'text')
        .addColumn('reviewer_id', 'text')
        .addColumn('reviewed_at', 'text')
        .addColumn('conflict_flag', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('verification_status', 'text', col => col.notNull().defaultTo('pending'))
        .addColumn('created_at', 'text', col => col.notNull())
        .addColumn('updated_at', 'text', col => col.notNull())
        .execute();
      await db.schema.createTable('preview_assets').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('template_id', 'text', col => col.notNull().references('template_products.id'))
        .addColumn('version_id', 'text', col => col.notNull().references('template_versions.version_id'))
        .addColumn('kind', 'text', col => col.notNull())
        .addColumn('storage_key', 'text', col => col.notNull())
        .addColumn('url', 'text')
        .addColumn('sha256', 'text', col => col.notNull())
        .addColumn('mime_type', 'text', col => col.notNull())
        .addColumn('size_bytes', 'integer', col => col.notNull())
        .addColumn('license_name', 'text', col => col.notNull())
        .addColumn('license_source', 'text', col => col.notNull())
        .addColumn('license_source_url', 'text')
        .addColumn('license_status', 'text', col => col.notNull().defaultTo('manual_review'))
        .addColumn('proof_ref', 'text')
        .addColumn('reviewer_id', 'text')
        .addColumn('reviewed_at', 'text')
        .addColumn('created_at', 'text', col => col.notNull())
        .execute();
    }
  },
  {
    name: '0003_refund_policies_orders',
    async up(db) {
      await db.schema.createTable('refund_policies').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('version', 'text', col => col.notNull().unique())
        .addColumn('window_days', 'integer', col => col.notNull())
        .addColumn('eligible_json', 'text', col => col.notNull())
        .addColumn('exclusions_json', 'text', col => col.notNull())
        .addColumn('window_exempt_reasons_json', 'text', col => col.notNull())
        .addColumn('manual_review_required', 'integer', col => col.notNull())
        .addColumn('is_active', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('created_at', 'text', col => col.notNull())
        .execute();
      await db.schema.createTable('orders').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('order_no', 'text', col => col.notNull().unique())
        .addColumn('buyer_id', 'text', col => col.notNull().references('users.id'))
        .addColumn('seller_id', 'text', col => col.notNull().references('users.id'))
        .addColumn('template_id', 'text', col => col.notNull().references('template_products.id'))
        .addColumn('version_id', 'text', col => col.notNull().references('template_versions.version_id'))
        .addColumn('license_type', 'text', col => col.notNull())
        .addColumn('license_price_factor', 'text', col => col.notNull())
        .addColumn('price_cents', 'integer', col => col.notNull())
        .addColumn('pricing_currency', 'text', col => col.notNull().defaultTo('USD'))
        .addColumn('payment_currency', 'text', col => col.notNull())
        .addColumn('payment_amount_minor', 'integer', col => col.notNull())
        .addColumn('quote_rate_json', 'text')
        .addColumn('quote_expires_at', 'text')
        .addColumn('refund_policy_version', 'text', col => col.notNull())
        .addColumn('refund_policy_snapshot_json', 'text', col => col.notNull())
        .addColumn('platform_fee_cents', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('seller_amount_cents', 'integer', col => col.notNull())
        .addColumn('tax_snapshot_json', 'text', col => col.notNull())
        .addColumn('payment_status', 'text', col => col.notNull().defaultTo('pending'))
        .addColumn('order_status', 'text', col => col.notNull().defaultTo('created'))
        .addColumn('paid_at', 'text')
        .addColumn('idempotency_key', 'text', col => col.notNull().unique())
        .addColumn('created_at', 'text', col => col.notNull())
        .addColumn('updated_at', 'text', col => col.notNull())
        .execute();
      await db.schema.createTable('order_items').ifNotExists()
        .addColumn('order_id', 'text', col => col.primaryKey().references('orders.id').onDelete('cascade'))
        .addColumn('template_id', 'text', col => col.notNull())
        .addColumn('version_id', 'text', col => col.notNull())
        .addColumn('license_type', 'text', col => col.notNull())
        .addColumn('price_cents', 'integer', col => col.notNull())
        .execute();
    }
  },
  {
    name: '0004_transactions_entitlements_complaints_audit',
    async up(db) {
      await db.schema.createTable('transactions').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('order_id', 'text', col => col.notNull().references('orders.id'))
        .addColumn('parent_transaction_id', 'text')
        .addColumn('provider', 'text', col => col.notNull())
        .addColumn('type', 'text', col => col.notNull())
        .addColumn('amount_minor', 'integer', col => col.notNull())
        .addColumn('pricing_amount_usd_cents', 'integer', col => col.notNull())
        .addColumn('currency', 'text', col => col.notNull())
        .addColumn('provider_transaction_id', 'text')
        .addColumn('event_id', 'text')
        .addColumn('idempotency_key', 'text')
        .addColumn('status', 'text', col => col.notNull())
        .addColumn('signature_verified', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('raw_event_hash', 'text')
        .addColumn('failure_reason', 'text')
        .addColumn('created_at', 'text', col => col.notNull())
        .addColumn('processed_at', 'text')
        .execute();
      await db.schema.createTable('entitlements').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('order_id', 'text', col => col.notNull().references('orders.id'))
        .addColumn('template_id', 'text', col => col.notNull())
        .addColumn('version_id', 'text', col => col.notNull())
        .addColumn('license_type', 'text', col => col.notNull())
        .addColumn('max_downloads', 'integer', col => col.notNull().defaultTo(10))
        .addColumn('download_count', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('expires_at', 'text', col => col.notNull())
        .addColumn('status', 'text', col => col.notNull().defaultTo('active'))
        .addColumn('reissued_from_id', 'text')
        .addColumn('reissued_to_id', 'text')
        .addColumn('revoke_reason_public', 'text')
        .addColumn('revoke_reason_internal', 'text')
        .addColumn('last_downloaded_at', 'text')
        .addColumn('created_at', 'text', col => col.notNull())
        .addColumn('updated_at', 'text', col => col.notNull())
        .execute();
      await db.schema.createTable('complaints').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('order_id', 'text', col => col.notNull().references('orders.id'))
        .addColumn('entitlement_id', 'text')
        .addColumn('template_id', 'text', col => col.notNull())
        .addColumn('version_id', 'text', col => col.notNull())
        .addColumn('reason', 'text', col => col.notNull())
        .addColumn('description', 'text', col => col.notNull())
        .addColumn('status', 'text', col => col.notNull().defaultTo('submitted'))
        .addColumn('review_route', 'text', col => col.notNull())
        .addColumn('refund_decision', 'text', col => col.notNull().defaultTo('not_requested'))
        .addColumn('refund_amount_usd_cents', 'integer')
        .addColumn('timeline_json', 'text', col => col.notNull())
        .addColumn('created_at', 'text', col => col.notNull())
        .addColumn('updated_at', 'text', col => col.notNull())
        .execute();
      await db.schema.createTable('complaint_evidence').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('complaint_id', 'text', col => col.notNull().references('complaints.id').onDelete('cascade'))
        .addColumn('kind', 'text', col => col.notNull())
        .addColumn('storage_key', 'text')
        .addColumn('source_url', 'text')
        .addColumn('sha256', 'text')
        .addColumn('description', 'text')
        .execute();
      await db.schema.createTable('complaint_timeline').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('complaint_id', 'text', col => col.notNull().references('complaints.id').onDelete('cascade'))
        .addColumn('event', 'text', col => col.notNull())
        .addColumn('actor_id', 'text')
        .addColumn('note', 'text')
        .addColumn('at', 'text', col => col.notNull())
        .execute();
      await db.schema.createTable('audit_logs').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('actor_type', 'text', col => col.notNull())
        .addColumn('actor_id', 'text', col => col.notNull())
        .addColumn('actor_email_snapshot', 'text')
        .addColumn('action', 'text', col => col.notNull())
        .addColumn('target_type', 'text', col => col.notNull())
        .addColumn('target_id', 'text', col => col.notNull())
        .addColumn('diff_json', 'text', col => col.notNull())
        .addColumn('reason', 'text')
        .addColumn('request_id', 'text')
        .addColumn('ip', 'text')
        .addColumn('user_agent', 'text')
        .addColumn('at', 'text', col => col.notNull())
        .execute();
      await db.schema.createTable('scan_jobs').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('version_id', 'text', col => col.notNull().references('template_versions.version_id'))
        .addColumn('status', 'text', col => col.notNull().defaultTo('pending'))
        .addColumn('created_at', 'text', col => col.notNull())
        .addColumn('updated_at', 'text', col => col.notNull())
        .execute();
      await db.schema.createTable('idempotency_keys').ifNotExists()
        .addColumn('key', 'text', col => col.notNull())
        .addColumn('scope', 'text', col => col.notNull())
        .addColumn('request_hash', 'text', col => col.notNull())
        .addColumn('response_json', 'text')
        .addColumn('created_at', 'text', col => col.notNull())
        .addPrimaryKeyConstraint('pk_idempotency_keys', ['key', 'scope'])
        .execute();
    }
  },
  {
    name: '0005_scan_contract_only',
    async up(db) {
      await db.schema.createIndex('idx_scan_jobs_version').ifNotExists().on('scan_jobs').column('version_id').execute();
    }
  },
  {
    name: '0006_indexes_and_integrity',
    async up(db) {
      await db.schema.createIndex('idx_templates_status_published').ifNotExists().on('template_products').columns(['status', 'published_at']).execute();
      await db.schema.createIndex('idx_orders_buyer_status').ifNotExists().on('orders').columns(['buyer_id', 'payment_status']).execute();
      await db.schema.createIndex('idx_entitlements_buyer_status').ifNotExists().on('entitlements').columns(['order_id', 'status']).execute();
      await db.schema.createIndex('idx_complaints_status_created').ifNotExists().on('complaints').columns(['status', 'created_at']).execute();
      await db.schema.createIndex('idx_audit_target_at').ifNotExists().on('audit_logs').columns(['target_type', 'target_id', 'at']).execute();
      await db.schema.createIndex('idx_transactions_event').ifNotExists().on('transactions').column('event_id').unique().where('event_id', 'is not', null).execute();
      await db.schema.createIndex('idx_refund_policies_active').ifNotExists().on('refund_policies').column('is_active').unique().where('is_active', '=', 1).execute();
    }
  },
  {
    name: '0007_seed_refund_policy_v21',
    async up(db) {
      const current = await db.selectFrom('refund_policies').select('id').where('version', '=', 'v2.1').executeTakeFirst();
      if (current) return;
      const now = new Date().toISOString();
      await db.insertInto('refund_policies').values({
        id: 'refund-policy-v2.1',
        version: 'v2.1',
        window_days: 7,
        eligible_json: JSON.stringify(['file_corrupted_or_inaccessible', 'materially_not_as_described', 'duplicate_purchase']),
        exclusions_json: JSON.stringify(['already_downloaded', 'subjective_dissatisfaction']),
        window_exempt_reasons_json: JSON.stringify(['technical_unavailable', 'file_corrupted_or_inaccessible']),
        manual_review_required: 1,
        is_active: 1,
        created_at: now
      }).execute();
    }
  },
  {
    name: '0008_m0_integrity_and_normalized_files',
    up: hardenM0,
    down: undoM0Hardening
  },
  {
    name: '0009_explicit_order_items',
    async up(db) { await sql`DROP TRIGGER IF EXISTS m0_order_item_insert`.execute(db); }
  },
  {
    name: '0010_m1_scanning_proof_revision',
    async up(db) {
      const add = async (table: string, column: string, definition: string) => {
        const exists = await sql<{ name: string }>`PRAGMA table_info(${sql.raw(table)})`.execute(db);
        if (!exists.rows.some(row => row.name === column)) await sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).execute(db);
      };
      await add('template_products', 'review_target_version_id', 'TEXT');
      await add('template_versions', 'status', "TEXT NOT NULL DEFAULT 'draft'");
      await add('template_versions', 'revision', 'INTEGER NOT NULL DEFAULT 1');
      await add('license_proofs', 'revision', 'INTEGER NOT NULL DEFAULT 1');
      await add('license_proofs', 'file_review_status', "TEXT NOT NULL DEFAULT 'pending'");
      await add('preview_assets', 'revision', 'INTEGER NOT NULL DEFAULT 1');
      await add('scan_jobs', 'findings_json', "TEXT NOT NULL DEFAULT '[]'");
      await add('scan_jobs', 'package_license_json', 'TEXT');
      await db.schema.createTable('proof_captures').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('proof_id', 'text', col => col.notNull().references('license_proofs.id').onDelete('cascade'))
        .addColumn('version_id', 'text', col => col.notNull().references('template_versions.version_id').onDelete('cascade'))
        .addColumn('status', 'text', col => col.notNull().defaultTo('active'))
        .addColumn('outcome', 'text', col => col.notNull())
        .addColumn('error_code', 'text')
        .addColumn('proof_link', 'text', col => col.notNull())
        .addColumn('final_url', 'text')
        .addColumn('source_domain', 'text')
        .addColumn('title', 'text')
        .addColumn('h1', 'text')
        .addColumn('page_summary', 'text')
        .addColumn('response_sha256', 'text')
        .addColumn('screenshot_sha256', 'text')
        .addColumn('captured_at', 'text', col => col.notNull())
        .addColumn('history_json', 'text', col => col.notNull())
        .execute();
      await db.schema.createIndex('idx_proof_captures_version').ifNotExists().on('proof_captures').columns(['version_id', 'captured_at']).execute();
    }
  },
  {
    name: '0011_email_verification_codes',
    async up(db) {
      await db.schema.createTable('email_verification_codes').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('user_id', 'text', col => col.notNull().references('users.id').onDelete('cascade'))
        .addColumn('code_hash', 'text', col => col.notNull())
        .addColumn('created_at', 'text', col => col.notNull())
        .addColumn('expires_at', 'text', col => col.notNull())
        .addColumn('consumed_at', 'text')
        .addColumn('attempts', 'integer', col => col.notNull().defaultTo(0))
        .execute();
      await db.schema.createIndex('idx_email_codes_user').ifNotExists().on('email_verification_codes').columns(['user_id', 'created_at']).execute();
    }
  },
  {
    name: '0012_connect_accounts',
    async up(db) {
      await db.schema.createTable('seller_connected_accounts').ifNotExists()
        .addColumn('seller_id', 'text', col => col.primaryKey().references('users.id').onDelete('cascade'))
        .addColumn('stripe_account_id', 'text', col => col.notNull().unique())
        .addColumn('livemode', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('onboarding_status', 'text', col => col.notNull().defaultTo('pending'))
        .addColumn('capabilities_json', 'text', col => col.notNull().defaultTo('{}'))
        .addColumn('requirements_json', 'text', col => col.notNull().defaultTo('{}'))
        .addColumn('synced_at', 'text', col => col.notNull())
        .execute();
      await db.schema.createTable('connect_account_intents').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('seller_id', 'text', col => col.notNull().references('users.id').onDelete('cascade'))
        .addColumn('idempotency_key', 'text', col => col.notNull().unique())
        .addColumn('stripe_account_id', 'text')
        .addColumn('status', 'text', col => col.notNull().defaultTo('pending'))
        .addColumn('created_at', 'text', col => col.notNull())
        .addColumn('updated_at', 'text', col => col.notNull())
        .execute();
      await db.schema.createIndex('idx_connect_intents_seller').ifNotExists().on('connect_account_intents').column('seller_id').execute();
    }
  },
  {
    name: '0013_checkout_webhook_download',
    async up(db) {
      await sql`ALTER TABLE orders ADD COLUMN stripe_checkout_session_id TEXT`.execute(db);
      await sql`ALTER TABLE orders ADD COLUMN checkout_session_expires_at TEXT`.execute(db);
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_session ON orders(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL`.execute(db);
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_provider_intent ON transactions(provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL`.execute(db);
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_entitlements_root_order ON entitlements(order_id) WHERE reissued_from_id IS NULL`.execute(db);
      await db.schema.createTable('payment_event_inbox').ifNotExists()
        .addColumn('provider', 'text', col => col.notNull())
        .addColumn('event_id', 'text', col => col.notNull())
        .addColumn('event_type', 'text', col => col.notNull())
        .addColumn('payload_hash', 'text', col => col.notNull())
        .addColumn('status', 'text', col => col.notNull().defaultTo('received'))
        .addColumn('received_at', 'text', col => col.notNull())
        .addColumn('processed_at', 'text')
        .addColumn('last_error', 'text')
        .addPrimaryKeyConstraint('pk_payment_event_inbox', ['provider', 'event_id'])
        .execute();
      await db.schema.createTable('download_reservations').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('entitlement_id', 'text', col => col.notNull().references('entitlements.id').onDelete('cascade'))
        .addColumn('buyer_id', 'text', col => col.notNull().references('users.id').onDelete('cascade'))
        .addColumn('version_id', 'text', col => col.notNull().references('template_versions.version_id'))
        .addColumn('request_key', 'text', col => col.notNull())
        .addColumn('token_hash', 'text', col => col.notNull().unique())
        .addColumn('status', 'text', col => col.notNull().defaultTo('issued'))
        .addColumn('created_at', 'text', col => col.notNull())
        .addColumn('expires_at', 'text', col => col.notNull())
        .addColumn('consumed_at', 'text')
        .addUniqueConstraint('uq_download_request', ['entitlement_id', 'request_key'])
        .execute();
      await db.schema.createIndex('idx_download_reservations_expiry').ifNotExists().on('download_reservations').columns(['status', 'expires_at']).execute();
      await sql`CREATE TRIGGER IF NOT EXISTS m2_entitlement_requires_paid BEFORE INSERT ON entitlements WHEN NOT EXISTS (SELECT 1 FROM orders WHERE id=NEW.order_id AND payment_status='paid' AND order_status='fulfilled') BEGIN SELECT RAISE(ABORT,'Entitlement requires paid fulfilled order'); END`.execute(db);
    }
  },
  {
    name: '0014_sanitized_artifact_status',
    async up(db) {
      await sql`ALTER TABLE template_files ADD COLUMN artifact_status TEXT NOT NULL DEFAULT 'unverified'`.execute(db);
      await sql`CREATE INDEX IF NOT EXISTS idx_template_files_artifact ON template_files(version_id, kind, artifact_status)`.execute(db);
    }
  },
  {
    name: '0015_m3_email_delivery_logs',
    async up(db) {
      await db.schema.createTable('email_delivery_logs').ifNotExists()
        .addColumn('id', 'text', col => col.primaryKey())
        .addColumn('user_id', 'text', col => col.notNull().references('users.id').onDelete('cascade'))
        .addColumn('recipient', 'text', col => col.notNull())
        .addColumn('kind', 'text', col => col.notNull())
        .addColumn('provider', 'text', col => col.notNull())
        .addColumn('status', 'text', col => col.notNull())
        .addColumn('provider_message_id', 'text')
        .addColumn('error_code', 'text')
        .addColumn('created_at', 'text', col => col.notNull())
        .execute();
      await db.schema.createIndex('idx_email_delivery_logs_user').ifNotExists().on('email_delivery_logs').columns(['user_id', 'created_at']).execute();
      await sql`CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_created ON email_delivery_logs(created_at DESC)`.execute(db);
    }
  },
  {
    name: '0016_m3_complaints_refunds',
    async up(db) {
      await sql`ALTER TABLE complaints ADD COLUMN idempotency_key TEXT`.execute(db);
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_complaints_idempotency ON complaints(idempotency_key) WHERE idempotency_key IS NOT NULL`.execute(db);
      await sql`CREATE TABLE IF NOT EXISTS refund_requests (
        id TEXT PRIMARY KEY,
        complaint_id TEXT NOT NULL REFERENCES complaints(id),
        order_id TEXT NOT NULL REFERENCES orders(id),
        requested_by TEXT NOT NULL REFERENCES users(id),
        amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
        currency TEXT NOT NULL CHECK (currency IN ('USD','USDT')),
        status TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','rejected')),
        stripe_refund_id TEXT,
        stripe_payment_intent TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        failure_reason TEXT,
        product_refund_cents INTEGER NOT NULL CHECK (product_refund_cents >= 0),
        tax_refund_cents INTEGER NOT NULL CHECK (tax_refund_cents >= 0),
        platform_fee_reversal_cents INTEGER NOT NULL CHECK (platform_fee_reversal_cents >= 0),
        seller_reversal_cents INTEGER NOT NULL CHECK (seller_reversal_cents >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (product_refund_cents = platform_fee_reversal_cents + seller_reversal_cents)
      )`.execute(db);
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_requests_active ON refund_requests(complaint_id) WHERE status IN ('pending','succeeded')`.execute(db);
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_requests_stripe ON refund_requests(stripe_refund_id) WHERE stripe_refund_id IS NOT NULL`.execute(db);
      await sql`CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status, created_at)`.execute(db);
      await sql`ALTER TABLE transactions ADD COLUMN refund_request_id TEXT REFERENCES refund_requests(id)`.execute(db);
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_refund_request ON transactions(refund_request_id) WHERE refund_request_id IS NOT NULL`.execute(db);
      await sql`CREATE INDEX IF NOT EXISTS idx_transactions_order_type_status ON transactions(order_id, type, status)`.execute(db);
      await sql`CREATE INDEX IF NOT EXISTS idx_complaints_status_created ON complaints(status, created_at)`.execute(db);
    }
  },
  {
    name: '0017_m3_takedown_and_fees',
    async up(db) {
      await sql`CREATE TABLE IF NOT EXISTS template_takedowns (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES template_products(id),
        mode TEXT NOT NULL CHECK (mode IN ('suspend','remove')),
        reason TEXT NOT NULL,
        actor_id TEXT NOT NULL REFERENCES users(id),
        previous_status TEXT NOT NULL,
        entitlements_revoked INTEGER NOT NULL DEFAULT 0 CHECK (entitlements_revoked IN (0,1)),
        created_at TEXT NOT NULL
      )`.execute(db);
      await sql`CREATE INDEX IF NOT EXISTS idx_takedowns_template ON template_takedowns(template_id, created_at DESC)`.execute(db);
      await sql`ALTER TABLE orders ADD COLUMN platform_fee_bps INTEGER NOT NULL DEFAULT 0 CHECK (platform_fee_bps BETWEEN 0 AND 10000)`.execute(db);
      await sql`CREATE INDEX IF NOT EXISTS idx_orders_seller_paid ON orders(seller_id, paid_at)`.execute(db);
      await sql`CREATE INDEX IF NOT EXISTS idx_orders_seller_status_paid ON orders(seller_id, payment_status, paid_at)`.execute(db);
    }
  }
];

const downTables: Record<string, readonly string[]> = {
  '0001_auth_users_sessions': ['auth_sessions', 'users'],
  '0002_templates_versions_proofs_previews': ['preview_assets', 'license_proofs', 'template_files', 'template_versions', 'template_products'],
  '0003_refund_policies_orders': ['order_items', 'orders', 'refund_policies'],
  '0004_transactions_entitlements_complaints_audit': ['idempotency_keys', 'scan_jobs', 'audit_logs', 'complaint_timeline', 'complaint_evidence', 'complaints', 'entitlements', 'transactions'],
  '0015_m3_email_delivery_logs': ['email_delivery_logs'],
  '0016_m3_complaints_refunds': ['refund_requests'],
  '0017_m3_takedown_and_fees': ['template_takedowns']
};
for (const migration of migrations) {
  const tables = downTables[migration.name];
  if (tables) migration.down = async db => { for (const table of tables) await sql.raw(`DROP TABLE IF EXISTS ${table}`).execute(db); };
}

export default migrations;
