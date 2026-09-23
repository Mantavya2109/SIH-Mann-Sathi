import React, { useState } from "react";

interface NavItem {
  id: string;
  label: string;
  icon: string;
  previewText: string;
  badge?: string;
  section: "general" | "tools";
}

interface GlassSidebarProps {
  activeTab: string;
  onTabChange: (id: string) => void;
  user: { name: string; role: string };
  onLogout: () => void;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Dashboard", icon: "🏠", previewText: "Your wellness space", section: "general" },
  { id: "chat", label: "Chat Companion", icon: "💬", previewText: "Talk with Sahaaya AI", section: "general" },
  { id: "wellness", label: "My Wellness", icon: "💚", previewText: "Mood & daily progress", section: "general" },
  { id: "resources", label: "Resources", icon: "📖", previewText: "Guides, articles & coping tools", section: "general" },
  { id: "appointments", label: "Appointments", icon: "📅", previewText: "Upcoming sessions with counsellors", badge: "2", section: "general" },
  { id: "insights", label: "Insights", icon: "📊", previewText: "Biosignal trends & reports", section: "general" },

  { id: "breathing", label: "Breathing Exercises", icon: "🫁", previewText: "Box breathing & calm reset", section: "tools" },
  { id: "mood", label: "Mood Tracker", icon: "😊", previewText: "Log how you feel right now", section: "tools" },
  { id: "journal", label: "Journal Entry", icon: "✏️", previewText: "Private confidential notes", section: "tools" },
  { id: "emergency", label: "Emergency Help", icon: "⚠️", previewText: "Immediate SOS & helpline", section: "tools" },
];

export const GlassSidebar: React.FC<GlassSidebarProps> = ({
  activeTab,
  onTabChange,
  user,
  onLogout,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMouseOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const generalItems = NAV_ITEMS.filter((i) => i.section === "general");
  const toolItems = NAV_ITEMS.filter((i) => i.section === "tools");

  return (
    <aside
      onMouseMove={handleMouseMove}
      className="w-72 h-[calc(100vh-2rem)] sticky top-4 left-4 my-4 ml-4 flex flex-col justify-between p-5 rounded-3xl bg-white/70 backdrop-blur-xl border border-white/80 shadow-lg shadow-emerald-900/5 overflow-hidden z-30 transition-all duration-300 relative group shrink-0"
    >
      {/* Dynamic Glass Reflection Follow Effect */}
      <div
        className="absolute pointer-events-none rounded-full w-48 h-48 bg-white/40 blur-2xl -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300 opacity-0 group-hover:opacity-100"
        style={{ left: `${mouseOffset.x}px`, top: `${mouseOffset.y}px` }}
      />

      {/* Header Logo */}
      <div className="relative z-10">
        <div className="flex items-center gap-3 p-2 group/logo cursor-pointer">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/30 transition-all duration-300 group-hover/logo:scale-110 group-hover/logo:rotate-6">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-lg tracking-tight leading-none">Mann Shathi</h1>
            <p className="text-[11px] text-emerald-700 font-semibold transition-opacity duration-300 group-hover/logo:text-emerald-900 mt-0.5">
              You Are Not Alone
            </p>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="mt-6 space-y-6 overflow-y-auto max-h-[calc(100vh-22rem)] pr-1 scrollbar-none">
          {/* General Links */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-3 mb-2">General</p>
            <nav className="space-y-1 relative">
              {generalItems.map((item) => {
                const isActive = activeTab === item.id;
                const isHovered = hoveredId === item.id;

                return (
                  <div key={item.id} className="relative">
                    <button
                      onClick={() => onTabChange(item.id)}
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all duration-200 relative z-10 ${
                        isActive
                          ? "bg-[#D8EADF] text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-emerald-50/50"
                      }`}
                      style={{
                        transform: isHovered && !isActive ? "scale(1.03) translateX(4px)" : "scale(1)",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-base">{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-800 text-white">
                          {item.badge}
                        </span>
                      )}
                    </button>

                    {/* Hover Discovery Tooltip */}
                    {isHovered && (
                      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 px-3 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-xl shadow-xl whitespace-nowrap pointer-events-none animate-in fade-in slide-in-from-left-2 duration-150">
                        {item.previewText}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Tools Links */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-3 mb-2">Tools</p>
            <nav className="space-y-1">
              {toolItems.map((item) => {
                const isActive = activeTab === item.id;
                const isHovered = hoveredId === item.id;

                return (
                  <div key={item.id} className="relative">
                    <button
                      onClick={() => onTabChange(item.id)}
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all duration-200 relative z-10 ${
                        isActive
                          ? "bg-[#D8EADF] text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-emerald-50/50"
                      }`}
                      style={{
                        transform: isHovered && !isActive ? "scale(1.03) translateX(4px)" : "scale(1)",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-base">{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                    </button>

                    {/* Hover Discovery Tooltip */}
                    {isHovered && (
                      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 px-3 py-1.5 bg-slate-900 text-white text-[11px] font-medium rounded-xl shadow-xl whitespace-nowrap pointer-events-none animate-in fade-in slide-in-from-left-2 duration-150">
                        {item.previewText}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      {/* Encouragement Card & Footer */}
      <div className="relative z-10 space-y-3">
        <div className="p-4 rounded-3xl bg-[#FEF9C3] border border-amber-200/60 shadow-sm relative overflow-hidden group/card hover:-translate-y-1 hover:shadow-md transition-all duration-300">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">☀️</span>
            <h4 className="text-xs font-bold text-slate-900">A Brighter You Tomorrow</h4>
          </div>
          <p className="text-[11px] text-slate-600 leading-snug">Small steps today create a better tomorrow.</p>
          <button 
            onClick={() => onTabChange("resources")}
            className="mt-3 w-full py-2 bg-[#18181B] hover:bg-slate-800 text-white text-[11px] font-semibold rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-95 shadow-xs flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>Explore Resources</span>
            <span>→</span>
          </button>
        </div>

        {/* User Account Bar */}
        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center text-xs font-bold">
              {user.name.charAt(0)}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-900 leading-none">{user.name}</span>
              <span className="text-[10px] text-slate-500 mt-0.5 capitalize">{user.role}</span>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors text-xs font-semibold cursor-pointer"
            title="Log out"
          >
            ↪
          </button>
        </div>
      </div>
    </aside>
  );
};