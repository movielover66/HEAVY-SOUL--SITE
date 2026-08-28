
// Gallery
  const mainImg = document.getElementById("pdMainImg");
  const thumbsWrap = document.getElementById("pdThumbs");
  
  // Safe check for images array
  const productImages = product.images && product.images.length ? product.images : [product.image];
  mainImg.src = productImages[0];
  mainImg.alt = product.name;

  thumbsWrap.innerHTML = productImages.map((src, i) => `
    <img src="${escapeHtml(src)}" class="${i === 0 ? "active" : ""}" data-src="${escapeHtml(src)}" alt="${escapeHtml(product.name)} view ${i+1}">
  `).join("");

  // Clean old listener by cloning or direct handling
  thumbsWrap.replaceWith(thumbsWrap.cloneNode(true));
  const newThumbsWrap = document.getElementById("pdThumbs");
  
  newThumbsWrap.addEventListener("click", (e) => {
    const img = e.target.closest("img");
    if (!img) return;
    mainImg.src = img.dataset.src;
    document.querySelectorAll("#pdThumbs img").forEach(t => t.classList.toggle("active", t === img));
  });
