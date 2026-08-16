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
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
      <div>
        <div class="name">${escapeHtml(item.name)}</div>
        <div class="meta">Size ${escapeHtml(item.size || "-")} · Qty ${qty}</div>
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

  const payBtn = document.getElementById("payBtn");
  if (payBtn) payBtn.textContent = "Pay ₹" + amountDue;

  // Mirror into the sticky pay bar so the amount + action stay visible while scrolling.
  const barDueLabel = document.getElementById("barDueLabel");
  const barDueVal = document.getElementById("barDueVal");
  const barRemainingSub = document.getElementById("barRemainingSub");
  if (barDueLabel) barDueLabel.textContent = dueLabel.textContent;
  if (barDueVal) barDueVal.textContent = dueVal.textContent;
  if (barRemainingSub) {
    if (paymentMethod === "cod") {
      barRemainingSub.textContent = "+ ₹" + remainingVal.textContent.replace("₹", "") + " on delivery";
      barRemainingSub.classList.remove("hidden");
    } else {
      barRemainingSub.classList.add("hidden");
    }
  }

  const codNote = document.getElementById("codNote");
  const codExplainer = document.getElementById("codExplainer");
  if (codNote) codNote.style.display = paymentMethod === "cod" ? "block" : "none";
  if (codExplainer) codExplainer.style.display = paymentMethod === "cod" ? "block" : "none";
}

function setMethod(method){
  paymentMethod = method;
  document.getElementById("btnPrepaid").classList.toggle("active", method === "prepaid");
  document.getElementById("btnCod").classList.toggle("active", method === "cod");
  renderAmounts();
}

renderAmounts();

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
  const payBar = document.getElementById("payBar");
  const payBarSpacer = document.getElementById("payBarSpacer");
  if (payBar) payBar.classList.add("hidden");
  if (payBarSpacer) payBarSpacer.classList.add("hidden");
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

function buildOrderPayload_(orderId, amountDue){
  const fullAddress = `${shippingInfo.address}, ${shippingInfo.state} - ${shippingInfo.pin}`;
  const estWeight = totalQty * (SITE_CONFIG.WEIGHT_PER_ITEM_G || 300);
  const handling = paymentMethod === "cod" ? (SITE_CONFIG.COD_HANDLING_PER_ITEM * totalQty) : 0;
  const grandTotal = subtotal + handling;
  const remaining = paymentMethod === "cod" ? (grandTotal - amountDue) : 0;

  const items = cart.map(item => ({
    name: item.name,
    size: item.size || "-",
    qty: item.qty || 1,
    price: item.price
  }));

  return {
    orderId: orderId,
    customerName: shippingInfo.name,
    phone: shippingInfo.phone,
    email: shippingInfo.email || "",
    address: shippingInfo.address,
    city: shippingInfo.city || "",
    state: shippingInfo.state,
    pincode: shippingInfo.pin,
    fullAddress: fullAddress,
    amount: amountDue,
    codAmount: remaining,
    grandTotal: grandTotal,
    paymentType: paymentMethod === "cod" ? "cod" : "prepaid",
    weight: estWeight,
    items: items
  };
}

function sendOrderToSheet(orderPayload){
  const url = SITE_CONFIG.APPS_SCRIPT_URL;
  if (!url || url.includes("PASTE-YOUR")) return;

  fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(orderPayload)
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

// ---------------- RAZORPAY INTEGRATION LOGIC ----------------

async function placeOrder(){
  if (deadline - Date.now() <= 0) {
    showToast("Payment window has expired — please check out again");
    return;
  }
  // Prepaid = full amount via Razorpay. COD = advance amount via Razorpay,
  // balance stays payable on delivery.
  await startRazorpayPayment();
}

async function startRazorpayPayment() {
  const amountDue = paymentMethod === "prepaid" ? subtotal : calcCodAdvance();

  const payBtn = document.getElementById("payBtn");
  if (payBtn) { payBtn.disabled = true; payBtn.textContent = "Please wait…"; }

  // Order ID banano hocche payment-er AGE, jate webhook eta diye order match korte pare
  const orderId = generateOrderId();
  const orderPayload = buildOrderPayload_(orderId, amountDue);

  try {
    // 1. Razorpay order fast-e create koro — eta Cloudflare Worker route
    //    (/api/create-order), Google Apps Script na. Eta shudhu Razorpay-r
    //    sathe kotha bole, tai milliseconds-e ferot ase.
    const response = await fetch("/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ amount: amountDue }, orderPayload))
    });

    const rzpOrderData = await response.json();

    if (!rzpOrderData.success) {
      showToast("Payment creation failed: " + rzpOrderData.error);
      resetPayButton_();
      return;
    }

    // 2. Open Razorpay Checkout Pop-up
    var options = {
      "key": "rzp_live_TLJ04Y2T7hnl5m", // TODO: Put your Razorpay Key here!
      "amount": amountDue * 100, 
      "currency": "INR",
      "name": "Heavy Soul",
      "description": "Order Payment",
      "order_id": rzpOrderData.order_id,
      "handler": function (response) {
        // 3. Complete order on success (webhook will also write it — duplicate-safe)
        finalizeOrder(response.razorpay_payment_id, orderId, orderPayload);
      },
      "prefill": {
        "name": shippingInfo.name,
        "contact": shippingInfo.phone,
        "email": shippingInfo.email || ""
      },
      "theme": {
        "color": "#14120F"
      },
      "modal": {
        "ondismiss": function () {
          resetPayButton_();
        }
      }
    };

    var rzp = new Razorpay(options);
    rzp.on('payment.failed', function (response){
      showToast("Payment failed! " + response.error.description);
      resetPayButton_();
    });
    rzp.open();
  } catch (error) {
    showToast("Server error. Please try again.");
    console.error(error);
    resetPayButton_();
  }
}

function resetPayButton_(){
  const payBtn = document.getElementById("payBtn");
  if (!payBtn) return;
  payBtn.disabled = false;
  const amountDue = paymentMethod === "prepaid" ? subtotal : calcCodAdvance();
  payBtn.textContent = "Pay ₹" + amountDue;
}

async function finalizeOrder(paymentRef, orderId, orderPayload) {
  const amountDue = orderPayload.amount;
  const handling = paymentMethod === "cod" ? (SITE_CONFIG.COD_HANDLING_PER_ITEM * totalQty) : 0;
  const grandTotal = orderPayload.grandTotal;
  const remaining = orderPayload.codAmount;

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
Payment Method: ${paymentMethod === "prepaid" ? "Prepaid (Online)" : "COD (Advance Paid)"}
Amount Paid Now: ₹${amountDue}${paymentMethod === "cod" ? `\nBalance (Pay on Delivery): ₹${remaining}` : ""}

Payment Reference (Razorpay):
${paymentRef}

Track your order anytime: ${window.location.origin}${window.location.pathname.replace("payment.html","track.html")}?order=${encodeURIComponent(orderId)}

Please verify payment and confirm the order.`;

  // Backup write in case the webhook hasn't landed yet — Apps Script skips
  // this as a duplicate if the webhook already created the row. Fire-and-forget
  // is fine here since it's a best-effort backup, not shown anywhere in the UI.
  sendOrderToSheet(orderPayload);

  // If the customer is logged in, save this order under their account too,
  // so it shows up in "My Orders" on account.html. MUST be awaited — the
  // redirect right below can otherwise cancel this write mid-flight.
  if (window.firebase && typeof saveOrderRecord === "function") {
    await saveOrderRecord(orderPayload);
  }

  window.open(`https://wa.me/${SITE_CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank");

  clearInterval(tickInterval);
  localStorage.removeItem("cart");
  localStorage.removeItem("shippingInfo");
  localStorage.removeItem("paymentDeadline");

  window.location.href = `success.html?order=${encodeURIComponent(orderId)}&value=${amountDue}`;
}
