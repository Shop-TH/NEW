// ============================================================
//  FILE 1: src/App.jsx
//  SkinMart Mini App — หน้าร้านสำหรับลูกค้า
//  Stack: React + Firebase + Telegram WebApp SDK
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  addDoc, collection, getDocs, query, where,
  serverTimestamp, increment, orderBy
} from "firebase/firestore";

// ══════════════════════════════════════════
//  ⚙️  Firebase Config — แก้ไขก่อน deploy
// ══════════════════════════════════════════
const firebaseConfig = {
  apiKey           : "ใส่ apiKey ของคุณ",
  authDomain       : "ใส่ authDomain",
  projectId        : "ใส่ projectId",
  storageBucket    : "ใส่ storageBucket",
  messagingSenderId: "ใส่ messagingSenderId",
  appId            : "ใส่ appId",
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ══════════════════════════════════════════
//  ⚙️  Shop Config — แก้ไขก่อน deploy
// ══════════════════════════════════════════
const SHOP_ID  = "shop_001"; // รหัสร้านค้า
const BOT_NAME = "SkinMartBot"; // ชื่อ Bot ใน Telegram

// ══════════════════════════════════════════
//  📱  Telegram WebApp
// ══════════════════════════════════════════
const tg   = window?.Telegram?.WebApp;
const TG_USER = tg?.initDataUnsafe?.user || null;

// ══════════════════════════════════════════
//  🔢  UTILS
// ══════════════════════════════════════════
const fmt = n => "฿" + Number(n).toLocaleString("th-TH");
const calcTotal = (cart, products) =>
  cart.reduce((s, i) => {
    const p = products.find(x => x.id === i.id);
    return s + (p ? p.price * i.qty : 0);
  }, 0);

// ══════════════════════════════════════════
//  🔥  FIREBASE SERVICES
// ══════════════════════════════════════════

// ดึงสินค้าทั้งหมดของร้าน
async function fetchProducts(shopId) {
  const q    = query(
    collection(db, "shops", shopId, "products"),
    where("active", "==", true)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ดึงแบรนด์ทั้งหมดของร้าน
async function fetchBrands(shopId) {
  const snap = await getDocs(collection(db, "shops", shopId, "brands"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// บันทึก/อัปเดตข้อมูลลูกค้า
async function trackCustomer(shopId) {
  if (!TG_USER) return;
  const chatId = String(TG_USER.id);
  const ref    = doc(db, "customers", chatId);
  const snap   = await getDoc(ref);

  const customerData = {
    chatId,
    firstName  : TG_USER.first_name  || "",
    lastName   : TG_USER.last_name   || "",
    username   : TG_USER.username    || "",
    photoUrl   : TG_USER.photo_url   || "",
    languageCode: TG_USER.language_code || "th",
    shopId,
    lastVisit  : serverTimestamp(),
    visitCount : increment(1),
  };

  if (!snap.exists()) {
    await setDoc(ref, {
      ...customerData,
      visitCount  : 1,
      firstVisit  : serverTimestamp(),
      totalOrders : 0,
      totalSpent  : 0,
    });
  } else {
    await updateDoc(ref, customerData);
  }

  // บันทึก visit log
  await addDoc(collection(db, "visits"), {
    chatId,
    shopId,
    screen   : "home",
    timestamp: serverTimestamp(),
  });
}

// บันทึกว่าดูสินค้าชิ้นไหน
async function trackProductView(shopId, productId, brandKey) {
  if (!TG_USER) return;
  await addDoc(collection(db, "visits"), {
    chatId   : String(TG_USER.id),
    shopId,
    screen   : "product_detail",
    productId,
    brandKey,
    timestamp: serverTimestamp(),
  });
}

// บันทึกออเดอร์
async function saveOrder(shopId, cart, products) {
  if (!TG_USER) return null;
  const chatId = String(TG_USER.id);
  const total  = calcTotal(cart, products);
  const orderId = "SM" + Date.now().toString().slice(-6);

  const items = cart.map(i => {
    const p = products.find(x => x.id === i.id);
    return { id: i.id, name: p?.name, price: p?.price, qty: i.qty };
  });

  await setDoc(doc(db, "orders", orderId), {
    orderId,
    chatId,
    customerName: TG_USER.first_name + (TG_USER.last_name ? " " + TG_USER.last_name : ""),
    username    : TG_USER.username || "",
    shopId,
    items,
    total,
    status      : "รอตรวจสอบ",
    createdAt   : serverTimestamp(),
  });

  // อัปเดตสถิติลูกค้า
  await updateDoc(doc(db, "customers", chatId), {
    totalOrders: increment(1),
    totalSpent : increment(total),
    lastOrder  : serverTimestamp(),
  });

  return orderId;
}

// ══════════════════════════════════════════
//  🎨  DESIGN TOKENS
// ══════════════════════════════════════════
const TOKEN = {
  bg      : "#07080f",
  surface : "rgba(255,255,255,0.04)",
  border  : "rgba(255,255,255,0.08)",
  text    : "#f0f0f5",
  muted   : "rgba(255,255,255,0.4)",
  accent  : "#a78bfa",   // violet
  green   : "#34d399",
  font    : "'DM Serif Display', Georgia, serif",
  body    : "'Prompt', sans-serif",
};

// ══════════════════════════════════════════
//  📺  SCREENS
// ══════════════════════════════════════════
const SCREEN = {
  SPLASH  : "splash",
  HOME    : "home",
  PRODUCTS: "products",
  DETAIL  : "detail",
  CART    : "cart",
  PAYMENT : "payment",
  SUCCESS : "success",
};

// ══════════════════════════════════════════
//  🌟  SPLASH SCREEN
// ══════════════════════════════════════════
function SplashScreen() {
  return (
    <div style={{
      height: "100vh", background: TOKEN.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 20,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Prompt:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        body { background: ${TOKEN.bg}; overflow-x: hidden; }
        @keyframes splashPop  { from{opacity:0;transform:scale(0.5)} to{opacity:1;transform:scale(1)} }
        @keyframes fadeUp     { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp    { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse      { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes shimmer    { from{transform:translateX(-100%)} to{transform:translateX(200%)} }
        @keyframes spin       { to{transform:rotate(360deg)} }
      `}</style>
      <div style={{ fontSize: 72, animation: "splashPop 0.7s cubic-bezier(0.34,1.56,0.64,1)" }}>🛍️</div>
      <div style={{
        fontFamily: TOKEN.font, fontSize: 38, color: TOKEN.text,
        animation: "fadeUp 0.6s 0.3s both ease", letterSpacing: 1,
      }}>SkinMart</div>
      <div style={{
        fontSize: 12, color: TOKEN.muted, letterSpacing: 4,
        textTransform: "uppercase", fontFamily: TOKEN.body,
        animation: "fadeUp 0.6s 0.5s both ease",
      }}>Premium Skincare</div>
      <div style={{ marginTop: 32, animation: "fadeUp 0.6s 0.8s both ease" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: "50%",
              background: TOKEN.accent, animation: `pulse 1.2s ${i * 0.2}s infinite`,
            }}/>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  🏠  HOME SCREEN
// ══════════════════════════════════════════
function HomeScreen({ brands, products, cart, onSelectBrand, onViewCart }) {
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const greeting  = TG_USER?.first_name ? `สวัสดีค่ะ คุณ${TG_USER.first_name}` : "สวัสดีค่ะ";

  return (
    <div style={{ minHeight: "100vh", background: TOKEN.bg, fontFamily: TOKEN.body, paddingBottom: 100 }}>
      {/* Hero */}
      <div style={{ position: "relative", padding: "52px 24px 36px", overflow: "hidden" }}>
        {/* BG orbs */}
        <div style={{ position:"absolute", top:-60, right:-60, width:220, height:220, borderRadius:"50%", background:`radial-gradient(circle,${TOKEN.accent}18,transparent 70%)`, pointerEvents:"none" }}/>
        <div style={{ position:"absolute", bottom:-40, left:-40, width:160, height:160, borderRadius:"50%", background:`radial-gradient(circle,${TOKEN.green}10,transparent 70%)`, pointerEvents:"none" }}/>

        <div style={{ fontSize:11, color:TOKEN.accent, fontWeight:600, letterSpacing:3, textTransform:"uppercase", marginBottom:10, animation:"fadeUp 0.5s both" }}>{greeting}</div>
        <div style={{ fontFamily:TOKEN.font, fontSize:38, color:TOKEN.text, lineHeight:1.15, marginBottom:8, animation:"fadeUp 0.5s 0.1s both" }}>
          เลือกสินค้า<br/>
          <span style={{ fontStyle:"italic", color:TOKEN.accent }}>ที่ใช่สำหรับคุณ</span>
        </div>
        <div style={{ fontSize:13, color:TOKEN.muted, animation:"fadeUp 0.5s 0.2s both" }}>
          {products.length} รายการ • จ่ายปลายทาง ไม่ต้องโอนก่อน
        </div>
      </div>

      {/* Brand List */}
      <div style={{ padding:"0 16px" }}>
        <div style={{ fontSize:10, color:TOKEN.muted, letterSpacing:2.5, textTransform:"uppercase", marginBottom:14, paddingLeft:4 }}>
          เลือกแบรนด์
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {brands.map((b, i) => {
            const count = products.filter(p => p.brand === b.key).length;
            return (
              <BrandCard key={b.key} brand={b} count={count} index={i} onClick={() => onSelectBrand(b.key)} />
            );
          })}
        </div>
      </div>

      {/* Cart FAB */}
      {cartCount > 0 && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", zIndex:50, animation:"slideUp 0.3s ease" }}>
          <button onClick={onViewCart} style={{
            background:`linear-gradient(135deg,${TOKEN.accent},#7c3aed)`,
            border:"none", borderRadius:28, padding:"14px 28px",
            display:"flex", alignItems:"center", gap:10, cursor:"pointer",
            boxShadow:`0 8px 32px ${TOKEN.accent}50`,
          }}>
            <span style={{ fontSize:18 }}>🛒</span>
            <span style={{ fontFamily:TOKEN.body, fontWeight:700, fontSize:15, color:"#fff" }}>ดูตะกร้า</span>
            <span style={{ background:"rgba(255,255,255,0.25)", borderRadius:20, padding:"2px 10px", fontSize:13, fontWeight:800, color:"#fff" }}>{cartCount}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function BrandCard({ brand, count, index, onClick }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        background: pressed ? "rgba(255,255,255,0.07)" : TOKEN.surface,
        border:`1px solid ${pressed ? brand.color + "50" : TOKEN.border}`,
        borderRadius:18, padding:"18px 20px",
        display:"flex", alignItems:"center", gap:16,
        cursor:"pointer", textAlign:"left", width:"100%",
        transition:"all 0.15s",
        transform: pressed ? "scale(0.97)" : "scale(1)",
        animation:`fadeUp 0.5s ${index * 0.07}s both ease`,
        boxShadow: pressed ? `0 0 24px ${brand.color}20` : "none",
        fontFamily: TOKEN.body,
      }}>
      <div style={{
        width:54, height:54, borderRadius:16, flexShrink:0,
        background:`linear-gradient(135deg,${brand.color}25,${brand.color}08)`,
        border:`1px solid ${brand.color}30`,
        display:"flex", alignItems:"center", justifyContent:"center", fontSize:26,
      }}>{brand.emoji}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontFamily:TOKEN.font, fontSize:19, color:TOKEN.text, marginBottom:3 }}>{brand.name}</div>
        <div style={{ fontSize:12, color:TOKEN.muted }}>{brand.desc || ""}</div>
        <div style={{ marginTop:6, fontSize:10, color:brand.color, fontWeight:700, letterSpacing:1, textTransform:"uppercase" }}>
          {count} รายการ →
        </div>
      </div>
      <div style={{ width:8, height:8, borderRadius:"50%", background:brand.color, flexShrink:0, opacity:0.7 }}/>
    </button>
  );
}

// ══════════════════════════════════════════
//  🛍️  PRODUCTS SCREEN
// ══════════════════════════════════════════
function ProductsScreen({ brandKey, brands, products, cart, onBack, onViewDetail, onAddToCart, onViewCart }) {
  const brand     = brands.find(b => b.key === brandKey) || {};
  const filtered  = products.filter(p => p.brand === brandKey);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <div style={{ minHeight:"100vh", background:TOKEN.bg, fontFamily:TOKEN.body, paddingBottom:120 }}>
      {/* Header */}
      <div style={{
        padding:"20px 20px 18px", position:"sticky", top:0, zIndex:10,
        background:`rgba(7,8,15,0.92)`, backdropFilter:"blur(16px)",
        borderBottom:`1px solid ${TOKEN.border}`,
      }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:TOKEN.muted, fontSize:13, cursor:"pointer", padding:0, marginBottom:14, fontFamily:TOKEN.body, display:"flex", alignItems:"center", gap:6 }}>
          ← กลับ
        </button>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:`${brand.color}20`, border:`1px solid ${brand.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{brand.emoji}</div>
          <div>
            <div style={{ fontFamily:TOKEN.font, fontSize:22, color:TOKEN.text }}>{brand.name}</div>
            <div style={{ fontSize:11, color:TOKEN.muted }}>{filtered.length} รายการ</div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding:"16px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {filtered.map((p, i) => {
          const inCart = cart.find(c => c.id === p.id);
          return (
            <ProductCard key={p.id} product={p} brand={brand} inCart={inCart} index={i}
              onDetail={() => onViewDetail(p.id)}
              onAdd={() => onAddToCart(p.id)} />
          );
        })}
      </div>

      {/* Cart FAB */}
      {cartCount > 0 && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", zIndex:50 }}>
          <button onClick={onViewCart} style={{
            background:`linear-gradient(135deg,${TOKEN.accent},#7c3aed)`,
            border:"none", borderRadius:28, padding:"13px 26px",
            display:"flex", alignItems:"center", gap:10, cursor:"pointer",
            boxShadow:`0 8px 32px ${TOKEN.accent}50`,
          }}>
            <span style={{ fontSize:17 }}>🛒</span>
            <span style={{ fontFamily:TOKEN.body, fontWeight:700, fontSize:14, color:"#fff" }}>ดูตะกร้า ({cartCount})</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, brand, inCart, index, onDetail, onAdd }) {
  const [pressed, setPressed] = useState(false);
  return (
    <div style={{
      background:TOKEN.surface, border:`1px solid ${TOKEN.border}`,
      borderRadius:16, overflow:"hidden",
      animation:`fadeUp 0.4s ${index * 0.05}s both ease`,
      fontFamily:TOKEN.body,
    }}>
      <div onClick={onDetail} style={{ position:"relative", paddingTop:"100%", cursor:"pointer", overflow:"hidden" }}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", transition:"transform 0.3s" }}/>
        ) : (
          <div style={{ position:"absolute", inset:0, background:`linear-gradient(135deg,${brand.color}20,${brand.color}08)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:40 }}>{brand.emoji}</div>
        )}
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top,rgba(7,8,15,0.8),transparent 55%)" }}/>
        {inCart && (
          <div style={{ position:"absolute", top:8, right:8, background:brand.color, borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:800, color:"#07080f" }}>×{inCart.qty}</div>
        )}
      </div>
      <div style={{ padding:"10px 12px 12px" }}>
        <div onClick={onDetail} style={{ fontSize:12, fontWeight:600, color:"rgba(255,255,255,0.85)", lineHeight:1.4, marginBottom:8, cursor:"pointer", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden", minHeight:34 }}>
          {product.name}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:14, fontWeight:700, color:brand.color }}>{fmt(product.price)}</span>
          <button onClick={onAdd}
            onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
            style={{
              background: inCart ? brand.color : `${brand.color}18`,
              border:`1px solid ${brand.color}`,
              color: inCart ? "#07080f" : brand.color,
              borderRadius:10, padding:"5px 12px", fontSize:12, fontWeight:700,
              cursor:"pointer", transition:"all 0.12s",
              transform: pressed ? "scale(0.9)" : "scale(1)",
              fontFamily:TOKEN.body,
            }}>
            {inCart ? "✓+" : "+"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  🔍  DETAIL SCREEN
// ══════════════════════════════════════════
function DetailScreen({ productId, brands, products, cart, onBack, onAddToCart, onViewCart }) {
  const product   = products.find(p => p.id === productId);
  const brand     = brands.find(b => b.key === product?.brand) || {};
  const inCart    = cart.find(c => c.id === productId);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const [pressed, setPressed] = useState(false);

  useEffect(() => { trackProductView(SHOP_ID, productId, product?.brand); }, []);

  if (!product) return null;

  return (
    <div style={{ minHeight:"100vh", background:TOKEN.bg, fontFamily:TOKEN.body, paddingBottom:120 }}>
      {/* Back */}
      <button onClick={onBack} style={{
        position:"fixed", top:16, left:16, zIndex:20,
        background:"rgba(7,8,15,0.8)", border:`1px solid ${TOKEN.border}`,
        borderRadius:12, padding:"8px 16px", color:TOKEN.muted,
        fontSize:13, cursor:"pointer", backdropFilter:"blur(8px)", fontFamily:TOKEN.body,
      }}>← กลับ</button>

      {/* Image */}
      <div style={{ position:"relative", height:320, overflow:"hidden" }}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
        ) : (
          <div style={{ width:"100%", height:"100%", background:`linear-gradient(135deg,${brand.color}30,${brand.color}08)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:80 }}>{brand.emoji}</div>
        )}
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top,#07080f 0%,transparent 55%)" }}/>
      </div>

      {/* Content */}
      <div style={{ padding:"0 24px 24px", marginTop:-36, position:"relative" }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:`${brand.color}15`, border:`1px solid ${brand.color}30`, borderRadius:20, padding:"4px 12px", marginBottom:14 }}>
          <span style={{ fontSize:14 }}>{brand.emoji}</span>
          <span style={{ fontSize:11, color:brand.color, fontWeight:700 }}>{brand.name}</span>
        </div>
        <h1 style={{ fontFamily:TOKEN.font, fontSize:26, color:TOKEN.text, lineHeight:1.25, marginBottom:10 }}>{product.name}</h1>
        <div style={{ fontSize:30, fontWeight:700, color:brand.color, marginBottom:20, fontFamily:TOKEN.font }}>{fmt(product.price)}</div>

        {product.description && (
          <div style={{ background:TOKEN.surface, border:`1px solid ${TOKEN.border}`, borderRadius:16, padding:"16px 18px", marginBottom:16 }}>
            <div style={{ fontSize:10, color:TOKEN.muted, letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>รายละเอียด</div>
            <div style={{ fontSize:14, color:"rgba(255,255,255,0.75)", lineHeight:1.8 }}>{product.description}</div>
          </div>
        )}

        <div style={{ background:TOKEN.surface, border:`1px solid ${TOKEN.border}`, borderRadius:14, padding:"12px 18px" }}>
          <div style={{ fontSize:12, color:TOKEN.muted, display:"flex", alignItems:"center", gap:8 }}>
            <span>📦</span> ชำระเงินสดปลายทาง (COD) — ไม่ต้องโอนก่อน
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div style={{
        position:"fixed", bottom:0, left:0, right:0, padding:"14px 20px 24px",
        background:`rgba(7,8,15,0.97)`, backdropFilter:"blur(16px)",
        borderTop:`1px solid ${TOKEN.border}`, display:"flex", gap:10, zIndex:20,
      }}>
        {cartCount > 0 && (
          <button onClick={onViewCart} style={{
            flex:1, background:TOKEN.surface, border:`1px solid ${TOKEN.border}`,
            borderRadius:16, padding:"14px", color:TOKEN.text, fontSize:14,
            fontWeight:700, cursor:"pointer", fontFamily:TOKEN.body,
          }}>
            🛒 {cartCount}
          </button>
        )}
        <button onClick={() => onAddToCart(productId)}
          onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
          style={{
            flex:3, background:`linear-gradient(135deg,${brand.color},${brand.color}bb)`,
            border:"none", borderRadius:16, padding:"15px",
            color:"#07080f", fontSize:15, fontWeight:800, cursor:"pointer",
            transform: pressed ? "scale(0.97)" : "scale(1)", transition:"all 0.1s",
            boxShadow:`0 8px 24px ${brand.color}40`, fontFamily:TOKEN.body,
          }}>
          {inCart ? `✅ เพิ่มอีก (${inCart.qty} ชิ้น)` : "🛒 เพิ่มลงตะกร้า"}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  🛒  CART SCREEN
// ══════════════════════════════════════════
function CartScreen({ cart, products, brands, onBack, onUpdateQty, onCheckout }) {
  const total = calcTotal(cart, products);

  if (cart.length === 0) {
    return (
      <div style={{ height:"100vh", background:TOKEN.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:18, padding:24, fontFamily:TOKEN.body }}>
        <div style={{ fontSize:64 }}>🛒</div>
        <div style={{ fontFamily:TOKEN.font, fontSize:24, color:TOKEN.text }}>ตะกร้าว่างอยู่ค่ะ</div>
        <div style={{ fontSize:13, color:TOKEN.muted, textAlign:"center" }}>เลือกสินค้าที่ต้องการก่อนนะคะ</div>
        <button onClick={onBack} style={{ marginTop:8, background:`${TOKEN.accent}15`, border:`1px solid ${TOKEN.accent}40`, borderRadius:16, padding:"12px 28px", color:TOKEN.accent, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:TOKEN.body }}>
          ← เลือกสินค้า
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:TOKEN.bg, fontFamily:TOKEN.body, paddingBottom:160 }}>
      {/* Header */}
      <div style={{ padding:"24px 20px 18px", position:"sticky", top:0, background:`rgba(7,8,15,0.95)`, backdropFilter:"blur(16px)", borderBottom:`1px solid ${TOKEN.border}`, zIndex:10 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:TOKEN.muted, fontSize:13, cursor:"pointer", padding:0, marginBottom:14, fontFamily:TOKEN.body }}>← เลือกสินค้าต่อ</button>
        <div style={{ fontFamily:TOKEN.font, fontSize:24, color:TOKEN.text }}>🛒 ตะกร้าสินค้า</div>
      </div>

      {/* Items */}
      <div style={{ padding:"14px 16px" }}>
        {cart.map(item => {
          const p = products.find(x => x.id === item.id);
          const b = brands.find(x => x.key === p?.brand);
          if (!p) return null;
          return (
            <div key={item.id} style={{ background:TOKEN.surface, border:`1px solid ${TOKEN.border}`, borderRadius:16, padding:"14px", marginBottom:10, display:"flex", gap:12, alignItems:"center" }}>
              {p.imageUrl
                ? <img src={p.imageUrl} alt={p.name} style={{ width:60, height:60, borderRadius:12, objectFit:"cover", flexShrink:0 }}/>
                : <div style={{ width:60, height:60, borderRadius:12, background:`${b?.color}20`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, flexShrink:0 }}>{b?.emoji}</div>
              }
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:"rgba(255,255,255,0.85)", marginBottom:5, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</div>
                <div style={{ fontSize:14, fontWeight:700, color:b?.color }}>{fmt(p.price * item.qty)}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                <button onClick={() => onUpdateQty(item.id, item.qty - 1)} style={{ width:30, height:30, borderRadius:9, background:TOKEN.surface, border:`1px solid ${TOKEN.border}`, color:TOKEN.text, fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>−</button>
                <span style={{ fontSize:15, fontWeight:700, color:TOKEN.text, minWidth:20, textAlign:"center" }}>{item.qty}</span>
                <button onClick={() => onUpdateQty(item.id, item.qty + 1)} style={{ width:30, height:30, borderRadius:9, background:`${TOKEN.accent}15`, border:`1px solid ${TOKEN.accent}40`, color:TOKEN.accent, fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"16px 20px 28px", background:`rgba(7,8,15,0.97)`, backdropFilter:"blur(16px)", borderTop:`1px solid ${TOKEN.border}`, zIndex:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div>
            <div style={{ fontSize:12, color:TOKEN.muted, marginBottom:3 }}>ยอดรวมทั้งหมด</div>
            <div style={{ fontFamily:TOKEN.font, fontSize:28, color:TOKEN.accent }}>{fmt(total)}</div>
          </div>
          <div style={{ textAlign:"right", fontSize:12, color:TOKEN.muted }}>
            <div>📦 COD</div>
            <div>จ่ายเมื่อรับของ</div>
          </div>
        </div>
        <button onClick={onCheckout} style={{
          width:"100%", background:`linear-gradient(135deg,${TOKEN.accent},#7c3aed)`,
          border:"none", borderRadius:18, padding:"16px",
          color:"#fff", fontSize:16, fontWeight:800, cursor:"pointer",
          boxShadow:`0 8px 32px ${TOKEN.accent}45`, fontFamily:TOKEN.body,
        }}>
          ✅ ยืนยันสั่งซื้อ — {fmt(total)}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  💳  PAYMENT SCREEN
// ══════════════════════════════════════════
function PaymentScreen({ cart, products, shopData, onBack, onSuccess }) {
  const total = calcTotal(cart, products);
  const [slip, setSlip]     = useState(null);
  const [sending, setSending] = useState(false);
  const [orderId, setOrderId] = useState(null);

  const handleFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => setSlip(ev.target.result);
    r.readAsDataURL(f);
  };

  const handleSend = async () => {
    if (!slip) return;
    setSending(true);
    try {
      const id = await saveOrder(SHOP_ID, cart, products);
      setOrderId(id);
      // ส่งข้อมูลกลับ Bot ผ่าน Telegram WebApp
      if (tg) {
        tg.sendData(JSON.stringify({
          action  : "new_order",
          orderId : id,
          total,
          chatId  : String(TG_USER?.id),
          slip    : slip.split(",")[1], // base64
        }));
      }
      setTimeout(() => { setSending(false); onSuccess(id); }, 1000);
    } catch (err) {
      setSending(false);
      alert("เกิดข้อผิดพลาด กรุณาลองใหม่ค่ะ");
    }
  };

  const bank = shopData?.bank || { name:"กสิกรไทย", account:"123-4-56789-0", holder:"บริษัท สกินมาร์ท จำกัด" };

  return (
    <div style={{ minHeight:"100vh", background:TOKEN.bg, fontFamily:TOKEN.body, paddingBottom:40 }}>
      <div style={{ padding:"24px 20px 18px", borderBottom:`1px solid ${TOKEN.border}` }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:TOKEN.muted, fontSize:13, cursor:"pointer", padding:0, marginBottom:14, fontFamily:TOKEN.body }}>← กลับ</button>
        <div style={{ fontFamily:TOKEN.font, fontSize:24, color:TOKEN.text }}>💳 ชำระเงิน</div>
      </div>

      <div style={{ padding:"20px 20px" }}>
        {/* Bank Info */}
        <div style={{ background:TOKEN.surface, border:`1px solid ${TOKEN.border}`, borderRadius:16, padding:"18px 20px", marginBottom:16 }}>
          <div style={{ fontSize:10, color:TOKEN.muted, letterSpacing:2.5, textTransform:"uppercase", marginBottom:12 }}>บัญชีธนาคาร</div>
          <div style={{ fontSize:13, color:TOKEN.muted, marginBottom:4 }}>🏦 {bank.name}</div>
          <div style={{ fontFamily:"monospace", fontSize:20, fontWeight:800, color:TOKEN.text, letterSpacing:2, marginBottom:4 }}>{bank.account}</div>
          <div style={{ fontSize:13, color:TOKEN.muted }}>👤 {bank.holder}</div>
        </div>

        {/* Amount */}
        <div style={{ background:`linear-gradient(135deg,${TOKEN.accent}15,${TOKEN.accent}05)`, border:`1px solid ${TOKEN.accent}30`, borderRadius:16, padding:"20px", textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:11, color:TOKEN.accent, letterSpacing:2.5, textTransform:"uppercase", marginBottom:8 }}>ยอดที่ต้องโอน</div>
          <div style={{ fontFamily:TOKEN.font, fontSize:40, color:TOKEN.accent }}>{fmt(total)}</div>
        </div>

        {/* Slip Upload */}
        {!slip ? (
          <label style={{
            display:"flex", flexDirection:"column", alignItems:"center", gap:10,
            border:`2px dashed ${TOKEN.accent}40`, borderRadius:18, padding:"28px",
            cursor:"pointer", color:TOKEN.accent, background:`${TOKEN.accent}05`,
          }}>
            <input type="file" accept="image/*" onChange={handleFile} style={{ display:"none" }}/>
            <span style={{ fontSize:36 }}>📎</span>
            <span style={{ fontSize:15, fontWeight:600, fontFamily:TOKEN.body }}>แนบสลิปโอนเงิน</span>
            <span style={{ fontSize:12, color:TOKEN.muted }}>กดเพื่อเลือกรูปภาพ</span>
          </label>
        ) : (
          <div>
            <img src={slip} alt="slip" style={{ width:"100%", borderRadius:16, maxHeight:240, objectFit:"contain", border:`1px solid ${TOKEN.border}` }}/>
            <button onClick={() => setSlip(null)} style={{ width:"100%", marginTop:8, background:"none", border:`1px solid ${TOKEN.border}`, borderRadius:12, padding:"10px", color:TOKEN.muted, cursor:"pointer", fontFamily:TOKEN.body, fontSize:13 }}>
              เลือกรูปใหม่
            </button>
          </div>
        )}

        {/* Send Button */}
        {slip && (
          <button onClick={handleSend} disabled={sending} style={{
            width:"100%", marginTop:14,
            background: sending ? TOKEN.surface : `linear-gradient(135deg,${TOKEN.accent},#7c3aed)`,
            border:"none", borderRadius:18, padding:"16px",
            color: sending ? TOKEN.muted : "#fff",
            fontSize:16, fontWeight:800, cursor: sending ? "not-allowed" : "pointer",
            boxShadow: sending ? "none" : `0 8px 32px ${TOKEN.accent}45`,
            fontFamily:TOKEN.body, transition:"all 0.2s",
          }}>
            {sending ? "⏳ กำลังส่ง..." : "📤 ส่งสลิปยืนยัน"}
          </button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  🎉  SUCCESS SCREEN
// ══════════════════════════════════════════
function SuccessScreen({ orderId, onRestart }) {
  return (
    <div style={{ height:"100vh", background:TOKEN.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20, padding:32, fontFamily:TOKEN.body, textAlign:"center" }}>
      <div style={{ fontSize:72, animation:"splashPop 0.6s cubic-bezier(0.34,1.56,0.64,1)" }}>🎉</div>
      <div style={{ fontFamily:TOKEN.font, fontSize:28, color:TOKEN.text, animation:"fadeUp 0.5s 0.2s both" }}>ส่งสลิปแล้วค่ะ!</div>
      <div style={{ fontSize:14, color:TOKEN.muted, lineHeight:1.8, animation:"fadeUp 0.5s 0.3s both" }}>
        รอแอดมินตรวจสอบและยืนยัน<br/>ภายใน 15-30 นาทีค่ะ 😊
      </div>
      {orderId && (
        <div style={{ background:TOKEN.surface, border:`1px solid ${TOKEN.border}`, borderRadius:14, padding:"14px 24px", animation:"fadeUp 0.5s 0.4s both" }}>
          <div style={{ fontSize:11, color:TOKEN.muted, marginBottom:4 }}>เลขออเดอร์</div>
          <div style={{ fontFamily:"monospace", fontSize:20, fontWeight:800, color:TOKEN.accent }}>{orderId}</div>
        </div>
      )}
      <button onClick={onRestart} style={{
        marginTop:8, background:`${TOKEN.accent}15`, border:`1px solid ${TOKEN.accent}40`,
        borderRadius:18, padding:"13px 32px", color:TOKEN.accent,
        fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:TOKEN.body,
        animation:"fadeUp 0.5s 0.5s both",
      }}>
        🔄 สั่งซื้อสินค้าอีกครั้ง
      </button>
    </div>
  );
}

// ══════════════════════════════════════════
//  🚀  MAIN APP
// ══════════════════════════════════════════
export default function App() {
  const [screen,     setScreen]     = useState(SCREEN.SPLASH);
  const [brands,     setBrands]     = useState([]);
  const [products,   setProducts]   = useState([]);
  const [shopData,   setShopData]   = useState(null);
  const [cart,       setCart]       = useState([]);
  const [activeBrand,setActiveBrand]= useState(null);
  const [activeProduct,setActiveProduct] = useState(null);
  const [successOrder, setSuccessOrder] = useState(null);
  const [loading,    setLoading]    = useState(true);

  // โหลดข้อมูลทั้งหมด
  useEffect(() => {
    async function init() {
      try {
        tg?.expand();
        tg?.setHeaderColor("#07080f");
        tg?.setBackgroundColor("#07080f");

        // โหลดข้อมูลพร้อมกัน
        const [b, p, shopSnap] = await Promise.all([
          fetchBrands(SHOP_ID),
          fetchProducts(SHOP_ID),
          getDoc(doc(db, "shops", SHOP_ID)),
        ]);

        setBrands(b);
        setProducts(p);
        if (shopSnap.exists()) setShopData(shopSnap.data());

        // Track ลูกค้า
        await trackCustomer(SHOP_ID);
      } catch (err) {
        console.error("Init error:", err);
      } finally {
        setLoading(false);
        setTimeout(() => setScreen(SCREEN.HOME), 2000);
      }
    }
    init();
  }, []);

  // จัดการตะกร้า
  const addToCart = useCallback(productId => {
    setCart(prev => {
      const exists = prev.find(i => i.id === productId);
      return exists
        ? prev.map(i => i.id === productId ? { ...i, qty: i.qty + 1 } : i)
        : [...prev, { id: productId, qty: 1 }];
    });
  }, []);

  const updateQty = useCallback((productId, qty) => {
    setCart(prev => qty <= 0
      ? prev.filter(i => i.id !== productId)
      : prev.map(i => i.id === productId ? { ...i, qty } : i)
    );
  }, []);

  if (screen === SCREEN.SPLASH || loading) return <SplashScreen />;

  if (screen === SCREEN.SUCCESS) return (
    <SuccessScreen orderId={successOrder} onRestart={() => { setCart([]); setScreen(SCREEN.HOME); }} />
  );

  if (screen === SCREEN.HOME) return (
    <HomeScreen brands={brands} products={products} cart={cart}
      onSelectBrand={key => { setActiveBrand(key); setScreen(SCREEN.PRODUCTS); }}
      onViewCart={() => setScreen(SCREEN.CART)} />
  );

  if (screen === SCREEN.PRODUCTS) return (
    <ProductsScreen brandKey={activeBrand} brands={brands} products={products} cart={cart}
      onBack={() => setScreen(SCREEN.HOME)}
      onViewDetail={id => { setActiveProduct(id); setScreen(SCREEN.DETAIL); }}
      onAddToCart={addToCart}
      onViewCart={() => setScreen(SCREEN.CART)} />
  );

  if (screen === SCREEN.DETAIL) return (
    <DetailScreen productId={activeProduct} brands={brands} products={products} cart={cart}
      onBack={() => setScreen(SCREEN.PRODUCTS)}
      onAddToCart={addToCart}
      onViewCart={() => setScreen(SCREEN.CART)} />
  );

  if (screen === SCREEN.CART) return (
    <CartScreen cart={cart} products={products} brands={brands}
      onBack={() => setScreen(activeBrand ? SCREEN.PRODUCTS : SCREEN.HOME)}
      onUpdateQty={updateQty}
      onCheckout={() => setScreen(SCREEN.PAYMENT)} />
  );

  if (screen === SCREEN.PAYMENT) return (
    <PaymentScreen cart={cart} products={products} shopData={shopData}
      onBack={() => setScreen(SCREEN.CART)}
      onSuccess={id => { setSuccessOrder(id); setScreen(SCREEN.SUCCESS); }} />
  );

  return null;
}
