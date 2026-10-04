const STATUS_STEPS = ["Confirmed", "Packed", "Shipped", "Out for Delivery", "Delivered"];
const AUTO_REFRESH_MS = 30000;

const form = document.getElementById("trackForm");
const input = document.getElementById("orderIdInput");
const resultBox = document.getElementById("trackResult");

let currentOrderId = null;
let refreshTimer = null;
let cancelCountdownTimer = null;

const urlOrder = new URLSearchParams(window.location.search).get("order");
const autoFillNote = document.getElementById("autoFillNote");
if (urlOrder) {
  input.value = urlOrder;
  if (autoFillNote) autoFillNote.classList.add("show");
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = input.value.trim();
  if (!id) return;
  if (autoFillNote) autoFillNote.classList.remove("show");
  lookupOrder(id, true);
});

// Event delegation — resultBox.innerHTML gets replaced on every render/refresh,
// so we attach one listener here instead of re-binding a button listener each time.
resultBox.addEventListener("click", (e) => {
  const btn = e.target.closest(".cancel-order-btn");
  if (btn) handleCancelClick(btn);
});

async function lookupOrder(orderId, showLoading){
  if (showLoading) {
    resultBox.innerHTML = `
      <div class="track-skeleton">
        <div class="sk-line sk-w60"></div>
        <div class="sk-steps">
          <div class="sk-dot"></div><div class="sk-dot"></div><div class="sk-dot"></div><div class="sk-dot"></div><div class="sk-dot"></div>
        </div>
        <div class="sk-line sk-w40"></div>
        <div class="sk-line sk-w80"></div>
      </div>
    `;
  }

  const url = SITE_CONFIG.APPS_SCRIPT_URL;
  if (!url || url.includes("PASTE-YOUR")) {
    resultBox.innerHTML = `<p class="hint pin-error">Live tracking isn't connected yet. Please message us on WhatsApp with your Order ID and we'll update you directly.</p>`;
    return;
  }

  try {
    const res = await fetch(`${url}?orderId=${encodeURIComponent(orderId)}`);
    const data = await res.json();
    if (!data.found) {
      stopAutoRefresh();
      stopCancelCountdown();
      resultBox.innerHTML = `<p class="hint pin-error">No order found with ID "${escapeHtml(orderId)}". Please double-check, or contact us on WhatsApp.</p>`;
      return;
    }
    currentOrderId = orderId;
    renderStatus(data);
    startAutoRefresh(orderId);
  } catch (err) {
    if (showLoading) {
      resultBox.innerHTML = `<p class="hint pin-error">Couldn't fetch tracking info right now. Please try again shortly, or contact us on WhatsApp.</p>`;
    }
  }
}

function startAutoRefresh(orderId){
  stopAutoRefresh();
  refreshTimer = setInterval(() => {
    lookupOrder(orderId, false);
  }, AUTO_REFRESH_MS);
}

function stopAutoRefresh(){
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

/* =========================================================
   24HR SELF-SERVICE CANCEL
   ========================================================= */

function stopCancelCountdown(){
  if (cancelCountdownTimer) {
    clearInterval(cancelCountdownTimer);
    cancelCountdownTimer = null;
  }
}

function buildCancelSectionHtml(data){
  if (String(data.status || "").toLowerCase() === "cancelled") {
    return `
      <div class="hint" style="margin-top:16px;">
        This order has been cancelled.
      </div>
    `;
  }

  if (!data.cancelEligible) {
    return data.cancelIneligibleReason ? `
      <div class="hint" style="margin-top:16px;">
        ${escapeHtml(data.cancelIneligibleReason)}
      </div>
    ` : "";
  }

  return `
    <div class="cancel-card" style="margin-top:16px;">
      <button type="button" class="btn outline cancel-order-btn">Cancel Order</button>
      <p class="hint cancel-countdown" style="margin-top:8px; font-size:12px; opacity:0.7;"></p>
    </div>
  `;
}

function startCancelCountdown(deadlineIso){
  stopCancelCountdown();
  const countdownEl = resultBox.querySelector(".cancel-countdown");
  if (!countdownEl || !deadlineIso) return;

  const deadline = new Date(deadlineIso).getTime();

  const tick = () => {
    const msLeft = deadline - Date.now();
    if (msLeft <= 0) {
      countdownEl.textContent = "Cancellation window has closed.";
      const btn = resultBox.querySelector(".cancel-order-btn");
      if (btn) btn.remove();
      stopCancelCountdown();
      return;
    }
    const hrs = Math.floor(msLeft / 3600000);
    const mins = Math.floor((msLeft % 3600000) / 60000);
    countdownEl.textContent = `Cancellable for ${hrs}h ${mins}m more`;
  };

  tick();
  cancelCountdownTimer = setInterval(tick, 60000);
}

async function handleCancelClick(btn){
  if (!currentOrderId) return;
  if (!confirm("Cancel this order? This cannot be undone.")) return;

  const url = SITE_CONFIG.APPS_SCRIPT_URL;
  btn.disabled = true;
  btn.textContent = "Cancelling...";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight on Apps Script
      body: JSON.stringify({
        type: "cancel_order",
        orderId: currentOrderId,
        apiToken: SITE_CONFIG.API_TOKEN || ""
      })
    });

    const data = await res.json();

    if (data.success) {
      stopCancelCountdown();
      alert(data.message || "Your order has been cancelled.");
      lookupOrder(currentOrderId, true);
    } else {
      alert(data.error || "Could not cancel this order. Please try again or contact us on WhatsApp.");
      btn.disabled = false;
      btn.textContent = "Cancel Order";
    }
  } catch (err) {
    alert("Something went wrong. Please try again or contact us on WhatsApp.");
    btn.disabled = false;
    btn.textContent = "Cancel Order";
  }
}

const CHECKPOINT_ICONS = {
  pickup: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h13l3 4v6h-3"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M3 7v7h4"/></svg>`,
  facility: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21V9l9-5 9 5v12"/><path d="M9 21v-6h6v6"/></svg>`,
  transit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h13l3 4v6h-3"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>`,
  outfordelivery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h11M13 6l6 6-6 6"/></svg>`,
  delivered: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6 9 17l-5-5"/></svg>`,
  default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/></svg>`
};

function iconForStatus(statusText){
  const s = String(statusText || "").toLowerCase();
  if (s.includes("delivered")) return CHECKPOINT_ICONS.delivered;
  if (s.includes("out for delivery")) return CHECKPOINT_ICONS.outfordelivery;
  if (s.includes("pickup") || s.includes("picked up")) return CHECKPOINT_ICONS.pickup;
  if (s.includes("facility") || s.includes("center") || s.includes("centre") || s.includes("warehouse")) return CHECKPOINT_ICONS.facility;
  if (s.includes("trip") || s.includes("transit") || s.includes("bag") || s.includes("arrived") || s.includes("departed")) return CHECKPOINT_ICONS.transit;
  return CHECKPOINT_ICONS.default;
}

const STEP_LABELS = ["Order Placed", "Packed", "Shipped", "Out for Delivery", "Delivered"];
const STATUS_COPY = {
  "Confirmed":        ["Order Confirmed", "We've received your order and are getting it ready."],
  "Packed":           ["Packed", "Your order is packed and waiting for courier pickup."],
  "Shipped":          ["Shipped", "Your order is on its way to you."],
  "Out for Delivery": ["Out for Delivery", "Your order is out for delivery and will reach you soon. Please keep an eye on your phone."],
  "Delivered":        ["Delivered", "Your order has been delivered. Thank you for choosing Heavy Soul!"],
  "Cancelled":        ["Cancelled", "This order has been cancelled."]
};

function renderStatus(data){
  const status = String(data.status || "");
  const currentIndex = STATUS_STEPS.findIndex(s => s.toLowerCase() === status.toLowerCase());
  const isDelivered = currentIndex === STATUS_STEPS.length - 1;
  const isCancelled = status.toLowerCase() === "cancelled";
  const isOutForDelivery = STATUS_STEPS[currentIndex] === "Out for Delivery";
  const progressPct = currentIndex >= 0 ? (currentIndex / (STATUS_STEPS.length - 1)) * 100 : 0;
  const copy = STATUS_COPY[status] || [status || "Processing", ""];
  const latest = (data.history && data.history.length > 0) ? data.history[0] : null;
  const e = escapeHtml;

  const stepsHtml = STATUS_STEPS.map((step, i) => {
    const done = currentIndex >= 0 && i <= currentIndex;
    const isCurrent = i === currentIndex && !isDelivered;
    const stamp = (i === currentIndex && latest && latest.time) ? `<small>${e(latest.time)}</small>` : "";
    return `
      <div class="step-col">
        <span class="step-dot ${done ? "done" : ""} ${isCurrent ? "pulse" : ""}">
          ${done && !isCurrent ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg>` : ""}
        </span>
        <span class="step-label ${done ? "done" : ""}">${STEP_LABELS[i]}${stamp}</span>
      </div>`;
  }).join("");

  const eddHtml = (data.estimatedDelivery && !isDelivered && !isCancelled) ? `
    <div class="tk-edd"><small>${data.eddIsEstimate ? "Estimated Delivery (approx.)" : "Estimated Delivery"}</small><b>${e(formatEddDate(data.estimatedDelivery))}</b></div>` : "";

  const awbHtml = data.awb ? `
    <div class="tk-row">
      <div><small>Tracking Number</small><b>${e(data.awb)}</b>
        <button type="button" class="tk-copy" onclick="navigator.clipboard&&navigator.clipboard.writeText('${e(data.awb)}');typeof showToast==='function'&&showToast('Tracking number copied')">Copy</button></div>
      ${data.trackingLink ? `<a href="${e(data.trackingLink)}" target="_blank" rel="noopener" class="btn outline">Track on courier site →</a>` : ""}
    </div>` : "";

  const locHtml = (latest && !isCancelled) ? `
    <div class="tk-row tk-loc"><div><small>Current location</small><b>${e(latest.location || "In transit")}</b>
      <small style="margin-top:4px;">${e(latest.status)}${latest.time ? " · " + e(latest.time) : ""}</small></div></div>` : "";

  // Real checkpoint map (Leaflet + free OpenStreetMap tiles) — not live GPS,
  // but each courier scan's city/hub is geocoded to a real lat/lon pin.
  // The <div> is just a placeholder here; initRouteMap_() fills it in
  // asynchronously after this HTML is in the DOM (see end of this function).
  const routeMapHtml = (!isCancelled && currentIndex >= 0) ? `<div id="trackRouteMap" class="route-map-leaflet"></div>` : "";

  const hasRiderInfo = data.riderName || data.riderPhone;
  const courierHtml = (hasRiderInfo && !isDelivered) ? `
    <div class="rider-card">
      <div class="rider-info">
        ${data.courierServiceName ? `<div class="rider-service">${e(data.courierServiceName)}</div>` : ""}
        <div class="rider-name">${e(data.riderName || "Delivery partner")}</div>
      </div>
      ${data.riderPhone ? `<a href="tel:${e(data.riderPhone)}" class="rider-call">Call</a>` : ""}
    </div>` : (isOutForDelivery ? `
    <div class="rider-card muted"><div class="rider-info"><div class="rider-name">Your parcel is out for delivery</div>
      <div class="rider-sub">Courier partner hasn't shared rider contact for this shipment</div></div></div>` : "");

  const historyHtml = (data.history && data.history.length > 0) ? `
    <div class="checkpoint-timeline">
      <p class="eyebrow" style="margin-top:28px;">Shipment activity</p>
      ${data.history.map((entry, i) => `
        <div class="checkpoint-item ${i === 0 ? "latest" : ""}" style="animation-delay:${i * 60}ms;">
          <span class="checkpoint-icon ${i === 0 ? "latest" : ""}">${iconForStatus(entry.status)}</span>
          <div class="checkpoint-content">
            <div class="checkpoint-status">${e(entry.status)}</div>
            <div class="checkpoint-meta">
              ${entry.location ? `<span>${e(entry.location)}</span>` : ""}
              ${entry.time ? `<span>${e(entry.time)}</span>` : ""}
            </div>
          </div>
        </div>`).join("")}
    </div>` : "";

  const items = Array.isArray(data.items) ? data.items : [];
  const itemsHtml = items.map(it => `
    <div class="tk-item">
      <div class="tk-item-ico">👕</div>
      <div style="flex:1;"><b>${e(it.name)}</b><br><span style="color:var(--ink-faint);">${it.size && it.size !== "-" ? "Size " + e(it.size) + " · " : ""}Qty ${Number(it.qty) || 1}</span></div>
      <b>₹${(Number(it.price) || 0) * (Number(it.qty) || 1)}</b>
    </div>`).join("");

  const payLabel = String(data.paymentType || "").toLowerCase() === "cod" ? "Cash on Delivery" : "Prepaid (Online)";
  const wa = "https://wa.me/" + (SITE_CONFIG.WHATSAPP_NUMBER || "919339909978");

  const sideHtml = `
    <aside class="tk-side">
      ${itemsHtml}
      <h3>Order details</h3>
      <div class="tk-kv"><small>Order ID</small>${e(data.orderId)}</div>
      ${(data.estimatedDelivery && !isDelivered && !isCancelled) ? `<div class="tk-kv"><small>Estimated delivery</small>${e(formatEddDate(data.estimatedDelivery))}</div>` : ""}
      ${data.address ? `<div class="tk-kv"><small>Shipping address</small>${e(data.address)}</div>` : ""}
      ${data.customerName ? `<div class="tk-kv"><small>Name</small>${e(data.customerName)}</div>` : ""}
      <div class="tk-kv"><small>Payment method</small>${payLabel}${data.amount ? " · ₹" + e(data.amount) : ""}</div>
      <a class="tk-help" href="${wa}" target="_blank" rel="noopener"><b>Need help?</b><br>Contact us on WhatsApp →</a>
    </aside>`;

  resultBox.innerHTML = `
    <div class="tk-grid">
      <div class="track-card">
        <span class="tk-pill">ORDER #${e(data.orderId)}</span>
        <div class="tk-head">
          <div><h2 class="tk-title">${e(copy[0])}</h2><p class="tk-sub">${e(copy[1])}</p></div>
          ${eddHtml}
        </div>
        ${isCancelled ? "" : `<div class="status-track"><div class="status-track-line"><div class="status-track-line-fill" style="width:${progressPct}%;"></div></div><div class="status-track-steps">${stepsHtml}</div></div>`}
        ${awbHtml}
        ${routeMapHtml}
        ${locHtml}
        ${courierHtml}
        ${historyHtml}
        ${buildCancelSectionHtml(data)}
        <p class="hint" style="margin-top:16px; font-size:12px; opacity:0.6;"><span class="live-dot small"></span> Live status — updates automatically</p>
      </div>
      ${sideHtml}
    </div>`;

  if (data.cancelEligible && data.cancelDeadline) {
    startCancelCountdown(data.cancelDeadline);
  } else {
    stopCancelCountdown();
  }

  initRouteMap_(data, latest, isDelivered, isCancelled);
}

/* =========================================================
   CHECKPOINT MAP (Leaflet + free OpenStreetMap/Nominatim)
   Not live GPS — Delhivery only exposes hub/city-level scan
   checkpoints, not a continuous moving position. Each scan's
   location name is geocoded (via our own /api/geocode proxy,
   which calls Nominatim) into a real lat/lon, so the map always
   shows the most recent known checkpoint. It updates whenever a
   new scan comes in on the 30s auto-refresh.
   ========================================================= */

let _routeMap = null;
let _geocodeMemCache = (() => {
  try { return JSON.parse(localStorage.getItem("hs_geocode_cache") || "{}"); }
  catch (e) { return {}; }
})();

function saveGeocodeMemCache_(){
  try { localStorage.setItem("hs_geocode_cache", JSON.stringify(_geocodeMemCache)); }
  catch (e) { /* storage full/unavailable — fine, just skip persisting */ }
}

async function geocode_(query){
  const key = String(query).trim().toLowerCase();
  if (!key) return null;
  if (_geocodeMemCache[key]) return _geocodeMemCache[key];

  try {
    const res = await fetch("/api/geocode?q=" + encodeURIComponent(query));
    const data = await res.json();
    if (!data.success) return null;
    const point = { lat: data.lat, lon: data.lon };
    _geocodeMemCache[key] = point;
    saveGeocodeMemCache_();
    return point;
  } catch (e) {
    return null;
  }
}

// A raw customer-typed address ("house no:6/ thana: anandapur/ pin
// code:758021") rarely geocodes well as freeform text. A 6-digit PIN code
// searched structurally is far more reliable, so we pull one out of the
// address and prefer that; freeform text is only a fallback.
async function geocodePin_(pin){
  const key = "pin:" + pin;
  if (_geocodeMemCache[key]) return _geocodeMemCache[key];

  try {
    const res = await fetch("/api/geocode?pin=" + encodeURIComponent(pin));
    const data = await res.json();
    if (!data.success) return null;
    const point = { lat: data.lat, lon: data.lon };
    _geocodeMemCache[key] = point;
    saveGeocodeMemCache_();
    return point;
  } catch (e) {
    return null;
  }
}

function extractPincode_(address){
  const m = String(address || "").match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

// Straight-line ("as the crow flies") distance in km — not the real road
// route, just enough to give a rough sense of how far away the shipment is.
function haversineKm_(a, b){
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Delhivery location strings look like "Hooghly_Chinsurah_D (West Bengal)"
// — strip the trailing facility-code segment in parentheses and swap
// underscores for spaces so it geocodes as a normal place name.
function cleanLocationName_(raw){
  if (!raw) return "";
  return String(raw).replace(/_/g, " ").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

async function initRouteMap_(data, latest, isDelivered, isCancelled){
  const el = document.getElementById("trackRouteMap");
  if (!el || isCancelled || typeof L === "undefined") return;

  const originQuery = (window.SITE_CONFIG && SITE_CONFIG.WAREHOUSE_GEOCODE_QUERY) || "Hooghly, West Bengal, India";
  const destPincode = extractPincode_(data.address);
  const currentLocRaw = (latest && latest.location) ? cleanLocationName_(latest.location) : null;

  // Trail: every distinct hub the shipment has scanned through so far, in
  // chronological order (data.history is newest-first, so reverse it),
  // capped to the most recent 6 stops to keep the number of geocode calls
  // reasonable. This is what gets connected into the red dashed trail line.
  const chronological = (data.history || []).map(h => cleanLocationName_(h.location)).filter(Boolean).reverse();
  const trailLocs = [...new Set(chronological)].slice(-6);

  const [originPt, destPt, currentPt, trailPts] = await Promise.all([
    geocode_(originQuery),
    destPincode ? geocodePin_(destPincode) : (data.address ? geocode_(data.address + ", India") : Promise.resolve(null)),
    (currentLocRaw && !isDelivered) ? geocode_(currentLocRaw + ", India") : Promise.resolve(null),
    Promise.all(trailLocs.map(loc => geocode_(loc + ", India")))
  ]);

  if (!document.getElementById("trackRouteMap")) return; // page re-rendered again while we were waiting

  if (!originPt && !destPt && !currentPt) {
    el.innerHTML = `<p class="hint" style="padding:16px; font-size:12px; margin:0;">Map unavailable right now.</p>`;
    return;
  }

  if (_routeMap) { _routeMap.remove(); _routeMap = null; }

  _routeMap = L.map(el, { zoomControl: false, attributionControl: true }).setView([22.5, 88.3], 7);
  // Standard OpenStreetMap tiles — free, no API key. Darkened via a CSS
  // filter on the tile pane only (see .route-map-leaflet .leaflet-tile-pane
  // in track.html), so markers/popups stay normal-colored.
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(_routeMap);

  const dotIcon = (color, emoji) => L.divIcon({
    className: '',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${color};border:2px solid #0b0d0a;box-shadow:0 0 0 3px ${color}40;font-size:11px;">${emoji || ''}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  const bounds = [];
  if (originPt) {
    L.marker([originPt.lat, originPt.lon], { icon: dotIcon('#7c8273', '🏭') }).addTo(_routeMap).bindPopup("Warehouse");
    bounds.push([originPt.lat, originPt.lon]);
  }

  // Red dashed trail: warehouse → every scanned checkpoint so far → current
  // position (or the delivery address, once delivered). Grows stop by stop
  // as new scans come in on refresh — not a real road route, just a
  // straight-line "how far it's travelled" trail connecting the dots.
  const trailPoints = [];
  if (originPt) trailPoints.push([originPt.lat, originPt.lon]);
  trailPts.forEach(p => { if (p) trailPoints.push([p.lat, p.lon]); });
  if (isDelivered && destPt) trailPoints.push([destPt.lat, destPt.lon]);
  else if (currentPt) trailPoints.push([currentPt.lat, currentPt.lon]);

  // Drop consecutive duplicate points (same hub geocoded twice in a row)
  const dedupedTrail = trailPoints.filter((pt, i) => i === 0 ||
    Math.abs(pt[0] - trailPoints[i - 1][0]) > 0.0005 || Math.abs(pt[1] - trailPoints[i - 1][1]) > 0.0005);

  if (dedupedTrail.length > 1) {
    L.polyline(dedupedTrail, { color: '#e65c5c', weight: 3, opacity: 0.85, dashArray: '7 7' }).addTo(_routeMap);
    dedupedTrail.forEach(pt => bounds.push(pt));
  }

  // Truck icon marks the courier's last known scan checkpoint — this is
  // NOT a live GPS position, just the most recent hub/city Delhivery
  // reported. It moves to a new spot only when a new scan comes in.
  if (currentPt && !isDelivered) {
    L.marker([currentPt.lat, currentPt.lon], { icon: dotIcon('#b6f23a', '🚚') })
      .addTo(_routeMap)
      .bindTooltip("Heavy Soul Parcel", { permanent: true, direction: 'top', offset: [0, -13], className: 'truck-label' })
      .bindPopup("Last known checkpoint");
    bounds.push([currentPt.lat, currentPt.lon]);
  }
  if (destPt) {
    L.marker([destPt.lat, destPt.lon], { icon: dotIcon('#6aa6ff', '📍') }).addTo(_routeMap).bindPopup("Delivery address");
    bounds.push([destPt.lat, destPt.lon]);
  }

  if (bounds.length > 1) {
    _routeMap.fitBounds(bounds, { padding: [28, 28] });
  } else if (bounds.length === 1) {
    _routeMap.setView(bounds[0], 11);
  }

  // "How far" caption — straight-line distance from the last known
  // checkpoint (or the warehouse, if not shipped yet) to the delivery
  // address. Not the real road distance, just a rough sense of scale.
  const fromPt = (currentPt && !isDelivered) ? currentPt : originPt;
  let captionHtml = '';
  if (fromPt && destPt) {
    const km = haversineKm_(fromPt, destPt);
    const label = (currentPt && !isDelivered) ? 'from last known checkpoint' : 'from warehouse';
    captionHtml = `<div class="route-caption">~${km < 10 ? km.toFixed(1) : Math.round(km)} km ${label} to delivery address (straight-line, not road distance)</div>`;
  } else if (!destPt) {
    captionHtml = `<div class="route-caption">Couldn't pin the exact delivery address on the map — showing what we have.</div>`;
  }
  if (captionHtml) {
    const existingCap = el.parentNode.querySelector('.route-caption');
    if (existingCap) existingCap.remove();
    const cap = document.createElement('div');
    cap.innerHTML = captionHtml;
    el.parentNode.insertBefore(cap.firstChild, el.nextSibling);
  }
}
