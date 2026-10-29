import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import './layout-primitives.css';
import './styles.css';
import './m0.css';
import { initI18n, resources } from './lib/i18n/i18n';
import { fixtureMode, loadDesignData } from './lib/api/client';
import { authClient, commerceClient, connectClient, adminClient, complaintClient, sellerClient, request, type SessionUser } from './lib/api/http-client';
import { readPreference, savePreference } from './lib/preferences';
import { headerHTML, footerHTML } from './presentation/chrome';
import { createPresentation } from './presentation/render-functions.js';

initI18n();
const dictionaries = Object.fromEntries(Object.entries(resources).map(([locale, bundle]) => [locale, Object.fromEntries(Object.entries(bundle.translation).map(([key, value]) => [key, value.replace(/\{\{(\w+)\}\}/g, '{$1}')]))]));
interface TemplateView { id: string; priceUsdCents: number; licenseTypes: string[]; }
interface Filters { q: string; category: string; priceMin: number; priceMax: number; license: string; sort: string; }
const initialFilters: Filters = { q: '', category: 'all', priceMin: 0, priceMax: 100, license: 'any', sort: 'mixed' };

function AuthDialog({ close, complete }: { close: () => void; complete: (user: SessionUser) => void }) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => previous?.focus(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      if (pendingVerification) { complete(await authClient.verifyEmail(verificationCode)); close(); return; }
      const result = await authClient.authenticate(mode, { email: String(form.get('email')), password: String(form.get('password')), ...(mode === 'register' ? { displayName: String(form.get('displayName')) } : {}) });
      if (mode === 'register' && result.authStatus === 'pending_email') { setPendingVerification(true); await authClient.resendVerification(); return; }
      complete(result); close();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('ui.error')); }
    finally { setBusy(false); }
  }
  async function resend() { setBusy(true); setError(''); try { await authClient.resendVerification(); } catch (reason) { setError(reason instanceof Error ? reason.message : t('ui.error')); } finally { setBusy(false); } }
  return <dialog ref={dialog} className="dlg" onCancel={close} aria-labelledby="auth-title"><div className="dlg-body"><div className="dlg-head"><h2 id="auth-title">{pendingVerification ? t('auth.verifyTitle') : t(`auth.${mode}`)}</h2><button className="btn btn-ghost" onClick={close} aria-label={t('ui.close')}>×</button></div><form className="dlg-body-inner" onSubmit={event => void submit(event)}>{pendingVerification ? <><p>{t('auth.verifyInstructions')}</p><div className="field"><label className="field-label" htmlFor="auth-code">{t('auth.verificationCode')}</label><input className="input" id="auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={event => setVerificationCode(event.target.value)} required /></div><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void resend()}>{t('auth.resendCode')}</button></> : <>{mode === 'register' && <div className="field"><label className="field-label" htmlFor="auth-name">{t('auth.name')}</label><input className="input" id="auth-name" name="displayName" required autoComplete="name" maxLength={80}/></div>}<div className="field"><label className="field-label" htmlFor="auth-email">{t('auth.email')}</label><input className="input" id="auth-email" name="email" type="email" required autoComplete="email" autoFocus/></div><div className="field"><label className="field-label" htmlFor="auth-password">{t('auth.password')}</label><input className="input" id="auth-password" name="password" type="password" minLength={10} maxLength={128} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required/></div></>}{error && <p className="field-error" role="alert">{error}</p>}<div className="dlg-actions">{!pendingVerification && <button className="btn btn-secondary" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{t(mode === 'login' ? 'auth.register' : 'auth.login')}</button>}<button className="btn btn-primary" disabled={busy}>{busy ? t('common.loading') : pendingVerification ? t('auth.verifySubmit') : t(`auth.${mode}`)}</button></div></form></div></dialog>;
}

function FinalDesign() {
  const { t, i18n } = useTranslation();
  const location = useLocation(); const navigate = useNavigate(); const root = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  const [theme, setTheme] = useState(() => readPreference('mb-theme', 'light'));
  const [user, setUser] = useState<SessionUser | null>(null); const [authOpen, setAuthOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false); const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [tab, setTab] = useState('overview'); const [licenseChoice, setLicenseChoice] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState('USD'); const [complaintId, setComplaintId] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState('queue'); const [adminSelected, setAdminSelected] = useState<string | null>(null); const [adminReason, setAdminReason] = useState('');
  const [adminComplaints, setAdminComplaints] = useState<import('./lib/api/models').AdminComplaintItem[]>([]);
  const [adminTemplates, setAdminTemplates] = useState<Array<{ id: string; name: { en?: string; zh?: string }; status: string; priceUsdCents: number; version: string; currentVersionId: string | null; sellerId: string; updatedAt: string }>>([]);
  const [adminAudit, setAdminAudit] = useState<import('./lib/api/models').AuditItem[]>([]);
  const [earnings, setEarnings] = useState<import('./lib/api/models').SellerEarnings | null>(null); const [earningsRange, setEarningsRange] = useState(30);
  const [complaintDraft, setComplaintDraft] = useState<{ entitlementId: string; reason: string; description: string }>({ entitlementId: '', reason: 'materially_not_as_described', description: '' });
  const [dialogTitle, setDialogTitle] = useState(''); const [dialogBusy, setDialogBusy] = useState(false);
  const [connectState, setConnectState] = useState<'idle'|'creating'|'pending'|'restricted'|'active'>('idle');
  const [connectAccountId, setConnectAccountId] = useState('');
  const [sell, setSell] = useState<Record<string, unknown>>({ name: '', category: '', summary: '', priceCents: '', previews: [], pkgName: '', pkgSize: 0, pkgFileName: '', pkgFile: null, scanning: false, scanned: false, scanJobId: '', scanStatus: '', scanFindings: [], scanDetected: '', scanExcerpt: '', parserStatus: '', licenseType: '', decl: [false, false, false], signer: '', signDate: new Date().toISOString().slice(0, 10), proofFiles: [], proofFileObjects: [], proofLink: '', urlStatus: '', urlCapturedAt: '', urlSummary: '', errors: {}, showErrors: false, submitted: false, manualReview: false, templateId: '', versionId: '' });
  const [toast, setToast] = useState(''); const [dialogContent, setDialogContent] = useState(''); const infoDialog = useRef<HTMLDialogElement>(null);
  const route = location.pathname.startsWith('/templates/') ? 'detail' : ({ '/': 'market', '/seller': 'seller', '/seller/earnings': 'earnings', '/library': 'library', '/complaints': 'complaints', '/admin': 'admin' } as Record<string, string>)[location.pathname] ?? 'notfound';
  const detailId = route === 'detail' ? decodeURIComponent(location.pathname.slice('/templates/'.length)) : null;
  useEffect(() => { let active = true; setError(''); void loadDesignData().then(value => { if (active) setData(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : t('ui.error')); }); return () => { active = false; }; }, [attempt]);
  useEffect(() => { let active = true; void authClient.restore().then(async value => { if (!active) return; setUser(value); if (value && location.pathname === '/library') { try { const result = await commerceClient.entitlements(); if (active) setData(old => old ? { ...old, entitlements: result.items } : old); } catch { if (active) setToast(t('ui.error')); } } if (value?.roles.includes('seller') && value.authStatus === 'verified') { try { const result = await connectClient.status(); if (result.account) { setConnectAccountId(result.account.stripe_account_id); setConnectState(result.account.onboarding_status as 'pending'|'restricted'|'active'); } } catch { /* Seller status remains unknown until the next explicit action. */ } } }).catch(() => {}); return () => { active = false; }; }, []);
  const isAdmin = Boolean(user?.roles.includes('admin')); const isSeller = Boolean(user?.roles.includes('seller'));
  useEffect(() => { let active = true; if (fixtureMode || !user) return; void (async () => {
    try {
      if (route === 'library' || route === 'complaints') {
        const [entitlements, complaints] = await Promise.all([commerceClient.entitlements(), complaintClient.list()]);
        if (active) setData(old => old ? { ...old, entitlements: entitlements.items, complaints: complaints.items } : old);
      }
      if (route === 'admin' && isAdmin) {
        const [reviews, complaints, audit, templates] = await Promise.all([adminClient.reviews(), adminClient.complaints(), adminClient.audit(), adminClient.templates()]);
        if (!active) return;
        const submissions = reviews.items.map(item => ({ id: String(item.versionId), title: { en: String(item.versionId) }, seller: '', submittedAt: '', parserStatus: '', scanStatus: '', scanJobId: '', conflictFlag: false, conflictReasons: [], urlAuthorityStatus: '', pageSummary: null, packageLicense: { file: null, excerpt: null } }));
        setAdminComplaints(complaints.items); setAdminTemplates(templates.items);
        setAdminAudit(audit.items.map(item => ({ id: String(item.id), at: String(item.at), actor: String((item.actor as { id?: string } | undefined)?.id ?? ''), targetId: String(item.targetId ?? ''), diff: (item.diff as Array<{ field: string; before: string; after: string }> | undefined) ?? [] })));
        setData(old => old ? { ...old, submissions, audit: audit.items.map(item => ({ id: String(item.id), at: String(item.at), actor: String((item.actor as { id?: string } | undefined)?.id ?? ''), targetId: String(item.targetId ?? ''), diff: (item.diff as Array<{ field: string; before: string; after: string }> | undefined) ?? [] })) } : old);
      }
      if (route === 'earnings' && isSeller) {
        const to = new Date(); const from = new Date(to.getTime() - earningsRange * 24 * 60 * 60 * 1000);
        const result = await sellerClient.earnings(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
        if (active) setEarnings(result);
      }
    } catch (reason) { if (active) setToast(reason instanceof Error ? reason.message : t('ui.error')); }
  })(); return () => { active = false; }; }, [route, user, attempt, earningsRange, isAdmin, isSeller, t]);
  useEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.themePreference = theme; savePreference('mb-theme', theme); }, [theme]);
  useEffect(() => { document.documentElement.lang = i18n.language; document.title = t('app.title'); savePreference('mb-language', i18n.language); }, [i18n.language, t]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);
  const presentation = useMemo(() => data ? createPresentation(data, dictionaries) : null, [data]);
  const options = { lang: i18n.language, route, loading: !data, listError: Boolean(error), detailId, detailMode: 'approved', tab, licenseChoice, currency, signedIn: fixtureMode || Boolean(user), filters, heroEnter: false, entitlements: data?.entitlements ?? [], complaints: data?.complaints ?? [], audit: (adminAudit.length ? adminAudit : data?.audit) ?? [], admin: { tab: adminTab, selected: adminSelected, reason: adminReason, queue: data?.submissions ?? [], complaints: adminComplaints.length ? adminComplaints : (data?.adminComplaints ?? []), templates: adminTemplates.length ? adminTemplates : (data?.adminTemplates ?? []) }, complaintId, complaintDraft, sell, connectState, earnings: earnings ?? data?.earnings ?? null, earningsRange, isAdmin: fixtureMode || isAdmin, isSeller: fixtureMode || isSeller };
  let html = '';
  try { html = presentation ? presentation.render(options) : `<section class="shell section"><div class="empty"><p class="empty-title">${t(error ? 'market.errorTitle' : 'common.loading')}</p><button class="btn btn-secondary" data-action="retry-list">${t('market.retry')}</button></div></section>`; }
  catch (reason) { html = `<section class="shell section"><div class="empty"><p class="empty-title">${t('market.errorTitle')}</p></div></section>`; console.error('Presentation error', reason); }
  useEffect(() => {
    const node = root.current; if (!node) return;
    node.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n!); });
    node.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach(element => element.setAttribute('aria-label', t(element.dataset.i18nAria!)));
    node.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(element => element.setAttribute('title', t(element.dataset.i18nTitle!)));
    node.querySelectorAll<HTMLElement>('[data-action="set-theme"]').forEach(element => element.setAttribute('aria-pressed', String(element.dataset.themeValue === theme)));
    node.querySelectorAll<HTMLElement>('[data-action="set-lang"]').forEach(element => element.setAttribute('aria-pressed', String(element.dataset.lang === i18n.language)));
    node.querySelectorAll<HTMLElement>('[data-action="set-category"]').forEach(element => element.setAttribute('aria-pressed', String(element.dataset.value === filters.category)));
    const search = node.querySelector<HTMLInputElement>('#q-header'); if (search) { search.placeholder = t('search.placeholder'); search.value = filters.q; }
    for (const action of ['go-library', 'go-admin', 'go-earnings']) node.querySelectorAll<HTMLElement>(`[data-action="${action}"]`).forEach(element => { element.hidden = !fixtureMode && (!user || (action === 'go-admin' && !user.roles.includes('admin')) || (action === 'go-earnings' && !user.roles.includes('seller'))); });
    node.querySelectorAll<HTMLButtonElement>('[data-action="buy"]').forEach(element => { element.disabled = checkoutBusy; });
    node.querySelectorAll<HTMLButtonElement>('[data-action="download-ent"]').forEach(element => { element.disabled = element.dataset.available !== 'true' || downloadBusy === element.dataset.ent; });
    const login = node.querySelector<HTMLElement>('[data-action="login"]'); if (login && user) login.textContent = user.displayName;
    node.querySelectorAll<HTMLElement>('.reveal').forEach(element => element.classList.add('is-in'));
    const fill = node.querySelector<HTMLElement>('#range-fill'); if (fill) { fill.style.left = `${filters.priceMin}%`; fill.style.width = `${filters.priceMax - filters.priceMin}%`; }
  }, [html, filters, theme, i18n.language, user, t]);
  function go(path: string) { navigate(path); window.scrollTo({ top: 0 }); }
  async function startConnectOnboarding() {
    setConnectState('creating');
    try {
      if (!connectAccountId) { const account = await connectClient.createAccount(crypto.randomUUID()); setConnectAccountId(account.stripe_account_id); setConnectState(account.onboarding_status as 'pending'|'restricted'|'active'); }
      const link = await connectClient.onboardingLink(); window.location.assign(link.url);
    }
    catch { setConnectState('idle'); setToast(t('ui.error')); }
  }
  async function beginCheckout(templateId: string) {
    if (fixtureMode) { showUnavailable(); return; }
    if (!user) { setAuthOpen(true); return; }
    if (user.authStatus !== 'verified') { setToast(t('auth.verifyInstructions')); return; }
    const template = (data?.templates as TemplateView[] | undefined)?.find(item => item.id === templateId);
    const licenseType = licenseChoice[templateId] || template?.licenseTypes.find(item => item !== 'custom') || 'commercial_single_project';
    if (licenseType === 'custom') { showUnavailable(); return; }
    setCheckoutBusy(true);
    try {
      const result = await commerceClient.checkout(templateId, licenseType, crypto.randomUUID());
      if (!result.url) throw new Error(t('ui.error'));
      window.location.assign(result.url);
    } catch (reason) { setCheckoutBusy(false); setToast(reason instanceof Error ? reason.message : t('ui.error')); }
  }
  async function beginDownload(entitlementId: string) {
    if (fixtureMode) { showUnavailable(); return; }
    setDownloadBusy(entitlementId);
    try {
      const result = await commerceClient.download(entitlementId);
      const downloadUrl = result.downloadUrl || (result.token ? `/api/v1/downloads/${encodeURIComponent(result.token)}` : '');
      if (!downloadUrl) throw new Error(t('ui.error'));
      window.location.assign(downloadUrl);
    } catch (reason) { setToast(reason instanceof Error ? reason.message : t('ui.error')); }
    finally { setDownloadBusy(null); }
  }
  function switchTheme(nextTheme: 'light' | 'dark', origin: HTMLElement) {
    if (nextTheme === theme) return;
    const rootElement = document.documentElement;
    const rect = origin.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    rootElement.style.setProperty('--theme-x', `${x}px`);
    rootElement.style.setProperty('--theme-y', `${y}px`);
    rootElement.style.setProperty('--theme-r', `${radius}px`);
    const commit = () => setTheme(nextTheme);
    const transitionApi = (document as Document & { startViewTransition?: (callback: () => void) => { finished: Promise<unknown> } }).startViewTransition;
    if (transitionApi && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const transition = transitionApi.call(document, commit);
      void transition.finished.finally(() => {
        rootElement.style.removeProperty('--theme-x');
        rootElement.style.removeProperty('--theme-y');
        rootElement.style.removeProperty('--theme-r');
      });
    } else {
      commit();
      window.setTimeout(() => {
        rootElement.style.removeProperty('--theme-x');
        rootElement.style.removeProperty('--theme-y');
        rootElement.style.removeProperty('--theme-r');
      }, 0);
    }
  }
  function showUnavailable() { setToast(t('ui.unavailable')); }
  function updateSell(patch: Record<string, unknown>) { setSell(old => ({ ...old, ...patch })); }
  function fileSize(bytes: number) { return `${Math.max(1, Math.round(bytes / 1024))} KB`; }
  function handleUpload(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    const kind = input.dataset.upload;
    if (kind === 'package') {
      const file = files[0];
      if (!file) return;
      updateSell({ pkgName: file.name, pkgFileName: file.name, pkgFile: file, pkgSize: file.size, scanStatus: 'pending', scanned: false, scanning: false, scanJobId: '', scanFindings: [], parserStatus: '' });
    } else if (kind === 'proof') {
      const additions = files.map(file => ({ name: file.name, size: fileSize(file.size), type: file.type || 'application/octet-stream', file }));
      setSell(old => ({ ...old, proofFiles: [...(old.proofFiles as Array<Record<string, string>>), ...additions.map(({ file: _file, ...item }) => item)], proofFileObjects: [...(old.proofFileObjects as File[]), ...files] }));
    } else if (kind === 'preview') {
      const additions = files.map(file => ({ name: file.name, url: URL.createObjectURL(file), kind: 'image', licenseName: 'Seller upload', licenseSource: 'seller', licenseStatus: 'pending', file }));
      setSell(old => ({ ...old, previews: [...(old.previews as Array<Record<string, string>>), ...additions] }));
    }
    input.value = '';
  }
  async function submitM1Review() {
    const state = sell;
    if (!state.templateId || !state.versionId) { setToast(t('ui.m1NotConnected')); return; }
    try {
      const proof = await request<{ id: string }>(`/templates/${state.templateId}/versions/${state.versionId}/license-proof`, { method: 'POST', body: JSON.stringify({ declarationVersion: '1', declarationItems: (state.decl as boolean[]).map((accepted, index) => ({ code: `declaration_${index + 1}`, accepted, acceptedAt: accepted ? new Date().toISOString() : null })), signer: { name: String(state.signer || 'Seller'), accountId: user?.id || 'seller' }, signDate: String(state.signDate), proofLink: state.proofLink ? String(state.proofLink) : null }) });
      for (const file of state.proofFileObjects as File[]) { const form = new FormData(); form.append('file', file, file.name); await request(`/templates/${state.templateId}/versions/${state.versionId}/license-proof/files`, { method: 'POST', body: form }); }
      for (const item of state.previews as Array<{ file?: File }>) { if (!item.file) continue; const form = new FormData(); form.append('file', item.file, item.file.name); await request(`/templates/${state.templateId}/versions/${state.versionId}/preview-assets`, { method: 'POST', body: form }); }
      await request(`/templates/${state.templateId}/versions/${state.versionId}/submit-review`, { method: 'POST', body: JSON.stringify({}) });
      updateSell({ submitted: true }); setToast(t('ui.saved')); setAttempt(old => old + 1);
    } catch (error) { setToast(error instanceof Error ? error.message : t('ui.error')); }
  }
  async function reviewDecision(decision: 'approve' | 'reject') {
    const versionId = adminSelected;
    if (!versionId) { setToast(t('ui.unavailable')); return; }
    try { await request(`/admin/reviews/${versionId}/${decision}`, { method: 'POST', body: JSON.stringify({ reason: adminReason || (decision === 'approve' ? 'All evidence is valid' : 'Please revise the submission') }) }); setToast(t('ui.saved')); setAttempt(old => old + 1); setAdminSelected(null); }
    catch (error) { setToast(error instanceof Error ? error.message : t('ui.error')); }
  }
  function openDialog(title: string, content: string) { setDialogTitle(title); setDialogContent(content); queueMicrotask(() => infoDialog.current?.showModal()); }
  async function openRefund(id: string, mode: 'approve' | 'reject') {
    try { const detail = await adminClient.complaint(id); if (presentation) openDialog('', presentation.refundDialog(detail, mode)); }
    catch (reason) { setToast(reason instanceof Error ? reason.message : t('ui.error')); }
  }
  async function confirmRefund(mode: 'approve' | 'reject', id: string, amount: number) {
    if (!id) { setToast(t('ui.error')); return; }
    const reason = (document.getElementById('refund-reason') as HTMLTextAreaElement | null)?.value.trim() ?? '';
    if (reason.length < 8) { setToast(t('adm.refundReasonHint')); return; }
    setDialogBusy(true);
    try {
      if (mode === 'approve') await adminClient.approveRefund(id, { amountUsdCents: amount, reason }, crypto.randomUUID());
      else await adminClient.rejectRefund(id, { reason }, crypto.randomUUID());
      infoDialog.current?.close(); setToast(t(mode === 'approve' ? 'adm.refundDone' : 'adm.refundRejectedToast')); setAttempt(old => old + 1);
    } catch (error) { setToast(error instanceof Error ? error.message : t('ui.error')); }
    finally { setDialogBusy(false); }
  }
  function openTakedown(id: string) {
    const all = (adminTemplates.length ? adminTemplates : (data?.adminTemplates as typeof adminTemplates | undefined) ?? []);
    const template = all.find(item => item.id === id);
    if (!template) { setToast(t('ui.error')); return; }
    if (presentation) openDialog('', presentation.takedownDialog(template));
  }
  async function confirmTakedown(id: string) {
    const mode = (document.querySelector('input[name="takedown-mode"]:checked') as HTMLInputElement | null)?.value === 'remove' ? 'remove' : 'suspend';
    const reason = (document.getElementById('takedown-reason') as HTMLTextAreaElement | null)?.value.trim() ?? '';
    if (reason.length < 8) { setToast(t('adm.takedownReasonHint')); return; }
    setDialogBusy(true);
    try { await adminClient.takedown(id, { mode, reason }, crypto.randomUUID()); infoDialog.current?.close(); setToast(t('adm.takedownDone', { id })); setAttempt(old => old + 1); }
    catch (error) { setToast(error instanceof Error ? error.message : t('ui.error')); }
    finally { setDialogBusy(false); }
  }
  async function submitComplaint() {
    const entitlement = (data?.entitlements as Array<{ id: string; orderId: string }> | undefined)?.find(item => item.id === (complaintDraft.entitlementId || (data?.entitlements as Array<{ id: string }> | undefined)?.[0]?.id));
    if (!entitlement) { setToast(t('cp.noOrder')); return; }
    if (complaintDraft.description.trim().length < 8) { setToast(t('cp.errDetail')); return; }
    setDialogBusy(true);
    try {
      await complaintClient.create({ orderId: entitlement.orderId, entitlementId: entitlement.id, reason: complaintDraft.reason, description: complaintDraft.description.trim() }, crypto.randomUUID());
      setComplaintDraft(old => ({ ...old, description: '' })); setToast(t('cp.submitSuccess')); setAttempt(old => old + 1);
    } catch (error) { setToast(error instanceof Error ? error.message : t('ui.error')); }
    finally { setDialogBusy(false); }
  }
  function startScan() { void runM1Upload(); }
  async function runM1Upload() {
    const state = sell;
    const pkg = state.pkgFile as File | null;
    if (!pkg) { setToast(t('ui.m1NotConnected')); return; }
    updateSell({ scanning: true, errors: {} });
    try {
      const product = await request<{ id: string }>('/templates', { method: 'POST', body: JSON.stringify({ name: { zh: String(state.name || 'Untitled'), en: String(state.name || 'Untitled') }, summary: { zh: String(state.summary || ''), en: String(state.summary || '') }, category: String(state.category || 'intro'), licenseTypes: [String(state.licenseType || 'commercial_single_project')], priceUsdCents: Number(state.priceCents || 0), version: '1.0.0' }) });
      const version = await request<{ versionId: string }>(`/templates/${product.id}/versions`, { method: 'POST', body: JSON.stringify({ version: '1.0.0' }) });
      const session = await request<{ fileId: string; storageKey: string }>(`/templates/${product.id}/versions/${version.versionId}/upload-session`, { method: 'POST', body: JSON.stringify({ filename: pkg.name, contentType: pkg.type || 'application/zip', sizeBytes: pkg.size }) });
      const form = new FormData(); form.append('file', pkg, pkg.name);
      await request(`/templates/${product.id}/versions/${version.versionId}/files/${session.fileId}/content`, { method: 'POST', body: form });
      const finalized = await request<{ scanJobId: string; scanStatus: string; packageLicense?: { parserStatus?: string } }>(`/templates/${product.id}/versions/${version.versionId}/files/${session.fileId}/finalize`, { method: 'POST', body: JSON.stringify({}) });
      updateSell({ templateId: product.id, versionId: version.versionId, scanJobId: finalized.scanJobId, scanStatus: finalized.scanStatus, parserStatus: finalized.packageLicense?.parserStatus || '', scanned: true, scanning: false });
      setToast(t('ui.saved'));
    } catch (error) { updateSell({ scanning: false }); setToast(error instanceof Error ? error.message : t('ui.error')); }
  }
  function click(event: MouseEvent<HTMLDivElement>) {
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-action]'); if (!element) return;
    const { action, value, id } = element.dataset; if (element.tagName === 'A') event.preventDefault();
    if (action === 'go-market') return go('/');
    if (action === 'go-sell') return go('/seller');
    if (action === 'go-library') return go('/library');
    if (action === 'go-admin') return go('/admin');
    if (action === 'go-earnings') return go('/seller/earnings');
    if (action === 'set-earnings-range') { setEarnings(null); setEarningsRange(Number(value) || 30); return; }
    if (action === 'go-complaint') { setComplaintId(element.dataset.ent ?? null); return go('/complaints'); }
    if (action === 'go-detail') { setTab('overview'); return go(`/templates/${encodeURIComponent(id ?? '')}`); }
    if (action === 'buy') { if (id) void beginCheckout(id); return; }
    if (action === 'download-ent') { const entitlementId = element.dataset.ent; if (entitlementId) void beginDownload(entitlementId); return; }
    if (action === 'set-lang') { void i18n.changeLanguage(element.dataset.lang); return; }
    if (action === 'set-theme') { switchTheme(element.dataset.themeValue === 'dark' ? 'dark' : 'light', element); return; }
    if (action === 'set-category') { setFilters(old => ({ ...old, category: value ?? 'all' })); return go('/'); }
    if (action === 'set-license-filter') return setFilters(old => ({ ...old, license: value ?? 'any' }));
    if (action === 'set-sort') return setFilters(old => ({ ...old, sort: value ?? 'mixed' }));
    if (action === 'clear-filters') return setFilters(initialFilters);
    if (action === 'tab') return setTab(element.dataset.tab ?? 'overview');
    if (action === 'set-currency') return setCurrency(value ?? 'USD');
    if (action === 'retry-list') return setAttempt(old => old + 1);
    if (action === 'admin-tab') { setAdminSelected(null); return setAdminTab(element.dataset.tab ?? 'queue'); }
    if (action === 'admin-open') return setAdminSelected(id ?? null);
    if (action === 'admin-back') return setAdminSelected(null);
    if (action === 'sell-choose-package') { document.getElementById('sell-package-file')?.click(); return; }
    if (action === 'sell-choose-proof') { document.getElementById('sell-proof-file')?.click(); return; }
    if (action === 'sell-choose-preview') { document.getElementById('sell-preview-file')?.click(); return; }
    if (action === 'sell-run-scan') { startScan(); return; }
    if (action === 'connect-onboarding') { void startConnectOnboarding(); return; }
    if (action === 'sell-url-check') { setToast(t('ui.saved')); return; }
    if (action === 'sell-submit') { void submitM1Review(); return; }
    if (action === 'admin-approve') { void reviewDecision('approve'); return; }
    if (action === 'admin-reject') { void reviewDecision('reject'); return; }
    if (action === 'refund-open') { if (id) void openRefund(id, 'approve'); return; }
    if (action === 'refund-reject') { if (id) void openRefund(id, 'reject'); return; }
    if (action === 'refund-confirm-approve') { void confirmRefund('approve', id ?? '', Number(element.dataset.amount ?? 0)); return; }
    if (action === 'refund-confirm-reject') { void confirmRefund('reject', id ?? '', 0); return; }
    if (action === 'takedown-open') { if (id) openTakedown(id); return; }
    if (action === 'takedown-confirm') { if (id) void confirmTakedown(id); return; }
    if (action === 'submit-complaint') { void submitComplaint(); return; }
    if (action === 'sell-save-draft') { setToast(t('ui.saved')); return; }
    if (action === 'sell-add-proof' || action === 'sell-add-pending' || action === 'sell-seed-preview' || action === 'sell-remove-proof') { setToast(t('ui.saved')); return; }
    if (action === 'focus-entitlement') return document.getElementById(`ent-${element.dataset.ent}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (action === 'login') return setAuthOpen(true);
    if (action === 'close-dialog') return infoDialog.current?.close();
    if (action === 'open-refund' && presentation) { setDialogTitle(t('footer.refundPolicy')); setDialogContent(presentation.policy()); queueMicrotask(() => infoDialog.current?.showModal()); return; }
    if (action === 'open-license-guide') { setDialogTitle(t('footer.licenseGuide')); setDialogContent(`<p class="dlg-text">${t('guide.p1')}</p><p class="dlg-text">${t('guide.p2')}</p>`); queueMicrotask(() => infoDialog.current?.showModal()); return; }
    showUnavailable();
  }
  function change(event: ChangeEvent<HTMLDivElement>) {
    const element = event.target as HTMLInputElement;
    if (element.dataset.upload) { handleUpload(element); return; }
    if (element.dataset.range) { const n = Number(element.value); setFilters(old => ({ ...old, [element.dataset.range!]: n })); }
    if (element.dataset.license && detailId) setLicenseChoice(old => ({ ...old, [detailId]: element.value }));
    if (element.dataset.sell) { const key = element.dataset.sell; setSell(old => ({ ...old, [key]: key === 'decl' ? (old.decl as boolean[]).map((checked, i) => i === Number(element.dataset.idx) ? element.checked : checked) : element.value })); }
    if (element.dataset.complaint) { const key = element.dataset.complaint as 'entitlementId' | 'reason' | 'description'; setComplaintDraft(old => ({ ...old, [key]: element.value })); }
    if (element.hasAttribute('data-admin-reason')) setAdminReason(element.value);
  }
  function submit(event: FormEvent<HTMLDivElement>) {
    event.preventDefault(); const form = event.target as HTMLFormElement;
    if (form.dataset.action === 'submit-search') { const query = String(new FormData(form).get('q') ?? form.querySelector('input')?.value ?? ''); setFilters(old => ({ ...old, q: query })); go('/'); }
  }
  return <div ref={root} onClick={click} onChange={change} onSubmit={submit} data-fixture-mode={fixtureMode ? 'NON_PRODUCTION' : undefined}><div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: headerHTML }}/><main id="main" className="site-main" tabIndex={-1} dangerouslySetInnerHTML={{ __html: html }}/><div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: footerHTML }}/>{fixtureMode && <small className="fixture-mode" title={t('ui.fixtureBanner')}>NON_PRODUCTION</small>}<div className="toast-host" aria-live="polite">{toast && <div className="toast">{toast}</div>}</div><dialog ref={infoDialog} className="dlg"><div className="dlg-body"><div className="dlg-head"><h2>{dialogTitle || t('footer.refundPolicy')}</h2><button className="btn btn-ghost" onClick={() => infoDialog.current?.close()}>{t('common.close')}</button></div><div className="dlg-body-inner" dangerouslySetInnerHTML={{ __html: dialogContent }}/></div></dialog>{authOpen && <AuthDialog close={() => setAuthOpen(false)} complete={setUser}/>}</div>;
}
export function App() { return <BrowserRouter><FinalDesign/></BrowserRouter>; }
