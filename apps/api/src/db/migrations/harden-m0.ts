import { sql, type Kysely } from 'kysely';
import type { Database } from '../types.js';
import * as E from '@shared/enums/domain.js';
import { decode, filesSchema, timelineSchema } from '@shared/schemas/domain.js';

const values = (items: readonly string[]) => items.map(item => `'${item}'`).join(',');
const member = (column: string, items: readonly string[]) => `${column} IN (${values(items)})`;
const safe = (column: string) => `(typeof(${column}) = 'integer' AND ${column} BETWEEN 0 AND 9007199254740991)`;
const boolean = (column: string) => `(typeof(${column}) = 'integer' AND ${column} IN (0,1))`;
const json = (column: string, type: 'array' | 'object') => `(json_valid(${column}) AND json_type(${column}) = '${type}')`;
const decimal = (column: string) => `(typeof(${column}) = 'text' AND length(${column}) > 0 AND ${column} NOT GLOB '*[^0-9.]*' AND ${column} GLOB '[0-9]*' AND ${column} NOT LIKE '%.%.%' AND ${column} NOT LIKE '%.' AND replace(replace(${column},'0',''),'.','') <> '')`;
const utc = (column: string, nullable = false) => `(${nullable ? `${column} IS NULL OR ` : ''}(typeof(${column}) = 'text' AND length(${column}) = 24 AND ${column} GLOB '????-??-??T??:??:??.???Z' AND julianday(${column}) IS NOT NULL AND strftime('%Y-%m-%dT%H:%M:%fZ',${column},'+0 days') = ${column}))`;
const checks: Record<string, string[]> = {
  users: [member('auth_status', E.AUTH_STATUSES), json('roles_json', 'array'), utc('created_at'), utc('updated_at'), utc('email_verified_at', true)],
  auth_sessions: [utc('expires_at'), utc('created_at'), utc('revoked_at', true), 'expires_at > created_at'],
  template_products: [member('status', E.TEMPLATE_STATUSES), safe('price_usd_cents'), safe('rating_count'), 'rating BETWEEN 0 AND 5', json('name_json', 'object'), json('summary_json', 'object'), json('tags_json', 'array'), json('license_types_json', 'array'), json('license_pricing_json', 'array'), 'json_valid(sales_recent_json)', json('early_signal_json', 'object'), utc('created_at'), utc('updated_at'), utc('published_at', true), utc('ranking_updated_at', true)],
  template_versions: [member('scan_status', E.SCAN_STATUSES), boolean('conflict_flag'), boolean('immutable'), json('conflict_reasons_json', 'array'), json('package_license_json', 'object'), `COALESCE(${member("json_extract(package_license_json,'$.parserStatus')", E.PARSER_STATUSES)},0)`, utc('created_at'), utc('submitted_at', true), utc('approved_at', true)],
  template_files: [member('kind', E.FILE_KINDS), safe('size_bytes'), 'length(sha256) = 64 AND sha256 NOT GLOB \'*[^0-9a-fA-F]*\''],
  license_proofs: [boolean('conflict_flag'), member('verification_status', E.VERIFICATION_STATUSES), member('url_authority_status', E.URL_AUTHORITY_STATUSES), json('declaration_items_json', 'array'), json('signer_json', 'object'), json('proof_files_json', 'array'), utc('created_at'), utc('updated_at'), utc('captured_at', true), utc('reviewed_at', true)],
  preview_assets: [member('kind', E.PREVIEW_KINDS), member('license_status', E.PREVIEW_LICENSE_STATUSES), safe('size_bytes'), utc('created_at'), utc('reviewed_at', true)],
  refund_policies: [safe('window_days'), boolean('manual_review_required'), boolean('is_active'), json('eligible_json', 'array'), json('exclusions_json', 'array'), json('window_exempt_reasons_json', 'array'), utc('created_at')],
  orders: [member('license_type', E.LICENSE_TYPES), decimal('license_price_factor'), safe('price_cents'), safe('payment_amount_minor'), safe('platform_fee_cents'), safe('seller_amount_cents'), "pricing_currency = 'USD'", member('payment_currency', E.PAYMENT_CURRENCIES), member('payment_status', E.PAYMENT_STATUSES), member('order_status', E.ORDER_STATUSES), 'platform_fee_cents = price_cents - seller_amount_cents', json('tax_snapshot_json', 'object'), json('refund_policy_snapshot_json', 'object'),
    "COALESCE(json_type(refund_policy_snapshot_json,'$.windowDays') = 'integer' AND json_extract(refund_policy_snapshot_json,'$.windowDays') BETWEEN 0 AND 9007199254740991 AND json_type(refund_policy_snapshot_json,'$.eligible') = 'array' AND json_type(refund_policy_snapshot_json,'$.exclusions') = 'array' AND json_type(refund_policy_snapshot_json,'$.windowExemptReasons') = 'array' AND json_type(refund_policy_snapshot_json,'$.manualReviewRequired') IN ('true','false'),0)",
    "(payment_currency = 'USD' AND payment_amount_minor = price_cents AND quote_rate_json IS NULL AND quote_expires_at IS NULL) OR (payment_currency = 'USDT' AND quote_rate_json IS NOT NULL AND json_valid(quote_rate_json) AND json_type(quote_rate_json,'$.usdToUsdt') = 'text' AND quote_expires_at IS NOT NULL)",
    "payment_status NOT IN ('paid','partially_refunded','refunded') OR paid_at IS NOT NULL", utc('created_at'), utc('updated_at'), utc('paid_at', true), utc('quote_expires_at', true)],
  order_items: [member('license_type', E.LICENSE_TYPES), safe('price_cents')],
  transactions: [member('type', E.TRANSACTION_TYPES), member('status', E.TRANSACTION_STATUSES), member('currency', E.PAYMENT_CURRENCIES), safe('amount_minor'), safe('pricing_amount_usd_cents'), boolean('signature_verified'), utc('created_at'), utc('processed_at', true)],
  entitlements: [member('status', E.ENTITLEMENT_STATUSES), member('license_type', E.LICENSE_TYPES), 'max_downloads = 10', safe('download_count'), 'download_count <= max_downloads', 'reissued_from_id IS NULL OR reissued_from_id <> id', 'reissued_to_id IS NULL OR reissued_to_id <> id', utc('expires_at'), utc('created_at'), utc('updated_at'), utc('last_downloaded_at', true)],
  complaints: [member('reason', E.COMPLAINT_REASONS), member('status', E.COMPLAINT_STATUSES), member('review_route', E.REVIEW_ROUTES), member('refund_decision', E.REFUND_DECISIONS), `(refund_amount_usd_cents IS NULL OR ${safe('refund_amount_usd_cents')})`, utc('created_at'), utc('updated_at')],
  complaint_timeline: [utc('at')],
  audit_logs: ["actor_type IN ('user','system')", json('diff_json', 'array'), 'json_array_length(diff_json) > 0', utc('at')],
  scan_jobs: [member('status', E.SCAN_STATUSES), utc('created_at'), utc('updated_at')],
  idempotency_keys: ['response_json IS NULL OR json_valid(response_json)', utc('created_at')]
};

const triggerNames: string[] = [];
async function trigger(db: Kysely<Database>, name: string, body: string): Promise<void> {
  triggerNames.push(name);
  await sql.raw(`CREATE TRIGGER IF NOT EXISTS ${name} ${body}`).execute(db);
}

/** Non-destructive upgrade: SQLite permits table CHECKs on an added guard column. */
export async function hardenM0(db: Kysely<Database>): Promise<void> {
  const columns = await sql<{ name: string }>`PRAGMA table_info(template_versions)`.execute(db);
  if (columns.rows.some(column => column.name === 'files_json')) {
    const versions = await sql<{ version_id: string; files_json: string }>`SELECT version_id, files_json FROM template_versions`.execute(db);
    for (const version of versions.rows) {
      for (const file of decode(filesSchema, version.files_json)) {
        const existing = await db.selectFrom('template_files').selectAll().where('file_id', '=', file.fileId).executeTakeFirst();
        const row = { file_id: file.fileId, version_id: version.version_id, kind: file.kind, storage_key: file.storageKey, filename: file.filename, mime_type: file.mimeType, size_bytes: file.sizeBytes, sha256: file.sha256 };
        if (existing && Object.entries(row).some(([key, value]) => existing[key as keyof typeof existing] !== value)) throw new Error(`Conflicting normalized template file ${file.fileId}.`);
        if (!existing) await db.insertInto('template_files').values(row).execute();
      }
    }
    await sql`ALTER TABLE template_versions DROP COLUMN files_json`.execute(db);
  }
  await sql`ALTER TABLE orders ADD COLUMN quote_id TEXT`.execute(db);
  await sql`ALTER TABLE preview_assets ADD COLUMN review_notes TEXT`.execute(db);
  for (const column of ['chain', 'tx_hash', 'from_address', 'to_address']) await sql.raw(`ALTER TABLE transactions ADD COLUMN ${column} TEXT`).execute(db);
  for (const column of ['confirmations', 'required_confirmations']) await sql.raw(`ALTER TABLE transactions ADD COLUMN ${column} INTEGER CHECK (${column} IS NULL OR ${safe(column)})`).execute(db);
  const complaints = await sql<{ id: string; timeline_json: string }>`SELECT id,timeline_json FROM complaints`.execute(db);
  for (const complaint of complaints.rows) {
    const events = decode(timelineSchema, complaint.timeline_json);
    const existing = await db.selectFrom('complaint_timeline').selectAll().where('complaint_id', '=', complaint.id).execute();
    for (let index = 0; index < events.length; index++) {
      const event = events[index]!;
      if (!existing.some(row => row.event === event.event && row.actor_id === event.actorId && row.note === event.note && row.at === event.at)) await db.insertInto('complaint_timeline').values({ id: `${complaint.id}:legacy:${index}`, complaint_id: complaint.id, event: event.event, actor_id: event.actorId, note: event.note, at: event.at }).execute();
    }
  }
  await sql`ALTER TABLE complaints DROP COLUMN timeline_json`.execute(db);
  // Preserve the original numeric contract, repairing the initial adapter's zero-sales object.
  await sql`UPDATE template_products SET sales_recent_json = CAST(json_extract(sales_recent_json, '$.sales7d') AS TEXT) WHERE json_type(sales_recent_json) = 'object' AND json_type(sales_recent_json,'$.sales7d') = 'integer'`.execute(db);
  for (const [table, rules] of Object.entries(checks)) {
    await sql.raw(`ALTER TABLE ${table} ADD COLUMN _m0_guard INTEGER NOT NULL DEFAULT 0 CHECK (_m0_guard = 0 AND ${rules.map(rule => `(${rule})`).join(' AND ')})`).execute(db);
  }
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_template_version_label ON template_versions(template_id, version)`.execute(db);
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_license_proof_version ON license_proofs(version_id)`.execute(db);
  await sql`INSERT INTO order_items(order_id, template_id, version_id, license_type, price_cents) SELECT id, template_id, version_id, license_type, price_cents FROM orders WHERE NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = orders.id)`.execute(db);
  const invalid = await sql<{ id: string }>`SELECT o.id FROM orders o JOIN order_items i ON i.order_id=o.id WHERE i.template_id<>o.template_id OR i.version_id<>o.version_id OR i.license_type<>o.license_type OR i.price_cents<>o.price_cents`.execute(db);
  if (invalid.rows.length) throw new Error('Existing order items conflict with their orders.');
  await trigger(db, 'm0_order_item_insert', `AFTER INSERT ON orders BEGIN INSERT INTO order_items(order_id,template_id,version_id,license_type,price_cents) VALUES(NEW.id,NEW.template_id,NEW.version_id,NEW.license_type,NEW.price_cents); END`);
  for (const action of ['INSERT', 'UPDATE']) {
    await trigger(db, `m0_item_match_${action.toLowerCase()}`, `BEFORE ${action} ON order_items WHEN NOT EXISTS (SELECT 1 FROM orders WHERE id=NEW.order_id AND template_id=NEW.template_id AND version_id=NEW.version_id AND license_type=NEW.license_type AND price_cents=NEW.price_cents) BEGIN SELECT RAISE(ABORT,'Order item must match its order'); END`);
    for (const table of ['orders', 'license_proofs', 'preview_assets']) {
      const seller = table === 'orders' ? ' AND p.seller_id=NEW.seller_id' : '';
      await trigger(db, `m0_${table}_version_${action.toLowerCase()}`, `BEFORE ${action} ON ${table} WHEN NOT EXISTS (SELECT 1 FROM template_versions v JOIN template_products p ON p.id=v.template_id WHERE v.version_id=NEW.version_id AND v.template_id=NEW.template_id${seller}) BEGIN SELECT RAISE(ABORT,'Template/version ownership mismatch'); END`);
    }
    for (const table of ['entitlements', 'complaints']) {
      const license = table === 'entitlements' ? ' AND o.license_type=NEW.license_type' : '';
      await trigger(db, `m0_${table}_order_${action.toLowerCase()}`, `BEFORE ${action} ON ${table} WHEN NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.template_id=NEW.template_id AND o.version_id=NEW.version_id${license}) BEGIN SELECT RAISE(ABORT,'Order identity mismatch'); END`);
    }
    await trigger(db, `m0_complaint_entitlement_${action.toLowerCase()}`, `BEFORE ${action} ON complaints WHEN NEW.entitlement_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entitlements e WHERE e.id=NEW.entitlement_id AND e.order_id=NEW.order_id AND e.template_id=NEW.template_id AND e.version_id=NEW.version_id) BEGIN SELECT RAISE(ABORT,'Complaint entitlement mismatch'); END`);
    await trigger(db, `m0_policy_reasons_${action.toLowerCase()}`, `BEFORE ${action} ON refund_policies WHEN EXISTS (SELECT 1 FROM json_each(NEW.window_exempt_reasons_json) WHERE type <> 'text' OR value NOT IN (${values(E.COMPLAINT_REASONS)})) BEGIN SELECT RAISE(ABORT,'Invalid exemption reason'); END`);
    await trigger(db, `m0_user_roles_${action.toLowerCase()}`, `BEFORE ${action} ON users WHEN json_array_length(NEW.roles_json)=0 OR EXISTS (SELECT 1 FROM json_each(NEW.roles_json) WHERE type <> 'text' OR value NOT IN (${values(E.USER_ROLES)})) BEGIN SELECT RAISE(ABORT,'Invalid user role'); END`);
  }
  await trigger(db, 'm0_item_delete', `BEFORE DELETE ON order_items WHEN EXISTS (SELECT 1 FROM orders WHERE id=OLD.order_id) BEGIN SELECT RAISE(ABORT,'Order requires exactly one item'); END`);
  await trigger(db, 'm0_order_snapshot_immutable', `BEFORE UPDATE OF buyer_id,seller_id,template_id,version_id,license_type,license_price_factor,price_cents,refund_policy_version,refund_policy_snapshot_json ON orders WHEN NEW.buyer_id<>OLD.buyer_id OR NEW.seller_id<>OLD.seller_id OR NEW.template_id<>OLD.template_id OR NEW.version_id<>OLD.version_id OR NEW.license_type<>OLD.license_type OR NEW.license_price_factor<>OLD.license_price_factor OR NEW.price_cents<>OLD.price_cents OR NEW.refund_policy_version<>OLD.refund_policy_version OR NEW.refund_policy_snapshot_json<>OLD.refund_policy_snapshot_json BEGIN SELECT RAISE(ABORT,'Order snapshot is immutable'); END`);
  await trigger(db, 'm0_order_active_policy', `BEFORE INSERT ON orders WHEN NOT EXISTS (SELECT 1 FROM refund_policies p WHERE p.is_active=1 AND p.version=NEW.refund_policy_version AND json_extract(NEW.refund_policy_snapshot_json,'$.windowDays')=p.window_days AND json_extract(NEW.refund_policy_snapshot_json,'$.eligible')=p.eligible_json AND json_extract(NEW.refund_policy_snapshot_json,'$.exclusions')=p.exclusions_json AND json_extract(NEW.refund_policy_snapshot_json,'$.windowExemptReasons')=p.window_exempt_reasons_json AND json_extract(NEW.refund_policy_snapshot_json,'$.manualReviewRequired')=p.manual_review_required) BEGIN SELECT RAISE(ABORT,'Order requires the active policy snapshot'); END`);
  const allowed = Object.entries(E.TEMPLATE_TRANSITIONS).flatMap(([from, targets]) => targets.map(to => `(OLD.status='${from}' AND NEW.status='${to}')`)).join(' OR ');
  await trigger(db, 'm0_template_transition', `BEFORE UPDATE OF status ON template_products WHEN NEW.status<>OLD.status AND NOT (${allowed}) BEGIN SELECT RAISE(ABORT,'Invalid template transition'); END`);
  await trigger(db, 'm0_policy_immutable', `BEFORE UPDATE OF id,version,window_days,eligible_json,exclusions_json,window_exempt_reasons_json,manual_review_required,created_at ON refund_policies WHEN NEW.id<>OLD.id OR NEW.version<>OLD.version OR NEW.window_days<>OLD.window_days OR NEW.eligible_json<>OLD.eligible_json OR NEW.exclusions_json<>OLD.exclusions_json OR NEW.window_exempt_reasons_json<>OLD.window_exempt_reasons_json OR NEW.manual_review_required<>OLD.manual_review_required OR NEW.created_at<>OLD.created_at BEGIN SELECT RAISE(ABORT,'Refund policy versions are immutable'); END`);
  await trigger(db, 'm0_policy_no_delete', `BEFORE DELETE ON refund_policies BEGIN SELECT RAISE(ABORT,'Refund policy versions are immutable'); END`);
  for (const action of ['UPDATE', 'DELETE']) await trigger(db, `m0_audit_no_${action.toLowerCase()}`, `BEFORE ${action} ON audit_logs BEGIN SELECT RAISE(ABORT,'Audit logs are append only'); END`);
}

/** Explicit manual rollback definition; the migration runner never invokes down. */
export async function undoM0Hardening(db: Kysely<Database>): Promise<void> {
  const triggers = await sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'm0_%'`.execute(db);
  for (const row of triggers.rows) await sql.raw(`DROP TRIGGER ${row.name}`).execute(db);
  await sql`ALTER TABLE template_versions ADD COLUMN files_json TEXT NOT NULL DEFAULT '[]'`.execute(db);
  await sql`UPDATE template_versions SET files_json = COALESCE((SELECT json_group_array(json_object('fileId',file_id,'kind',kind,'storageKey',storage_key,'filename',filename,'mimeType',mime_type,'sizeBytes',size_bytes,'sha256',sha256)) FROM template_files f WHERE f.version_id=template_versions.version_id),'[]')`.execute(db);
  await sql`ALTER TABLE complaints ADD COLUMN timeline_json TEXT NOT NULL DEFAULT '[]'`.execute(db);
  await sql`UPDATE complaints SET timeline_json=COALESCE((SELECT json_group_array(json_object('event',event,'actorId',actor_id,'note',note,'at',at)) FROM complaint_timeline t WHERE t.complaint_id=complaints.id),'[]')`.execute(db);
  await sql`ALTER TABLE orders DROP COLUMN quote_id`.execute(db);
  await sql`ALTER TABLE preview_assets DROP COLUMN review_notes`.execute(db);
  for (const column of ['chain', 'tx_hash', 'from_address', 'to_address', 'confirmations', 'required_confirmations']) await sql.raw(`ALTER TABLE transactions DROP COLUMN ${column}`).execute(db);
  for (const table of Object.keys(checks).reverse()) await sql.raw(`ALTER TABLE ${table} DROP COLUMN _m0_guard`).execute(db);
  await sql`DROP INDEX IF EXISTS idx_template_version_label`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_license_proof_version`.execute(db);
}
