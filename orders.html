<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<meta name="description" content="View your Heavy Soul order history.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Heavy Soul">
<meta property="og:title" content="My Orders — Heavy Soul">
<meta property="og:description" content="View your Heavy Soul order history.">
<meta property="og:image" content="https://heavysoul.in/assets/og-image.jpg">
<meta property="og:url" content="https://heavysoul.in/orders.html">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="My Orders — Heavy Soul">
<meta name="twitter:description" content="View your Heavy Soul order history.">
<meta name="twitter:image" content="https://heavysoul.in/assets/og-image.jpg">
<title>My Orders — Heavy Soul</title>
<link rel="stylesheet" href="css/style.css">
<style>
  /* ===== DARK / LIME THEME (scoped to this page, matches track.html) ===== */
  body.orders-dark{
    --paper:#0b0d0a; --paper-soft:#12160f; --ink:#f3f4ef; --ink-soft:#b9bdb0; --ink-faint:#7c8273;
    --line:#242b20; --accent:#b6f23a;
    background:#0b0d0a; color:var(--ink);
  }
  body.orders-dark .btn{ background:var(--accent); color:#0b0d0a; border-color:var(--accent); font-weight:700; }
  body.orders-dark .btn.outline{ background:transparent; color:var(--ink); border-color:var(--line); }

  .orders-hero{
    background:radial-gradient(1200px 400px at 80% -10%, rgba(182,242,58,.10), transparent), #0b0d0a;
    text-align:left; padding:56px 24px 40px;
  }
  .orders-hero > *{ max-width:1080px; margin-left:auto; margin-right:auto; }
  .orders-hero .eyebrow{ color:var(--accent); font-family:var(--mono); font-size:11.5px; letter-spacing:.08em; text-transform:uppercase; }
  .orders-hero h1{ font-family:var(--serif); font-size:40px; font-weight:600; margin:10px 0 8px; text-transform:uppercase; }
  .orders-hero p{ color:var(--ink-soft); font-size:14px; max-width:480px; margin:0; }

  .orders-section{ max-width:1080px; margin:34px auto 90px; padding:0 24px; }

  /* ---- controls: search + filter tabs ---- */
  .orders-controls{ display:flex; gap:12px; flex-wrap:wrap; align-items:center; justify-content:space-between; margin-bottom:22px; }
  .orders-search{ position:relative; flex:1; min-width:220px; max-width:320px; }
  .orders-search input{
    width:100%; padding:11px 14px 11px 38px; background:var(--paper-soft); border:1px solid var(--line);
    border-radius:10px; color:var(--ink); font-size:13.5px;
  }
  .orders-search input::placeholder{ color:var(--ink-faint); }
  .orders-search input:focus{ outline:none; border-color:var(--accent); }
  .orders-search svg{ position:absolute; left:12px; top:50%; transform:translateY(-50%); width:15px; height:15px; color:var(--ink-faint); }

  .orders-tabs{ display:flex; gap:6px; flex-wrap:wrap; }
  .orders-tab{
    padding:8px 16px; border-radius:999px; border:1px solid var(--line); background:var(--paper-soft);
    color:var(--ink-soft); font-size:12.5px; font-family:var(--mono); text-transform:uppercase; letter-spacing:.03em;
    cursor:pointer; transition:all .15s ease;
  }
  .orders-tab.active{ background:var(--accent); color:#0b0d0a; border-color:var(--accent); font-weight:700; }
  .orders-tab:hover:not(.active){ border-color:var(--ink-faint); }

  /* ---- order card ---- */
  .order-card{
    background:var(--paper-soft); border:1px solid var(--line); border-radius:14px;
    padding:20px; margin-bottom:14px; display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap;
    transition:border-color .15s ease, transform .15s ease;
  }
  .order-card:hover{ border-color:#3a4530; transform:translateY(-1px); }
  .order-card-thumb{
    width:56px; height:56px; min-width:56px; border-radius:10px; background:#0b0d0a; border:1px solid var(--line);
    display:flex; align-items:center; justify-content:center; font-size:24px;
  }
  .order-card-body{ flex:1; min-width:200px; }
  .order-card-top{ display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:6px; }
  .order-card-id{ font-family:var(--mono); font-size:13px; color:var(--accent); font-weight:600; }
  .order-card-date{ font-size:11.5px; color:var(--ink-faint); }
  .order-card-items{ font-size:13px; color:var(--ink-soft); margin-bottom:10px; }
  .order-card-items span{ color:var(--ink-faint); }

  .order-badge-row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:10px; min-height:22px; }
  .status-badge{
    display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:999px;
    font-size:11px; font-family:var(--mono); text-transform:uppercase; letter-spacing:.03em; font-weight:700;
    border:1px solid transparent;
  }
  .status-badge::before{ content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }
  .status-badge.s-confirmed{ background:rgba(182,242,58,.08); color:#b6f23a; border-color:rgba(182,242,58,.3); }
  .status-badge.s-packed{ background:rgba(182,242,58,.08); color:#b6f23a; border-color:rgba(182,242,58,.3); }
  .status-badge.s-shipped{ background:rgba(90,170,255,.1); color:#6aa6ff; border-color:rgba(90,170,255,.3); }
  .status-badge.s-outfordelivery{ background:rgba(255,185,70,.1); color:#ffb946; border-color:rgba(255,185,70,.3); }
  .status-badge.s-delivered{ background:rgba(130,220,140,.12); color:#7fe08c; border-color:rgba(130,220,140,.3); }
  .status-badge.s-cancelled{ background:rgba(230,100,100,.1); color:#e67a7a; border-color:rgba(230,100,100,.3); }
  .status-badge.s-loading{ background:var(--paper-soft); color:var(--ink-faint); border-color:var(--line); }

  .edd-chip{ font-size:11.5px; color:var(--ink-faint); font-family:var(--mono); }
  .edd-chip b{ color:var(--ink); }

  .cancellable-chip{
    font-size:10.5px; color:#ffb946; font-family:var(--mono); background:rgba(255,185,70,.08);
    border:1px solid rgba(255,185,70,.25); padding:3px 9px; border-radius:999px;
  }

  .order-card-total{ font-size:14px; font-weight:700; color:var(--ink); white-space:nowrap; }

  .order-card-actions{ display:flex; gap:8px; width:100%; margin-top:12px; }
  .order-card-actions .btn{ flex:1; text-align:center; padding:10px 14px; font-size:12.5px; border-radius:9px; }

  .order-empty{
    text-align:center; padding:60px 24px; border:1px solid var(--line); background:var(--paper-soft); border-radius:14px;
  }
  .order-empty svg{ width:34px; height:34px; color:var(--ink-faint); margin-bottom:14px; }
  .order-empty p{ font-size:13.5px; color:var(--ink-soft); max-width:320px; margin:0 auto 18px; }

  .orders-login-prompt{
    text-align:center; padding:60px 24px; border:1px solid var(--line); background:var(--paper-soft); border-radius:14px;
  }
  .orders-login-prompt svg{ width:34px; height:34px; color:var(--ink-faint); margin-bottom:14px; }
  .orders-login-prompt p{ font-size:13.5px; color:var(--ink-soft); max-width:320px; margin:0 auto 18px; }

  /* ---- skeleton ---- */
  .order-skel{ background:var(--paper-soft); border:1px solid var(--line); border-radius:14px; padding:20px; margin-bottom:14px; display:flex; gap:16px; }
  .order-skel .sk-thumb{ width:56px; height:56px; border-radius:10px; }
  .order-skel .sk-body{ flex:1; }
  .sk-line{ height:10px; border-radius:4px; background:linear-gradient(90deg, var(--paper-soft) 25%, var(--line) 37%, var(--paper-soft) 63%); background-size:400% 100%; animation:skShimmer 1.4s ease infinite; margin-bottom:10px; }
  .sk-w30{ width:30%; } .sk-w60{ width:60%; } .sk-w40{ width:40%; }
  @keyframes skShimmer{ 0%{ background-position:100% 0; } 100%{ background-position:0 0; } }
</style>
</head>
<body class="orders-dark">

<header class="site-header">
  <nav class="nav wrap">
    <button class="nav-burger" onclick="toggleMobileNav()" aria-label="Menu"><span></span><span></span><span></span></button>
    <a href="index.html" class="brand">Heavy Soul<small>Est. 2026</small></a>
    <div class="nav-links">
      <a href="index.html">Home</a>
      <a href="shop.html">Shop</a>
      <a href="track.html">Track order</a>
      <a href="orders.html" class="active">Orders</a>
      <a href="policy.html">Policies</a>
      <a href="account.html" id="navLoginLink">Login / Signup</a>
    </div>
    <div class="nav-icons">
      <a class="icon-btn" id="accountBtn" href="account.html" aria-label="Login / Signup">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.7-3.6 5-5.5 7.5-5.5s5.8 1.9 7.5 5.5"/></svg>
      </a>
      <a class="icon-btn" href="cart.html" aria-label="Cart">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
        <span class="cart-count" id="cartCount">0</span>
      </a>
    </div>
  </nav>
  <div class="mobile-panel" id="mobilePanel">
    <a href="index.html">Home</a>
    <a href="shop.html">Shop</a>
    <a href="track.html">Track order</a>
    <a href="orders.html">Orders</a>
    <a href="policy.html">Policies</a>
    <a href="account.html" id="navLoginLinkMobile">Login / Signup</a>
  </div>
</header>

<div class="orders-hero">
  <p class="eyebrow">Order history</p>
  <h1>My orders</h1>
  <p>Every Heavy Soul order you've placed while logged in, in one place.</p>
</div>

<div class="orders-section">

  <!-- Shown while logged OUT -->
  <div id="ordersLoginPrompt" class="orders-login-prompt" style="display:none;">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7h13l3 4v6h-3"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M3 7v7h4"/></svg>
    <p>Log in to see your order history. Placed an order as a guest? Use Track Order with your Order ID instead.</p>
    <a href="account.html" class="btn accent">Login / Signup</a>
    <a href="track.html" class="btn outline" style="margin-left:8px;">Track an order</a>
  </div>

  <!-- Shown while logged IN -->
  <div id="ordersLoggedIn" style="display:none;">
    <div class="orders-controls">
      <div class="orders-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" id="orderSearchInput" placeholder="Search by Order ID or item…" autocomplete="off">
      </div>
      <div class="orders-tabs" id="ordersTabs">
        <button class="orders-tab active" data-filter="all">All</button>
        <button class="orders-tab" data-filter="active">Active</button>
        <button class="orders-tab" data-filter="delivered">Delivered</button>
        <button class="orders-tab" data-filter="cancelled">Cancelled</button>
      </div>
    </div>

    <div id="ordersList">
      <div class="order-skel"><div class="sk-thumb sk-line"></div><div class="sk-body"><div class="sk-line sk-w30"></div><div class="sk-line sk-w60"></div><div class="sk-line sk-w40"></div></div></div>
      <div class="order-skel"><div class="sk-thumb sk-line"></div><div class="sk-body"><div class="sk-line sk-w30"></div><div class="sk-line sk-w60"></div><div class="sk-line sk-w40"></div></div></div>
    </div>
  </div>

</div>

<footer class="site-footer">
  <div class="wrap">
    <div class="footer-bottom">
      <span>© 2026 Heavy Soul. All rights reserved.</span>
      <span>Prices in INR · Ships across India</span>
      <span>Trade Reg. No. 3549 (Saptagram GP, Hooghly)</span>
    </div>
  </div>
</footer>

<script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js"></script>
<script src="js/config.js"></script>
<script src="js/analytics.js"></script>
<script src="js/auth.js"></script>
<script src="js/msg91-otp.js"></script>
<script src="js/auth-unified.js"></script>
<script src="js/orders.js"></script>
<script src="js/nav.js"></script>
<script>
const STATUS_ICON_CLASS = {
  "confirmed": "s-confirmed",
  "packed": "s-packed",
  "shipped": "s-shipped",
  "out for delivery": "s-outfordelivery",
  "delivered": "s-delivered",
  "cancelled": "s-cancelled"
};

let allOrdersCache = [];
let statusCache = {}; // orderId -> {status, estimatedDelivery, eddIsEstimate, cancelEligible, cancelDeadline}
let currentFilter = "all";

function renderOrderCard(order){
  const date = order.createdAt && order.createdAt.toDate ? order.createdAt.toDate() : null;
  const dateStr = date ? date.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '';
  const items = order.items || [];
  const itemsText = items.map(it => `${it.name}${it.size && it.size !== '-' ? ' (' + it.size + ')' : ''} ×${it.qty || 1}`).join(', ');
  const total = order.subtotal || order.amountPaid || 0;
  const st = statusCache[order.orderId];

  let badgeHtml = `<span class="status-badge s-loading">Checking…</span>`;
  let eddHtml = "";
  let cancellableHtml = "";

  if (st) {
    const sKey = String(st.status || "").toLowerCase();
    const cls = STATUS_ICON_CLASS[sKey] || "s-confirmed";
    badgeHtml = `<span class="status-badge ${cls}">${escapeHtml(st.status || "Confirmed")}</span>`;

    if (st.estimatedDelivery && sKey !== "delivered" && sKey !== "cancelled") {
      eddHtml = `<span class="edd-chip">${st.eddIsEstimate ? "Est. delivery (approx.)" : "Est. delivery"}: <b>${escapeHtml(formatEddDate(st.estimatedDelivery))}</b></span>`;
    }
    if (st.cancelEligible) {
      cancellableHtml = `<span class="cancellable-chip">Cancellable</span>`;
    }
  }

  return `
    <div class="order-card" data-order-id="${escapeHtml(order.orderId)}" data-status="${st ? escapeHtml(String(st.status || '').toLowerCase()) : ''}" data-search="${escapeHtml((order.orderId + ' ' + itemsText).toLowerCase())}">
      <div class="order-card-thumb">👕</div>
      <div class="order-card-body">
        <div class="order-card-top">
          <span class="order-card-id">${escapeHtml(order.orderId)}</span>
          <span class="order-card-date">${dateStr}</span>
        </div>
        <div class="order-badge-row" data-badge-slot>
          ${badgeHtml}
          ${eddHtml}
          ${cancellableHtml}
        </div>
        <div class="order-card-items">${escapeHtml(itemsText)}</div>
        <div class="order-card-top" style="margin-bottom:0;">
          <span class="order-card-total">₹${total}</span>
        </div>
        <div class="order-card-actions">
          <a href="track.html?order=${encodeURIComponent(order.orderId)}" class="btn outline">Track order</a>
          <button type="button" class="btn" onclick="reorderItems_('${escapeHtml(order.orderId)}')">Reorder</button>
        </div>
      </div>
    </div>
  `;
}

function reorderItems_(orderId){
  const order = allOrdersCache.find(o => o.orderId === orderId);
  if (!order || !order.items) { if (typeof showToast === "function") showToast("Couldn't find items for this order"); return; }
  const cart = JSON.parse(localStorage.getItem("cart")) || [];
  order.items.forEach(it => {
    cart.push({ name: it.name, size: it.size || "-", qty: it.qty || 1, price: it.price || 0, sku: it.sku || "", image: it.image || "" });
  });
  localStorage.setItem("cart", JSON.stringify(cart));
  if (typeof showToast === "function") showToast("Added to bag");
  window.location.href = "cart.html";
}

function applyFiltersAndRender(){
  const listEl = document.getElementById('ordersList');
  const q = (document.getElementById('orderSearchInput').value || "").trim().toLowerCase();

  let filtered = allOrdersCache.filter(o => {
    const st = statusCache[o.orderId];
    const sKey = st ? String(st.status || "").toLowerCase() : "";

    if (currentFilter === "delivered" && sKey !== "delivered") return false;
    if (currentFilter === "cancelled" && sKey !== "cancelled") return false;
    if (currentFilter === "active" && (sKey === "delivered" || sKey === "cancelled")) return false;

    if (q) {
      const itemsText = (o.items || []).map(it => it.name).join(' ').toLowerCase();
      if (!o.orderId.toLowerCase().includes(q) && !itemsText.includes(q)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="order-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7h13l3 4v6h-3"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M3 7v7h4"/></svg>
        <p>${allOrdersCache.length === 0 ? "No orders yet." : "No orders match this filter."} <a href="shop.html" style="color:var(--accent);">Start shopping →</a></p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered.map(renderOrderCard).join('');
}

async function hydrateOrderStatuses(orders){
  const url = SITE_CONFIG.APPS_SCRIPT_URL;
  if (!url || url.includes('PASTE-YOUR')) return;

  await Promise.all(orders.slice(0, 12).map(async (o) => {
    try {
      const res = await fetch(url + '?orderId=' + encodeURIComponent(o.orderId));
      const d = await res.json();
      if (!d.found) return;
      statusCache[o.orderId] = d;
    } catch (e) { /* leave as "Checking…" */ }
  }));
  applyFiltersAndRender();
}

async function loadAndRenderOrders(){
  const orders = await loadUserOrders();
  allOrdersCache = orders;

  if (orders.length === 0) {
    applyFiltersAndRender();
    return;
  }

  applyFiltersAndRender(); // render immediately with "Checking…" badges
  hydrateOrderStatuses(orders);
}

document.getElementById('ordersTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.orders-tab');
  if (!btn) return;
  document.querySelectorAll('.orders-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  applyFiltersAndRender();
});

let searchDebounce;
document.getElementById('orderSearchInput').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(applyFiltersAndRender, 200);
});

document.addEventListener('DOMContentLoaded', function(){
  if (!authReady()) return;
  firebase.auth().onAuthStateChanged(function(user){
    document.getElementById('ordersLoginPrompt').style.display = user ? 'none' : 'block';
    document.getElementById('ordersLoggedIn').style.display = user ? 'block' : 'none';
    if (user){
      loadAndRenderOrders();
    }
  });
});
</script>

</body>
</html>
