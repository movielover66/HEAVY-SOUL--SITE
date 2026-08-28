const productId = new URLSearchParams(window.location.search).get("id");

function renderProductPage_(){
  const product = findProduct(productId);

  if (!product) {
    document.getElementById("pdRoot").innerHTML = `
      <div class="empty-state">
        <h2>Product not found</h2>
        <p>This item may have been removed or the link is incorrect.</p>
        <a class="btn" href="shop.html">Back to shop</a>
      </div>`;
    return false;
  }

  document.title = `${product.name} — Heavy Soul`;

  document.getElementById("pdCrumb").innerHTML =
    `<a href="index.html">Home</a> / <a href="shop.html">Shop</a> / <a href="shop.html?category=${encodeURIComponent(product.category)}">${escapeHtml(product.category)}</a> / ${escapeHtml(product.name)}`;

  document.getElementById("pdCat").textContent = product.category;
  document.getElementById("pdTitle").textContent = product.name;
  document.getElementById("pdPrice").textContent = "₹" + product.price + (product.compareAt ? ` · was ₹${product.compareAt}` : "");
  document.getElementById("pdDesc").textContent = product.description;

  if (product.badge) {
    document.getElementById("pdBadge").innerHTML = `<span class="tag ${product.orderType === "custom" ? "accent" : ""}">${escapeHtml(product.badge)}</span>`;
  }

  // Gallery
  const mainImg = document.getElementById("pdMainImg");
  mainImg.src = product.image;
  mainImg.alt = product.name;
  document.getElementById("pdThumbs").innerHTML = product.images.map((src, i) => `
    <img src="${escapeHtml(src)}" class="${i === 0 ? "active" : ""}" data-src="${escapeHtml(src)}" alt="${escapeHtml(product.name)} view ${i+1}">
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

  // Size guide — show the numeric (bottoms) table if sizes look like waist numbers
  const sizeGuideBtn = document.getElementById("sizeGuideBtn");
  const sizeGuideModal = document.getElementById("sizeGuideModal");
  const sizeGuideClose = document.getElementById("sizeGuideClose");
  const isNumericSizing = product.sizes.every(s => /^\d+$/.test(s));
  document.getElementById("sizeGuideTops").classList.toggle("hidden", isNumericSizing);
  document.getElementById("sizeGuideBottoms").classList.toggle("hidden", !isNumericSizing);

  if (sizeGuideBtn) {
    sizeGuideBtn.addEventListener("click", () => sizeGuideModal.classList.remove("hidden"));
  }
  if (sizeGuideClose) {
    sizeGuideClose.addEventListener("click", () => sizeGuideModal.classList.add("hidden"));
  }
  if (sizeGuideModal) {
    sizeGuideModal.addEventListener("click", (e) => {
      if (e.target === sizeGuideModal) sizeGuideModal.classList.add("hidden");
    });
  }

  // Related products — same category, excluding self
  const related = PRODUCTS.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);
  const relatedWrap = document.getElementById("relatedGrid");
  if (related.length) {
    relatedWrap.innerHTML = related.map(productCardHTML).join("");
  } else {
    document.getElementById("relatedSection").classList.add("hidden");
  }

  // Structured data — lets Google show price/availability in search results
  const siteUrl = ((typeof SITE_CONFIG !== "undefined") && SITE_CONFIG.SITE_URL) || "https://heavysoul.in";
  const productSchema = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product.name,
    "description": product.description,
    "image": product.images && product.images.length ? product.images.map(img => siteUrl + "/" + img) : [siteUrl + "/" + product.image],
    "category": product.category,
    "offers": {
      "@type": "Offer",
      "url": siteUrl + "/product.html?id=" + product.id,
      "priceCurrency": "INR",
      "price": product.price,
      "availability": "https://schema.org/InStock",
      "itemCondition": "https://schema.org/NewCondition"
    }
  };
  const schemaTag = document.createElement("script");
  schemaTag.type = "application/ld+json";
  schemaTag.textContent = JSON.stringify(productSchema);
  document.head.appendChild(schemaTag);

  return true;
}

// If the product isn't in the cached/fallback catalog yet (e.g. it was
// just added in the admin panel), retry once the live catalog arrives
// instead of leaving the visitor stuck on "Product not found".
if (!renderProductPage_()) {
  window.addEventListener("hs:productsUpdated", function retryRender_(){
    window.removeEventListener("hs:productsUpdated", retryRender_);
    renderProductPage_();
  });
}
