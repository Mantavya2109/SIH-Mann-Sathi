import { useState, useEffect } from "react";

interface Counsellor {
  id: string;
  name: string;
  title: string;
  role: string;
  specialization: string;
  availability: string;
  phone: string;
  email: string;
  location: string;
  experience: string;
  languages: string[];
  bio: string;
  photo_placeholder: string;
}

interface Props {
  user: { id: string; name: string; email: string; role: string };
  onNavigate: (tab: string) => void;
}

export default function MySupportTab({ user, onNavigate }: Props) {
  const [counsellors, setCounsellors] = useState<Counsellor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCounsellor, setSelectedCounsellor] = useState<Counsellor | null>(null);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadCounsellors() {
      try {
        setLoading(true);
        const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
        const res = await fetch(`${baseUrl}/api/user/counsellors`);
        if (res.ok) {
          const data = await res.json();
          setCounsellors(data);
        }
      } catch (err) {
        console.error("Failed to load counsellors:", err);
      } finally {
        setLoading(false);
      }
    }
    loadCounsellors();
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto" style={{ background: "#f7f8fb" }}>
      <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Dedicated Care Team
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
                My Support & Counsellors
              </h1>
              <p className="text-slate-600 text-sm mt-1">
                Verified mental health professionals assigned to your care and wellbeing support.
              </p>
            </div>

            <button
              onClick={() => onNavigate("Appointments")}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#0d9488] bg-[#f0fdfa] border border-[#99f6e4] hover:bg-teal-100 transition-all flex items-center gap-2 self-start md:self-center"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              </svg>
              View Scheduled Sessions
            </button>
          </div>
        </div>

        {/* Confidentiality Notice */}
        <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
          <div className="text-blue-700 mt-0.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div className="text-xs text-blue-900 leading-relaxed">
            <strong>Confidential & Protected Care:</strong> All interactions with your assigned counselling team follow strict ethical, medical confidentiality protocols and institutional safeguard guidelines.
          </div>
        </div>

        {/* Counsellor Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {loading ? (
            <div className="col-span-2 py-12 text-center text-slate-400 text-sm animate-pulse">
              Loading support team profiles...
            </div>
          ) : counsellors.length > 0 ? (
            counsellors.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between space-y-5 hover:border-slate-300 transition-all"
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 font-black text-base flex items-center justify-center border border-teal-100 flex-shrink-0">
                        {c.name.split(" ")[1]?.charAt(0) || "D"}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                          {c.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">{c.title}</p>
                      </div>
                    </div>

                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {c.availability}
                    </span>
                  </div>

                  {/* Bio & Details */}
                  <p className="text-xs text-slate-600 mt-4 leading-relaxed line-clamp-3">
                    {c.bio}
                  </p>

                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Specialization</span>
                      <strong className="text-slate-800 text-right">{c.specialization}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Experience</span>
                      <strong className="text-slate-800">{c.experience}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Languages</span>
                      <strong className="text-slate-800">{c.languages.join(", ")}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Phone</span>
                      <strong className="text-slate-800">{c.phone}</strong>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <button
                    onClick={() => setSelectedCounsellor(c)}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-all text-center"
                  >
                    View Profile
                  </button>
                  <button
                    onClick={() => {
                      setContactSuccess(`Direct outreach request sent to ${c.name}. You will be contacted during duty hours.`);
                      setTimeout(() => setContactSuccess(null), 5000);
                    }}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-[#0d9488] hover:bg-[#0f766e] transition-all text-center shadow-xs"
                  >
                    Contact Counsellor
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-2 py-12 text-center text-slate-500 text-sm">
              No counsellors found.
            </div>
          )}
        </div>

        {/* Contact Notification Alert */}
        {contactSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{contactSuccess}</span>
            </div>
            <button onClick={() => setContactSuccess(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">✕</button>
          </div>
        )}
      </div>

      {/* Counsellor Profile Modal */}
      {selectedCounsellor && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 font-black text-lg flex items-center justify-center border border-teal-100">
                  {selectedCounsellor.name.split(" ")[1]?.charAt(0) || "D"}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {selectedCounsellor.name}
                  </h3>
                  <p className="text-xs text-slate-500">{selectedCounsellor.title}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedCounsellor(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition-all"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 leading-relaxed">
                <strong>Professional Background:</strong>
                <p className="mt-1 text-slate-600">{selectedCounsellor.bio}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Specialization</span>
                  <strong className="text-slate-800">{selectedCounsellor.specialization}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Experience</span>
                  <strong className="text-slate-800">{selectedCounsellor.experience}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Languages</span>
                  <strong className="text-slate-800">{selectedCounsellor.languages.join(", ")}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Availability</span>
                  <strong className="text-emerald-700">{selectedCounsellor.availability}</strong>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-slate-400 block text-[11px]">Direct Official Helpline / Office</span>
                <p className="text-slate-800 font-semibold">{selectedCounsellor.phone}</p>
                <p className="text-slate-600">{selectedCounsellor.email}</p>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={() => setSelectedCounsellor(null)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedCounsellor(null);
                  setContactSuccess(`Outreach notification initiated with ${selectedCounsellor.name}.`);
                  setTimeout(() => setContactSuccess(null), 5000);
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#0d9488] hover:bg-[#0f766e] transition-all"
              >
                Request Consultation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
