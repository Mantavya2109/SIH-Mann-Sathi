"use client";

import React from "react";
import GlyphPortal from "../components/ui/glyph-portal";
import DotField from "../components/interactive/DotField";
import BrandLogo from "../components/common/BrandLogo";

interface LoginScreenProps {
  onSelectPortal: (role: "victim" | "counsellor") => void;
}

export default function LoginScreen({ onSelectPortal }: LoginScreenProps) {
  return (
    <div className="w-full h-screen overflow-y-auto bg-[#0B3B2A] font-sans scrollbar-none">
      <GlyphPortal
        word="MANN SAATHI"
        focusChar="A"
        scrollLength={2.5}
        annotations={false}
        interactive={true}
        enterLabel="Step inside"
        fontFamily='"Arial Black", "Arial", sans-serif'
        fontWeight={900}
        style={{
          "--gp-paper": "#0B3B2A",       // Deep Forest Green
          "--gp-ink": "#E2EFE9",         // Soft Mint Big Typography
          "--gp-field": "#E2EFE9",       // Subtle Warm Mint Inner Surface
          "--gp-foreground": "#0F172A",
        }}
        background={<DotField />}
        front={
          <>
            <div className="absolute inset-x-0 top-8 px-8 flex items-center justify-between max-w-7xl mx-auto z-20">
              <BrandLogo size={38} showText={true} textColor="text-white" subtextColor="text-emerald-200" subtitle="You Are Not Alone" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-100 bg-emerald-950/60 backdrop-blur-md px-4 py-2 rounded-full border border-emerald-700/50 shadow-xs">
                Official Portal Access
              </span>
            </div>
            
            <p className="absolute inset-x-0 text-center text-base font-medium text-emerald-200/90 top-[26%] pointer-events-none">
              A confidential digital sanctuary starts here.
            </p>
            <p className="absolute inset-x-0 text-center text-lg font-semibold text-emerald-100 top-[66%] pointer-events-none">
              Follow your path to healing.
            </p>
          </>
        }
      >
        {/* REVEALED DOMINANT 80% VIEWPORT MAIN PORTAL PANEL */}
        <div className="min-h-screen w-full flex items-center justify-center p-6 md:p-12 lg:p-16">
          <div className="w-full max-w-[1280px] bg-white rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 border border-slate-200/80 my-auto">
            
            {/* LEFT PANEL: Forest Green Deep Identity */}
            <div className="relative bg-[#0B3B2A] p-10 md:p-14 text-white flex flex-col justify-between overflow-hidden min-h-[460px] lg:min-h-[580px]">
              
              {/* Subtle Depth Gradient Background (No photos or landscape illustrations) */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-[#14523B] via-[#0B3B2A] to-[#062419] pointer-events-none" />

              {/* Brand Identity Header */}
              <div className="relative z-10">
                <BrandLogo size={42} showText={true} textColor="text-white" subtextColor="text-emerald-300" subtitle="AI-Powered Trauma Support Platform" />
              </div>

              {/* Refined Quote Display */}
              <div className="relative z-10 my-auto py-8 space-y-4 max-w-xl">
                <blockquote 
                  className="text-2xl md:text-3xl lg:text-3xl font-serif italic text-emerald-50 leading-relaxed tracking-tight"
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  &ldquo;You are never alone on this journey. Compassionate, continuous support is always within reach.&rdquo;
                </blockquote>
                <div className="text-xs font-bold uppercase tracking-widest text-emerald-400/90 pt-2">
                  — Mann Sathi Sanctuary
                </div>
              </div>

              {/* Security & Confidentiality Section */}
              <div className="relative z-10 pt-6 border-t border-emerald-800/80 space-y-2">
                <div className="flex items-center gap-2.5 text-xs font-semibold text-emerald-200">
                  <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>End-to-End Encrypted & Confidential Support</span>
                </div>
                <p className="text-[11px] text-emerald-400/70 pl-6">
                  Ministry of Social Justice & Empowerment — Official Public Portal Access
                </p>
              </div>
            </div>

            {/* RIGHT PANEL: Main Portal Direct Access Options */}
            <div className="p-10 md:p-14 bg-[#FAFBFB] flex flex-col justify-between space-y-8">
              
              <div className="space-y-2">
                <span className="inline-block px-3.5 py-1 rounded-md bg-emerald-100/80 text-emerald-900 text-xs font-extrabold uppercase tracking-wider">
                  Direct Portal Access
                </span>
                <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
                  Welcome to Mann Sathi
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed pt-1">
                  Select your assigned portal below for immediate direct access to the platform.
                </p>
              </div>

              {/* Portal Selection Cards */}
              <div className="space-y-5 my-auto">
                
                {/* Complainant Portal Card */}
                <div
                  onClick={() => onSelectPortal("victim")}
                  className="group p-6 rounded-2xl border border-slate-200 hover:border-emerald-500 bg-white hover:bg-emerald-50/30 transition-all duration-200 cursor-pointer flex items-center justify-between shadow-xs hover:shadow-lg"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100/70 text-emerald-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      {/* Vector User Outline Icon */}
                      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-bold text-slate-900">Complainant Portal</h2>
                        <span className="text-xs font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-md">
                          Survivor Entry
                        </span>
                      </div>
                      <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
                        Access AI check-ins, biosignal tracking, appointments, and support resources.
                      </p>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center group-hover:bg-emerald-600 transition-colors shrink-0 ml-4">
                    <svg className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>
                </div>

                {/* Counsellor Portal Card */}
                <div
                  onClick={() => onSelectPortal("counsellor")}
                  className="group p-6 rounded-2xl border border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50/80 transition-all duration-200 cursor-pointer flex items-center justify-between shadow-xs hover:shadow-lg"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      {/* Vector Stethoscope/Officer Outline Icon */}
                      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-bold text-slate-900">Counsellor Portal</h2>
                        <span className="text-xs font-bold text-slate-800 bg-slate-200/90 px-2.5 py-0.5 rounded-md">
                          Officer Dashboard
                        </span>
                      </div>
                      <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
                        Review assigned cases, monitor stress alerts, notes, and direct interventions.
                      </p>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center group-hover:bg-slate-800 transition-colors shrink-0 ml-4">
                    <svg className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>
                </div>

              </div>

              {/* Bottom Information Message */}
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pt-3 border-t border-slate-200/80">
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>No registration required for direct demonstration access.</span>
              </div>

            </div>

          </div>
        </div>
      </GlyphPortal>
    </div>
  );
}