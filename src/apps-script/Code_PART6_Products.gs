/**
 *  *  * HEAVY SOUL - Product Catalog / Admin Panel Backend
   * Add this as a NEW file in the same Apps Script project as the other
      * Code_PART*.gs files (File -> New -> Script file). It shares the
          * jsonResponse_ / logError_ / getOrCreateSheet_ helpers already defined
               * in Code_PART3_of_5.gs and Code_PART5_of_5.gs.
                     *
                            * SETUP (one-time):
                                    *  1. Project Settings (gear icon) -> Script Properties -> Add property:
                                             *       ADMIN_PASSWORD = <a password you choose>
                                                       *  2. Deploy -> Manage deployments -> edit the existing Web App deployment
                                                                  *     -> "New version" -> Deploy. (Re-deploying is required whenever you
                                                                              *     add/change server-side code, otherwise the live URL keeps running
                                                                                           *     the old version.)
                                                                                                         *  3. Open admin.html on your live site, log in with that password.
                                                                                                                        * The Products sheet + Drive photo folder are created automatically the
                                                                                                                                        * first time either the admin panel or the site asks for products.
                                                                                                                                                         */

var PRODUCTS_SHEET_NAME = 'Products';
var PRODUCTS_HEADERS = ['ID', 'Name', 'Category', 'Price', 'CompareAt', 'Badge', 'OrderType', 'Description', 'Sizes', 'Images', 'Status', 'UpdatedAt'];
var PRODUCT_IMAGE_FOLDER_NAME = 'Heavy Soul Product Photos';

/* ========================================================= ADMIN AUTH ========================================================= */

function verifyAdminPassword_(body) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!expected) {
    logError_('ADMIN_PASSWORD script property is not set — admin panel is locked out until it is.');
    return false;
  }
  return !!(body && body.adminPassword === expected);
}

/* ========================================================= SHEET ACCESS ========================================================= */

function getProductsSheet_() {
  var sheet = getOrCreateSheet_(PRODUCTS_SHEET_NAME, PRODUCTS_HEADERS);
  if (sheet.getLastRow() < 2) seedInitialProducts_(sheet);
  return sheet;
}

// Seeds the sheet once with the 13 products that used to be hardcoded in
// js/products.js, so the shop keeps working exactly as before on day one.
// Edit/delete them from the admin panel like any other product afterwards.
function seedInitialProducts_(sheet) {
  var now = new Date();
  var seed = [
    ['KTM WHITE 390', 'T-Shirts', 1, 899, 'Best Seller', 'collection', 'Our signature drop-shoulder tee in ink black. 240 GSM heavyweight cotton, boxy fit, garment-washed for a broken-in feel from day one.', 'S,M,L,XL,XXL', 'assets/products/p1-a.svg,assets/products/p1-b.svg'],
    ['Bone Boxy Tee', 'T-Shirts', 549, '', 'New', 'collection', 'The same 240 GSM boxy tee in undyed bone. A quiet staple built to layer under everything else in your rotation.', 'S,M,L,XL,XXL', 'assets/products/p2-a.svg,assets/products/p2-b.svg'],
    ['Oxblood Graphic Tee', 'T-Shirts', 999, '', 'Limited', 'collection', "Puff-print graphic tee with an oxblood chest hit. Limited run — once a size sells out it won't be restocked.", 'S,M,L,XL', 'assets/products/p3-a.svg,assets/products/p3-b.svg'],
    ['Heavyweight Hoodie — Ink', 'Hoodies', 1799, '', 'Best Seller', 'collection', '420 GSM fleece hoodie, brushed inside for warmth without the bulk. Dropped shoulders, kangaroo pocket, ribbed cuffs.', 'S,M,L,XL,XXL', 'assets/products/p4-a.svg,assets/products/p4-b.svg'],
    ['Heavyweight Hoodie — Bone', 'Hoodies', 1799, '', '', 'collection', 'Same 420 GSM construction as our Ink hoodie, in undyed bone. Pairs with almost anything in the edit.', 'S,M,L,XL,XXL', 'assets/products/p5-a.svg,assets/products/p5-b.svg'],
    ['Zip Hoodie — Oxblood Trim', 'Hoodies', 1999, '', 'New', 'collection', 'Full-zip hoodie with an oxblood interior hood lining and matching drawcord tips. Heavyweight fleece, relaxed fit.', 'S,M,L,XL', 'assets/products/p6-a.svg,assets/products/p6-b.svg'],
    ['Overshirt — Slate', 'Shirts', 1499, '', '', 'collection', 'Brushed cotton overshirt in slate, built to layer as a light jacket. Corozo buttons, twin chest pockets.', 'S,M,L,XL', 'assets/products/p7-a.svg,assets/products/p7-b.svg'],
    ['Linen Shirt — Bone', 'Shirts', 1399, '', 'New', 'collection', 'Mid-weight linen-cotton shirt, relaxed through the body with a camp collar. Breathable, made for warm days.', 'S,M,L,XL,XXL', 'assets/products/p8-a.svg,assets/products/p8-b.svg'],
    ['Cargo Trouser — Ink', 'Bottoms', 1699, '', 'Best Seller', 'collection', 'Tapered cargo trouser in ink twill with articulated knees and a hidden interior pocket. Adjustable waist tabs.', '28,30,32,34,36', 'assets/products/p9-a.svg,assets/products/p9-b.svg'],
    ['Wide Denim — Bone Wash', 'Bottoms', 1899, '', '', 'collection', 'Wide-leg denim in a stonewashed bone tone. Mid-rise, rigid-recycled cotton that softens with wear.', '28,30,32,34,36', 'assets/products/p10-a.svg,assets/products/p10-b.svg'],
    ['Coach Jacket — Ink', 'Outerwear', 2399, '', 'New', 'collection', 'Water-resistant shell coach jacket, taped seams, snap closure. Cut oversized to layer a hoodie underneath.', 'S,M,L,XL', 'assets/products/p11-a.svg,assets/products/p11-b.svg'],
    ['Woven Tag Cap', 'Accessories', 649, '', '', 'collection', 'Six-panel cap with a woven Heavy Soul tag at the back strap. Unstructured crown, curved brim.', 'One Size', 'assets/products/p12-a.svg,assets/products/p12-b.svg'],
    ['Custom Print Tee', 'Custom', 1099, '', 'Custom', 'custom', "Send us your own design or photo and we'll print it on our 240 GSM boxy tee. Made to order — please allow extra processing time. COD requires 50% advance.", 'S,M,L,XL,XXL', 'assets/products/p13-a.svg']
  ];
  var rows = seed.map(function (p, i) {
    return [i + 1, p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], 'Active', now];
  });
  sheet.getRange(2, 1, rows.length, PRODUCTS_HEADERS.length).setValues(rows);
}

/* ========================================================= READ ========================================================= */

// includeHidden=true -> used by the admin panel (sees everything).
// includeHidden=false -> used by the public site (only "Active" items).
function readAllProducts_(includeHidden) {
  var sheet = getProductsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, PRODUCTS_HEADERS.length).getValues();
  var products = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!row[0]) continue; // skip blank rows
    var status = row[10] || 'Active';
    if (!includeHidden && status !== 'Active') continue;
    products.push(rowToProduct_(row));
  }
  return products;
}

function rowToProduct_(row) {
  var images = String(row[9] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var sizes = String(row[8] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  return {
    id: row[0],
    name: row[1],
    category: row[2],
    price: Number(row[3]) || 0,
    compareAt: row[4] ? Number(row[4]) : undefined,
    badge: row[5] || undefined,
    orderType: row[6] || 'collection',
    description: row[7] || '',
    sizes: sizes,
    images: images,
    image: images[0] || '',
    status: row[10] || 'Active'
  };
}

function findProductRow_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // sheet row index (1-based, +1 for header)
  }
  return -1;
}

function nextProductId_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var max = 0;
  for (var i = 0; i < ids.length; i++) {
    var n = Number(ids[i][0]);
    if (n > max) max = n;
  }
  return max + 1;
}

/* ========================================================= WRITE (ADD / EDIT) ========================================================= */

// product = { id (blank/omit for new), name, category, price, compareAt,
//             badge, orderType, description, sizes: [..], images: [..],
//             status: 'Active' | 'Hidden' }
function saveProduct_(product) {
  if (!product || !String(product.name || '').trim()) {
    return { success: false, error: 'Product name is required.' };
  }
  if (!product.price || Number(product.price) <= 0) {
    return { success: false, error: 'A valid price is required.' };
  }
  if (!product.images || !product.images.length) {
    return { success: false, error: 'At least one photo is required.' };
  }

  var sheet = getProductsSheet_();
  var isNew = !product.id;
  var rowIndex;
  var id;

  if (isNew) {
    id = nextProductId_(sheet);
    rowIndex = sheet.getLastRow() + 1;
  } else {
    id = product.id;
    rowIndex = findProductRow_(sheet, id);
    if (rowIndex < 0) {
      return { success: false, error: 'Product not found (it may have been deleted).' };
    }
  }

  var sizes = Array.isArray(product.sizes) ? product.sizes.join(',') : String(product.sizes || '');
  var images = Array.isArray(product.images) ? product.images.join(',') : String(product.images || '');

  sheet.getRange(rowIndex, 1, 1, PRODUCTS_HEADERS.length).setValues([[
    id,
    String(product.name).trim(),
    product.category || 'T-Shirts',
    Number(product.price),
    product.compareAt ? Number(product.compareAt) : '',
    product.badge || '',
    product.orderType === 'custom' ? 'custom' : 'collection',
    product.description || '',
    sizes,
    images,
    product.status === 'Hidden' ? 'Hidden' : 'Active',
    new Date()
  ]]);

  return { success: true, id: id, products: readAllProducts_(true) };
}

function deleteProduct_(id) {
  if (!id) return { success: false, error: 'Missing product id.' };
  var sheet = getProductsSheet_();
  var rowIndex = findProductRow_(sheet, id);
  if (rowIndex < 0) return { success: false, error: 'Product not found.' };
  sheet.deleteRow(rowIndex);
  return { success: true, products: readAllProducts_(true) };
}

/* ========================================================= PHOTO UPLOAD (Cloudflare R2) ========================================================= */

// SETUP (one-time), in Apps Script editor -> Project Settings (gear icon)
// -> Script Properties -> Add script property, one row per name below:
//
//   R2_ACCOUNT_ID          your Cloudflare account id
//   R2_ACCESS_KEY_ID       Access Key ID from the R2 API token
//   R2_SECRET_ACCESS_KEY   Secret Access Key from the R2 API token
//   R2_BUCKET_NAME         the bucket name you created (e.g. heavy-soul-products)
//   R2_PUBLIC_URL          the public bucket URL (e.g. https://pub-xxxx.r2.dev)
//
// body = { imageBase64: '<raw base64, no data: prefix>', mimeType: 'image/jpeg', fileName: 'tee.jpg' }
// Uploads the photo to R2 and returns a public, CDN-served URL to store in
// the product's Images field.
function uploadProductImage_(body) {
  try {
    if (!body || !body.imageBase64) {
      return { success: false, error: 'No image data received.' };
    }
    var mimeType = body.mimeType || 'image/jpeg';
    var fileName = body.fileName || ('product-' + new Date().getTime());
    var bytes = Utilities.base64Decode(body.imageBase64);
    var url = uploadBytesToR2_(bytes, mimeType, fileName);
    return { success: true, url: url };
  } catch (err) {
    logError_('uploadProductImage_ failed: ' + err);
    return { success: false, error: 'Upload failed: ' + err };
  }
}

// Uploads one object to Cloudflare R2 using an AWS Signature Version 4
// signed PUT request (R2 is S3-compatible, so this is the same scheme S3
// clients use — Apps Script has no S3 SDK, so it's signed by hand here).
function r2PutObject_(accountId, accessKey, secretKey, bucket, key, bytes, contentType) {
  var region = 'auto';
  var service = 's3';
  var host = accountId + '.r2.cloudflarestorage.com';
  var endpoint = 'https://' + host + '/' + bucket + '/' + key;

  var now = new Date();
  var amzDate = Utilities.formatDate(now, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  var dateStamp = Utilities.formatDate(now, 'UTC', 'yyyyMMdd');

  var payloadHash = toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));

  var canonicalHeaders = 'host:' + host + '\n' +
    'x-amz-content-sha256:' + payloadHash + '\n' +
    'x-amz-date:' + amzDate + '\n';
  var signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  var canonicalRequest = [
    'PUT',
    '/' + bucket + '/' + key,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  var credentialScope = dateStamp + '/' + region + '/' + service + '/aws4_request';
  var stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, canonicalRequest))
  ].join('\n');

  var signingKey = r2SignatureKey_(secretKey, dateStamp, region, service);
  var signature = toHex_(Utilities.computeHmacSha256Signature(Utilities.newBlob(stringToSign).getBytes(), signingKey));

  var authorizationHeader = 'AWS4-HMAC-SHA256 Credential=' + accessKey + '/' + credentialScope +
    ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;

  var options = {
    method: 'put',
    contentType: contentType,
    payload: bytes,
    headers: {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Authorization': authorizationHeader
    },
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(endpoint, options);
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('R2 upload failed (' + code + '): ' + response.getContentText());
  }
}

function r2SignatureKey_(secretKey, dateStamp, region, service) {
  var kDate = Utilities.computeHmacSha256Signature(Utilities.newBlob(dateStamp).getBytes(), Utilities.newBlob('AWS4' + secretKey).getBytes());
  var kRegion = Utilities.computeHmacSha256Signature(Utilities.newBlob(region).getBytes(), kDate);
  var kService = Utilities.computeHmacSha256Signature(Utilities.newBlob(service).getBytes(), kRegion);
  var kSigning = Utilities.computeHmacSha256Signature(Utilities.newBlob('aws4_request').getBytes(), kService);
  return kSigning;
}

function toHex_(bytes) {
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b);
    var hex = v.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// Shared upload helper: takes raw bytes, uploads to R2, returns the public URL.
// Throws if the R2 Script Properties are missing.
function uploadBytesToR2_(bytes, mimeType, fileName) {
  var props = PropertiesService.getScriptProperties();
  var accountId = props.getProperty('R2_ACCOUNT_ID');
  var accessKey = props.getProperty('R2_ACCESS_KEY_ID');
  var secretKey = props.getProperty('R2_SECRET_ACCESS_KEY');
  var bucket = props.getProperty('R2_BUCKET_NAME');
  var publicUrl = props.getProperty('R2_PUBLIC_URL');

  if (!accountId || !accessKey || !secretKey || !bucket || !publicUrl) {
    throw new Error('R2 Script Properties are not fully set. Check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL.');
  }

  var safeName = (fileName || 'product.jpg').replace(/[^a-zA-Z0-9.\-_]/g, '_');
  var key = 'products/' + new Date().getTime() + '-' + safeName;

  r2PutObject_(accountId, accessKey, secretKey, bucket, key, bytes, mimeType || 'image/jpeg');

  return publicUrl.replace(/\/$/, '') + '/' + key;
}

/* ========================================================= ONE-TIME: MIGRATE OLD DRIVE PHOTOS TO R2 ========================================================= */

// Run this ONCE from the Apps Script editor (select this function in the
// function dropdown at the top, then click Run). It scans every product's
// Images field, and for any image still pointing at drive.google.com, it
// pulls the file straight from Drive (no download step needed since it's
// already in your own Drive), re-uploads it to R2, and rewrites that
// product's Images field with the new pub-xxxx.r2.dev URL(s).
//
// Safe to re-run: once a product's images are all on R2, it's skipped.
// Check the Apps Script "Executions" log afterwards to see a per-product
// summary and any errors.
function migrateProductImagesToR2_() {
  var sheet = getProductsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('No products found.');
    return;
  }

  var range = sheet.getRange(2, 1, lastRow - 1, PRODUCTS_HEADERS.length);
  var values = range.getValues();
  var imagesCol = 9; // 0-based index of the "Images" column
  var migratedProducts = 0;
  var migratedFiles = 0;
  var failed = 0;

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!row[0]) continue; // blank row

    var images = String(row[imagesCol] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var changed = false;

    for (var j = 0; j < images.length; j++) {
      var driveFileId = extractDriveFileId_(images[j]);
      if (!driveFileId) continue; // already an R2 URL, a local asset path, etc — leave as-is

      try {
        var file = DriveApp.getFileById(driveFileId);
        var blob = file.getBlob();
        var newUrl = uploadBytesToR2_(blob.getBytes(), blob.getContentType(), file.getName());
        images[j] = newUrl;
        changed = true;
        migratedFiles++;
      } catch (err) {
        failed++;
        Logger.log('Product ID ' + row[0] + ', image ' + (j + 1) + ' failed: ' + err);
      }
    }

    if (changed) {
      row[imagesCol] = images.join(',');
      migratedProducts++;
    }
  }

  range.setValues(values);
  Logger.log('Migration done. Products updated: ' + migratedProducts + ', files moved: ' + migratedFiles + ', failed: ' + failed);
}

// Pulls the Drive file ID out of a drive.google.com URL
// (handles both /thumbnail?id=... and /uc?id=... /file/d/<id>/ styles).
// Returns null if the URL isn't a Drive link (e.g. already an R2 URL).
function extractDriveFileId_(url) {
  if (!url || url.indexOf('drive.google.com') === -1) return null;
  var m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return null;
}

/* ========================================================= ONE-TIME: SWAP OLD R2 DOMAIN FOR CUSTOM DOMAIN ========================================================= */

// Run this ONCE after connecting a custom domain (e.g. cdn.heavysoul.in) to
// the bucket and updating R2_PUBLIC_URL. It rewrites every product's
// Images field so any URL still pointing at the old pub-xxxx.r2.dev
// address instead points at the new custom domain. No re-upload needed —
// this only edits the stored text, since the files themselves already
// live in the same bucket either way.
function swapR2DomainInProductImages() {
  var oldDomain = 'https://pub-9f7c8b2cd342441e8717eed3aff1df36.r2.dev';
  var newDomain = PropertiesService.getScriptProperties().getProperty('R2_PUBLIC_URL');

  if (!newDomain) {
    Logger.log('R2_PUBLIC_URL script property is not set — set it to the new custom domain first.');
    return;
  }

  var sheet = getProductsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('No products found.');
    return;
  }

  var range = sheet.getRange(2, 1, lastRow - 1, PRODUCTS_HEADERS.length);
  var values = range.getValues();
  var imagesCol = 9;
  var updatedProducts = 0;
  var updatedUrls = 0;

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!row[0]) continue;

    var images = String(row[imagesCol] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var changed = false;

    for (var j = 0; j < images.length; j++) {
      if (images[j].indexOf(oldDomain) === 0) {
        images[j] = newDomain.replace(/\/$/, '') + images[j].slice(oldDomain.length);
        changed = true;
        updatedUrls++;
      }
    }

    if (changed) {
      row[imagesCol] = images.join(',');
      updatedProducts++;
    }
  }

  range.setValues(values);
  Logger.log('Domain swap done. Products updated: ' + updatedProducts + ', URLs rewritten: ' + updatedUrls);
}