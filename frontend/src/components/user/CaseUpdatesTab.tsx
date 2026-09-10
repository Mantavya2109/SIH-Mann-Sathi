import { useState, useEffect, useRef } from "react";

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments();
  }, [user.id]);

  async function loadDocuments() {
    try {
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
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

      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
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
    const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
    window.open(`${baseUrl}/api/user/${user.id}/documents/${doc.id}/download`, "_blank");
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto" style={{ background: "#f7f8fb" }}>
      <div className="p-6 md:p-10 max-w-4xl mx-auto w-full space-y-6">
        {/* TOP SECTION: IMMEDIATE UPLOAD & HEADER */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
              Case Documents
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              Upload case records or supporting documents (PDF, DOC, DOCX up to 15MB).
            </p>
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
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
              Uploaded Records ({documents.length})
            </h2>
            <span className="text-xs text-slate-400">Available to your care team</span>
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
