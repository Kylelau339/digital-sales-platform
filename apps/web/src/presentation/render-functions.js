/* Presentation-only extraction from approved export. No prototype boot, listeners, requests, timers, or business mutation functions. */
export function createPresentation(D, I18N) {
const STATUS_STATE = {
    passed: 'passed', running: 'running', pending: 'pending', failed: 'failed',
    manual_review: 'manual', timed_out: 'timeout', unknown: 'unknown',
    active: 'active', exhausted: 'exhausted', expired: 'expired',
    revoked: 'revoked', reissued: 'reissued',
    submitted: 'submitted', triaged: 'triaged', actioned: 'actioned',
    resolved: 'resolved', rejected: 'rejected',
    approved: 'approved', not_requested: 'not_requested',
    accepted: 'accepted', pending_authority: 'pending'
  };
const STATUS_KEY = {
    passed: 'st.passed', running: 'st.running', pending: 'st.pending',
    failed: 'st.failed', manual: 'st.manual', timeout: 'st.timeout',
    unknown: 'st.unknown',
    active: 'lib.status.active', exhausted: 'lib.status.exhausted',
    expired: 'lib.status.expired', revoked: 'lib.status.revoked',
    reissued: 'lib.status.reissued',
    submitted: 'cp.st.submitted', triaged: 'cp.st.triaged',
    actioned: 'cp.st.actioned', resolved: 'cp.st.resolved', rejected: 'cp.st.rejected',
    approved: 'cp.decision.approved', not_requested: 'cp.decision.not_requested'
  };
const ICONS = {
    check: '<path d="M5 12.5 10 17.5 19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    dot: '<circle cx="12" cy="12" r="4" fill="currentColor"/>',
    info: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v6M12 7.75v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    shield: '<path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6l7-2.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.8 12.2 11 14.4l4.2-4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    alert: '<path d="M12 4.5 21 19.5H3L12 4.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v4.2M12 16.7v.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    close: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    play: '<path d="M9 7.5 17 12l-8 4.5Z" fill="currentColor"/>',
    pause: '<path d="M9 7.5h2.2v9H9zM12.8 7.5H15v9h-2.2z" fill="currentColor"/>',
    upload: '<path d="M12 16.5V6.5M8 10l4-3.5L16 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 16.5v2.2h14v-2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    file: '<path d="M7 3.5h7l4 4v13H7v-17Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3.5v4h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    link: '<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1.2 1.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0L6 13a3.5 3.5 0 0 0 5 5l1.2-1.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    download: '<path d="M12 5v10M8 11.5 12 15.5l4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 18.5h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    search: '<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15 15l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    refresh: '<path d="M19 12a7 7 0 1 1-2.4-5.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M19 4.5V9h-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    box: '<path d="M4.5 8 12 4l7.5 4v8L12 20l-7.5-4V8Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4.5 8 12 12l7.5-4M12 12v8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    tag: '<path d="M4.5 11.2V5h6.2l8.3 8.3-6.2 6.2L4.5 11.2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="8.6" cy="8.6" r="1.3" fill="currentColor"/>',
    clock: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    arrow: '<path d="M5 12h13M13 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    star: '<path d="M12 4.5l2.3 4.9 5.2.7-3.8 3.8.9 5.3L12 16.7l-4.6 2.5.9-5.3L4.5 10.1l5.2-.7L12 4.5Z" fill="currentColor"/>',
    globe: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3.6 12h16.8M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5Z" fill="none" stroke="currentColor" stroke-width="1.5"/>'
  };
let state = {
    lang: 'zh-TW',
    route: 'market',
    loading: true,
    listError: false,
    sortFailureUsed: false,
    detailId: null,
    detailMode: 'live',
    detailDraft: null,
    previewTried: {},
    previewIdx: {},
    playing: false,
    tab: 'overview',
    licenseChoice: {},
    currency: 'USD',
    quote: null,
    orders: {},
    entitlements: D.entitlements.map(function (e) { return Object.assign({}, e); }),
    complaints: D.complaints.map(function (c) { return Object.assign({}, c); }),
    signedIn: false,
    complaintId: null,
    filters: { q: '', category: 'all', priceMin: 0, priceMax: 100, license: 'any', sort: 'mixed' },
    heroEnter: true,
    lastRoute: null,
    admin: { tab: 'queue', selected: null, reason: '', queue: D.submissions.map(function (s) { return JSON.parse(JSON.stringify(s)); }) },
    audit: D.audit.map(function (a) { return JSON.parse(JSON.stringify(a)); }),
    sell: null
  };
function marketHTML() {
    var f = state.filters;
    var chips = ['all', 'intro', 'title', 'bg', '3d', 'product', 'motion'].map(function (c) {
      return '<button type="button" class="chip" data-action="set-category" data-value="' + c + '" aria-pressed="' + (f.category === c) + '">' + esc(catLabel(c)) + '</button>';
    }).join('');
    var rangeHTML =
      '<div class="range-box">' +
        '<span class="range-val" id="range-val">' + priceLabel(f.priceMin, f.priceMax) + '</span>' +
        '<div class="range-sliders">' +
          '<span class="range-track" aria-hidden="true"><span class="range-fill" id="range-fill"></span></span>' +
          '<input type="range" class="range-input" id="price-min" data-range="priceMin" min="0" max="100" step="5" value="' + f.priceMin + '" aria-label="' + esc(t('market.priceMin')) + '">' +
          '<input type="range" class="range-input" id="price-max" data-range="priceMax" min="0" max="100" step="5" value="' + f.priceMax + '" aria-label="' + esc(t('market.priceMax')) + '">' +
        '</div>' +
      '</div>';

    var licBtns = [['any', t('market.licenseAny')], ['commercial_single_project', licShort('commercial_single_project')],
      ['commercial_multi_project', licShort('commercial_multi_project')], ['personal_use', licShort('personal_use')],
      ['custom', licShort('custom')]].map(function (p) {
      return '<button type="button" class="seg-btn" data-action="set-license-filter" data-value="' + p[0] + '" aria-pressed="' + (f.license === p[0]) + '">' + esc(p[1]) + '</button>';
    }).join('');

    var sortBtns = [['mixed', t('market.sortMixed')], ['new_pool', t('market.sortNewPool')],
      ['recent_sales', t('market.sortRecentSales')], ['rating', t('market.sortRating')],
      ['related', t('market.sortRelated')]].map(function (p) {
      return '<button type="button" class="seg-btn" data-action="set-sort" data-value="' + p[0] + '" aria-pressed="' + (f.sort === p[0]) + '">' + esc(p[1]) + '</button>';
    }).join('').replace(/data-action="set-sort"/g, 'data-action="set-sort"');

    var live = liveTemplates();
    var liveCount = live.length;
    var newCount = live.filter(isNew).length;
    var sellerNames = {};
    live.forEach(function (tpl) { sellerNames[tpl.seller.name] = 1; });
    var catCount = {};
    live.forEach(function (tpl) { catCount[tpl.category] = 1; });
    var lastUpdated = live.map(function (tpl) { return tpl.updated; }).sort().pop() || '';

    return '' +
      '<section class="hero"><div class="shell hero-grid">' +
        '<div class="hero-copy">' +
          '<p class="hero-eyebrow">' + esc(t('market.kicker')) + '</p>' +
          '<h1 class="hero-display">' +
            '<span>' + esc(t('market.heroLine1')) + '</span>' +
            '<span>' + esc(t('market.heroLine2')) +
              ' <span class="dot-row" aria-hidden="true"><i class="dot dot-lime"></i><i class="dot dot-orange"></i><i class="dot dot-azure"></i></span>' +
            '</span>' +
            '<span>' + esc(t('market.heroLine3')) + '</span>' +
          '</h1>' +
          '<p class="hero-lede">' + esc(t('market.heroSub')) + '</p>' +
          '<form class="hero-search" role="search" data-action="submit-search">' +
            '<label class="vh" for="q-hero">' + t('search.label') + '</label>' +
            '<input class="input" id="q-hero" type="search" autocomplete="off" value="' + esc(f.q) + '" placeholder="' + esc(t('search.placeholder')) + '" />' +
            '<button class="btn btn-primary" type="submit">' + esc(t('search.submit')) + '</button>' +
          '</form>' +
          '<div class="hero-stats">' +
            '<div class="hero-stat"><span class="hero-stat-num">' + liveCount + '</span><span class="hero-stat-key">' + esc(t('market.statLive')) + '</span></div>' +
            '<div class="hero-stat"><span class="hero-stat-num">' + Object.keys(catCount).length + '</span><span class="hero-stat-key">' + esc(t('market.statCategories')) + '</span></div>' +
            '<div class="hero-stat"><span class="hero-stat-num">' + Object.keys(sellerNames).length + '</span><span class="hero-stat-key">' + esc(t('market.statSellers')) + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="hero-visual">' + heroArtHTML() +
          '<p class="hero-updated">' + icon('clock') + esc(lastUpdated ? t('market.asideUpdated', { date: lastUpdated }) : t('market.asideLive')) + '</p>' +
        '</div>' +
        '<div class="hero-notice">' + icon('shield') +
          '<p><strong>' + esc(t('market.complianceTitle')) + '</strong> ' + esc(t('market.compliance')) + '</p>' +
        '</div>' +
      '</div></section>' +

      '<section class="shell section promo-band" aria-label="' + esc(t('market.categoryBand')) + '">' +
        '<div class="promo-grid">' + promoHTML() + '</div>' +
      '</section>' +

      '<section class="shell section catalogue" id="catalogue">' +
        '<div class="catalogue-head">' +
          '<div>' +
            '<p class="eyebrow">' + esc(t('market.categoryBand')) + '</p>' +
            '<h2 class="section-title">' + esc(t('market.browse')) + '</h2>' +
            '<p class="section-lede">' + esc(t('market.browseSub')) + '</p>' +
          '</div>' +
          '<div id="results-count" class="results-count">' + resultsHeadHTML() + '</div>' +
        '</div>' +
        '<div class="filter-bar">' +
          '<div class="filter-group od-fill">' +
            '<span class="filter-label" id="fl-cat">' + t('market.filterCategory') + '</span>' +
            '<div class="od-cluster" role="group" aria-labelledby="fl-cat">' + chips + '</div>' +
          '</div>' +
          '<div class="filter-group">' +
            '<span class="filter-label" id="fl-price">' + t('market.filterPrice') + '</span>' +
            rangeHTML +
          '</div>' +
          '<div class="filter-group">' +
            '<span class="filter-label" id="fl-license">' + t('market.filterLicense') + '</span>' +
            '<div class="seg-group" role="group" aria-labelledby="fl-license">' + licBtns + '</div>' +
          '</div>' +
          '<div class="filter-group">' +
            '<span class="filter-label" id="fl-sort">' + t('market.filterSort') + '</span>' +
            '<div class="seg-group sort-control" role="group" aria-labelledby="fl-sort">' + sortBtns + '</div>' +
          '</div>' +
        '</div>' +
        '<div id="results">' + resultsHTML() + '</div>' +
      '</section>';
  }

function esc(s) {
    return String(s == null ? '' : s)
      .split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;')
      .split('"').join('&quot;').split("'").join('&#39;');
  }

function catLabel(cat) {
    var map = {
      all: 'nav.all', intro: 'nav.intro', title: 'nav.title', bg: 'nav.bg',
      '3d': 'nav.3d', product: 'nav.product', motion: 'nav.motion'
    };
    return t(map[cat] || 'nav.all');
  }

function t(key, vars) {
    var dict = I18N[state.lang] || I18N['zh-TW'];
    var s = dict[key];
    if (s == null) s = I18N.en[key];
    if (s == null) s = I18N['zh-TW'][key];
    if (s == null) return key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return s;
  }

function priceLabel(min, max) {
    var lo = 'US$' + min;
    var hi = max >= 100 ? 'US$100+' : 'US$' + max;
    return lo + ' – ' + hi;
  }

function licShort(key) {
    var m = licMeta(key);
    if (!m) return key;
    return L(m.short) || L(m.label) || key;
  }

function licMeta(key) { return D.licenseTypes[key] || null; }

function L(o) {
    if (!o) return '';
    if (o[state.lang]) return o[state.lang];
    var zh = state.lang.indexOf('zh') === 0;
    return (zh ? o['zh-TW'] : o.en) || o['zh-TW'] || o.en || '';
  }

function liveTemplates() {
    return D.templates.filter(function (tpl) { return tpl.status === 'approved'; });
  }

function heroArtHTML() {
    return '<div class="hero-art">' +
      '<span class="hero-sticker">' + icon('shield') + esc(t('market.heroBadge')) + '</span>' +
      '<svg class="hero-svg" viewBox="0 0 560 420" aria-hidden="true" focusable="false">' +
        '<g stroke="#111214" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">' +
          '<g class="art-grid">' +
            '<g stroke="#CFCCC0" stroke-width="1.4" fill="none">' +
              '<path d="M320 16h224M320 56h224M320 96h224M320 136h224M320 176h224M320 216h224M320 256h224"/>' +
              '<path d="M320 16v240M360 16v240M400 16v240M440 16v240M480 16v240M520 16v240"/>' +
            '</g>' +
            '<g fill="#E7E4D9" stroke="none">' +
              '<rect x="400" y="16" width="38" height="38"/><rect x="480" y="56" width="38" height="38"/>' +
              '<rect x="360" y="96" width="38" height="38"/><rect x="440" y="136" width="38" height="38"/>' +
              '<rect x="480" y="176" width="38" height="38"/><rect x="360" y="216" width="38" height="38"/>' +
            '</g>' +
          '</g>' +
          '<g class="art-cube art-cube-a">' +
            '<path d="M330 84l34-18 34 18-34 18z" fill="#F7F6F0"/>' +
            '<path d="M330 84v30l34 18V102z" fill="#D9D6CB"/>' +
            '<path d="M398 84v30l-34 18V102z" fill="#BDBAAF"/>' +
          '</g>' +
          '<g class="art-orb art-orb-blue">' +
            '<circle cx="82" cy="330" r="58" fill="#8CC4F5"/>' +
            '<path d="M24 330a58 58 0 0 0 116 0z" fill="#5FA8E8" opacity=".55" stroke="none"/>' +
          '</g>' +
          '<g class="art-arch">' +
            '<path d="M160 394V236c0-58 47-105 105-105s105 47 105 105v158h-46V238c0-33-26-59-59-59s-59 26-59 59v156z" fill="#FF6A2B"/>' +
            '<path d="M206 394V238c0-33 26-59 59-59 12 0 24 4 33 10-42 4-75 39-75 82v123z" fill="#FF8A54" stroke="none"/>' +
          '</g>' +
          '<g transform="rotate(-10 300 304)" class="art-bar">' +
            '<rect x="176" y="276" width="238" height="56" rx="28" fill="#C9F25B"/>' +
            '<ellipse cx="204" cy="304" rx="24" ry="28" fill="#E3FA9A"/>' +
          '</g>' +
          '<path class="art-ground" d="M388 394a58 58 0 0 1 116 0z" fill="#111214"/>' +
          '<g class="art-head">' +
            '<circle cx="432" cy="286" r="46" fill="#F7F6F0"/>' +
            '<path d="M386 286a46 46 0 0 0 92 0c-16 18-76 18-92 0z" fill="#DEDBD0" stroke="none"/>' +
          '</g>' +
          '<circle class="art-bead" cx="286" cy="176" r="30" fill="#F7F6F0"/>' +
          '<g class="art-cube art-cube-b">' +
            '<path d="M458 384l26-14 26 14-26 14z" fill="#F7F6F0"/>' +
            '<path d="M458 384v22l26 14v-22z" fill="#D9D6CB"/>' +
            '<path d="M510 384v22l-26 14v-22z" fill="#BDBAAF"/>' +
          '</g>' +
          '<g class="art-cube art-cube-c">' +
            '<path d="M42 250l22-12 22 12-22 12z" fill="#FF6A2B"/>' +
            '<path d="M42 250v18l22 12v-18z" fill="#D9511B"/>' +
            '<path d="M86 250v18l-22 12v-18z" fill="#EE5F26"/>' +
          '</g>' +
          '<rect class="art-swatch art-swatch-blue" x="24" y="124" width="34" height="34" fill="#8CC4F5" transform="rotate(-8 41 141)"/>' +
          '<rect class="art-swatch art-swatch-lime" x="300" y="350" width="30" height="30" fill="#C9F25B"/>' +
          '<path class="art-line" d="M44 392c38-18 76-18 114 0" fill="none"/>' +
        '</g>' +
      '</svg>' +
    '</div>';
  }

function icon(name) {
    return '<svg class="od-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
  }

function promoHTML() {
    return '<button type="button" class="promo promo-lime" data-action="go-sell">' +
        '<span class="promo-top"><span class="promo-kicker">01 / ' + esc(t('header.sell')) + '</span><span class="promo-arrow">' + icon('arrow') + '</span></span>' +
        '<span class="promo-title">' + esc(t('market.promo1Title')) + '</span>' +
        '<span class="promo-text">' + esc(t('market.promo1Text')) + '</span>' +
        '<span class="promo-avatars" aria-hidden="true"><i>AK</i><i>MO</i><i>RA</i><i class="promo-play">' + icon('play') + '</i></span>' +
      '</button>' +
      '<button type="button" class="promo promo-azure" data-action="open-license-guide">' +
        '<span class="promo-top"><span class="promo-kicker">02 / ' + esc(t('lic.scopeTitle')) + '</span><span class="promo-arrow">' + icon('arrow') + '</span></span>' +
        '<span class="promo-title">' + esc(t('market.promo2Title')) + '</span>' +
        '<span class="promo-text">' + esc(t('market.promo2Text')) + '</span>' +
        '<span class="promo-shape" aria-hidden="true"><i class="shape-blue"></i><i class="shape-orange"></i></span>' +
      '</button>' +
      '<button type="button" class="promo promo-beige" data-action="login">' +
        '<span class="promo-top"><span class="promo-kicker">03 / ' + esc(t('market.promo3Action')) + '</span><span class="promo-arrow">' + icon('arrow') + '</span></span>' +
        '<span class="promo-title">' + esc(t('market.promo3Title')) + '</span>' +
        '<span class="promo-text">' + esc(t('market.promo3Text')) + '</span>' +
        '<span class="promo-cta">' + esc(t('market.promo3Action')) + '</span>' +
      '</button>';
  }

function resultsHeadHTML() {
    var n = state.listError ? 0 : listItems().length;
    var label = state.filters.q
      ? t('market.resultsFor', { q: state.filters.q })
      : t('market.resultsCount', { n: n });
    return '<p class="section-note">' + esc(label) + '</p>';
  }

function listItems() {
    var f = state.filters;
    var items = D.templates.filter(function (tpl) {
      if (!matchesQuery(tpl, f.q)) return false;
      if (tpl.status === 'removed' && !f.q) return false;
      if (f.category !== 'all' && tpl.category !== f.category) return false;
      if (f.license !== 'any' && (tpl.licenseTypes || []).indexOf(f.license) < 0) return false;
      if (tpl.priceUsdCents / 100 < f.priceMin || tpl.priceUsdCents / 100 > f.priceMax) return false;
      return true;
    });

    var mode = f.sort || 'mixed';
    if (mode === 'rating') {
      items.sort(function (a, b) { return b.rating - a.rating; });
      return items;
    }
    if (mode === 'recent_sales') {
      items.sort(function (a, b) { return b.salesRecent - a.salesRecent; });
      return items;
    }
    if (mode === 'new_pool') {
      items.sort(function (a, b) {
        var an = isNew(a) ? 1 : 0, bn = isNew(b) ? 1 : 0;
        if (an !== bn) return bn - an;
        return String(b.publishedAt).localeCompare(String(a.publishedAt));
      });
      return items;
    }
    if (mode === 'related') {
      items.sort(function (a, b) {
        var ac = f.category !== 'all' && a.category === f.category ? 1 : 0;
        var bc = f.category !== 'all' && b.category === f.category ? 1 : 0;
        if (ac !== bc) return bc - ac;
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.salesRecent - a.salesRecent;
      });
      return items;
    }

    /* mixed — mature titles by recent sales, with the new pool spaced through
       the grid at roughly 15–20% of slots. */
    var pool = items.filter(isNew).sort(function (a, b) {
      return String(b.publishedAt).localeCompare(String(a.publishedAt));
    });
    var mature = items.filter(function (x) { return !isNew(x); }).sort(function (a, b) {
      return b.salesRecent - a.salesRecent;
    });
    if (!pool.length) return mature;
    var out = mature.slice();
    pool.forEach(function (item, i) {
      var pos = Math.round(((i + 1) * (mature.length + pool.length)) / (pool.length + 1)) - 1;
      pos = Math.max(0, Math.min(out.length, pos));
      out.splice(pos, 0, item);
    });
    return out;
  }

function matchesQuery(tpl, q) {
    if (!q) return true;
    var hay = [
      tpl.name['zh-TW'], tpl.name.en, tpl.summary['zh-TW'], tpl.summary.en,
      tpl.seller.name, tpl.id
    ].join(' ').toLowerCase();
    return hay.indexOf(q.toLowerCase()) >= 0;
  }

function isNew(tpl) {
    if (tpl.status !== 'approved') return false;
    var cut = new Date(D.today);
    cut.setDate(cut.getDate() - 30);
    return new Date(tpl.publishedAt) >= cut;
  }

function resultsHTML() {
    if (state.listError) {
      return '<div class="empty">' + icon('alert') +
        '<p class="empty-title">' + t('market.errorTitle') + '</p>' +
        '<p class="empty-text">' + t('market.errorText') + '</p>' +
        '<button type="button" class="btn btn-primary" data-action="retry-list">' + icon('refresh') + t('market.retry') + '</button>' +
        '</div>';
    }
    var items = listItems();
    if (!items.length) {
      return '<div class="empty">' + icon('search') +
        '<p class="empty-title">' + t('market.emptyTitle') + '</p>' +
        '<p class="empty-text">' + t('market.emptyText') + '</p>' +
        '<button type="button" class="btn btn-secondary" data-action="clear-filters">' + t('market.clearFilters') + '</button>' +
        '</div>';
    }
    return '<div class="entry-list">' + items.map(function (tpl, i) { return cardHTML(tpl, i); }).join('') + '</div>';
  }

function cardHTML(tpl, idx) {
    var delay = typeof idx === 'number' ? Math.min(idx, 8) * 45 : 0;
    if (tpl.status === 'removed') {
      return '<div class="tombstone reveal" style="--d:' + delay + 'ms">' + icon('box') +
        '<div class="od-fill"><p class="card-title">' + esc(L(tpl.name)) + '</p>' +
        '<p class="section-note">' + esc(L(tpl.removedReason)) + '</p></div>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-action="go-detail" data-id="' + esc(tpl.id) + '">' + t('market.tombstoneAction') + '</button>' +
        '</div>';
    }
    var tags = (tpl.licenseTypes || []).map(function (lic) {
      return '<span class="tag tag-license">' + esc(licShort(lic)) + '</span>';
    }).join('');
    var verified = tpl.seller.verified
      ? '<span class="badge-verified">' + icon('shield') + t('card.verified') + '</span>'
      : '<span class="section-note">' + t('card.unverified') + '</span>';
    var latestV = (tpl.history && tpl.history[0]) ? tpl.history[0].v : '';
    var metaLine = t('card.sales', { n: tpl.salesRecent }) + (latestV ? ' · v' + latestV : '') + ' · ' + tpl.updated;
    var newBadge = isNew(tpl) ? '<span class="entry-new">' + t('market.badgeNew') + '</span>' : '';

    return '<a class="entry reveal" style="--d:' + delay + 'ms" href="#" data-action="go-detail" data-id="' + esc(tpl.id) + '">' +
      '<span class="entry-head">' +
        '<span class="entry-plate" aria-hidden="true"></span>' +
        '<span class="entry-kicker">' + esc(catLabel(tpl.category)) + '</span>' +
        newBadge +
      '</span>' +
      '<span class="entry-media">' +
        '<img class="entry-img" src="' + esc(tpl.image) + '" width="' + tpl.imageW + '" height="' + tpl.imageH + '" alt="' + esc(L(tpl.alt)) + '" loading="lazy" />' +
        '<span class="entry-arrow" aria-hidden="true">' + icon('arrow') + '</span>' +
      '</span>' +
      '<div class="entry-main">' +
        '<h3 class="entry-title">' + esc(L(tpl.name)) + '</h3>' +
        '<div class="entry-seller">' + icon('tag') + '<span class="od-truncate">' + esc(tpl.seller.name) + '</span>' + verified + '</div>' +
      '</div>' +
      '<div class="entry-data">' +
        '<span class="entry-price">' + money(tpl.priceUsdCents) + '</span>' +
        '<span class="entry-rating" aria-label="' + esc(t('detail.rating')) + ' ' + tpl.rating + '">' + icon('star') + '<span>' + tpl.rating.toFixed(1) + '</span></span>' +
        '<div class="entry-tags">' + tags + '</div>' +
        '<span class="entry-meta">' + esc(metaLine) + '</span>' +
      '</div>' +
    '</a>';
  }

function money(cents) {
    if (cents == null) return t('common.none');
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
    } catch (e) {
      return 'US$' + (cents / 100).toFixed(2);
    }
  }

function detailHTML() {
    var tpl = currentTemplate();
    if (!tpl) {
      return '<div class="shell section"><div class="empty">' + icon('search') +
        '<p class="empty-title">' + t('detail.notFoundTitle') + '</p>' +
        '<p class="empty-text">' + t('detail.notFoundText') + '</p>' +
        '<button type="button" class="btn btn-primary" data-action="go-market">' + t('detail.back') + '</button>' +
        '</div></div>';
    }

    var banner = '';
    if (tpl.status === 'removed') {
      banner = '<div class="alert alert-danger">' + icon('alert') + '<div class="od-fill">' +
        '<p class="alert-title">' + t('detail.removedTitle') + '</p>' +
        '<div class="alert-body"><p>' + t('detail.removedText') + '</p>' +
        '<p><strong>' + t('detail.removedReason') + '：</strong>' + esc(L(tpl.removedReason)) + '</p></div></div></div>';
    } else if (state.detailMode === 'review') {
      banner = '<div class="alert alert-warning">' + icon('clock') + '<div class="od-fill">' +
        '<p class="alert-title">' + t('detail.reviewTitle') + '</p>' +
        '<div class="alert-body"><p>' + t('detail.reviewText') + '</p><p>' + t('detail.buyerViewNote') + '</p></div></div></div>';
    }

    return '<div class="shell">' +
      '<nav class="crumb" aria-label="' + esc(t('a11y.breadcrumb')) + '">' +
        '<button type="button" data-action="go-market">' + t('detail.back') + '</button>' +
        '<span aria-hidden="true">/</span><span>' + esc(catLabel(tpl.category)) + '</span>' +
        '<span aria-hidden="true">/</span><span class="od-truncate">' + esc(L(tpl.name)) + '</span>' +
      '</nav>' +
      banner +
      '<div class="detail-layout">' +
        '<div class="reveal">' + previewHTML(tpl) +
          '<div class="tabs">' +
            '<button type="button" class="tab" data-action="tab" data-tab="overview" aria-pressed="' + (state.tab === 'overview') + '">' + t('detail.tabOverview') + '</button>' +
            '<button type="button" class="tab" data-action="tab" data-tab="license" aria-pressed="' + (state.tab === 'license') + '">' + t('detail.tabLicense') + '</button>' +
            '<button type="button" class="tab" data-action="tab" data-tab="versions" aria-pressed="' + (state.tab === 'versions') + '">' + t('detail.tabVersions') + '</button>' +
          '</div>' +
          tabPanelHTML(tpl) +
        '</div>' +
        purchaseHTML(tpl) +
      '</div>' +
    '</div>';
  }

function currentTemplate() {
    if (state.detailDraft && state.detailId === state.detailDraft.id) return state.detailDraft;
    return tplById(state.detailId);
  }

function tplById(id) {
    for (var i = 0; i < D.templates.length; i++) {
      if (D.templates[i].id === id) return D.templates[i];
    }
    return null;
  }

function previewHTML(tpl) {
    var tried = state.previewTried[tpl.id] || 0;
    if (tpl.previewFails && tried === 0) {
      return '<div class="preview-frame"><div class="empty" style="border:0;border-radius:0">' + icon('alert') +
        '<p class="empty-title">' + t('detail.previewErrorTitle') + '</p>' +
        '<p class="empty-text">' + t('detail.previewErrorText') + '</p>' +
        '<button type="button" class="btn btn-primary" data-action="retry-preview">' + icon('refresh') + t('detail.retry') + '</button>' +
        '</div></div>';
    }
    var assets = passedPreviews(tpl);
    if (!assets.length) {
      return '<div class="preview-frame"><div class="empty" style="border:0;border-radius:0">' + icon('clock') +
        '<p class="empty-title">' + t('detail.previewNoMedia') + '</p>' +
        '<p class="empty-text">' + t('sell.assetLicenseHint') + '</p>' +
        '</div></div>';
    }
    var idx = Math.min(state.previewIdx[tpl.id] || 0, assets.length - 1);
    var asset = assets[idx];
    var kind = asset.kind || 'image';
    var media = '<img class="od-media" src="' + esc(asset.url) + '" width="' + tpl.imageW + '" height="' + tpl.imageH + '" alt="' + esc(L(tpl.alt)) + '" />';
    var playBtn = kind === 'video'
      ? '<button type="button" class="preview-play" data-action="toggle-play">' + icon(state.playing ? 'pause' : 'play') +
        '<span>' + (state.playing ? t('detail.pause') : t('detail.play')) + '</span></button>'
      : '';
    var thumbs = assets.length > 1
      ? '<div class="od-cluster" style="margin-top:12px" role="group" aria-label="' + esc(t('sell.assetLicense')) + '">' +
        assets.map(function (a, i) {
          return '<button type="button" class="btn btn-secondary btn-sm" data-action="pick-preview-asset" data-idx="' + i + '" aria-pressed="' + (i === idx) + '">' +
            esc(a.kind === 'video' ? t('detail.play') : t('detail.specResolution')) + ' ' + (i + 1) + '</button>';
        }).join('') + '</div>'
      : '';

    return '<div class="preview-frame">' +
      '<div class="preview-media-wrap' + (state.playing ? ' is-playing' : '') + '">' + media + playBtn + '</div>' +
      '<div class="preview-caption">' +
        (kind === 'image' || tpl.specs.still ? '' : '<span class="od-stat"><span class="od-nowrap">' + esc(tpl.specs.duration) + '</span><span>' + t('detail.specDuration') + '</span></span>') +
        '<span class="od-stat"><span class="od-nowrap">' + esc(tpl.specs.resolution) + '</span><span>' + t('detail.specResolution') + '</span></span>' +
        '<span class="od-stat"><span class="od-nowrap">' + tpl.specs.files + '</span><span>' + t('detail.specFiles') + '</span></span>' +
        '<span class="od-stat"><span class="od-nowrap">' + tpl.specs.fonts + '</span><span>' + t('detail.specFonts') + '</span></span>' +
        '<span class="od-stat"><span class="od-nowrap">' + assets.length + '</span><span>' + t('sell.assetLicense') + '</span></span>' +
      '</div>' +
      thumbs +
    '</div>';
  }

function passedPreviews(tpl) {
    return (tpl.previews || []).filter(function (p) { return p.licenseStatus === 'passed'; });
  }

function tabPanelHTML(tpl) {
    if (state.tab === 'license') {
      return '<div class="tab-panel">' +
        '<p>' + t('detail.licenseNote') + '</p>' +
        '<pre class="license-text">' + esc(tpl.licenseText) + '</pre>' +
      '</div>';
    }
    if (state.tab === 'versions') {
      return '<div class="tab-panel">' + (tpl.history || []).map(function (h) {
        return '<div class="version-row"><span class="version-tag od-nowrap">' + esc(h.v) + '</span>' +
          '<span class="od-fill">' + esc(L(h.note)) + '</span>' +
          '<span class="section-note od-nowrap">' + esc(h.date) + '</span></div>';
      }).join('') + '</div>';
    }
    var specRows = '';
    if (!tpl.specs.still) {
      specRows += '<div class="spec-row"><dt>' + t('detail.specDuration') + '</dt><dd class="od-nowrap">' + esc(tpl.specs.duration) + '</dd></div>';
    }
    specRows += '<div class="spec-row"><dt>' + t('detail.specResolution') + '</dt><dd class="od-nowrap">' + esc(tpl.specs.resolution) + '</dd></div>' +
      '<div class="spec-row"><dt>' + t('detail.specFiles') + '</dt><dd class="od-nowrap">' + esc(String(tpl.specs.files)) + '</dd></div>' +
      '<div class="spec-row"><dt>' + t('detail.specFonts') + '</dt><dd class="od-nowrap">' + esc(String(tpl.specs.fonts)) + '</dd></div>' +
      '<div class="spec-row"><dt>' + t('detail.updated') + '</dt><dd class="od-nowrap">' + esc(tpl.updated) + '</dd></div>' +
      '<div class="spec-row"><dt>' + t('lic.scopeTitle') + '</dt><dd>' + esc(licLabel(chosenLicence(tpl))) + '</dd></div>';
    return '<div class="tab-panel">' +
      '<h3>' + esc(L(tpl.name)) + '</h3>' +
      '<p>' + esc(L(tpl.summary)) + '</p>' +
      '<dl class="spec-list">' + specRows + '</dl>' +
      '<p>' + t('detail.complianceLine') + '</p>' +
    '</div>';
  }

function licLabel(key) {
    var m = licMeta(key);
    if (!m) return key;
    return L(m.label) || t('st.pendingPlatform');
  }

function chosenLicence(tpl) {
    var c = state.licenseChoice[tpl.id];
    if (c && (tpl.licenseTypes || []).indexOf(c) >= 0) return c;
    return defaultLicence(tpl);
  }

function defaultLicence(tpl) {
    var offers = tpl.licenseTypes || [];
    for (var i = 0; i < offers.length; i++) {
      if (offers[i] !== 'custom') return offers[i];
    }
    return offers[0] || 'commercial_single_project';
  }

function purchaseHTML(tpl) {
    var order = state.orders[tpl.id];
    var chosen = chosenLicence(tpl);
    var meta = licMeta(chosen);
    var cents = priceFor(tpl, chosen);
    var blocked = tpl.status !== 'approved' || state.detailMode !== 'live';
    var isCustom = chosen === 'custom';

    var options = (tpl.licenseTypes || []).map(function (lic) {
      var m = licMeta(lic);
      var body = m && m.desc
        ? esc(L(m.desc))
        : '<span class="od-nowrap">' + t('lic.pendingPlatform') + '</span>';
      var p = priceFor(tpl, lic);
      return '<label class="license-option">' +
        '<input type="radio" name="detail-license" value="' + lic + '" data-license="' + lic + '"' + (lic === chosen ? ' checked' : '') + (blocked ? ' disabled' : '') + ' />' +
        '<span class="od-stack" style="--od-gap:2px">' +
          '<span class="license-name">' + esc(licLabel(lic)) + '</span>' +
          '<span class="license-desc">' + body + '</span>' +
        '</span>' +
        '<span class="license-price od-nowrap">' + (p == null ? t('lic.pendingPlatform') : money(p)) + '</span>' +
      '</label>';
    }).join('');

    var action;
    if (order) {
      action = '<button type="button" class="btn btn-primary btn-lg btn-block" data-action="download" data-id="' + esc(tpl.id) + '">' + icon('download') + t('detail.download') + '</button>';
    } else if (blocked) {
      action = '<button type="button" class="btn btn-lg btn-block" disabled>' + t('detail.buy') + '</button>';
    } else if (isCustom) {
      action = '<button type="button" class="btn btn-primary btn-lg btn-block" data-action="quote-request" data-id="' + esc(tpl.id) + '">' + t('detail.quoteAction') + '</button>';
    } else {
      action = '<button type="button" class="btn btn-primary btn-lg btn-block" data-action="buy" data-id="' + esc(tpl.id) + '">' +
        t(state.signedIn ? 'detail.buy' : 'detail.buyLogin') + '</button>';
    }

    return '<aside class="panel panel-sticky reveal" style="--d:120ms">' +
      '<h1 class="panel-title">' + esc(L(tpl.name)) + '</h1>' +
      '<div class="panel-seller">' + icon('tag') + '<span>' + t('detail.seller') + '</span><span class="od-truncate">' + esc(tpl.seller.name) + '</span>' +
        (tpl.seller.verified ? '<span class="badge-verified">' + icon('shield') + t('card.verified') + '</span>' : '') +
      '</div>' +

      '<div class="price-block">' +
        '<div class="price-main">' +
          '<span class="price price-lg od-nowrap">' + money(cents == null ? tpl.priceUsdCents : cents) + '</span>' +
          '<span class="price-note">' + t('detail.priceNote') + '</span>' +
        '</div>' +
        (isCustom
          ? '<p class="field-hint" style="margin-top:8px">' + t('detail.quoteRequired') + '</p>'
          : currencyBarHTML(cents, 'detail')) +
      '</div>' +

      '<p class="filter-label">' + t('detail.selectLicense') + '</p>' +
      '<div class="license-list">' + options + '</div>' +

      '<p class="filter-label">' + t('detail.licenseScope') + '</p>' +
      '<div class="summary-table">' +
        (meta && meta.scope
          ? scopeRow('detail.scopeCommercial', meta.scope.commercial) +
            scopeRow('detail.scopeResale', meta.scope.resale) +
            scopeRow('detail.scopeRedistribute', meta.scope.redistribute) +
            scopeRow('detail.scopeAttribution', meta.scope.attribution)
          : '<div class="summary-row"><span>' + t('lic.scopeTitle') + '</span><span class="summary-value">' + t('lic.pendingPlatform') + '</span></div>') +
      '</div>' +

      '<div style="margin-top:24px">' + refundSummaryHTML() + '</div>' +

      (order ? '<div class="summary-table" style="margin-top:16px">' +
        '<div class="summary-row"><span>' + t('checkout.orderNo') + '</span><span class="summary-value od-nowrap">' + esc(order.id) + '</span></div>' +
        '<div class="summary-row"><span>' + t('checkout.license') + '</span><span class="summary-value">' + esc(licLabel(order.license)) + '</span></div>' +
      '</div>' : '') +

      '<div style="margin-top:16px">' + action + '</div>' +
      '<p class="compliance-line">' + t('detail.complianceLine') + '</p>' +
    '</aside>';
  }

function priceFor(tpl, lic) {
    if (lic === 'custom') return null;
    var f = (licMeta(lic) && licMeta(lic).factor) || 1;
    return Math.round(tpl.priceUsdCents * f);
  }

function currencyBarHTML(cents, ctx) {
    if (cents == null) return '';
    var btns = ['USD', 'USDT'].map(function (c) {
      return '<button type="button" class="seg-btn" data-action="set-currency" data-value="' + c + '" aria-pressed="' + (state.currency === c) + '">' + t(c === 'USD' ? 'cur.usd' : 'cur.usdt') + '</button>';
    }).join('');
    return '<div class="currency-bar">' +
      '<span class="filter-label">' + t('cur.label') + '</span>' +
      '<div class="seg-group" role="group" aria-label="' + esc(t('cur.label')) + '">' + btns + '</div>' +
      '</div>' + quoteHTML(cents, ctx);
  }

function quoteHTML(cents, ctx) {
    if (state.currency !== 'USDT' || cents == null) return '';
    var q = state.quote && state.quote.usdCents === cents ? state.quote : null;
    if (!q) {
      return '<div class="quote-box" data-quote-box="' + esc(ctx) + '" data-expired="false">' +
        '<div class="quote-row"><span class="quote-key">USDT</span><span class="quote-amount">—</span></div>' +
        '<button type="button" class="btn btn-secondary btn-sm quote-refresh" data-action="refresh-quote" data-ctx="' + esc(ctx) + '">' + t('cur.refresh') + '</button>' +
        '</div>';
    }
    var left = quoteLeft();
    if (left <= 0) return quoteExpiredHTML(ctx);
    return '<div class="quote-box" data-quote-box="' + esc(ctx) + '" data-expired="false">' +
      '<div class="quote-row"><span class="quote-key">' + t('cur.payAmount') + '</span>' +
        '<span class="quote-amount">' + usdt(q.usdCents, q.rate) + '</span></div>' +
      '<p class="quote-note">' + esc(t('cur.rate', { rate: q.rate.toFixed(2) })) + ' · <span class="quote-timer">' +
        esc(t('cur.valid', { n: left })) + '</span></p>' +
      '<p class="quote-note">' + esc(t('cur.fixedNote')) + '</p>' +
      '</div>';
  }

function quoteLeft() {
    if (!state.quote) return 0;
    return Math.max(0, Math.ceil((state.quote.expiresAt - Date.now()) / 1000));
  }

function quoteExpiredHTML(ctx) {
    var q = state.quote;
    return '<div class="quote-box" data-quote-box="' + esc(ctx) + '" data-expired="true">' +
      '<div class="quote-row"><span class="quote-key">' + t('cur.payAmount') + '</span>' +
        '<span class="quote-amount">' + (q ? usdt(q.usdCents, q.rate) : '—') + '</span></div>' +
      '<p class="quote-note quote-timer">' + esc(t('cur.expired')) + '</p>' +
      '<button type="button" class="btn btn-primary btn-sm quote-refresh" data-action="refresh-quote" data-ctx="' + esc(ctx) + '">' + icon('refresh') + t('cur.refresh') + '</button>' +
      '</div>';
  }

function usdt(cents, rate) {
    var n = (cents / 100) * (rate || 1);
    return n.toFixed(2) + ' USDT';
  }

function scopeRow(labelKey, value) {
    if (!value) return '';
    var cls = value === 'yes' ? 'summary-yes' : value === 'limited' ? 'summary-limited' : 'summary-no';
    var ico = value === 'yes' ? 'check' : value === 'limited' ? 'info' : 'close';
    return '<div class="summary-row"><span>' + t(labelKey) + '</span>' +
      '<span class="summary-value ' + cls + '">' + icon(ico) + t('detail.scope' + (value === 'yes' ? 'Yes' : value === 'limited' ? 'Limited' : 'No')) + '</span></div>';
  }

function refundSummaryHTML() {
    var p = D.policy;
    var eligible = p.eligible.map(function (k) {
      return '<div class="refund-item" data-ok="true">' + icon('check') + '<span>' + t('rf.eligible.' + ({
        file_corrupted_or_inaccessible: 'file',
        materially_not_as_described: 'mismatch',
        duplicate_purchase: 'duplicate'
      }[k] || 'file')) + '</span></div>';
    }).join('');
    var excl = p.exclusions.map(function (k) {
      return '<div class="refund-item" data-ok="false">' + icon('close') + '<span>' + t('rf.excl.' + ({
        downloaded_no_auto_refund: 'downloaded',
        subjective_dissatisfaction: 'subjective'
      }[k] || 'downloaded')) + '</span></div>';
    }).join('');
    return '<p class="filter-label">' + t('rf.title') + ' · <span class="policy-version">' + esc(p.version) + '</span></p>' +
      '<div class="refund-grid">' +
        '<div class="refund-col"><p class="refund-col-title">' + t('rf.eligible') + '</p><div class="refund-list">' + eligible + '</div></div>' +
        '<div class="refund-col"><p class="refund-col-title">' + t('rf.exclusions') + '</p><div class="refund-list">' + excl + '</div></div>' +
      '</div>' +
      '<div class="refund-manual">' +
        '<p class="field-hint">' + t('rf.manual') + ' · ' + t('rf.window', { n: D.policy.windowDays }) + '</p>' +
        '<button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px" data-action="go-complaint">' + t('rf.manualAction') + '</button>' +
      '</div>';
  }

function connectPanelHTML() {
    if (state.route !== 'seller' || !state.signedIn) return '';
    const status = state.connectState || 'idle';
    const label = status === 'active' ? t('connect.active') : status === 'restricted' ? t('connect.restricted') : status === 'pending' ? t('connect.pending') : t('connect.notConnected');
    return '<div class="form-section" style="margin-bottom:20px"><div class="form-section-head"><h2 class="form-section-title">' + esc(t('connect.title')) + '</h2><p class="form-section-note">' + esc(t('connect.description')) + '</p></div><div class="od-cluster" style="justify-content:space-between"><span class="panel-key">' + esc(label) + '</span><button type="button" class="btn btn-secondary" data-action="connect-onboarding"' + (status === 'active' ? ' disabled' : '') + '>' + esc(status === 'idle' ? t('connect.create') : t('connect.continue')) + '</button></div></div>';
  }

  function sellHTML() {
    var s = state.sell;
    if (s.submitted) return sellSubmittedHTML();

    var cats = [['', t('sell.chooseCategory')]].concat(['intro', 'title', 'bg', '3d', 'product', 'motion'].map(function (c) {
      return [c, catLabel(c)];
    }));
    var licPairs = [['', t('sell.licensePlaceholder')]].concat(Object.keys(D.licenseTypes).map(function (k) {
      return [k, licLabel(k)];
    }));
    var checks = sellChecklist();
    var doneCount = checks.filter(function (c) { return c.done; }).length;
    var errKeys = Object.keys(s.errors);
    var conflict = sellConflict();
    var proofs = s.proofFiles.map(function (f) {
      return '<div class="file-chip">' + icon('file') + '<div class="od-fill"><p class="file-name">' + esc(f.name) + '</p>' +
        '<p class="file-meta">' + esc(f.size) + ' · ' + esc(t('sell.proofOnlyAdmin')) + '</p></div>' +
        '<button type="button" class="file-remove" data-action="sell-remove-proof" data-name="' + esc(f.name) + '">' + esc(t('common.remove')) + '</button></div>';
    }).join('');

    var errorSummary = '';
    if (s.showErrors && errKeys.length) {
      errorSummary = '<div class="alert alert-danger error-summary">' + icon('alert') + '<div class="od-fill">' +
        '<p class="alert-title">' + esc(t('sell.errorSummaryTitle', { n: errKeys.length })) + '</p>' +
        '<ul>' + errKeys.map(function (k) { return '<li>' + esc(t(s.errors[k])) + '</li>'; }).join('') + '</ul>' +
        '</div></div>';
    }

    return '<section class="shell section">' + sellHeaderHTML() + connectPanelHTML() + sellStepperHTML() + errorSummary +
      '<div class="sell-layout"><div>' +

        '<div class="form-section">' +
          '<div class="form-section-head"><h2 class="form-section-title">' + esc(t('sell.sec1Title')) + '</h2>' +
            '<p class="form-section-note">' + esc(t('sell.sec1Note')) + '</p></div>' +
          '<div class="field"><label class="field-label" for="sell-name">' + esc(t('sell.fieldName')) + ' <span class="required-mark">' + esc(t('common.required')) + '</span></label>' +
            '<input class="input" id="sell-name" data-sell="name" value="' + esc(s.name) + '" aria-invalid="' + (!!s.errors.name) + '" />' +
            '<p class="field-hint">' + esc(t('sell.fieldNameHint')) + '</p>' + errorBlock('name') + '</div>' +
          '<div class="field-row">' +
            '<div class="field"><label class="field-label" for="sell-cat">' + esc(t('sell.fieldCategory')) + '</label>' +
              '<select class="select" id="sell-cat" data-sell="category">' + optionList(cats, s.category) + '</select>' + errorBlock('category') + '</div>' +
            '<div class="field"><label class="field-label" for="sell-price">' + esc(t('sell.priceLabel')) + ' <span class="required-mark">' + esc(t('common.required')) + '</span></label>' +
              '<input class="input" id="sell-price" data-sell="priceCents" inputmode="numeric" value="' + esc(s.priceCents) + '" aria-invalid="' + (!!s.errors.price) + '" />' +
              '<p class="field-hint" id="sell-price-preview">' + esc(t('sell.priceDisplay', { v: money(parseInt(s.priceCents, 10) || 0) })) + '</p>' + errorBlock('price') + '</div>' +
          '</div>' +
          '<div class="field"><label class="field-label" for="sell-summary">' + esc(t('sell.fieldSummary')) + ' <span class="required-mark">' + esc(t('common.required')) + '</span></label>' +
            '<textarea class="textarea" id="sell-summary" data-sell="summary" rows="3" aria-invalid="' + (!!s.errors.summary) + '">' + esc(s.summary) + '</textarea>' +
            '<p class="field-hint">' + esc(t('sell.fieldSummaryHint')) + '</p>' + errorBlock('summary') + '</div>' +
        '</div>' +

        '<div class="form-section">' +
          '<div class="form-section-head"><h2 class="form-section-title">' + esc(t('sell.assetLicense')) + '</h2>' +
            '<p class="form-section-note">' + esc(t('sell.assetLicenseHint')) + '</p></div>' +
          '<div class="field">' + sellPreviewRowsHTML() +
            '<div class="od-cluster" style="margin-top:12px">' +
              '<button type="button" class="btn btn-secondary btn-sm" data-action="sell-choose-preview">' + icon('upload') + esc(t('sell.previewImageUpload')) + '</button>' +
              '<button type="button" class="btn btn-ghost btn-sm" disabled title="' + esc(t('sell.previewVideoDisabled')) + '">' + icon('play') + esc(t('sell.previewVideoDisabled')) + '</button>' +
              '<input class="vh" type="file" id="sell-preview-file" data-upload="preview" accept="image/png,image/jpeg,image/webp" multiple />' +
              '<button type="button" class="btn btn-ghost btn-sm" data-action="sell-seed-preview">' + icon('file') + esc(t('sell.previewSeed')) + '</button>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-action="sell-add-pending">' + icon('file') + esc(t('sell.addPreview')) + '</button>' +
            '</div>' +
            '<p class="field-hint">' + esc(t('sell.previewSeedNote')) + '</p>' + errorBlock('preview') + '</div>' +
        '</div>' +

        '<div class="form-section' + (conflict ? ' is-conflict' : '') + '">' +
          '<div class="form-section-head"><h2 class="form-section-title">' + esc(t('sell.sec2Title')) + '</h2>' +
            '<p class="form-section-note">' + esc(t('sell.sec2Note')) + '</p></div>' +
          '<div class="field"><label class="field-label" for="sell-pkg">' + esc(t('sell.packageName')) + '</label>' +
            '<input class="input" id="sell-pkg" data-sell="pkgName" value="' + esc(s.pkgName) + '" placeholder="' + esc(t('sell.packageNamePlaceholder')) + '" />' +
            '<input class="vh" type="file" id="sell-package-file" data-upload="package" accept=".zip,.motion,application/zip" />' +
            '<p class="field-hint">' + esc(t('sell.scanHint')) + '</p>' + errorBlock('scan') + '</div>' +
          '<button type="button" class="dropzone" data-action="' + (s.pkgName && s.scanStatus === 'pending' ? 'sell-run-scan' : 'sell-choose-package') + '"' + (s.scanning ? ' disabled' : '') + '>' +
            icon(s.scanning ? 'refresh' : s.pkgName && s.scanStatus === 'pending' ? 'refresh' : 'upload') +
            '<span class="dropzone-title">' + esc(s.scanning ? t('sell.scanning') : s.pkgName && s.scanStatus === 'pending' ? t('sell.scanRun') : t('sell.dropTitle')) + '</span>' +
            '<span class="dropzone-hint">' + esc(s.pkgName ? s.pkgName + ' · ' + t('sell.scanSimNote') : t('sell.dropHint')) + '</span>' +
          '</button>' +
          sellScanHTML() +
        '</div>' +

        '<div class="form-section">' +
          '<div class="form-section-head"><h2 class="form-section-title">' + esc(t('sell.sec3Title')) + '</h2>' +
            '<p class="form-section-note">' + esc(t('sell.sec3Note')) + '</p></div>' +
          '<div class="field"><label class="field-label" for="sell-license">' + esc(t('sell.licenseLabel')) + '</label>' +
            '<select class="select" id="sell-license" data-sell="licenseType">' + optionList(licPairs, s.licenseType) + '</select>' + errorBlock('license') + '</div>' +
          '<p class="declare-note">' + esc(t('sell.declareBody')) + '</p>' +
          '<div class="check-list">' +
            [t('sell.decl1'), t('sell.decl2'), t('sell.decl3')].map(function (text, i) {
              return '<label class="check-item"><input type="checkbox" data-sell="decl" data-idx="' + i + '"' + (s.decl[i] ? ' checked' : '') + ' />' +
                '<span class="check-text">' + esc(text) + '</span></label>';
            }).join('') +
          '</div>' + errorBlock('decl') +
          '<div class="field-row" style="margin-top:20px">' +
            '<div class="field"><label class="field-label" for="sell-signer">' + esc(t('sell.signer')) + '</label>' +
              '<input class="input" id="sell-signer" data-sell="signer" value="' + esc(s.signer) + '" />' + errorBlock('signer') + '</div>' +
            '<div class="field"><label class="field-label" for="sell-date">' + esc(t('sell.signDate')) + '</label>' +
              '<input class="input" id="sell-date" type="date" data-sell="signDate" value="' + esc(s.signDate) + '" />' + errorBlock('signDate') + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="form-section">' +
          '<div class="form-section-head"><h2 class="form-section-title">' + esc(t('sell.sec4Title')) + '</h2>' +
            '<p class="form-section-note">' + esc(t('sell.sec4Note')) + '</p></div>' +
          '<div class="field"><p class="field-label">' + esc(t('sell.proofFiles')) + '</p>' +
            '<div class="stack-list">' + (proofs || '<p class="field-hint">' + esc(t('sell.proofFilesHint')) + '</p>') + '</div>' +
            '<input class="vh" type="file" id="sell-proof-file" data-upload="proof" accept="application/pdf,image/png,image/jpeg" multiple />' +
            '<button type="button" class="btn btn-secondary btn-sm" style="margin-top:10px" data-action="sell-choose-proof">' + icon('file') + esc(t('sell.proofAdd')) + '</button>' +
          '</div>' +
          '<div class="field"><label class="field-label" for="sell-link">' + esc(t('sell.proofLink')) + '</label>' +
            '<div class="od-row"><input class="input od-fill" id="sell-link" data-sell="proofLink" value="' + esc(s.proofLink) + '" placeholder="https://" />' +
              '<button type="button" class="btn btn-secondary" data-action="sell-url-check">' + esc(t('sell.urlCheck')) + '</button></div>' +
            '<p class="field-hint">' + esc(t('sell.urlHint')) + '</p>' + errorBlock('proof') +
            (s.urlStatus
              ? '<div class="panel-box" data-tone="' + (s.urlStatus === 'accepted' ? 'ok' : 'warning') + '" style="margin-top:10px">' +
                '<div class="od-cluster" style="justify-content:space-between">' +
                  statusBadge(s.urlStatus === 'accepted' ? 'accepted' : 'pending', s.urlStatus === 'accepted' ? 'sell.urlAccepted' : 'sell.urlRejected') +
                  '<span class="panel-key">' + esc(t('sell.urlCaptured')) + ' ' + esc(s.urlCapturedAt) + '</span>' +
                '</div>' +
                '<p class="panel-text">' + esc(s.urlStatus === 'accepted' ? t('sell.urlAccepted') : t('sell.urlPending')) + '</p>' +
                '<p class="field-hint">' + esc(t('sell.urlSimNote')) + '</p></div>'
              : '') +
          '</div>' +
        '</div>' +

        '<div class="form-section">' +
          '<div class="form-section-head"><h2 class="form-section-title">' + esc(t('sell.sec5Title')) + '</h2>' +
            '<p class="form-section-note">' + esc(t('sell.sec5Note')) + '</p></div>' +
          '<div class="summary-table">' +
            '<div class="summary-row"><span>' + esc(t('sell.fieldName')) + '</span><span class="summary-value">' + esc(s.name || t('sell.notSelected')) + '</span></div>' +
            '<div class="summary-row"><span>' + esc(t('checkout.license')) + '</span><span class="summary-value">' + esc(s.licenseType ? licLabel(s.licenseType) : t('sell.notSelected')) + '</span></div>' +
            '<div class="summary-row"><span>' + esc(t('sell.fieldPrice')) + '</span><span class="summary-value od-nowrap">' + money(parseInt(s.priceCents, 10) || 0) + '</span></div>' +
            '<div class="summary-row"><span>' + esc(t('sell.assetLicense')) + '</span><span class="summary-value">' + s.previews.length + '</span></div>' +
            '<div class="summary-row"><span>' + esc(t('sell.conflictTitle')) + '</span><span class="summary-value">' + (conflict ? t('adm.conflictYes') : t('adm.conflictNo')) + '</span></div>' +
          '</div>' +
          '<p class="field-hint" style="margin-top:12px">' + esc(t('sell.actionNote')) + '</p>' +
        '</div>' +

      '</div><aside class="sell-side">' +
        '<div class="checklist">' +
          '<p class="checklist-title">' + icon('shield') + esc(t('sell.checklistTitle')) + '</p>' +
          '<div class="checklist-progress"><span style="width:' + Math.round((doneCount / checks.length) * 100) + '%"></span></div>' +
          checks.map(function (c) {
            return '<div class="checklist-item" data-done="' + c.done + '" data-alert="' + (!!c.alert) + '">' +
              icon(c.done ? 'check' : c.alert ? 'alert' : 'dot') +
              '<span class="checklist-text">' + esc(c.text) + '</span></div>';
          }).join('') +
        '</div>' +
        '<div class="panel-box" style="margin-top:16px"><p class="panel-key">' + esc(t('market.noticeLabel')) + '</p>' +
          '<p class="panel-text">' + esc(t('guide.p3')) + '</p></div>' +
      '</aside></div>' +

      '<div class="action-bar"><p class="action-bar-note">' + esc(t('sell.actionNote')) + '</p>' +
        '<div class="action-bar-actions">' +
          '<button type="button" class="btn btn-ghost" data-action="sell-save-draft">' + esc(t('sell.saveDraft')) + '</button>' +
          '<button type="button" class="btn btn-primary" data-action="sell-submit">' + esc(conflict ? t('sell.submitConflict') : t('sell.submit')) + '</button>' +
        '</div></div>' +
    '</section>';
  }

function sellSubmittedHTML() {
    var s = state.sell;
    return '<section class="shell section"><div class="status-view">' +
      '<div class="od-cluster" style="justify-content:space-between">' +
        statusBadge(s.manualReview ? 'manual' : 'pending', s.manualReview ? 'sell.manualQueued' : 'sell.statusReview') +
        '<span class="eyebrow">' + esc(s.submittedId) + '</span>' +
      '</div>' +
      '<h1 class="status-title">' + esc(t('sell.submittedTitle')) + '</h1>' +
      '<p class="status-sub">' + esc(t('sell.submittedSub')) + '</p>' +
      (s.manualReview
        ? '<div class="panel-box" data-tone="danger" style="margin-top:16px"><p class="field-label" style="margin:0">' + icon('alert') + esc(t('sell.conflictTitle')) + '</p>' +
          '<p class="panel-text">' + esc(t('sell.scanLocked')) + '</p></div>'
        : '') +
      '<div class="summary-table" style="margin-top:20px">' +
        '<div class="summary-row"><span>' + esc(t('sell.fieldName')) + '</span><span class="summary-value">' + esc(s.name) + '</span></div>' +
        '<div class="summary-row"><span>' + esc(t('checkout.license')) + '</span><span class="summary-value">' + esc(s.licenseType ? licLabel(s.licenseType) : t('sell.notSelected')) + '</span></div>' +
        '<div class="summary-row"><span>' + esc(t('sell.fieldPrice')) + '</span><span class="summary-value od-nowrap">' + money(parseInt(s.priceCents, 10) || 0) + '</span></div>' +
        '<div class="summary-row"><span>' + esc(t('sell.submittedId')) + '</span><span class="summary-value">' + esc(s.submittedId) + '</span></div>' +
      '</div>' +
      '<div class="sell-timeline">' +
        '<div class="sell-tl-item" data-done="true">' + icon('check') + '<span>' + esc(t('sell.tl1')) + '</span></div>' +
        '<div class="sell-tl-item" data-done="true">' + icon('check') + '<span>' + esc(t('sell.tl2')) + '</span></div>' +
        '<div class="sell-tl-item" data-done="false">' + icon('clock') + '<span>' + esc(s.manualReview ? t('sell.statusManual') : t('sell.tl3')) + '</span></div>' +
        '<div class="sell-tl-item" data-done="false">' + icon('clock') + '<span>' + esc(t('sell.tl4')) + '</span></div>' +
      '</div>' +
      '<p class="field-hint">' + esc(t('sell.reviewNote')) + '</p>' +
      '<div class="od-cluster" style="margin-top:20px">' +
        '<button type="button" class="btn btn-primary" data-action="go-market">' + esc(t('sell.backToMarket')) + '</button>' +
        (state.signedIn ? '<button type="button" class="btn btn-secondary" data-action="go-admin">' + esc(t('sell.viewAdmin')) + '</button>' : '') +
        '<button type="button" class="btn btn-ghost" data-action="sell-reset">' + esc(t('header.sell')) + '</button>' +
      '</div>' +
      '</div></section>';
  }

function statusBadge(value, extraKey) {
    var s = STATUS_STATE[value] || 'pending';
    var label = extraKey ? t(extraKey) : t(STATUS_KEY[s] || 'st.pending');
    var ico = s === 'passed' || s === 'active' || s === 'approved' || s === 'resolved' || s === 'accepted' ? 'check'
      : s === 'failed' || s === 'rejected' || s === 'revoked' || s === 'expired' ? 'alert'
        : s === 'manual' || s === 'timeout' || s === 'pending' || s === 'running' || s === 'triaged' ? 'clock'
          : 'dot';
    return '<span class="status-badge" data-state="' + esc(s) + '">' + icon(ico) + '<span>' + esc(label) + '</span></span>';
  }

function sellChecklist() {
    var s = state.sell;
    var priceOk = /^\d+$/.test(String(s.priceCents)) && parseInt(s.priceCents, 10) > 0;
    var infoDone = !!(s.name.trim() && s.category && s.summary.trim() && priceOk);
    var declDone = s.decl[0] && s.decl[1] && s.decl[2] && s.signer.trim() && s.signDate;
    var proofDone = s.proofFiles.length > 0 || s.proofLink.trim();
    return [
      { done: infoDone, text: t('sell.check1') },
      { done: s.scanned, text: t('sell.check2') },
      { done: !!s.licenseType, text: t('sell.check3') },
      { done: !!declDone, text: t('sell.check4') },
      { done: !!proofDone, text: t('sell.check5') },
      { done: s.scanned && !sellConflict(), alert: sellConflict(), text: t('sell.check6') }
    ];
  }

function sellConflict() {
    var s = state.sell;
    return !!(s.scanned && s.licenseType === 'commercial_multi_project' && s.scanDetected === 'commercial-no-resale');
  }

function sellHeaderHTML() {
    return '<div class="sell-head"><div><p class="eyebrow">' + esc(t('header.sell')) + '</p>' +
      '<h1 class="sell-title">' + esc(t('sell.title')) + '</h1>' +
      '<p class="sell-sub">' + esc(t('sell.sub')) + '</p></div>' +
      '<div class="sell-head-actions"><button type="button" class="btn btn-secondary" data-action="go-market">' + esc(t('sell.backToMarket')) + '</button></div>' +
      '</div>';
  }

function sellStepperHTML() {
    var s = state.sell;
    var done = [
      !!(s.name && s.category && s.summary),
      s.scanned,
      !!(s.licenseType),
      s.proofFiles.length > 0 || !!s.proofLink,
      false
    ];
    var labels = [t('sell.step1'), t('sell.step2'), t('sell.step3'), t('sell.step4'), t('sell.step5')];
    return '<div class="stepper">' + labels.map(function (label, i) {
      var stateName = i === 4 ? 'current' : done[i] ? 'done' : 'todo';
      return '<div class="step" data-state="' + stateName + '"><span class="step-num">' + (i + 1) + '</span>' + esc(label) + '</div>';
    }).join('') + '</div>';
  }

function errorBlock(key) {
    if (!state.sell.errors[key]) return '';
    return '<p class="field-error">' + icon('alert') + esc(t(state.sell.errors[key])) + '</p>';
  }

function optionList(pairs, current) {
    return pairs.map(function (p) {
      return '<option value="' + esc(p[0]) + '"' + (p[0] === current ? ' selected' : '') + '>' + esc(p[1]) + '</option>';
    }).join('');
  }

function sellPreviewRowsHTML() {
    var s = state.sell;
    if (!s.previews.length) {
      return '<div class="panel-box"><p class="panel-text">' + esc(t('sell.assetLicenseHint')) + '</p></div>';
    }
    return '<div class="stack-list">' + s.previews.map(function (p) {
      var passed = p.licenseStatus === 'passed';
      var note = p.licenseStatus === 'failed' ? t('sell.assetNotPublic')
        : p.licenseStatus === 'manual_review' ? t('sell.assetPending') : t('sell.assetPassed');
      return '<div class="asset-row">' +
        '<img class="asset-thumb" src="' + esc(p.url) + '" alt="" width="64" height="40" />' +
        '<div class="od-fill"><p class="asset-name">' + esc(p.name) + '</p>' +
          '<p class="asset-meta">' + esc(t('sell.assetLicenseShort')) + ' · ' + esc(p.licenseName) + ' · ' + esc(p.licenseSource) + '</p>' +
          '<p class="asset-note" data-tone="' + (passed ? '' : 'danger') + '">' + esc(note) + '</p></div>' +
        statusBadge(p.licenseStatus) +
        '</div>';
    }).join('') + '</div>';
  }

function sellScanHTML() {
    var s = state.sell;
    var conflict = sellConflict();
    var out = '';
    if (s.scanStatus === 'pending' && !s.scanning && !s.scanned) {
      out += '<div class="scan-result"><div class="scan-head">' + statusBadge('pending') + '<span>' + esc(t('sell.scanPending')) + '</span></div>' +
        '<div class="scan-body"><p class="field-hint">' + esc(t('sell.scanSimNote')) + '</p></div></div>';
    } else if (s.scanning) {
      out += '<div class="scan-result"><div class="scan-head">' + statusBadge('running') + '<span>' + esc(t('sell.scanning')) + '</span></div>' +
        '<div class="scan-body"><p class="field-hint">' + esc(t('sell.scanSimNote')) + '</p></div></div>';
    } else if (s.scanned) {
      out += '<div class="scan-result"><div class="scan-head">' + statusBadge('passed') +
        '<span>' + esc(t('sell.scanParsed')) + '</span></div>' +
        '<div class="scan-body">' +
          '<div class="scan-line"><span>' + esc(t('sell.scanJobShort')) + '</span><span>' + esc(s.scanJobId) + '</span></div>' +
          '<div class="scan-line"><span>' + esc(t('sell.parserLabel')) + '</span><span>' + esc(t('st.passed')) + '</span></div>' +
          '<div class="scan-line"><span>' + esc(t('sell.scanDetected')) + '</span><span>' + esc(s.scanDetected) + '</span></div>' +
          '<div class="scan-line"><span>' + esc(t('sell.conflictExcerpt')) + '</span><span>' + esc(s.scanExcerpt) + '</span></div>' +
        '</div></div>';
    }
    if (conflict) {
      out += '<div class="panel-box" data-tone="danger" style="margin-top:12px">' +
        '<div class="od-cluster" style="justify-content:space-between">' +
          '<p class="field-label" style="margin:0">' + icon('alert') + esc(t('sell.conflictTitle')) + '</p>' +
          statusBadge('manual') +
        '</div>' +
        '<p class="panel-text">' + esc(t('sell.conflictBody')) + '</p>' +
        '<div class="scan-line"><span>' + esc(t('sell.conflictFile')) + '</span><span>licenses/TEMPLATE-LICENSE.txt</span></div>' +
        '<div class="scan-line"><span>' + esc(t('sell.conflictDeclaredLabel')) + '</span><span>' + esc(licLabel(s.licenseType)) + '</span></div>' +
        '<p class="panel-text"><strong>' + esc(t('sell.directBlocked')) + '</strong> ' + esc(t('sell.scanLocked')) + '</p>' +
      '</div>';
    }
    return out;
  }

function libraryHTML() {
    if (!state.signedIn) return signInGate('lib.title');
    var items = state.entitlements.slice();
    return '<section class="shell section">' +
      '<div class="sell-head"><div><p class="eyebrow">' + esc(t('header.purchases')) + '</p>' +
        '<h1 class="sell-title">' + esc(t('lib.title')) + '</h1>' +
        '<p class="sell-sub">' + esc(t('lib.sub')) + '</p></div>' +
        '<button type="button" class="btn btn-secondary" data-action="go-market">' + esc(t('sell.backToMarket')) + '</button></div>' +
      (items.length ? '<div class="lib-list">' + items.map(function (ent) {
        var tpl = tplById(ent.templateId);
        var name = tpl ? L(tpl.name) : ent.templateId;
        var left = Math.max(0, ent.maxDownloads - ent.downloadCount);
        var pct = Math.round((left / ent.maxDownloads) * 100);
        var active = ent.status === 'active' && left > 0;
        return '<article class="lib-item" id="ent-' + esc(ent.id) + '">' +
          '<div>' +
            '<p class="lib-name">' + esc(name) + '</p>' +
            '<div class="lib-meta">' +
              '<span>' + esc(t('lib.entitlement')) + ' ' + esc(ent.id) + '</span>' +
              '<span>' + esc(t('lib.orderLabel')) + ' ' + esc(ent.orderId) + '</span>' +
              '<span>' + esc(licLabel(ent.licenseType)) + '</span>' +
            '</div>' +
            '<div class="lib-meter-row"><span class="lib-meter" data-empty="' + (left === 0) + '"><span style="width:' + pct + '%"></span></span>' +
              '<span class="section-note">' + esc(t('lib.downloads', { n: left, max: ent.maxDownloads })) + '</span></div>' +
            '<p class="section-note" style="margin-top:4px">' + esc(t('lib.expires', { date: ent.expiresAt })) + ' · v' + esc(ent.versionId) + '</p>' +
            (ent.status === 'revoked' && ent.revokeReasonPublic
              ? '<p class="lib-note" data-tone="danger">' + esc(L(ent.revokeReasonPublic)) + '</p>' : '') +
            (ent.status === 'reissued'
              ? '<p class="lib-note">' + esc(t('lib.reissued')) + ' ' +
                '<button type="button" class="lib-link" data-action="focus-entitlement" data-ent="' + esc(ent.reissuedToId || ent.id) + '">' +
                esc(t('lib.reissuedLink', { id: ent.reissuedToId || ent.id })) + '</button></p>' : '') +
          '</div>' +
          '<div class="lib-state">' +
            statusBadge(ent.status) +
            '<div class="lib-actions">' +
              '<button type="button" class="btn btn-primary btn-sm" data-action="download-ent" data-ent="' + esc(ent.id) + '" data-available="' + (active ? 'true' : 'false') + '"' + (active ? '' : ' disabled') + '>' +
                icon('download') + esc(t('lib.download')) + '</button>' +
              '<button type="button" class="btn btn-secondary btn-sm" data-action="go-complaint" data-ent="' + esc(ent.id) + '">' + esc(t('lib.complaint')) + '</button>' +
            '</div>' +
          '</div>' +
        '</article>';
      }).join('') + '</div>'
        : '<div class="empty" style="margin-top:32px">' + icon('box') +
          '<p class="empty-title">' + esc(t('lib.empty')) + '</p>' +
          '<p class="empty-text">' + esc(t('lib.emptyText')) + '</p>' +
          '<button type="button" class="btn btn-primary" data-action="go-market">' + esc(t('lib.emptyAction')) + '</button></div>') +
      '</section>';
  }

function signInGate(key) {
    return '<section class="shell section"><div class="empty">' + icon('shield') +
      '<p class="empty-title">' + esc(t(key)) + '</p>' +
      '<p class="empty-text">' + esc(t('header.login')) + '</p>' +
      '<button type="button" class="btn btn-primary" data-action="login">' + esc(t('header.login')) + '</button>' +
      '</div></section>';
  }

function complaintTemplateHTML(c) {
    var tpl = tplById(c.templateId);
    var rank = { submitted: 0, triaged: 1, actioned: 2, resolved: 3, rejected: 3 };
    var steps = ['submitted', 'triaged', 'actioned', c.status === 'rejected' ? 'rejected' : 'resolved'];
    var cur = rank[c.status] != null ? rank[c.status] : 0;
    return '<article class="cp-card">' +
      '<div class="od-cluster" style="justify-content:space-between;align-items:flex-start">' +
        '<div><p class="eyebrow">' + esc(c.id) + '</p><p class="lib-name" style="margin-top:4px">' + esc(tpl ? L(tpl.name) : c.templateId) + '</p>' +
          '<p class="section-note">' + esc(t('cp.updated', { t: c.updatedAt })) + '</p></div>' +
        statusBadge(c.status) +
      '</div>' +
      '<div class="cp-row"><span>' + esc(t('lib.orderLabel')) + '</span><span class="od-nowrap">' + esc(c.orderId) + '</span></div>' +
      '<div class="cp-row"><span>' + esc(t('cp.entitlement')) + '</span><span class="od-nowrap">' + esc(c.entitlementId) + '</span></div>' +
      '<div class="cp-row"><span>' + esc(t('cp.reason')) + '</span><span>' + esc(t('cp.reason.' + c.reason)) + '</span></div>' +
      '<div class="cp-timeline">' + steps.map(function (step, i) {
        return '<span class="cp-step" data-done="' + (i <= cur) + '">' + esc(t('cp.st.' + step)) + '</span>';
      }).join('') + '</div>' +
      '<div class="cp-row"><span>' + esc(t('cp.decision')) + '</span><span>' + esc(t('cp.decision.' + c.refundDecision)) + '</span></div>' +
      (c.refundAmountUsdCents != null
        ? '<div class="cp-row"><span>' + esc(t('cp.amount')) + '</span><span class="od-nowrap">' + money(c.refundAmountUsdCents) + '</span></div>' : '') +
      '</article>';
  }

function complaintsHTML() {
    if (!state.signedIn) return signInGate('cp.title');
    var reasons = ['file_corrupted_or_inaccessible', 'technical_unavailable', 'materially_not_as_described', 'duplicate_purchase', 'unauthorized_distribution', 'copyright', 'trademark', 'malware', 'misleading_license', 'other'];
    var selected = state.complaintDraft && state.complaintDraft.entitlementId ? state.complaintDraft.entitlementId : state.complaintId;
    if (!selected || !state.entitlements.some(function (e) { return e.id === selected; })) {
      selected = state.entitlements.length ? state.entitlements[0].id : '';
    }
    var draftReason = (state.complaintDraft && state.complaintDraft.reason) || reasons[0];
    var draftDescription = (state.complaintDraft && state.complaintDraft.description) || '';
    var options = state.entitlements.map(function (ent) {
      var tpl = tplById(ent.templateId);
      return '<option value="' + esc(ent.id) + '"' + (ent.id === selected ? ' selected' : '') + '>' +
        esc((tpl ? L(tpl.name) : ent.templateId) + ' · ' + ent.orderId) + '</option>';
    }).join('');

    return '<section class="shell section">' +
      '<div class="sell-head"><div><p class="eyebrow">' + esc(t('footer.complaint')) + '</p>' +
        '<h1 class="sell-title">' + esc(t('cp.title')) + '</h1>' +
        '<p class="sell-sub">' + esc(t('cp.sub')) + '</p></div>' +
        '<button type="button" class="btn btn-secondary" data-action="go-library">' + esc(t('lib.title')) + '</button></div>' +
      '<div class="cp-grid" style="margin-top:28px">' +
        '<div class="cp-card">' +
          '<p class="cp-card-title">' + esc(t('cp.new')) + '</p>' +
          (state.entitlements.length
            ? '<div class="field"><label class="field-label" for="cp-ent">' + esc(t('cp.selectOrder')) + '</label>' +
              '<select class="select" id="cp-ent" data-complaint="entitlementId">' + options + '</select></div>' +
              '<div class="field"><p class="field-label">' + esc(t('cp.reason')) + '</p>' +
                '<div class="reason-list">' + reasons.map(function (r, i) {
                  return '<label class="check-item"><input type="radio" name="cp-reason" value="' + r + '" data-complaint="reason"' + (r === draftReason ? ' checked' : '') + ' />' +
                    '<span class="check-text">' + esc(t('cp.reason.' + r)) + '</span></label>';
                }).join('') + '</div></div>' +
              '<div class="field"><label class="field-label" for="cp-detail">' + esc(t('cp.detail')) + '</label>' +
                '<textarea class="textarea" id="cp-detail" rows="5" data-complaint="description" placeholder="' + esc(t('cp.detailHint')) + '">' + esc(draftDescription) + '</textarea>' +
                '<p class="field-hint">' + esc(t('cp.detailHint')) + '</p></div>' +
              (state.cpError ? '<p class="field-error">' + icon('alert') + esc(state.cpError) + '</p>' : '') +
              '<div class="od-cluster" style="justify-content:space-between;margin-top:4px">' +
                '<p class="field-hint" style="margin:0;max-width:44ch">' + esc(t('cp.refundNote')) + '</p>' +
                '<button type="button" class="btn btn-primary" data-action="submit-complaint">' + esc(t('cp.submit')) + '</button>' +
              '</div>'
            : '<div class="empty" style="border:0;padding:24px 0">' + icon('box') +
              '<p class="empty-title">' + esc(t('cp.noOrder')) + '</p>' +
              '<button type="button" class="btn btn-primary" data-action="go-market">' + esc(t('lib.emptyAction')) + '</button></div>') +
        '</div>' +
        '<div>' + refundSummaryHTML() + '</div>' +
      '</div>' +
      '<div class="cp-list-head"><p class="eyebrow">' + esc(t('cp.listTitle')) + '</p></div>' +
      (state.complaints.length
        ? '<div class="cp-list">' + state.complaints.map(complaintTemplateHTML).join('') + '</div>'
        : '<div class="empty">' + icon('file') + '<p class="empty-title">' + esc(t('cp.empty')) + '</p>' +
          '<p class="empty-text">' + esc(t('cp.emptyText')) + '</p></div>') +
      '</section>';
  }

  function earningsHTML() {
    if (!state.signedIn) return signInGate('earn.title');
    var e = state.earnings;
    var head = '<div class="sell-head"><div><p class="eyebrow">' + esc(t('earn.eyebrow')) + '</p>' +
      '<h1 class="sell-title">' + esc(t('earn.title')) + '</h1>' +
      '<p class="sell-sub">' + esc(t('earn.sub')) + '</p></div>' +
      '<button type="button" class="btn btn-secondary" data-action="go-sell">' + esc(t('sell.backToMarket')) + '</button></div>';
    if (!e) {
      return '<section class="shell section">' + head + '<div class="empty" style="margin-top:28px">' + icon('clock') +
        '<p class="empty-title">' + esc(t('earn.loading')) + '</p></div></section>';
    }
    var s = e.summary || {};
    var ranges = [7, 30, 90, 365].map(function (days) {
      return '<button type="button" class="tab" data-action="set-earnings-range" data-value="' + days + '" aria-pressed="' + ((state.earningsRange || 30) === days) + '">' + esc(t('earn.range', { n: days })) + '</button>';
    }).join('');
    var metrics = '<div class="metric-strip">' +
      '<div class="metric"><span class="metric-key">' + esc(t('earn.gross')) + '</span><span class="metric-num">' + money(s.grossSalesCents || 0) + '</span></div>' +
      '<div class="metric"><span class="metric-key">' + esc(t('earn.fees')) + '</span><span class="metric-num">' + money(s.platformFeeCents || 0) + '</span></div>' +
      '<div class="metric"><span class="metric-key">' + esc(t('earn.refunds')) + '</span><span class="metric-num">' + money(s.refundsCents || 0) + '</span></div>' +
      '<div class="metric"><span class="metric-key">' + esc(t('earn.net')) + '</span><span class="metric-num">' + money(s.netEarningsCents || 0) + '</span></div>' +
      '<div class="metric"><span class="metric-key">' + esc(t('earn.orders')) + '</span><span class="metric-num">' + esc(s.orderCount || 0) + '</span></div>' +
      '<div class="metric"><span class="metric-key">' + esc(t('earn.units')) + '</span><span class="metric-num">' + esc(s.unitCount || 0) + '</span></div>' +
      '</div>';
    var seriesRows = (e.series || []).map(function (row) {
      return '<div class="queue-row"><div class="queue-main"><p class="queue-title">' + esc(row.date) + '</p>' +
        '<p class="queue-sub">' + esc(t('earn.ordersUnits', { orders: row.orderCount, units: row.unitCount })) + '</p></div>' +
        '<div class="queue-cell"><span class="queue-cell-key">' + esc(t('earn.gross')) + '</span><span class="queue-value od-nowrap">' + money(row.grossSalesCents) + '</span></div>' +
        '<div class="queue-cell"><span class="queue-cell-key">' + esc(t('earn.refunds')) + '</span><span class="queue-value od-nowrap">' + money(row.refundsCents) + '</span></div>' +
        '<div class="queue-cell"><span class="queue-cell-key">' + esc(t('earn.net')) + '</span><span class="queue-value od-nowrap">' + money(row.netEarningsCents) + '</span></div></div>';
    }).join('');
    var templateRows = (e.templates || []).map(function (row) {
      var name = row.name ? L(row.name) : row.templateId;
      return '<div class="queue-row"><div class="queue-main"><p class="queue-title">' + esc(name) + '</p>' +
        '<p class="queue-sub">' + esc(row.templateId) + '</p></div>' +
        '<div class="queue-cell"><span class="queue-cell-key">' + esc(t('earn.units')) + '</span><span class="queue-value">' + esc(row.unitCount) + '</span></div>' +
        '<div class="queue-cell"><span class="queue-cell-key">' + esc(t('earn.gross')) + '</span><span class="queue-value od-nowrap">' + money(row.grossSalesCents) + '</span></div>' +
        '<div class="queue-cell"><span class="queue-cell-key">' + esc(t('earn.refunds')) + '</span><span class="queue-value od-nowrap">' + money(row.refundsCents) + '</span></div>' +
        '<div class="queue-cell"><span class="queue-cell-key">' + esc(t('earn.net')) + '</span><span class="queue-value od-nowrap">' + money(row.netEarningsCents) + '</span></div></div>';
    }).join('');
    var orderRows = (e.recentOrders || []).map(function (row) {
      var name = row.templateName ? L(row.templateName) : row.templateId;
      return '<div class="queue-row"><div class="queue-main"><p class="queue-title">' + esc(row.orderNo) + ' · ' + esc(name) + '</p>' +
        '<p class="queue-sub">' + esc(row.paidAt || '') + ' · ' + esc(licLabel(row.licenseType)) + '</p></div>' +
        '<div class="queue-cell"><span class="queue-cell-key">' + esc(t('earn.gross')) + '</span><span class="queue-value od-nowrap">' + money(row.priceCents) + '</span></div>' +
        '<div class="queue-cell"><span class="queue-cell-key">' + esc(t('earn.net')) + '</span><span class="queue-value od-nowrap">' + money(row.sellerAmountCents) + '</span></div>' +
        '<div class="queue-cell">' + statusBadge(row.paymentStatus) + '</div></div>';
    }).join('');
    return '<section class="shell section">' + head +
      '<div class="tabs" style="margin-top:24px">' + ranges + '</div>' +
      '<p class="section-note" style="margin-top:8px">' + esc(t('earn.rangeNote', { from: e.from, to: e.to })) + '</p>' +
      metrics +
      '<div class="adm-records-grid" style="margin-top:24px">' +
        '<div class="adm-block"><p class="adm-block-title">' + esc(t('earn.byTemplate')) + '</p>' + (templateRows || '<p class="panel-text">' + esc(t('earn.empty')) + '</p>') + '</div>' +
        '<div class="adm-block"><p class="adm-block-title">' + esc(t('earn.byDate')) + '</p>' + (seriesRows || '<p class="panel-text">' + esc(t('earn.empty')) + '</p>') + '</div>' +
        '<div class="adm-block"><p class="adm-block-title">' + esc(t('earn.recent')) + '</p>' + (orderRows || '<p class="panel-text">' + esc(t('earn.empty')) + '</p>') + '</div>' +
      '</div></section>';
  }

  function refundDialogHTML(detail, mode) {
    var complaint = detail.complaint || {};
    var order = detail.order || {};
    var evaluation = detail.evaluation || {};
    var blockers = (evaluation.blockers || []).map(function (b) { return '<li>' + esc(t('adm.refundBlock.' + b)) + '</li>'; }).join('');
    var amount = evaluation.fullRefundCents || order.paymentAmountMinor || 0;
    var title = mode === 'reject' ? t('adm.refundRejectTitle') : t('adm.refundTitle');
    var body = '<p class="dlg-text">' + esc(complaint.id || '') + ' · ' + esc(order.orderNo || '') + '</p>' +
      '<div class="summary-table">' +
        '<div class="summary-row"><span>' + esc(t('earn.gross')) + '</span><span class="summary-value">' + money(order.priceCents || 0) + '</span></div>' +
        '<div class="summary-row"><span>' + esc(t('earn.fees')) + '</span><span class="summary-value">' + money(order.platformFeeCents || 0) + '</span></div>' +
        '<div class="summary-row"><span>' + esc(t('earn.net')) + '</span><span class="summary-value">' + money(order.sellerAmountCents || 0) + '</span></div>' +
        '<div class="summary-row"><span>' + esc(t('adm.refundAmount')) + '</span><span class="summary-value">' + money(amount) + '</span></div>' +
      '</div>' +
      (mode === 'reject' ? '' : '<p class="field-hint">' + esc(t('adm.refundFullNote')) + '</p>') +
      (blockers ? '<div class="gate-note" style="margin-top:12px"><ul class="gate-list">' + blockers + '</ul></div>' : '') +
      '<div class="field" style="margin-top:16px"><label class="field-label" for="refund-reason">' + esc(t('adm.refundReason')) + '</label>' +
      '<textarea class="textarea" id="refund-reason" rows="3" placeholder="' + esc(t('adm.refundReasonHint')) + '"></textarea></div>' +
      '<div class="dlg-actions">' +
      '<button type="button" class="btn btn-ghost" data-action="close-dialog">' + esc(t('common.close')) + '</button>' +
      (mode === 'reject'
        ? '<button type="button" class="btn btn-danger" data-action="refund-confirm-reject" data-id="' + esc(complaint.id || '') + '">' + esc(t('adm.refundReject')) + '</button>'
        : '<button type="button" class="btn btn-primary" data-action="refund-confirm-approve" data-id="' + esc(complaint.id || '') + '" data-amount="' + esc(amount) + '"' + ((blockers || evaluation.eligible === false) ? ' disabled' : '') + '>' + esc(t('adm.refundConfirm')) + '</button>') +
      '</div>';
    return '<h2 class="dlg-title">' + esc(title) + '</h2>' + body;
  }

  function takedownDialogHTML(template) {
    var name = template && template.name ? L(template.name) : (template && template.id) || '';
    return '<h2 class="dlg-title">' + esc(t('adm.takedownTitle')) + '</h2>' +
      '<p class="dlg-text">' + esc(name) + ' · ' + esc(template && template.version ? 'v' + template.version : '') + '</p>' +
      '<div class="field"><p class="field-label">' + esc(t('adm.takedownMode')) + '</p>' +
        '<label class="check-item"><input type="radio" name="takedown-mode" value="suspend" checked /><span class="check-text">' + esc(t('adm.takedownSuspend')) + '</span></label>' +
        '<label class="check-item"><input type="radio" name="takedown-mode" value="remove" /><span class="check-text">' + esc(t('adm.takedownRemove')) + '</span></label>' +
      '</div>' +
      '<p class="field-hint">' + esc(t('adm.takedownEffect')) + '</p>' +
      '<div class="field" style="margin-top:12px"><label class="field-label" for="takedown-reason">' + esc(t('adm.takedownReason')) + '</label>' +
        '<textarea class="textarea" id="takedown-reason" rows="3" placeholder="' + esc(t('adm.takedownReasonPlaceholder')) + '"></textarea>' +
        '<p class="field-hint">' + esc(t('adm.takedownReasonHint')) + '</p></div>' +
      '<div class="dlg-actions"><button type="button" class="btn btn-ghost" data-action="close-dialog">' + esc(t('common.cancel')) + '</button>' +
        '<button type="button" class="btn btn-danger" data-action="takedown-confirm" data-id="' + esc(template && template.id || '') + '">' + esc(t('adm.takedownConfirm')) + '</button></div>';
  }

function adminHTML() {
    if (!state.signedIn) return signInGate('adm.title');
    if (state.isAdmin === false) return signInGate('ui.forbidden');
    if (state.admin.selected) return adminDetailHTML();
    return state.admin.tab === 'records' ? adminRecordsHTML() : adminQueueHTML();
}

function adminDetailHTML() {
    var sub = null;
    for (var i = 0; i < state.admin.queue.length; i++) {
      if (state.admin.queue[i].id === state.admin.selected) { sub = state.admin.queue[i]; break; }
    }
    if (!sub) { state.admin.selected = null; return adminQueueHTML(); }
    var blockers = submissionBlockers(sub);
    var canApprove = blockers.length === 0;
    var assets = sub.previews || [];
    var license = sub.packageLicense || {};

    var assetsHTML = assets.length ? assets.map(function (p) {
      var ok = p.licenseStatus === 'passed';
      return '<div class="asset-row">' +
        '<img class="asset-thumb" src="' + esc(p.url) + '" alt="" width="64" height="40" />' +
        '<div class="od-fill"><p class="asset-name">' + esc(p.kind === 'video' ? 'preview.mp4' : 'preview.jpg') + '</p>' +
          '<p class="asset-meta">' + esc(p.licenseName) + ' · ' + esc(p.licenseSource) + '</p>' +
          (ok ? '' : '<p class="asset-note" data-tone="danger">' + esc(t('sell.assetNotPublic')) + '</p>') +
        '</div>' + statusBadge(p.licenseStatus) + '</div>';
    }).join('') : '<p class="panel-text">' + esc(t('adm.noPreview')) + '</p>';

    var findings = (sub.scanFindings || []).length
      ? sub.scanFindings.map(function (f) {
        return '<div class="finding-row"><span class="finding-code">' + esc(f.code) + ' · ' + esc(f.path) + '</span>' +
          '<span>' + esc(L(f.message)) + '</span></div>';
      }).join('')
      : '<p class="panel-text">' + esc(t('adm.noFindings')) + '</p>';

    var gate = canApprove
      ? '<div class="gate-note" data-ok="true"><p class="field-label" style="margin:0">' + icon('check') + esc(t('adm.readyNote')) + '</p></div>'
      : '<div class="gate-note"><p class="field-label" style="margin:0">' + icon('alert') + esc(t('adm.blockedNote')) + '</p>' +
        '<ul class="gate-list">' + blockers.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></div>';

    var inner = '<div class="adm-detail-head">' +
        '<button type="button" class="btn btn-secondary btn-sm" data-action="admin-back">' + '← ' + esc(t('adm.back')) + '</button>' +
        '<div><p class="eyebrow">' + esc(sub.id) + '</p><h2 class="section-title" style="font-size:var(--fs-xl);margin-top:4px">' + esc(L(sub.title)) + '</h2>' +
          '<p class="section-note">' + esc(sub.seller) + ' · ' + esc(sub.submittedAt) + ' · ' + money(sub.priceUsdCents) + '</p></div>' +
      '</div>' +
      '<div class="adm-detail">' +
        '<div>' +
          '<div class="adm-block"><p class="adm-block-title">' + esc(t('sell.scanTitle')) + '</p>' +
            '<div class="panel-box"><div class="scan-grid">' +
              '<div><p class="panel-key">' + esc(t('sell.scanStatusLabel')) + '</p><div style="margin-top:6px">' + statusBadge(sub.scanStatus) + '</div></div>' +
              '<div><p class="panel-key">' + esc(t('sell.scanJobShort')) + '</p><p class="panel-value">' + esc(sub.scanJobId) + '</p></div>' +
              '<div><p class="panel-key">' + esc(t('sell.parserLabel')) + '</p><div style="margin-top:6px">' + statusBadge(sub.parserStatus === 'parsed' ? 'passed' : 'unknown', sub.parserStatus === 'parsed' ? 'st.passed' : 'st.unknown') + '</div></div>' +
              '<div><p class="panel-key">' + esc(t('adm.metric.conflict')) + '</p><div style="margin-top:6px">' + (sub.conflictFlag ? statusBadge('failed', 'adm.conflictYes') : statusBadge('passed', 'adm.conflictNo')) + '</div></div>' +
            '</div>' +
            '<div class="scan-line"><span>' + esc(t('sell.conflictFile')) + '</span><span>' + esc(license.file) + '</span></div>' +
            '<div class="scan-line"><span>' + esc(t('sell.scanDetected')) + '</span><span>' + esc(license.detected) + '</span></div>' +
            '<div class="scan-line"><span>' + esc(t('sell.conflictExcerpt')) + '</span><span>' + esc(license.excerpt) + '</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="adm-block"><p class="adm-block-title">' + esc(t('adm.urlTitle')) + '</p>' +
            '<div class="panel-box"><div class="od-cluster" style="justify-content:space-between">' +
              statusBadge(sub.urlAuthorityStatus === 'accepted' ? 'accepted' : sub.urlAuthorityStatus === 'rejected' ? 'failed' : 'pending',
                sub.urlAuthorityStatus === 'accepted' ? 'sell.urlAccepted' : sub.urlAuthorityStatus === 'rejected' ? 'st.failed' : 'sell.urlRejected') +
              '<span class="panel-key">' + esc(t('adm.capturedAt', { t: sub.capturedAt })) + '</span></div>' +
              (sub.proofLink ? '<p class="panel-key" style="margin-top:10px">' + esc(t('sell.proofLink')) + '</p><p class="panel-text" style="overflow-wrap:anywhere">' + esc(sub.proofLink) + '</p>' : '') +
              '<p class="panel-text">' + esc(sub.pageSummary ? L(sub.pageSummary) : t('sell.urlPending')) + '</p></div>' +
          '</div>' +
          '<div class="adm-block"><p class="adm-block-title">' + esc(t('sell.proofFiles')) + '</p>' +
            '<div class="panel-box">' + ((sub.proofFiles || []).length ? sub.proofFiles.map(function (f) { return '<div class="scan-line"><span>' + esc(f.name || f) + '</span><span>' + esc(f.size || t('sell.proofOnlyAdmin')) + '</span></div>'; }).join('') : '<p class="panel-text">' + esc(t('sell.proofFilesHint')) + '</p>') + '</div>' +
          '</div>' +
          '<div class="adm-block"><p class="adm-block-title">' + esc(t('adm.assetsTitle')) + '</p>' + assetsHTML + '</div>' +
          '<div class="adm-block"><p class="adm-block-title">' + esc(t('adm.scanFindings')) + '</p>' + findings + '</div>' +
        '</div>' +
        '<aside class="panel panel-sticky">' +
          '<p class="filter-label">' + esc(t('adm.decision')) + '</p>' + gate +
          '<div class="field" style="margin-top:16px"><label class="field-label" for="adm-reject">' + esc(t('adm.rejectReason')) + '</label>' +
            '<textarea class="textarea" id="adm-reject" rows="3" data-admin-reason placeholder="' + esc(t('adm.rejectReasonHint')) + '">' + esc(state.admin.reason) + '</textarea>' +
            '<p class="field-hint">' + esc(t('adm.rejectReasonHint')) + '</p></div>' +
          '<div class="dlg-actions" style="justify-content:flex-start">' +
            '<button type="button" class="btn btn-primary" data-action="admin-approve"' + (canApprove ? '' : ' disabled') + '>' + esc(t('adm.approve')) + '</button>' +
            '<button type="button" class="btn btn-danger" id="adm-reject-btn" data-action="admin-reject"' + (state.admin.reason.trim().length >= 8 ? '' : ' disabled') + '>' + esc(t('adm.reject')) + '</button>' +
          '</div>' +
          '<p class="field-hint" style="margin-top:10px">' + esc(t('adm.rejectNote')) + '</p>' +
          '<button type="button" class="btn btn-secondary btn-block" style="margin-top:16px" data-action="admin-buyer" data-id="' + esc(sub.id) + '">' + esc(t('adm.buyerPreview')) + '</button>' +
        '</aside>' +
      '</div>';
    return adminShellHTML(inner);
  }

function adminQueueHTML() {
    var queue = state.admin.queue;
    var parserIssues = queue.filter(function (s) { return s.parserStatus !== 'parsed'; }).length;
    var conflicts = queue.filter(function (s) { return s.conflictFlag; }).length;
    var assetIssues = queue.filter(function (s) { return !submissionAssetsOk(s); }).length;
    var scanIssues = queue.filter(function (s) { return s.scanStatus !== 'passed'; }).length;
    var metrics = '<div class="metric-strip">' +
      '<div class="metric"><span class="metric-key">' + esc(t('adm.metric.parser')) + '</span><span class="metric-num">' + parserIssues + '</span></div>' +
      '<div class="metric"><span class="metric-key">' + esc(t('adm.metric.conflict')) + '</span><span class="metric-num">' + conflicts + '</span></div>' +
      '<div class="metric"><span class="metric-key">' + esc(t('adm.metric.assets')) + '</span><span class="metric-num">' + assetIssues + '</span></div>' +
      '<div class="metric"><span class="metric-key">' + esc(t('adm.metric.scan')) + '</span><span class="metric-num">' + scanIssues + '</span></div>' +
      '</div>';

    if (!queue.length) {
      return adminShellHTML(metrics + '<div class="empty" style="margin-top:24px">' + icon('check') +
        '<p class="empty-title">' + esc(t('adm.empty')) + '</p>' +
        '<p class="empty-text">' + esc(t('adm.emptyText')) + '</p></div>');
    }

    var rows = queue.map(function (sub) {
      return '<div class="queue-row">' +
        '<div class="queue-main"><p class="queue-title">' + esc(L(sub.title)) + '</p>' +
          '<p class="queue-sub">' + esc(sub.seller) + ' · ' + esc(sub.id) + ' · ' + esc(sub.submittedAt) + '</p></div>' +
        '<div class="queue-cell"><span class="queue-cell-key">' + esc(t('checkout.price')) + '</span><span class="queue-value od-nowrap">' + money(sub.priceUsdCents) + '</span></div>' +
        '<div class="queue-cell"><span class="queue-cell-key">' + esc(t('adm.metric.parser')) + '</span>' +
          statusBadge(sub.parserStatus === 'parsed' ? 'passed' : 'unknown', sub.parserStatus === 'parsed' ? 'st.passed' : 'st.unknown') + '</div>' +
        '<div class="queue-cell"><span class="queue-cell-key">' + esc(t('adm.metric.conflict')) + '</span>' +
          (sub.conflictFlag ? statusBadge('failed', 'adm.conflictYes') : statusBadge('passed', 'adm.conflictNo')) + '</div>' +
        '<div class="queue-cell"><span class="queue-cell-key">' + esc(t('adm.metric.scan')) + '</span>' + statusBadge(sub.scanStatus) + '</div>' +
        '<div class="queue-cell"><button type="button" class="btn btn-secondary btn-sm" data-action="admin-open" data-id="' + esc(sub.id) + '">' + esc(t('adm.open')) + '</button></div>' +
      '</div>';
    }).join('');

    return adminShellHTML(metrics + '<div class="queue-list">' + rows + '</div>');
  }

function submissionAssetsOk(sub) {
    return (sub.previews || []).every(function (p) { return p.licenseStatus === 'passed'; });
  }

function adminShellHTML(inner) {
    var tab = state.admin.tab;
    return '<section class="shell section">' +
      '<div class="adm-head"><div><p class="eyebrow">' + esc(t('header.admin')) + '</p>' +
        '<h1 class="sell-title">' + esc(t('adm.title')) + '</h1>' +
        '<p class="sell-sub">' + esc(t('adm.queueSub')) + '</p></div>' +
        '<div class="od-cluster"><button type="button" class="btn btn-secondary btn-sm" data-action="go-market">' + esc(t('sell.backToMarket')) + '</button></div></div>' +
      '<div class="tabs" style="margin-top:24px">' +
        '<button type="button" class="tab" data-action="admin-tab" data-tab="queue" aria-pressed="' + (tab === 'queue') + '">' + esc(t('adm.queue')) + '</button>' +
        '<button type="button" class="tab" data-action="admin-tab" data-tab="records" aria-pressed="' + (tab === 'records') + '">' + esc(t('adm.records')) + '</button>' +
      '</div>' + inner + '</section>';
  }

function submissionBlockers(sub) {
    var out = [];
    if (sub.conflictFlag) out.push(t('adm.block.conflict'));
    if (sub.parserStatus !== 'parsed') out.push(t('adm.block.parser'));
    if (!submissionAssetsOk(sub)) out.push(t('adm.block.assets'));
    if (sub.scanStatus !== 'passed') out.push(t('sell.scanTimeoutNote'));
    if (sub.urlAuthorityStatus !== 'accepted') out.push(t('sell.urlRejected'));
    return out;
  }

function adminRecordsHTML() {
    var items = (state.admin && state.admin.complaints) || [];
    var open = items.filter(function (item) { return item.complaint.status !== 'resolved' && item.complaint.status !== 'rejected'; });
    var templates = (state.admin && state.admin.templates) || [];
    var audit = (state.audit || []).slice(0, 5).map(function (a) {
      var diff = a.diff || [];
      return '<div class="adm-audit"><div class="od-cluster" style="justify-content:space-between">' +
        '<span class="panel-key">' + esc(a.id) + ' · ' + esc(a.targetId || '') + '</span>' +
        '<span class="panel-key">' + esc(a.at) + '</span></div>' +
        '<p class="field-hint" style="margin-top:2px">' + esc(t('adm.auditActor')) + ': ' + esc(a.actor) + '</p>' +
        '<table class="diff-table"><thead><tr><th>' + esc(t('adm.field')) + '</th><th>' + esc(t('adm.before')) + '</th><th>' + esc(t('adm.after')) + '</th></tr></thead><tbody>' +
        diff.map(function (d) { return '<tr><td>' + esc(d.field) + '</td><td>' + esc(d.before) + '</td><td>' + esc(d.after) + '</td></tr>'; }).join('') +
        '</tbody></table></div>';
    }).join('');

    var complaints = open.length ? open.map(function (item) {
      var c = item.complaint; var order = item.order || {};
      var name = item.templateName ? L(item.templateName) : c.templateId;
      var refund = item.refund;
      var actions = refund && (refund.status === 'pending' || refund.status === 'succeeded')
        ? statusBadge(refund.status === 'succeeded' ? 'passed' : 'pending', refund.status === 'succeeded' ? 'adm.refundDone' : 'adm.refundPending')
        : '<div class="od-cluster"><button type="button" class="btn btn-primary btn-sm" data-action="refund-open" data-id="' + esc(c.id) + '">' + esc(t('adm.refundAction')) + '</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="refund-reject" data-id="' + esc(c.id) + '">' + esc(t('adm.refundReject')) + '</button></div>';
      return '<div class="adm-record"><div class="od-fill"><p class="queue-title">' + esc(name) + '</p>' +
        '<p class="queue-sub">' + esc(c.id) + ' · ' + esc(order.orderNo || c.orderId) + ' · ' + esc(t('cp.reason.' + c.reason)) + '</p>' +
        '<p class="queue-sub">' + esc(item.buyerEmail || '') + ' · ' + esc(t('earn.downloads', { n: item.downloadCount || 0 })) + '</p></div>' +
        statusBadge(c.status) + actions + '</div>';
    }).join('') : '<p class="panel-text">' + esc(t('adm.noneOpen')) + '</p>';

    var liveRows = templates.length ? templates.map(function (tpl) {
      var name = tpl.name ? L(tpl.name) : tpl.id;
      return '<div class="adm-record"><div class="od-fill"><p class="queue-title">' + esc(name) + '</p>' +
        '<p class="queue-sub">' + esc(tpl.id) + ' · v' + esc(tpl.version) + ' · ' + money(tpl.priceUsdCents) + '</p></div>' +
        statusBadge('active', 'adm.takedownLive') +
        '<button type="button" class="btn btn-danger btn-sm" data-action="takedown-open" data-id="' + esc(tpl.id) + '">' + esc(t('adm.takedown')) + '</button></div>';
    }).join('') : '<p class="panel-text">' + esc(t('adm.empty')) + '</p>';

    return adminShellHTML(
      '<div class="adm-records-grid">' +
        '<div class="adm-block"><p class="adm-block-title">' + esc(t('adm.complaintQueue')) + '</p>' + complaints + '</div>' +
        '<div class="adm-block"><p class="adm-block-title">' + esc(t('adm.audit')) + '</p>' + (audit || '<p class="panel-text">' + esc(t('adm.empty')) + '</p>') + '</div>' +
        '<div class="adm-block"><p class="adm-block-title">' + esc(t('adm.liveTitles')) + '</p>' + liveRows + '</div>' +
      '</div>'
    );
  }

function freshSell() {
    return {
      name: '', category: '', summary: '', priceCents: '',
      previews: [],
      pkgName: '', pkgSize: 0, scanning: false, scanned: false,
      scanJobId: '', scanStatus: '', scanFindings: [], parserStatus: '',
      licenseType: '', decl: [false, false, false],
      signer: '', signDate: new Date().toISOString().slice(0, 10),
      proofFiles: [], proofLink: '', urlStatus: '', urlCapturedAt: '', urlSummary: '',
      errors: {}, showErrors: false,
      submitted: false, manualReview: false
    };
  }
return { render(options) { state = Object.assign(state, options); state.sell = state.sell || freshSell(); state.cpError = ''; const views = {market:marketHTML,detail:detailHTML,seller:sellHTML,library:libraryHTML,complaints:complaintsHTML,admin:adminHTML,earnings:earningsHTML}; return (views[state.route] || detailHTML)(); }, translate(key, vars) { return t(key, vars); }, policy: refundSummaryHTML, refundDialog: refundDialogHTML, takedownDialog: takedownDialogHTML };
}
