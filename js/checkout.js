// Step 1: shipping details. Cart is read fresh from localStorage.
const orderCart = JSON.parse(localStorage.getItem("cart")) || [];

const checkoutItems = document.getElementById("checkoutItems");
const totalPriceEl = document.getElementById("checkoutTotal");

let total = 0;

if (orderCart.length === 0) {
  checkoutItems.innerHTML = `<p style="color:var(--ink-soft);">Your bag is empty. <a href="shop.html" style="color:var(--accent);">Go shopping →</a></p>`;
} else {
  orderCart.forEach(item => {
    const qty = item.qty || 1;
    total += item.price * qty;
    checkoutItems.innerHTML += `
      <div class="mini-item">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
        <div>
          <div class="name">${escapeHtml(item.name)}</div>
          <div class="meta">Size ${escapeHtml(item.size || "-")} · Qty ${qty}</div>
          <div class="meta">₹${item.price * qty}</div>
        </div>
      </div>
    `;
  });
}
totalPriceEl.textContent = "₹" + total;
const barTotalEl = document.getElementById("barTotal");
if (barTotalEl) barTotalEl.textContent = "₹" + total;

if (orderCart.length > 0 && typeof trackEvent === "function") {
  trackEvent("InitiateCheckout", { value: total, currency: "INR", num_items: orderCart.length });
}

// ---- Fields ----
const nameEl = document.getElementById("name");
const phoneEl = document.getElementById("phone");
const addressEl = document.getElementById("address");
const stateEl = document.getElementById("state");
const cityEl = document.getElementById("city");
const pinEl = document.getElementById("pin");
const pinChecking = document.getElementById("pinChecking");

// ---- Auto-fill from a previous order on this device (localStorage fallback) ----
const savedInfo = JSON.parse(localStorage.getItem("shippingInfo") || "null");
function fillShippingFields(info) {
  if (!info) return;
  nameEl.value = info.name || "";
  phoneEl.value = info.phone || "";
  document.getElementById("email").value = info.email || "";
  addressEl.value = info.address || "";
  stateEl.value = info.state || "";
  pinEl.value = info.pin || "";
  if (info.city) { cityEl.value = info.city; stateEl.dataset.city = info.city; }
}
fillShippingFields(savedInfo);

// ---- If logged in, prefer the address saved to their account (works across devices) ----
if (window.firebase) {
  firebase.auth().onAuthStateChanged(async function (user) {
    if (!user || typeof loadUserAddress !== "function") return;
    const accountAddress = await loadUserAddress();
    if (accountAddress) fillShippingFields(accountAddress);
  });
}

function validateField(el, errId, isValid){
  const errEl = document.getElementById(errId);
  const filled = el.value.trim().length > 0;
  if (!filled) {
    el.classList.remove("valid", "invalid");
    errEl.classList.remove("show");
    return;
  }
  if (isValid) {
    el.classList.add("valid");
    el.classList.remove("invalid");
    errEl.classList.remove("show");
  } else {
    el.classList.add("invalid");
    el.classList.remove("valid");
    errEl.classList.add("show");
  }
}

nameEl.addEventListener("input", () => validateField(nameEl, "err-name", nameEl.value.trim().length >= 2));
phoneEl.addEventListener("input", () => {
  phoneEl.value = phoneEl.value.replace(/\D/g, "").slice(0, 10);
  validateField(phoneEl, "err-phone", /^[6-9]\d{9}$/.test(phoneEl.value.trim()));
});
addressEl.addEventListener("input", () => validateField(addressEl, "err-address", addressEl.value.trim().length >= 10));

// ---- PIN code: validate + auto-fill state via the free India Post API ----
let pinLookupTimeout;
pinEl.addEventListener("input", () => {
  pinEl.value = pinEl.value.replace(/\D/g, "").slice(0, 6);
  const valid = /^\d{6}$/.test(pinEl.value.trim());
  validateField(pinEl, "err-pin", valid);
  pinChecking.textContent = "";
  pinChecking.classList.remove("pin-error", "ok");

  clearTimeout(pinLookupTimeout);
  if (!valid) return;

  pinLookupTimeout = setTimeout(async () => {
    pinChecking.textContent = "Checking PIN code…";
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pinEl.value.trim()}`);
      const data = await res.json();
      const po = data?.[0]?.PostOffice?.[0];
      if (po) {
        stateEl.value = po.State;
        stateEl.classList.add("valid");
        cityEl.value = po.District;
        cityEl.classList.add("valid");
        stateEl.dataset.city = po.District;
        pinChecking.textContent = `✓ Deliverable — ${po.District}, ${po.State}`;
        pinChecking.classList.add("ok");
      } else {
        stateEl.dataset.city = "";
        pinChecking.textContent = "✓ Deliverable to this area";
        pinChecking.classList.add("ok");
      }
    } catch {
      pinChecking.textContent = "✓ Deliverable to this area";
      pinChecking.classList.add("ok");
    }
  }, 500);
});

function goToPayment(){
  if (orderCart.length === 0) {
    showToast("Your bag is empty");
    return;
  }

  const name = nameEl.value.trim();
  const phone = phoneEl.value.trim();
  const email = document.getElementById("email").value.trim();
  const address = addressEl.value.trim();
  const state = stateEl.value.trim();
  const pin = pinEl.value.trim();

  validateField(nameEl, "err-name", name.length >= 2);
  validateField(phoneEl, "err-phone", /^[6-9]\d{9}$/.test(phone));
  validateField(addressEl, "err-address", address.length >= 10);
  validateField(pinEl, "err-pin", /^\d{6}$/.test(pin));

  if (!name || !/^[6-9]\d{9}$/.test(phone) || address.length < 10 || !state || !/^\d{6}$/.test(pin)) {
    showToast("Please check the highlighted fields");
    return;
  }

  const city = (cityEl.value || stateEl.dataset.city || "").trim();
  const shippingInfo = { name, phone, email, address, city, state, pin };
  localStorage.setItem("shippingInfo", JSON.stringify(shippingInfo));

  // If logged in, also save to their account so it's there next time on any device
  if (window.firebase && typeof saveUserAddress === "function") {
    saveUserAddress(shippingInfo);
  }

  logAbandonedCart(shippingInfo);

  localStorage.removeItem("paymentDeadline");
  localStorage.removeItem("paymentMethod");

  window.location.href = "payment.html";
}

function logAbandonedCart(shippingInfo){
  const url = SITE_CONFIG.APPS_SCRIPT_URL;
  if (!url || url.includes("PASTE-YOUR")) return;

  const cartSummary = orderCart
    .map(item => `${item.name} (${item.size || "-"}) x${item.qty || 1}`)
    .join(", ");

  fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      type: "abandoned_cart",
      customerName: shippingInfo.name,
      phone: shippingInfo.phone,
      cartSummary: cartSummary
    })
  }).catch(() => {});
}
