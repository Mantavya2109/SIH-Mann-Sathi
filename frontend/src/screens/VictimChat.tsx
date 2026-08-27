import { useState, useRef, useEffect } from "react";

interface Props {
  onLogout: () => void;
}

type Message = {
  id: number;
  role: "ai" | "user";
  text: string;
};

const navItems = [
  { icon: HomeIcon, label: "Home" },
  { icon: ChatIcon, label: "AI Check-in", active: true },
  { icon: SupportIcon, label: "My Support" },
  { icon: CalendarIcon, label: "Appointments" },
  { icon: FolderIcon, label: "Case Updates" },
  { icon: BookIcon, label: "Resources" },
];

const initialMessages: Message[] = [
  { id: 1, role: "ai", text: "Hi. I'm here to check in with you today. You can take your time." },
  { id: 2, role: "ai", text: "How have you been feeling recently?" },
];

export default function VictimChat({ onLogout }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const initializedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    async function startSession() {
      try {
        const res = await fetch("http://localhost:8000/api/conversation/start", {
          method: "POST"
        });
        if (!res.ok) throw new Error("Failed to start session");
        const data = await res.json();
        setSessionId(data.session_id);
      } catch (err) {
        console.error("Session init failed:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "ai",
            text: "Connection failed. Please ensure the backend server is running and try refreshing the page."
          }
        ]);
      }
    }
    startSession();
  }, []);

  async function sendMessage(text: string) {
    if (loading || isRecording) return;
    
    // Add user message to UI immediately
    const userMsgId = Date.now();
    const userMsg: Message = { id: userMsgId, role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("message", text);
      if (sessionId) {
        formData.append("session_id", sessionId);
      }

      const res = await fetch("http://localhost:8000/api/conversation/respond", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("API call failed");
      }

      const data = await res.json();
      
      const newMessages: Message[] = [];
      if (data.response_text) {
        newMessages.push({
          id: Date.now() + 1,
          role: "ai",
          text: data.response_text,
        });
      }
      if (data.follow_up_question) {
        newMessages.push({
          id: Date.now() + 2,
          role: "ai",
          text: data.follow_up_question,
        });
      }

      setMessages((prev) => [...prev, ...newMessages]);
    } catch (err) {
      console.error("Failed to send text message:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 3,
          role: "ai",
          text: "Sorry, I ran into an issue communicating with the backend. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function sendVoiceMessage(blob: Blob) {
    const tempUserMsgId = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: tempUserMsgId, role: "user", text: "🎤 Voice message (processing...)" },
    ]);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", blob, "voice_checkin.webm");
      if (sessionId) {
        formData.append("session_id", sessionId);
      }

      const res = await fetch("http://localhost:8000/api/conversation/respond", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Voice respond API failed");
      }

      const data = await res.json();

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempUserMsgId
            ? { ...msg, text: data.transcript || "🎤 Voice message complete." }
            : msg
        )
      );

      const newMessages: Message[] = [];
      if (data.response_text) {
        newMessages.push({
          id: Date.now() + 1,
          role: "ai",
          text: data.response_text,
        });
      }
      if (data.follow_up_question) {
        newMessages.push({
          id: Date.now() + 2,
          role: "ai",
          text: data.follow_up_question,
        });
      }

      setMessages((prev) => [...prev, ...newMessages]);
    } catch (err) {
      console.error("Failed to send voice message:", err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempUserMsgId
            ? { ...msg, text: "❌ Voice message failed to process." }
            : msg
        )
      );
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 3,
          role: "ai",
          text: "I couldn't process your voice check-in. Please ensure the backend is available.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    if (loading || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      let mimeType = "";
      if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
        mimeType = "audio/ogg";
      } else if (MediaRecorder.isTypeSupported("audio/wav")) {
        mimeType = "audio/wav";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      }
      
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        await sendVoiceMessage(audioBlob);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied or recorder failed:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "ai",
          text: "Microphone access denied or audio recording is unsupported on this browser.",
        },
      ]);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  async function handleLogout() {
    if (sessionId) {
      try {
        const formData = new FormData();
        formData.append("session_id", sessionId);
        await fetch("http://localhost:8000/api/conversation/end", {
          method: "POST",
          body: formData,
        });
      } catch (err) {
        console.error("Failed to end session cleanly:", err);
      }
    }
    onLogout();
  }

  const stage0Chips = ["I'm doing okay", "I'm worried", "I'm feeling overwhelmed", "I don't want to talk right now"];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f7f8fb" }}>
      {/* SIDEBAR */}
      <div
        className={`${sidebarOpen ? "w-60" : "w-16"} flex-shrink-0 flex flex-col transition-all duration-300`}
        style={{ background: "#1e3a8a", borderRight: "1px solid rgba(255,255,255,0.05)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.12)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.534 4.068 2 6.999 2 9.03 2 10.999 3 12 5c1.001-2 2.87-3 5.001-3 2.93 0 5.999 1.534 5.999 5.191 0 4.105-5.37 8.863-11 14.402z"/>
            </svg>
          </div>
          {sidebarOpen && (
            <span className="text-white font-bold text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Nirbhaya Mitra</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                item.active ? "text-white" : "text-blue-300 hover:text-white"
              }`}
              style={{
                background: item.active ? "rgba(255,255,255,0.12)" : "transparent",
                fontFamily: "Manrope, sans-serif",
              }}
            >
              <item.icon active={!!item.active} />
              {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-2 py-4 space-y-1" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-blue-300 hover:text-white transition-all"
            onClick={handleLogout}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            {sidebarOpen && <span className="text-sm font-medium">Profile</span>}
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-blue-300 hover:text-white transition-all">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            {sidebarOpen && <span className="text-sm font-medium">Privacy & Security</span>}
          </button>
        </div>
      </div>

      {/* MAIN CHAT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-[#64748b] hover:text-[#0f172a] transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: "#f0fdfa" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.534 4.068 2 6.999 2 9.03 2 10.999 3 12 5c1.001-2 2.87-3 5.001-3 2.93 0 5.999 1.534 5.999 5.191 0 4.105-5.37 8.863-11 14.402z"/>
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-[#0f172a] text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Nirbhaya Mitra AI</h2>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-[#64748b]">Private & secure</span>
              </div>
            </div>
          </div>

          {/* Emergency button */}
          <button
            className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
            style={{
              background: "#fef2f2",
              color: "#dc2626",
              border: "1.5px solid #fecaca",
              fontFamily: "Manrope, sans-serif",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            I need help now
          </button>
        </div>

        {/* Privacy banner */}
        <div
          className="px-6 py-2.5 text-xs flex items-center gap-2"
          style={{ background: "#eff6ff", borderBottom: "1px solid #dbeafe", color: "#1e40af" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Your conversations are handled securely and used to help provide appropriate support.
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "ai" && (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mr-3 mt-0.5"
                  style={{ background: "#f0fdfa", border: "1.5px solid #99f6e4" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.534 4.068 2 6.999 2 9.03 2 10.999 3 12 5c1.001-2 2.87-3 5.001-3 2.93 0 5.999 1.534 5.999 5.191 0 4.105-5.37 8.863-11 14.402z"/>
                  </svg>
                </div>
              )}
              <div
                className="max-w-sm px-4 py-3 rounded-2xl text-sm leading-relaxed"
                style={{
                  background: msg.role === "ai" ? "#ffffff" : "#0d9488",
                  color: msg.role === "ai" ? "#1e293b" : "#ffffff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  borderRadius: msg.role === "ai" ? "4px 18px 18px 18px" : "18px 4px 18px 18px",
                }}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Three dots bouncing loading indicator */}
          {loading && (
            <div className="flex justify-start">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mr-3 mt-0.5"
                style={{ background: "#f0fdfa", border: "1.5px solid #99f6e4" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.534 4.068 2 6.999 2 9.03 2 10.999 3 12 5c1.001-2 2.87-3 5.001-3 2.93 0 5.999 1.534 5.999 5.191 0 4.105-5.37 8.863-11 14.402z"/>
                </svg>
              </div>
              <div
                className="max-w-sm px-4 py-3 rounded-2xl text-sm leading-relaxed flex gap-1.5 items-center"
                style={{
                  background: "#ffffff",
                  color: "#94a3b8",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  borderRadius: "4px 18px 18px 18px",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#0d9488] animate-bounce" style={{ animationDelay: "0s" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#0d9488] animate-bounce" style={{ animationDelay: "0.15s" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#0d9488] animate-bounce" style={{ animationDelay: "0.3s" }} />
              </div>
            </div>
          )}

          {/* Quick chips (only visible at the start of conversation) */}
          {messages.length === 2 && !loading && (
            <div className="flex flex-wrap gap-2 pl-11">
              {stage0Chips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => sendMessage(chip)}
                  disabled={loading || isRecording}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    border: "1.5px solid #0d9488",
                    color: "#0d9488",
                    background: "#f0fdfa",
                    fontFamily: "Manrope, sans-serif",
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4" style={{ background: "#ffffff", borderTop: "1px solid #e2e8f0" }}>
          <div
            className="flex items-center gap-3 px-4 rounded-2xl"
            style={{ border: "1.5px solid #e2e8f0", background: "#f8fafc" }}
          >
            <input
              type="text"
              value={input}
              disabled={loading || isRecording}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && input.trim() && sendMessage(input.trim())}
              placeholder={isRecording ? "Listening..." : loading ? "Thinking..." : "Type your message…"}
              className="flex-1 py-3.5 text-sm outline-none bg-transparent text-[#0f172a] placeholder:text-[#94a3b8]"
              style={{ fontFamily: "Inter, sans-serif" }}
            />
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={loading}
              className={`p-1 transition-all active:scale-95 ${
                isRecording ? "text-[#dc2626] animate-pulse" : "text-[#94a3b8] hover:text-[#0d9488]"
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            <button
              onClick={() => input.trim() && sendMessage(input.trim())}
              disabled={loading || isRecording || !input.trim()}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-[0.96] disabled:opacity-50"
              style={{ background: "#0d9488" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Icon components
function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "currentColor"} strokeWidth="1.8" strokeLinecap="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}
function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "currentColor"} strokeWidth="1.8" strokeLinecap="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function SupportIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "currentColor"} strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.534 4.068 2 6.999 2 9.03 2 10.999 3 12 5c1.001-2 2.87-3 5.001-3 2.93 0 5.999 1.534 5.999 5.191 0 4.105-5.37 8.863-11 14.402z"/>
    </svg>
  );
}
function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "currentColor"} strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}
function FolderIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "currentColor"} strokeWidth="1.8" strokeLinecap="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function BookIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "currentColor"} strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  );
}
