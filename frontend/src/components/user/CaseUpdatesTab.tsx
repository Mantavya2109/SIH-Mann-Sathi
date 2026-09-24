import { useState, useEffect, useRef } from "react";
import { getApiBaseUrl } from "../../utils/api";

interface CaseDocument {
  id: string;
  file_name: string;
  file_size: string;
  file_type: string;
  uploaded_at: string;
  uploaded_at_formatted: string;
  description: string;
  category: string;
  is_seeded: boolean;
}

interface Milestone {
  id: string;
  title: string;
  date: string;
  description: string;
  status: string;
  badge: string;
}

interface CaseUpdates {
  case_ref: string;
  stage_label: string;
  last_review_date: string;
  support_team_notes: string[];
  milestones: Milestone[];
}

interface Props {
  user: { id: string; name: string; email: string; role: string };
  onNavigate: (tab: string) => void;
}

export default function CaseUpdatesTab({ user }: Props) {
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const [updates, setUpdates] = useState<CaseUpdates | null>(null);
  const [updatesState, setUpdatesState] = useState<"loading" | "ready" | "error">("loading");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments();
    loadCaseUpdates();
  }, [user.id]);

  // Case summary, timeline and care-team notes (GET /api/user/{id}/case-updates).
  async function loadCaseUpdates() {
    try {
      setUpdatesState("loading");
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/user/${user.id}/case-updates`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUpdates({
        ...data,
        milestones: Array.isArray(data?.milestones) ? data.milestones : [],
        support_team_notes: Array.isArray(data?.support_team_notes) ? data.support_team_notes : [],
      });
      setUpdatesState("ready");
    } catch (err) {
      console.error("Failed to load case updates:", err);
      setUpdatesState("error");
    }
  }

  async function loadDocuments() {
    try {
      setLoading(true);
      const baseUrl = getApiBaseUrl();
      const resDocs = await fetch(`${baseUrl}/api/user/${user.id}/documents`);
      if (resDocs.ok) {
        const docs = await resDocs.json();
        setDocuments(docs);
      }
    } catch (err) {
      console.error("Failed to load documents:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const allowedExtensions = [".pdf", ".doc", ".docx"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

    if (!allowedExtensions.includes(ext)) {
      setUploadError(`Unsupported format '${ext}'. Only PDF, DOC, and DOCX files are permitted.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setUploadError("File exceeds the maximum allowable size of 15 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/user/${user.id}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to upload document");
      }

      setUploadSuccess(`"${file.name}" uploaded successfully.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadDocuments();
      setTimeout(() => setUploadSuccess(null), 5000);
    } catch (err: any) {
      console.error("Upload failed:", err);
      setUploadError(err.message || "Failed to upload document. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleDownload(doc: CaseDocument) {
    const baseUrl = getApiBaseUrl();
    window.open(`${baseUrl}/api/user/${user.id}/documents/${doc.id}/download`, "_blank");
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-y-auto">
      <div className="p-4 sm:p-6 md:p-10 max-w-4xl mx-auto w-full space-y-6">
        {/* CASE SUMMARY */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-teal-700">Your case</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
                Case Updates
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                Where things stand, what's happened so far, and notes from your care team.
              </p>
            </div>
            {updates?.case_ref && (
              <span className="self-start px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs font-bold text-slate-700">
                {updates.case_ref}
              </span>
            )}
          </div>

          {updatesState === "loading" ? (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="h-[68px] rounded-xl bg-slate-100 animate-pulse" />
              <div className="h-[68px] rounded-xl bg-slate-100 animate-pulse" />
            </div>
          ) : updates ? (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-50/70 border border-emerald-100 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Current stage</p>
                <p className="mt-1 text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {updates.stage_label}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Last reviewed by your team</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{updates.last_review_date}</p>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-500">
              <span>We couldn't load your case updates right now.</span>
              <button onClick={loadCaseUpdates} className="font-bold text-teal-700 hover:text-teal-900">Try again</button>
            </div>
          )}
        </div>

        {/* TIMELINE + CARE TEAM NOTES */}
        {updates && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="md:col-span-3 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <h2 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                Case timeline
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Most recent first</p>
              <ol className="mt-5 relative">
                {updates.milestones.map((m, i) => (
                  <li key={m.id} className="relative pl-8 pb-6 last:pb-0">
                    {i < updates.milestones.length - 1 && (
                      <span className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-200" aria-hidden />
                    )}
                    <span
                      className={`absolute left-0 top-0.5 w-6 h-6 rounded-full flex items-center justify-center ${
                        m.status === "completed" ? "bg-emerald-500 text-white" : "bg-white border-2 border-teal-400 text-teal-600"
                      }`}
                      aria-hidden
                    >
                      {m.status === "completed" ? (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-teal-500" />
                      )}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">{m.title}</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                        {m.badge}
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{m.date}</p>
                    <p className="text-[13px] text-slate-600 leading-relaxed mt-1">{m.description}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="md:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <h2 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                From your care team
              </h2>
              <ul className="mt-4 space-y-3">
                {updates.support_team_notes.map((note) => (
                  <li key={note} className="flex gap-3 rounded-xl bg-teal-50/60 border border-teal-100 p-3.5">
                    <svg className="w-4 h-4 mt-0.5 shrink-0 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    <span className="text-[13px] text-slate-700 leading-relaxed">{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* FEEDBACK ALERTS */}
        {uploadError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center justify-between animate-in fade-in duration-150">
            <span>{uploadError}</span>
            <button onClick={() => setUploadError(null)} className="text-rose-600 hover:text-rose-900 font-bold">✕</button>
          </div>
        )}

        {uploadSuccess && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between animate-in fade-in duration-150">
            <span>{uploadSuccess}</span>
            <button onClick={() => setUploadSuccess(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">✕</button>
          </div>
        )}

        {/* DOCUMENT LIST */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                Case documents ({documents.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">PDF, DOC or DOCX up to 15 MB · available to your care team</p>
            </div>
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelected}
              accept=".pdf,.doc,.docx"
              className="hidden"
              id="user-doc-upload"
            />
            <label
              htmlFor="user-doc-upload"
              className={`px-5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-2 shadow-xs ${
                uploading
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-[#0d9488] text-white hover:bg-[#0f766e] active:scale-[0.98]"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>{uploading ? "Uploading..." : "+ Upload Document"}</span>
            </label>
          </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm animate-pulse">
              Loading documents...
            </div>
          ) : documents.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 rounded-xl px-2 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-black text-[11px] flex items-center justify-center flex-shrink-0">
                      {doc.file_type}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">{doc.file_name}</h3>
                      <p className="text-xs text-slate-500">
                        {doc.file_size} • {doc.uploaded_at_formatted}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all flex items-center gap-1.5"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
              No documents uploaded yet. Use the button above to upload files.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
