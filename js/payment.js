const cart = JSON.parse(localStorage.getItem("cart")) || [];
const shippingInfo = JSON.parse(localStorage.getItem("shippingInfo") || "null");

if (cart.length === 0) window.location.href = "shop.html";
if (!shippingInfo) window.location.href = "checkout.html";

let paymentMethod = "prepaid";

const checkoutItems = document.getElementById("checkoutItems");
let subtotal = 0, customTotal = 0, collectionQty = 0, totalQty = 0;

cart.forEach(item => {
  const qty = item.qty || 1;
  const lineTotal = item.price * qty;
  subtotal += lineTotal;
  totalQty += qty;

  if (item.orderType === "custom") customTotal += lineTotal;
  else collectionQty += qty;

  checkoutItems.innerHTML += `
    <div class="mini-item">
      <img src="${item.image}" alt="${item.name}">
      <div>
        <div class="name">${item.name}</div>
        <div class="meta">Size ${item.size || "-"} · Qty ${qty}</div>
        <div class="meta">₹${lineTotal}${item.orderType === "custom" ? " · Made to order" : ""}</div>
      </div>
    </div>
  `;
});

document.getElementById("subtotalVal").textContent = "₹" + subtotal;

function calcCodAdvance(){
  let advance = 0;
  if (customTotal > 0) advance += Math.round(customTotal * SITE_CONFIG.CUSTOM_ADVANCE_PERCENT);
  if (collectionQty > 0) advance += SITE_CONFIG.COD_FLAT_ADVANCE * collectionQty;
  return Math.min(advance, subtotal);
}

function renderAmounts(){
  const dueLabel = document.getElementById("dueLabel");
  const dueVal = document.getElementById("dueVal");
  const rowHandling = document.getElementById("rowHandling");
  const handlingVal = document.getElementById("handlingVal");
  const rowGrandTotal = document.getElementById("rowGrandTotal");
  const grandTotalVal = document.getElementById("grandTotalVal");
  const rowRemaining = document.getElementById("rowRemaining");
  const remainingVal = document.getElementById("remainingVal");

  let amountDue;

  if (paymentMethod === "prepaid") {
    dueLabel.textContent = "Pay now";
    dueVal.textContent = "₹" + subtotal;
    rowHandling.classList.add("hidden");
    rowGrandTotal.classList.add("hidden");
    rowRemaining.classList.add("hidden");
    amountDue = subtotal;
  } else {
    const advance = calcCodAdvance();
    const handling = SITE_CONFIG.COD_HANDLING_PER_ITEM * totalQty;
    const grandTotal = subtotal + handling;
    const balance = grandTotal - advance;

    handlingVal.textContent = "₹" + handling;
    grandTotalVal.textContent = "₹" + grandTotal;
    remainingVal.textContent = "₹" + balance;
    dueLabel.textContent = "Advance to pay now";
    dueVal.textContent = "₹" + advance;

    rowHandling.classList.remove("hidden");
    rowGrandTotal.classList.remove("hidden");
    rowRemaining.classList.remove("hidden");
    amountDue = advance;
  }

  updateUpiLink(amountDue);
}

function updateUpiLink(amount){
  const btn = document.getElementById("upiPayBtn");
  const amountLabel = document.getElementById("upiPayAmount");
  if (!btn) return;
  amountLabel.textContent = amount;
  const note = encodeURIComponent("HEAVY SOUL Order");
  const link = `upi://pay?pa=${encodeURIComponent(SITE_CONFIG.UPI_ID)}&pn=${encodeURIComponent(SITE_CONFIG.UPI_PAYEE_NAME)}&am=${amount}&cu=INR&tn=${note}`;
  btn.href = link;
}

function setMethod(method){
  paymentMethod = method;
  document.getElementById("btnPrepaid").classList.toggle("active", method === "prepaid");
  document.getElementById("btnCod").classList.toggle("active", method === "cod");
  renderAmounts();
}

renderAmounts();
document.getElementById("upiIdText").textContent = SITE_CONFIG.UPI_ID;

let deadline = Number(localStorage.getItem("paymentDeadline"));
const windowMs = SITE_CONFIG.PAYMENT_WINDOW_MINUTES * 60 * 1000;
if (!deadline || deadline < Date.now()) {
  deadline = Date.now() + windowMs;
  localStorage.setItem("paymentDeadline", String(deadline));
}

const clock = document.getElementById("clock");
const timerBox = document.getElementById("timerBox");

function cancelOrder(){
  localStorage.removeItem("cart");
  localStorage.removeItem("shippingInfo");
  localStorage.removeItem("paymentDeadline");
  document.getElementById("paymentMain").classList.add("hidden");
  document.getElementById("cancelledView").classList.remove("hidden");
}

const tickInterval = setInterval(() => {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    clearInterval(tickInterval);
    clock.textContent = "00:00";
    cancelOrder();
    return;
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  clock.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  if (remainingMs <= 2 * 60 * 1000) timerBox.classList.add("danger");
}, 1000);

function copyUPI(){
  navigator.clipboard.writeText(SITE_CONFIG.UPI_ID);
  showToast("UPI ID copied");
}

function sendOrderToSheet(orderId, shippingInfo, amountDue, paymentMethod, codCollectAmount, grandTotalAmount){
  const url = SITE_CONFIG.APPS_SCRIPT_URL;
  if (!url || url.includes("PASTE-YOUR")) return;

  const fullAddress = `${shippingInfo.address}, ${shippingInfo.state} - ${shippingInfo.pin}`;

  // Rough weight estimate — 300g per item. Adjust WEIGHT_PER_ITEM_G in config.js
  // once you know real per-product weights.
  const totalQty = cart.reduce((n, item) => n + (item.qty || 1), 0);
  const estWeight = totalQty * (SITE_CONFIG.WEIGHT_PER_ITEM_G || 300);

  const items = cart.map(item => ({
    name: item.name,
    size: item.size || "-",
    qty: item.qty || 1,
    price: item.price
  }));

  fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      orderId: orderId,
      customerName: shippingInfo.name,
      phone: shippingInfo.phone,
      address: shippingInfo.address,
      city: shippingInfo.city || "",
      state: shippingInfo.state,
      pincode: shippingInfo.pin,
      fullAddress: fullAddress,
      amount: amountDue,
      codAmount: codCollectAmount || 0,
      grandTotal: grandTotalAmount || amountDue,
      paymentType: paymentMethod === "cod" ? "cod" : "prepaid",
      weight: estWeight,
      items: items
    })
  }).catch(() => {});
}

function generateOrderId(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `HS-${y}${m}${d}-${rand}`;
}

function placeOrder(){
  if (deadline - Date.now() <= 0) {
    showToast("Payment window has expired — please check out again");
    return;
  }

  const utr = document.getElementById("utr").value.trim();
  if (!utr) {
    showToast("Enter your UPI transaction ID (UTR) after paying");
    return;
  }

  const orderId = generateOrderId();
  const amountDue = paymentMethod === "prepaid" ? subtotal : calcCodAdvance();
  const handling = paymentMethod === "cod" ? (SITE_CONFIG.COD_HANDLING_PER_ITEM * totalQty) : 0;
  const grandTotal = subtotal + handling;
  const remaining = paymentMethod === "cod" ? (grandTotal - amountDue) : 0;

  let orderLines = "";
  cart.forEach(item => {
    const qty = item.qty || 1;
    orderLines += `• ${item.name}\nSize: ${item.size || "-"}\nQty: ${qty}\nPrice: ₹${item.price * qty}${item.orderType === "custom" ? " (Custom)" : ""}\n\n`;
  });

  const message = `🛍️ *NEW ORDER — HEAVY SOUL*

Order ID: ${orderId}

Name: ${shippingInfo.name}
Phone: ${shippingInfo.phone}
Email: ${shippingInfo.email || "-"}

Address:
${shippingInfo.address}

State: ${shippingInfo.state}
PIN: ${shippingInfo.pin}

--------------------
${orderLines}Item Total: ₹${subtotal}${paymentMethod === "cod" ? `\nCOD Handling Charge: ₹${handling}\nTotal Payable: ₹${grandTotal}` : ""}
Payment Method: ${paymentMethod === "prepaid" ? "Prepaid (Full Payment)" : "COD (Advance Paid)"}
Amount Paid Now: ₹${amountDue}${paymentMethod === "cod" ? `\nBalance (Pay on Delivery): ₹${remaining}` : ""}

UTR:
${utr}

Track your order anytime: ${window.location.origin}${window.location.pathname.replace("payment.html","track.html")}?order=${encodeURIComponent(orderId)}

Please verify payment and confirm the order.`;

  sendOrderToSheet(orderId, shippingInfo, amountDue, paymentMethod, remaining, grandTotal);

  window.open(`https://wa.me/${SITE_CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank");

  clearInterval(tickInterval);
  localStorage.removeItem("cart");
  localStorage.removeItem("shippingInfo");
  localStorage.removeItem("paymentDeadline");

  window.location.href = `success.html?order=${encodeURIComponent(orderId)}`;
}
