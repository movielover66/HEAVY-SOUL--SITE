// Cart storage + rendering. Loaded on every page so addToCart() is always available.
let cart = JSON.parse(localStorage.getItem("cart")) || [];

function saveCart(){
  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
}

function addToCart(product, size, qty){
  qty = qty || 1;
  const existing = cart.find(item => item.id === product.id && item.size === size);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
      orderType: product.orderType || "collection",
      size: size || "-",
      qty: qty
    });
  }
  saveCart();
  if (typeof showToast === "function") showToast("Added to bag");
  if (typeof trackEvent === "function") {
    trackEvent("AddToCart", { item_name: product.name, value: product.price, currency: "INR" });
  }
}

function changeQty(id, size, delta){
  const item = cart.find(i => i.id === id && i.size === size);
  if (!item) return;
  item.qty = (item.qty || 1) + delta;
  if (item.qty < 1) {
    cart = cart.filter(i => !(i.id === id && i.size === size));
  }
  saveCart();
  renderCartPage();
}

function removeItem(id, size){
  cart = cart.filter(item => !(item.id === id && item.size === size));
  saveCart();
  renderCartPage();
  if (typeof showToast === "function") showToast("Removed from bag");
}

function renderCartPage(){
  const container = document.getElementById("cartItems");
  if (!container) return;

  const empty = document.getElementById("cartEmpty");
  const layout = document.getElementById("cartLayout");

  if (cart.length === 0) {
    if (layout) layout.classList.add("hidden");
    if (empty) empty.classList.remove("hidden");
    return;
  }
  if (layout) layout.classList.remove("hidden");
  if (empty) empty.classList.add("hidden");

  container.innerHTML = "";
  let subtotal = 0;

  cart.forEach(item => {
    const qty = item.qty || 1;
    const lineTotal = item.price * qty;
    subtotal += lineTotal;

    container.innerHTML += `
      <div class="cart-row">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <div class="meta">Size ${escapeHtml(item.size || "-")} ${item.orderType === "custom" ? "· Made to order" : ""}</div>
          <div class="qty-row" style="margin-top:10px;">
            <button onclick="changeQty(${item.id}, '${item.size}', -1)" aria-label="Decrease quantity">−</button>
            <span>${qty}</span>
            <button onclick="changeQty(${item.id}, '${item.size}', 1)" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div style="text-align:right;">
          <div class="price">₹${lineTotal}</div>
          <button class="remove" onclick="removeItem(${item.id}, '${item.size}')">Remove</button>
        </div>
      </div>
    `;
  });

  document.getElementById("cartSubtotal").textContent = "₹" + subtotal;
  document.getElementById("cartTotal").textContent = "₹" + subtotal;
}

renderCartPage();
