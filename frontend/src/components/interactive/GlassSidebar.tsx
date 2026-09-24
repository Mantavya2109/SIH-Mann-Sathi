import React, { useEffect, useState, type ReactNode } from "react";

/**
 * Victim-portal navigation.
 *  - Desktop (lg+): a slim floating dark-glass sidebar.
 *  - Phone / tablet: a top bar with a slide-in drawer.
 * Styled natively for the dark theme (same wordmark + font as the landing page).
 */

interface NavItem {
  id: string;
  label: string;
  hint: string;
  icon: ReactNode;
  badge?: string;
}

interface GlassSidebarProps {
  activeTab: string;
  onTabChange: (id: string) => void;
  user: { name: string; role: string };
  onLogout: () => void;
}

const I = (d: ReactNode) => (
  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const NAV_ITEMS: NavItem[] = [
  {
    id: "chat",
    label: "Chat Companion",
    hint: "Daily check-in",
    icon: I(<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z" />),
  },
  {
    id: "appointments",
    label: "Appointments",
    hint: "Your sessions",
    badge: "2",
    icon: I(
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="3" />
        <path d="M8 3v4M16 3v4M3.5 10h17" />
      </>,
    ),
  },
  {
    id: "insights",
    label: "Insights",
    hint: "How you're doing",
    icon: I(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  },
  {
    id: "caseupdates",
    label: "Case Updates",
    hint: "Progress & documents",
    icon: I(
      <>
        <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </>,
    ),
  },
  {
    id: "device",
    label: "Biosignal Device",
    hint: "Your wearable",
    icon: I(
      <>
        <rect x="6" y="6" width="12" height="12" rx="3" />
        <path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3M8.8 12h1.6l1-2 1.4 4 1-2h1.4" />
      </>,
    ),
  },
];

function Wordmark({ size = "lg" }: { size?: "lg" | "sm" }) {
  return (
    <span className={`font-extrabold tracking-[-0.02em] text-white leading-none ${size === "lg" ? "text-[20px]" : "text-[16px]"}`}>
      Mann{" "}
      <span className="bg-gradient-to-r from-[#d1fae5] via-[#6ee7b7] to-[#10b981] bg-clip-text text-transparent">Saathi</span>
    </span>
  );
}

function LogoMark({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#34d399] to-[#0d9488] text-[#03150e] shadow-[0_8px_24px_-10px_rgba(16,185,129,0.8)] ${
        small ? "w-8 h-8 rounded-xl" : "w-10 h-10"
      }`}
    >
      <svg className={small ? "w-[18px] h-[18px]" : "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20s-7-4.4-9.3-8.8A5 5 0 0112 5.6a5 5 0 019.3 5.6C19 15.6 12 20 12 20z" />
      </svg>
    </span>
  );
}

export const GlassSidebar: React.FC<GlassSidebarProps> = ({ activeTab, onTabChange, user, onLogout }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop rail: collapsed to icons by default, slides open on hover/focus, or stays open when pinned.
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const railOpen = hovered || pinned;

  // Close the drawer on Escape, and don't let the page scroll behind it.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const go = (id: string) => {
    onTabChange(id);
    setDrawerOpen(false);
  };

  const activeLabel = NAV_ITEMS.find((i) => i.id === activeTab)?.label ?? "Chat Companion";
  const initial = user.name.charAt(0).toUpperCase();

  // `open` = labels visible. The phone drawer is always open; the desktop rail
  // opens while hovered / focused, or stays open when pinned.
  const renderBody = (open: boolean) => (
    <>
      <div>
        {/* Brand — click to pin the rail open on desktop */}
        <button
          type="button"
          onClick={() => setPinned((v) => !v)}
          title={pinned ? "Unpin menu" : "Keep menu open"}
          className="flex items-center gap-3 w-full rounded-2xl p-1 text-left"
        >
          <LogoMark />
          <span className={`min-w-0 whitespace-nowrap transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}>
            <Wordmark />
            <span className="block mt-1.5 text-[11px] font-medium text-[#6ee7b7]/80">You are not alone</span>
          </span>
        </button>

        {/* Nav */}
        <p
          className={`mt-8 mb-2.5 px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[#737e90] whitespace-nowrap transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        >
          Menu
        </p>
        <nav className="space-y-1" aria-label="Victim portal">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                aria-current={active ? "page" : undefined}
                aria-label={open ? undefined : item.label}
                title={open ? undefined : item.label}
                className={`group relative w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition-colors duration-200 ${
                  active ? "bg-emerald-400/[0.10] text-white" : "text-[#9aa5b5] hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                {active && <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-gradient-to-b from-[#6ee7b7] to-[#10b981]" />}
                <span
                  className={`relative shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    active ? "bg-emerald-400/15 text-[#6ee7b7]" : "bg-white/[0.04] text-[#9aa5b5] group-hover:text-[#d1fae5]"
                  }`}
                >
                  {item.icon}
                  {item.badge && !open && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#10b981] text-[#03150e] text-[9px] font-bold flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className={`flex-1 min-w-0 whitespace-nowrap transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}>
                  <span className="block text-[13.5px] font-semibold leading-tight">{item.label}</span>
                  <span className={`block text-[11px] leading-tight mt-0.5 ${active ? "text-[#6ee7b7]/80" : "text-[#737e90]"}`}>{item.hint}</span>
                </span>
                {item.badge && open && (
                  <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-[#10b981] text-[#03150e] text-[10px] font-bold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Signed-in user */}
      <div
        className={`mt-6 flex items-center gap-3 rounded-2xl p-1.5 transition-colors duration-200 ${
          open ? "border border-white/[0.07] bg-white/[0.03]" : "border border-transparent"
        }`}
      >
        <span className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-[#34d399]/30 to-[#0d9488]/30 border border-emerald-300/25 text-[#d1fae5] flex items-center justify-center text-sm font-bold">
          {initial}
        </span>
        <span className={`flex-1 min-w-0 whitespace-nowrap transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}>
          <span className="block text-[13px] font-semibold text-white truncate">{user.name}</span>
          <span className="block text-[11px] text-[#9aa5b5] capitalize">{user.role}</span>
        </span>
        <button
          onClick={onLogout}
          title="Log out"
          aria-label="Log out"
          tabIndex={open ? 0 : -1}
          className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-[#9aa5b5] hover:text-[#fca5a5] hover:bg-red-500/10 transition ${
            open ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* ---------- Phone / tablet top bar ---------- */}
      <div className="lg:hidden shrink-0 sticky top-0 z-30 flex items-center gap-3 px-3.5 h-14 bg-[#070a11]/85 backdrop-blur-xl border-b border-white/[0.06]">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          className="w-10 h-10 -ml-1 rounded-xl flex items-center justify-center text-[#c9d2de] hover:bg-white/[0.06] active:scale-95 transition"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h10" />
          </svg>
        </button>
        <LogoMark small />
        <div className="min-w-0 leading-tight">
          <Wordmark size="sm" />
          <p className="mt-1 text-[11px] font-medium text-[#6ee7b7]/80 truncate">{activeLabel}</p>
        </div>
        <span className="ml-auto w-9 h-9 rounded-full bg-emerald-400/15 border border-emerald-300/25 text-[#d1fae5] flex items-center justify-center text-sm font-bold shrink-0" aria-hidden>
          {initial}
        </span>
      </div>

      {/* ---------- Desktop: collapsible rail attached to the left edge ---------- */}
      {/* The 76px placeholder keeps page content clear of the collapsed rail;
          the rail itself expands over the content instead of pushing it. */}
      <div className="hidden lg:block relative w-[76px] shrink-0 h-screen z-40">
        <aside
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(false);
          }}
          className={`absolute left-0 top-0 h-full flex flex-col justify-between px-3.5 pt-5 pb-4 bg-[#080c14]/95 backdrop-blur-xl border-r border-white/[0.07] overflow-x-hidden overflow-y-auto scrollbar-none transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            railOpen ? "w-[272px] shadow-[24px_0_60px_-20px_rgba(0,0,0,0.85)]" : "w-[76px]"
          }`}
        >
          {renderBody(railOpen)}
        </aside>
      </div>

      {/* ---------- Phone / tablet: slide-in drawer ---------- */}
      <div className={`lg:hidden fixed inset-0 z-50 ${drawerOpen ? "" : "pointer-events-none"}`} aria-hidden={!drawerOpen}>
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ${drawerOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          inert={!drawerOpen}
          className={`absolute left-0 top-0 h-full w-[min(86vw,320px)] flex flex-col justify-between p-4 pt-6 bg-[#0a0f18] border-r border-white/[0.07] shadow-2xl overflow-y-auto transition-transform duration-300 ease-out ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="absolute right-3 top-4 z-20 w-9 h-9 rounded-xl flex items-center justify-center text-[#9aa5b5] hover:bg-white/[0.06]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          {renderBody(true)}
        </aside>
      </div>
    </>
  );
};
