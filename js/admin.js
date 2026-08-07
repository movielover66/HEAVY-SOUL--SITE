// Heavy Soul — Admin Panel
// Talks to the same Apps Script backend as the rest of the site
// (SITE_CONFIG.APPS_SCRIPT_URL). Every admin_* request is sent with
// the stored password and re-checked server-side on every call.

const ADMIN_PW_KEY = "hs_admin_pw";
let currentProducts = [];
let editingId = null; // null = "add new" mode
let pendingImages = []; // urls, in display order — first is the main photo

const API_URL = (typeof SITE_CONFIG !== "undefined") && SITE_CONFIG.APPS_SCRIPT_URL;

function getStoredPassword(){
  return localStorage.getItem(ADMIN_PW_KEY) || "";
}

async function apiPost(payload){
  if (!API_URL) throw new Error("APPS_SCRIPT_URL is not set in js/config.js");
  // text/plain avoids a CORS pre-flight request against Apps Script,
  // which doesn't handle OPTIONS — same trick used elsewhere on the site.
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
  } catch (networkErr) {
    // Surface the *real* browser error instead of a generic message —
    // this tells us whether it's a network/CORS failure, a redirect
    // issue, etc.
    throw new Error("NETWORK: " + (networkErr && networkErr.message ? networkErr.message : networkErr));
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (parseErr) {
    // We got a response, but it wasn't JSON — usually means Apps Script
    // returned an HTML page (login/permission/error page) instead of
    // our jsonResponse_(). Surface the first bit of it for diagnosis.
    throw new Error("BAD_RESPONSE (status " + res.status + "): " + text.slice(0, 200));
  }
}

/* ========================= AUTH ========================= */

const loginScreen = document.getElementById("loginScreen");
const panelScreen = document.getElementById("panelScreen");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = document.getElementById("loginPassword").value;
  loginError.classList.remove("show");
  loginBtn.disabled = true;
  loginBtn.textContent = "Checking…";
  try {
    const data = await apiPost({ type: "admin_verify", adminPassword: pw });
    if (data && data.success) {
      localStorage.setItem(ADMIN_PW_KEY, pw);
      enterPanel();
    } else {
      loginError.textContent = "Wrong password.";
      loginError.classList.add("show");
    }
  } catch (err) {
    loginError.textContent = "Error: " + (err && err.message ? err.message : err);
    loginError.classList.add("show");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Log in";
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem(ADMIN_PW_KEY);
  panelScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

function enterPanel(){
  loginScreen.classList.add("hidden");
  panelScreen.classList.remove("hidden");
  loadProducts();
}

// If a password is already stored, try it silently instead of showing
// the login screen every visit.
(async function autoLogin(){
  const pw = getStoredPassword();
  if (!pw) return;
  try {
    const data = await apiPost({ type: "admin_verify", adminPassword: pw });
    if (data && data.success) enterPanel();
  } catch (err) { /* stay on login screen, server may just be unreachable */ }
})();

/* ========================= LOAD / RENDER LIST ========================= */

const productList = document.getElementById("productList");
const listStatus = document.getElementById("listStatus");

async function loadProducts(){
  listStatus.textContent = "Loading products…";
  try {
    const data = await apiPost({ type: "admin_list_products", adminPassword: getStoredPassword() });
    if (!data || !data.success) {
      listStatus.textContent = "";
      localStorage.removeItem(ADMIN_PW_KEY);
      panelScreen.classList.add("hidden");
      loginScreen.classList.remove("hidden");
      loginError.textContent = "Session expired — please log in again.";
      loginError.classList.add("show");
      return;
    }
    currentProducts = data.products || [];
    renderList();
    listStatus.textContent = "";
  } catch (err) {
    listStatus.textContent = "Error: " + (err && err.message ? err.message : err);
  }
}

function renderList(){
  if (!currentProducts.length) {
    productList.innerHTML = `<p class="admin-empty">No products yet — add your first t-shirt below.</p>`;
    return;
  }
  productList.innerHTML = currentProducts.map(p => `
    <div class="admin-row ${p.status === "Hidden" ? "is-hidden" : ""}">
      <img src="${escapeHtml(p.image || "")}" alt="" class="admin-thumb" onerror="this.style.opacity=0.15">
      <div class="admin-row-info">
        <div class="admin-row-name">${escapeHtml(p.name)}${p.status === "Hidden" ? ' <span class="admin-badge">Hidden</span>' : ""}</div>
        <div class="admin-row-meta">${escapeHtml(p.category)} · ₹${p.price}${p.compareAt ? ` <s>₹${p.compareAt}</s>` : ""}</div>
      </div>
      <div class="admin-row-actions">
        <button class="btn outline sm" data-edit="${p.id}">Edit</button>
        <button class="btn outline sm danger" data-delete="${p.id}">Delete</button>
      </div>
    </div>
  `).join("");
}

productList.addEventListener("click", (e) => {
  const editBtn = e.target.closest("[data-edit]");
  const delBtn = e.target.closest("[data-delete]");
  if (editBtn) openForm(editBtn.dataset.edit);
  if (delBtn) handleDelete(delBtn.dataset.delete);
});

async function handleDelete(id){
  const product = currentProducts.find(p => String(p.id) === String(id));
  if (!confirm(`Delete "${product ? product.name : "this product"}"? This can't be undone.`)) return;
  listStatus.textContent = "Deleting…";
  try {
    const data = await apiPost({ type: "admin_delete_product", adminPassword: getStoredPassword(), id });
    if (data && data.success) {
      currentProducts = data.products;
      renderList();
      listStatus.textContent = "";
      showAdminToast("Product deleted.");
    } else {
      listStatus.textContent = "";
      showAdminToast(data && data.error ? data.error : "Couldn't delete.");
    }
  } catch (err) {
    listStatus.textContent = "";
    showAdminToast("Network error — try again.");
  }
}

/* ========================= ADD / EDIT FORM ========================= */

const formSection = document.getElementById("formSection");
const productForm = document.getElementById("productForm");
const formTitle = document.getElementById("formTitle");
const imageGrid = document.getElementById("imageGrid");
const imageInput = document.getElementById("imageInput");
const imageStatus = document.getElementById("imageStatus");
const formError = document.getElementById("formError");
const saveBtn = document.getElementById("saveBtn");

document.getElementById("addProductBtn").addEventListener("click", () => openForm(null));
document.getElementById("cancelFormBtn").addEventListener("click", closeForm);

function openForm(id){
  formError.classList.remove("show");
  if (id) {
    const p = currentProducts.find(x => String(x.id) === String(id));
    if (!p) return;
    editingId = p.id;
    formTitle.textContent = "Edit product";
    document.getElementById("fName").value = p.name || "";
    document.getElementById("fCategory").value = p.category || "";
    document.getElementById("fPrice").value = p.price || "";
    document.getElementById("fCompareAt").value = p.compareAt || "";
    document.getElementById("fBadge").value = p.badge || "";
    document.getElementById("fOrderType").value = p.orderType === "custom" ? "custom" : "collection";
    document.getElementById("fSizes").value = (p.sizes || []).join(", ");
    document.getElementById("fDescription").value = p.description || "";
    document.getElementById("fStatus").value = p.status === "Hidden" ? "Hidden" : "Active";
    pendingImages = [...(p.images || [])];
  } else {
    editingId = null;
    formTitle.textContent = "Add product";
    productForm.reset();
    document.getElementById("fOrderType").value = "collection";
    document.getElementById("fStatus").value = "Active";
    pendingImages = [];
  }
  renderImageGrid();
  formSection.classList.remove("hidden");
  formSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeForm(){
  formSection.classList.add("hidden");
  editingId = null;
  pendingImages = [];
}

function renderImageGrid(){
  imageGrid.innerHTML = pendingImages.map((url, i) => `
    <div class="admin-img-tile ${i === 0 ? "is-main" : ""}">
      <img src="${escapeHtml(url)}" alt="">
      ${i === 0 ? '<span class="admin-img-tag">Main</span>' : ""}
      <button type="button" class="admin-img-remove" data-remove="${i}" aria-label="Remove photo">✕</button>
    </div>
  `).join("");
}

imageGrid.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove]");
  if (!btn) return;
  pendingImages.splice(Number(btn.dataset.remove), 1);
  renderImageGrid();
});

// Downscales/compresses a photo client-side before it's base64-encoded
// and sent up — keeps uploads fast and the request comfortably under
// Apps Script's payload limits.
function compressImage(file, maxDim = 1600, quality = 0.85){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read file"));
    reader.onload = () => {
      img.onerror = () => reject(new Error("Couldn't read image"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error("Compression failed")); return; }
          const outReader = new FileReader();
          outReader.onload = () => {
            const base64 = outReader.result.split(",")[1];
            resolve({ base64, mimeType: "image/jpeg", fileName: (file.name || "photo").replace(/\.\w+$/, "") + ".jpg" });
          };
          outReader.readAsDataURL(blob);
        }, "image/jpeg", quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

imageInput.addEventListener("change", async () => {
  const files = [...imageInput.files];
  if (!files.length) return;
  imageStatus.textContent = `Uploading ${files.length} photo${files.length > 1 ? "s" : ""}…`;
  for (const file of files) {
    try {
      const { base64, mimeType, fileName } = await compressImage(file);
      const data = await apiPost({
        type: "admin_upload_image",
        adminPassword: getStoredPassword(),
        imageBase64: base64,
        mimeType,
        fileName
      });
      if (data && data.success) {
        pendingImages.push(data.url);
        renderImageGrid();
      } else {
        showAdminToast((data && data.error) || "Photo upload failed.");
      }
    } catch (err) {
      showAdminToast("Photo upload failed — try a smaller image.");
    }
  }
  imageStatus.textContent = "";
  imageInput.value = "";
});

productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.classList.remove("show");

  const sizes = document.getElementById("fSizes").value
    .split(",").map(s => s.trim()).filter(Boolean);

  const product = {
    id: editingId,
    name: document.getElementById("fName").value.trim(),
    category: document.getElementById("fCategory").value.trim(),
    price: Number(document.getElementById("fPrice").value),
    compareAt: document.getElementById("fCompareAt").value ? Number(document.getElementById("fCompareAt").value) : "",
    badge: document.getElementById("fBadge").value.trim(),
    orderType: document.getElementById("fOrderType").value,
    sizes,
    description: document.getElementById("fDescription").value.trim(),
    status: document.getElementById("fStatus").value,
    images: pendingImages
  };

  if (!product.images.length) {
    formError.textContent = "Add at least one photo.";
    formError.classList.add("show");
    return;
  }
  if (!sizes.length) {
    formError.textContent = "Add at least one size (comma-separated, e.g. S, M, L, XL).";
    formError.classList.add("show");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  try {
    const data = await apiPost({ type: "admin_save_product", adminPassword: getStoredPassword(), product });
    if (data && data.success) {
      currentProducts = data.products;
      renderList();
      closeForm();
      showAdminToast(editingId ? "Product updated." : "Product added.");
    } else {
      formError.textContent = (data && data.error) || "Couldn't save — try again.";
      formError.classList.add("show");
    }
  } catch (err) {
    formError.textContent = "Network error — try again.";
    formError.classList.add("show");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save product";
  }
});

/* ========================= MISC ========================= */

function showAdminToast(message){
  let el = document.getElementById("adminToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "adminToast";
    el.className = "admin-toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.__adminToastTimer);
  window.__adminToastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

// escapeHtml() is already defined in js/config.js, loaded before this file.
