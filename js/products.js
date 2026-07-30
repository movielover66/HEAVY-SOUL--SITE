// Single source of truth for all products on the site.
// orderType: "collection" -> ready-made stock, COD advance = flat amount x qty
// orderType: "custom"     -> made-to-order / customised, COD advance = 50% of item price
const PRODUCTS = [
  {
    id: 1,
    name: "KTM WHITE 390",
    category: "T-Shirts",
    price: 599,
    compareAt: 899,
    badge: "Best Seller",
    orderType: "collection",
    image: "assets/products/p1-a.svg",
    images: ["assets/products/p1-a.svg", "assets/products/p1-b.svg"],
    description: "Our signature drop-shoulder tee in ink black. 240 GSM heavyweight cotton, boxy fit, garment-washed for a broken-in feel from day one.",
    sizes: ["S", "M", "L", "XL", "XXL"]
  },
  {
    id: 2,
    name: "Bone Boxy Tee",
    category: "T-Shirts",
    price: 549,
    badge: "New",
    orderType: "collection",
    image: "assets/products/p2-a.svg",
    images: ["assets/products/p2-a.svg", "assets/products/p2-b.svg"],
    description: "The same 240 GSM boxy tee in undyed bone. A quiet staple built to layer under everything else in your rotation.",
    sizes: ["S", "M", "L", "XL", "XXL"]
  },
  {
    id: 3,
    name: "Oxblood Graphic Tee",
    category: "T-Shirts",
    price: 999,
    badge: "Limited",
    orderType: "collection",
    image: "assets/products/p3-a.svg",
    images: ["assets/products/p3-a.svg", "assets/products/p3-b.svg"],
    description: "Puff-print graphic tee with an oxblood chest hit. Limited run — once a size sells out it won't be restocked.",
    sizes: ["S", "M", "L", "XL"]
  },
  {
    id: 4,
    name: "Heavyweight Hoodie — Ink",
    category: "Hoodies",
    price: 1799,
    badge: "Best Seller",
    orderType: "collection",
    image: "assets/products/p4-a.svg",
    images: ["assets/products/p4-a.svg", "assets/products/p4-b.svg"],
    description: "420 GSM fleece hoodie, brushed inside for warmth without the bulk. Dropped shoulders, kangaroo pocket, ribbed cuffs.",
    sizes: ["S", "M", "L", "XL", "XXL"]
  },
  {
    id: 5,
    name: "Heavyweight Hoodie — Bone",
    category: "Hoodies",
    price: 1799,
    orderType: "collection",
    image: "assets/products/p5-a.svg",
    images: ["assets/products/p5-a.svg", "assets/products/p5-b.svg"],
    description: "Same 420 GSM construction as our Ink hoodie, in undyed bone. Pairs with almost anything in the edit.",
    sizes: ["S", "M", "L", "XL", "XXL"]
  },
  {
    id: 6,
    name: "Zip Hoodie — Oxblood Trim",
    category: "Hoodies",
    price: 1999,
    badge: "New",
    orderType: "collection",
    image: "assets/products/p6-a.svg",
    images: ["assets/products/p6-a.svg", "assets/products/p6-b.svg"],
    description: "Full-zip hoodie with an oxblood interior hood lining and matching drawcord tips. Heavyweight fleece, relaxed fit.",
    sizes: ["S", "M", "L", "XL"]
  },
  {
    id: 7,
    name: "Overshirt — Slate",
    category: "Shirts",
    price: 1499,
    orderType: "collection",
    image: "assets/products/p7-a.svg",
    images: ["assets/products/p7-a.svg", "assets/products/p7-b.svg"],
    description: "Brushed cotton overshirt in slate, built to layer as a light jacket. Corozo buttons, twin chest pockets.",
    sizes: ["S", "M", "L", "XL"]
  },
  {
    id: 8,
    name: "Linen Shirt — Bone",
    category: "Shirts",
    price: 1399,
    badge: "New",
    orderType: "collection",
    image: "assets/products/p8-a.svg",
    images: ["assets/products/p8-a.svg", "assets/products/p8-b.svg"],
    description: "Mid-weight linen-cotton shirt, relaxed through the body with a camp collar. Breathable, made for warm days.",
    sizes: ["S", "M", "L", "XL", "XXL"]
  },
  {
    id: 9,
    name: "Cargo Trouser — Ink",
    category: "Bottoms",
    price: 1699,
    badge: "Best Seller",
    orderType: "collection",
    image: "assets/products/p9-a.svg",
    images: ["assets/products/p9-a.svg", "assets/products/p9-b.svg"],
    description: "Tapered cargo trouser in ink twill with articulated knees and a hidden interior pocket. Adjustable waist tabs.",
    sizes: ["28", "30", "32", "34", "36"]
  },
  {
    id: 10,
    name: "Wide Denim — Bone Wash",
    category: "Bottoms",
    price: 1899,
    orderType: "collection",
    image: "assets/products/p10-a.svg",
    images: ["assets/products/p10-a.svg", "assets/products/p10-b.svg"],
    description: "Wide-leg denim in a stonewashed bone tone. Mid-rise, rigid-recycled cotton that softens with wear.",
    sizes: ["28", "30", "32", "34", "36"]
  },
  {
    id: 11,
    name: "Coach Jacket — Ink",
    category: "Outerwear",
    price: 2399,
    badge: "New",
    orderType: "collection",
    image: "assets/products/p11-a.svg",
    images: ["assets/products/p11-a.svg", "assets/products/p11-b.svg"],
    description: "Water-resistant shell coach jacket, taped seams, snap closure. Cut oversized to layer a hoodie underneath.",
    sizes: ["S", "M", "L", "XL"]
  },
  {
    id: 12,
    name: "Woven Tag Cap",
    category: "Accessories",
    price: 649,
    orderType: "collection",
    image: "assets/products/p12-a.svg",
    images: ["assets/products/p12-a.svg", "assets/products/p12-b.svg"],
    description: "Six-panel cap with a woven Heavy Soul tag at the back strap. Unstructured crown, curved brim.",
    sizes: ["One Size"]
  },
  {
    id: 13,
    name: "Custom Print Tee",
    category: "Custom",
    price: 1099,
    badge: "Custom",
    orderType: "custom",
    image: "assets/products/p13-a.svg",
    images: ["assets/products/p13-a.svg"],
    description: "Send us your own design or photo and we'll print it on our 240 GSM boxy tee. Made to order — please allow extra processing time. COD requires 50% advance.",
    sizes: ["S", "M", "L", "XL", "XXL"]
  }
];

function findProduct(id){
  return PRODUCTS.find(p => p.id === Number(id));
}
