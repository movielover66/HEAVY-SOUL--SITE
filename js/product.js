const productId = new URLSearchParams(window.location.search).get("id");
const product = findProduct(productId);

if (!product) {
  document.getElementById("pdRoot").innerHTML = `
    <div class="empty-state">
      <h2>Product not found</h2>
      <p>This item may have been removed or the link is incorrect.</p>
      <a class="btn" href="shop.html">Back to shop</a>
    </div>`;
} else {
  document.title = `${product.name} — Heavy Soul`;

  document.getElementById("pdCrumb").innerHTML =
    `<a href="index.html">Home</a> / <a href="shop.html">Shop</a> / <a href="shop.html?category=${encodeURIComponent(product.category)}">${product.category}</a> / ${product.name}`;

  document.getElementById("pdCat").textContent = product.category;
  document.getElementById("pdTitle").textContent = product.name;
  document.getElementById("pdPrice").textContent = "₹" + product.price + (product.compareAt ? ` · was ₹${product.compareAt}` : "");
  document.getElementById("pdDesc").textContent = product.description;

  if (product.badge) {
    document.getElementById("pdBadge").innerHTML = `<span class="tag ${product.orderType === "custom" ? "accent" : ""}">${product.badge}</span>`;
  }

  // Gallery
  const mainImg = document.getElementById("pdMainImg");
  mainImg.src = product.image;
  mainImg.alt = product.name;
  document.getElementById("pdThumbs").innerHTML = product.images.map((src, i) => `
    <img src="${src}" class="${i === 0 ? "active" : ""}" data-src="${src}" alt="${product.name} view ${i+1}">
  `).join("");
  document.getElementById("pdThumbs").addEventListener("click", (e) => {
    const img = e.target.closest("img");
    if (!img) return;
    mainImg.src = img.dataset.src;
    document.querySelectorAll("#pdThumbs img").forEach(t => t.classList.toggle("active", t === img));
  });

  // Sizes
  let selectedSize = null;
  document.getElementById("pdSizes").innerHTML = product.sizes.map(s =>
    `<button class="size-btn" data-size="${s}">${s}</button>`
  ).join("");
  document.getElementById("pdSizes").addEventListener("click", (e) => {
    const btn = e.target.closest(".size-btn");
    if (!btn) return;
    selectedSize = btn.dataset.size;
    document.querySelectorAll(".size-btn").forEach(b => b.classList.toggle("active", b === btn));
  });
  if (product.sizes.length === 1) {
    selectedSize = product.sizes[0];
    document.querySelector(".size-btn").classList.add("active");
  }

  // Qty
  let qty = 1;
  const qtyLabel = document.getElementById("pdQty");
  document.getElementById("qtyMinus").addEventListener("click", () => {
    qty = Math.max(1, qty - 1);
    qtyLabel.textContent = qty;
  });
  document.getElementById("qtyPlus").addEventListener("click", () => {
    qty = Math.min(10, qty + 1);
    qtyLabel.textContent = qty;
  });

  document.getElementById("addToCartBtn").addEventListener("click", () => {
    if (!selectedSize) {
      showToast("Please select a size");
      return;
    }
    addToCart(product, selectedSize, qty);
  });

  document.getElementById("buyNowBtn").addEventListener("click", () => {
    if (!selectedSize) {
      showToast("Please select a size");
      return;
    }
    addToCart(product, selectedSize, qty);
    window.location.href = "cart.html";
  });

  if (product.orderType === "custom") {
    document.getElementById("pdNote").classList.remove("hidden");
  }

  // Related products — same category, excluding self
  const related = PRODUCTS.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);
  const relatedWrap = document.getElementById("relatedGrid");
  if (related.length) {
    relatedWrap.innerHTML = related.map(productCardHTML).join("");
  } else {
    document.getElementById("relatedSection").classList.add("hidden");
  }
}
