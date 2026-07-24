// Shared product-card markup, used on the homepage and the shop page.
function productCardHTML(p){
  const alt = p.images && p.images[1] ? p.images[1] : p.image;
  const priceHTML = p.compareAt
    ? `<span class="was">₹${p.compareAt}</span>₹${p.price}`
    : `₹${p.price}`;
  return `
    <a class="card" href="product.html?id=${p.id}">
      <div class="card-media">
        ${p.badge ? `<span class="tag ${p.orderType === 'custom' ? 'accent' : ''}">${p.badge}</span>` : ""}
        <img class="main" src="${p.image}" alt="${p.name}">
        <img class="alt" src="${alt}" alt="">
        <span class="quick-add">View product</span>
      </div>
      <div class="card-body">
        <div class="card-cat">${p.category}</div>
        <h3 class="card-title">${p.name}</h3>
        <div class="card-price">${priceHTML}</div>
      </div>
    </a>
  `;
}

function renderFeatured(){
  const grid = document.getElementById("featuredGrid");
  if (!grid) return;
  const featured = PRODUCTS.filter(p => p.badge === "Best Seller" || p.badge === "New").slice(0, 8);
  grid.innerHTML = featured.map(productCardHTML).join("");
}

document.addEventListener("DOMContentLoaded", renderFeatured);
