import { useState } from "react";

interface Props {
  onLogin: (role: "victim" | "counsellor") => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [role, setRole] = useState<"victim" | "counsellor">("victim");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen flex" style={{ background: "#f7f8fb" }}>
      {/* LEFT PANEL */}
      <div
        className="hidden lg:flex flex-col justify-between flex-1 p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, #1e3a8a 0%, #1e40af 40%, #0369a1 100%)" }}
      >
        {/* Soft decorative circles */}
        <div
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-10"
          style={{ background: "#0ea5e9" }}
        />
        <div
          className="absolute bottom-32 -left-16 w-64 h-64 rounded-full opacity-10"
          style={{ background: "#0d9488" }}
        />
        <div
          className="absolute top-1/2 right-12 w-40 h-40 rounded-full opacity-5"
          style={{ background: "#ffffff" }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.534 4.068 2 6.999 2 9.03 2 10.999 3 12 5c1.001-2 2.87-3 5.001-3 2.93 0 5.999 1.534 5.999 5.191 0 4.105-5.37 8.863-11 14.402z"/>
              </svg>
            </div>
            <div>
              <span className="text-white text-xl font-bold tracking-wide" style={{ fontFamily: "Manrope, sans-serif" }}>Nirbhaya Mitra</span>
              <p className="text-blue-200 text-xs">AI-powered Victim Well-being & Support</p>
            </div>
          </div>
        </div>

        {/* Main message */}
        <div className="relative z-10 space-y-6">
          {/* Abstract support illustration */}
          <div className="flex gap-3 mb-8">
            {[
              { y: 0, delay: "0s" },
              { y: -8, delay: "0.2s" },
              { y: -4, delay: "0.4s" },
            ].map((p, i) => (
              <div
                key={i}
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{
                  background: `rgba(255,255,255,${0.08 + i * 0.04})`,
                  transform: `translateY(${p.y}px)`,
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                {i === 0 && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                )}
                {i === 1 && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.534 4.068 2 6.999 2 9.03 2 10.999 3 12 5c1.001-2 2.87-3 5.001-3 2.93 0 5.999 1.534 5.999 5.191 0 4.105-5.37 8.863-11 14.402z"/>
                  </svg>
                )}
                {i === 2 && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                  </svg>
                )}
              </div>
            ))}
          </div>

          <h1 className="text-4xl font-bold text-white leading-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
            You don't have to go<br />through this alone.
          </h1>
          <p className="text-blue-200 text-lg leading-relaxed max-w-sm">
            Confidential, continuous support throughout your journey.
          </p>

          {/* Trust indicators */}
          <div className="space-y-3 pt-4">
            {[
              { icon: "🔒", label: "Confidential & secure" },
              { icon: "🌐", label: "Available across multiple languages" },
              { icon: "💙", label: "Continuous well-being support" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  {item.icon}
                </div>
                <span className="text-blue-100 text-sm">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom badge */}
        <div className="relative z-10">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs text-blue-200"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Government of India — Ministry of Social Justice & Empowerment
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 lg:max-w-md flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#1e3a8a" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.534 4.068 2 6.999 2 9.03 2 10.999 3 12 5c1.001-2 2.87-3 5.001-3 2.93 0 5.999 1.534 5.999 5.191 0 4.105-5.37 8.863-11 14.402z"/>
              </svg>
            </div>
            <span className="font-bold text-[#1e3a8a]" style={{ fontFamily: "Manrope, sans-serif" }}>Nirbhaya Mitra</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-[#0f172a]" style={{ fontFamily: "Manrope, sans-serif" }}>Welcome back</h2>
            <p className="text-sm text-[#64748b] mt-1">Choose your role to continue</p>
          </div>

          {/* Role cards */}
          <div className="space-y-3">
            {[
              {
                id: "victim" as const,
                label: "Victim / Complainant",
                desc: "Access your support, check-ins and assistance",
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                ),
              },
              {
                id: "counsellor" as const,
                label: "Counsellor / Case Officer",
                desc: "Monitor assigned cases and provide support",
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                ),
              },
            ].map((r) => {
              const selected = role === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  className="w-full flex items-start gap-4 p-4 rounded-2xl text-left transition-all duration-200"
                  style={{
                    border: selected ? "2px solid #0d9488" : "2px solid #e2e8f0",
                    background: selected ? "#f0fdfa" : "#ffffff",
                    boxShadow: selected ? "0 0 0 4px rgba(13,148,136,0.08)" : "none",
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                    style={{
                      background: selected ? "#0d9488" : "#f1f5f9",
                      color: selected ? "white" : "#64748b",
                    }}
                  >
                    {r.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-[#0f172a]" style={{ fontFamily: "Manrope, sans-serif" }}>{r.label}</p>
                    <p className="text-xs text-[#64748b] mt-0.5 leading-relaxed">{r.desc}</p>
                  </div>
                  {selected && (
                    <div className="ml-auto mt-0.5 flex-shrink-0">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#0d9488" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Inputs */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">Mobile number / User ID</label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Enter your mobile or user ID"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{
                  border: "1.5px solid #e2e8f0",
                  background: "#ffffff",
                  fontFamily: "Inter, sans-serif",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#0d9488")}
                onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{
                  border: "1.5px solid #e2e8f0",
                  background: "#ffffff",
                  fontFamily: "Inter, sans-serif",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#0d9488")}
                onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
              />
            </div>
            <p className="text-right text-xs" style={{ color: "#0d9488" }}>
              <button className="hover:underline">Continue with OTP instead</button>
            </p>
          </div>

          <button
            onClick={() => onLogin(role)}
            className="w-full py-3.5 rounded-xl font-semibold text-sm text-white transition-all duration-200 active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)",
              fontFamily: "Manrope, sans-serif",
            }}
          >
            Continue
          </button>

          <p className="text-center text-xs" style={{ color: "#0d9488" }}>
            <button className="hover:underline">Need help signing in?</button>
          </p>

          {/* Privacy notice */}
          <div
            className="flex items-center gap-2 justify-center pt-2 pb-1"
            style={{ borderTop: "1px solid #f1f5f9" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <p className="text-xs text-[#64748b]">Your privacy and safety are our priority.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
