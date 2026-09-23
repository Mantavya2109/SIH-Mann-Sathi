# Mann Shathi — Soft Mint & Sage Medical UI System (DESIGN.md)

## 1. Core Architecture & Constraints
- **Primary Theme:** Light Mode Soft Sage & Mint (`bg-[#E2EFE9]` / `bg-[#E8F3EE]`).
- **Navigation:** Remove all form-based logins. Direct selection cards for "Complainant Portal" and "Counsellor Portal".
- **Component Style:** Ultra-rounded cards (`rounded-3xl bg-white shadow-sm`), dark charcoal action buttons (`bg-[#18181B] text-white rounded-2xl`), and pastel accent badges.
- **Assets & Branding:**
  - Logo slot: Flexible asset path `frontend/src/assets/logo.svg` (or fallback placeholder component).
  - Image slots: Clean, framed illustration containers with fallback backgrounds (`bg-[#D8EADF]`).

---

## 2. Color System & Design Variables
- **Main Canvas Background:** Soft Mint Grey (`bg-[#E2EFE9]`).
- **Card Containers:** Pure White (`bg-white rounded-3xl p-6 shadow-sm border border-emerald-100/40`).
- **Pastel Tints:**
  - Soft Sage Green (`bg-[#E8F5E9] text-emerald-800`).
  - Warm Sunshine Yellow (`bg-[#FEF9C3] text-amber-900`).
  - Ice Blue Tint (`bg-[#F0F4F8] text-slate-800`).
- **Primary Dark Action:** Charcoal (`bg-[#18181B] hover:bg-slate-800 text-white rounded-2xl`).

---

## 3. UI Requirements & Asset Slots
1. **Simplified Access Screen (`LoginScreen.tsx`):**
   - Left side: Soft illustration banner with quote placeholder.
   - Right side: Two elevated access cards ("Complainant Portal" & "Counsellor Portal") with arrow buttons. Clicking directly switches application state without credentials.
2. **Dynamic Animations:**
   - Lucide React icons with animated hover bounces (`hover:scale-110 transition-transform duration-200`).
   - Card hover lift: `hover:-translate-y-1 hover:shadow-md transition-all duration-300 ease-out`.
3. **Brand Logo Container:**
   - Reusable `<BrandLogo />` component looking for `src/assets/logo.svg`. Displays a styled leaf/heart SVG icon if the image file is missing.