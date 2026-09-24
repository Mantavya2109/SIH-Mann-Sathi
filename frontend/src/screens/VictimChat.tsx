import { useState, useRef, useEffect } from "react";
import HomeTab from "../components/user/HomeTab";
import AppointmentsTab from "../components/user/AppointmentsTab";
import CaseUpdatesTab from "../components/user/CaseUpdatesTab";
import DeviceTab from "../components/user/DeviceTab";
import Aurora from "../components/interactive/Aurora";
import VoiceRecorderModal from "../components/user/VoiceRecorderModal";
import { LAST_PAGE_KEYS, useRememberedState } from "../lib/lastPage";
import "./victim-theme.css";
import BrandLogo from "../components/common/BrandLogo";
import { GlassSidebar } from "../components/interactive/GlassSidebar";

interface Props {
  user: { id: string; name: string; email: string; role: string };
  onLogout: () => void;
}

type Message = {
  id: number;
  role: "ai" | "user";
  text: string;
};

// Sidebar item id → screen shown. Insights opens the wellness overview screen (HomeTab).
const SIDEBAR_TO_SCREEN: Record<string, string> = {
  chat: "Chat",
  appointments: "Appointments",
  insights: "Home",
  caseupdates: "Case Updates",
  device: "Biosignal Device",
};

// Screen → sidebar item to highlight when a screen is opened from inside another screen.
const SCREEN_TO_SIDEBAR: Record<string, string> = {
  Chat: "chat",
  Home: "insights",
  Appointments: "appointments",
  "Case Updates": "caseupdates",
  "Biosignal Device": "device",
};

const initialMessages: Message[] = [
  { id: 1, role: "ai", text: "Hi. I'm here to check in with you today. You can take your time." },
  { id: 2, role: "ai", text: "How have you been feeling recently?" },
];

export default function VictimChat({ user, onLogout }: Props) {
  // Which sidebar item is open — remembered, so a refresh returns to the same page.
  // First visit is chat-first (Chat Companion).
  const [navId, setNavId] = useRememberedState(LAST_PAGE_KEYS.victimTab, "chat", Object.keys(SIDEBAR_TO_SCREEN));
  const [activeTab, setActiveTab] = useState<string>(() => SIDEBAR_TO_SCREEN[navId] || "Chat");

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Voice pop-up: the live mic stream (for the orb) and a "discard" flag for Cancel.
  const [recStream, setRecStream] = useState<MediaStream | null>(null);
  const discardRecordingRef = useRef(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (activeTab === "Chat") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, activeTab]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    async function startSession() {
      try {
        const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
        const formData = new FormData();
        formData.append("user_id", user.id);

        const res = await fetch(`${baseUrl}/api/conversation/start`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error("Failed to start session");
        const data = await res.json();
        setSessionId(data.session_id);
      } catch (err) {
        console.error("Session init failed:", err);
      }
    }
    startSession();
  }, [user.id]);

  async function sendMessage(text: string) {
    if (loading || isRecording) return;

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

      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${baseUrl}/api/conversation/respond`, {
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

      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${baseUrl}/api/conversation/respond`, {
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
        setRecStream(null);
        // Cancelled from the pop-up: drop the recording, send nothing.
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          audioChunksRef.current = [];
          return;
        }
        await sendVoiceMessage(audioBlob);
      };

      discardRecordingRef.current = false;
      mediaRecorder.start();
      setRecStream(stream);
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

  // Cancel from the voice pop-up: stop the mic without sending anything.
  function cancelRecording() {
    discardRecordingRef.current = true;
    stopRecording();
  }

  async function handleLogout() {
    if (sessionId) {
      try {
        const formData = new FormData();
        formData.append("session_id", sessionId);
        const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
        await fetch(`${baseUrl}/api/conversation/end`, {
          method: "POST",
          body: formData,
        });
      } catch (err) {
        console.error("Failed to end session cleanly:", err);
      }
    }
    onLogout();
  }

  // In-screen links ("View appointments", etc.) also move the sidebar highlight.
  function goToScreen(screen: string) {
    const target = SCREEN_TO_SIDEBAR[screen] ? screen : "Chat";
    setActiveTab(target);
    setNavId(SCREEN_TO_SIDEBAR[target]);
  }

  const stage0Chips = ["I'm doing okay", "I'm worried", "I'm feeling overwhelmed", "I don't want to talk right now"];

  return (
    <div className="ms-vic flex flex-col lg:flex-row h-screen overflow-hidden">
      {/* Voice check-in pop-up (only while recording) */}
      {isRecording && <VoiceRecorderModal stream={recStream} onSend={stopRecording} onCancel={cancelRecording} />}

      {/* FLOATING GLASS SIDEBAR */}
      <GlassSidebar
        activeTab={navId}
        onTabChange={(id) => {
          setNavId(id);
          setActiveTab(SIDEBAR_TO_SCREEN[id] || "Chat");
        }}
        user={user}
        onLogout={handleLogout}
      />

      {/* RENDER VIEWS */}
      {activeTab === "Home" ? (
        // Wellness overview — opened from Insights
        <HomeTab
          user={user}
          onNavigate={goToScreen}
          // Resources (which hosted the exercise player) was removed — send people to Chat
          onStartExercise={() => goToScreen("Chat")}
        />
      ) : activeTab === "Appointments" ? (
        <AppointmentsTab
          user={user}
          onNavigate={goToScreen}
        />
      ) : activeTab === "Case Updates" ? (
        <CaseUpdatesTab
          user={user}
          onNavigate={goToScreen}
        />
      ) : activeTab === "Biosignal Device" ? (
        <DeviceTab onNavigate={goToScreen} />
      ) : (
        /* MAIN CHAT VIEW — check-ins run through /api/conversation/respond */
        <div className="relative flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden">
          {/* Soft aurora glow behind the conversation */}
          <div aria-hidden className="absolute inset-0 pointer-events-none">
            <Aurora
              className="!absolute inset-x-0 top-0 !h-[75%] opacity-60"
              colorStops={["#10b981", "#5eead4", "#059669"]}
              blend={0.6}
              amplitude={0.9}
              speed={0.8}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#05070d]/30 to-[#05070d]" />
          </div>

          {/* Header */}
          <header className="relative z-10 shrink-0 flex items-center justify-between gap-3 px-4 sm:px-8 py-4 border-b border-white/[0.06] bg-[#05070d]/40 backdrop-blur-md">
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative shrink-0">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#34d399]/25 to-[#0d9488]/25 border border-emerald-300/25 text-[#6ee7b7]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20s-7-4.4-9.3-8.8A5 5 0 0112 5.6a5 5 0 019.3 5.6C19 15.6 12 20 12 20z" />
                  </svg>
                </span>
                <span className="absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full bg-[#34d399] border-[3px] border-[#070a11]" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] font-bold text-white tracking-[-0.01em] truncate">Mann Saathi Companion</h2>
                <p className="text-[12px] text-[#9aa5b5] truncate">Here to listen, whenever you're ready</p>
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-white/10 bg-white/[0.04] text-[12px] font-medium text-[#c9d2de]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" />
              </svg>
              End-to-end encrypted
            </span>
          </header>

          {/* Messages */}
          <div className="relative z-10 flex-1 min-h-0 overflow-y-auto scrollbar-none">
            <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-6 pb-4">
              <div className="flex justify-center mb-6">
                <span className="px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.07] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9aa5b5]">
                  Today
                </span>
              </div>

              <div className="space-y-2.5">
                {messages.map((msg, i) => {
                  const isUser = msg.role === "user";
                  const firstOfGroup = i === 0 || messages[i - 1].role !== msg.role;
                  return (
                    <div
                      key={msg.id}
                      className={`vic-msg flex items-end gap-2.5 ${isUser ? "justify-end" : "justify-start"} ${firstOfGroup && i > 0 ? "pt-3" : ""}`}
                    >
                      {!isUser && (
                        <span className={`shrink-0 w-8 h-8 ${firstOfGroup ? "" : "invisible"}`}>
                          <span className="vic-avatar w-8 h-8 rounded-full flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20s-7-4.4-9.3-8.8A5 5 0 0112 5.6a5 5 0 019.3 5.6C19 15.6 12 20 12 20z" />
                            </svg>
                          </span>
                        </span>
                      )}
                      <div
                        className={`${isUser ? "vic-bubble-user rounded-[20px] rounded-br-md" : "vic-bubble-ai rounded-[20px] rounded-bl-md"} max-w-[82%] sm:max-w-[70%] px-4 py-2.5 text-[14.5px] leading-relaxed break-words`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  );
                })}

                {loading && (
                  <div className="vic-msg flex items-end gap-2.5 pt-3">
                    <span className="vic-avatar shrink-0 w-8 h-8 rounded-full flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20s-7-4.4-9.3-8.8A5 5 0 0112 5.6a5 5 0 019.3 5.6C19 15.6 12 20 12 20z" />
                      </svg>
                    </span>
                    <div className="vic-bubble-ai rounded-[20px] rounded-bl-md px-4 py-3.5" aria-label="Companion is typing">
                      <div className="flex items-center gap-1.5">
                        <span className="vic-dot" />
                        <span className="vic-dot" style={{ animationDelay: "160ms" }} />
                        <span className="vic-dot" style={{ animationDelay: "320ms" }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Composer */}
          <div
            className="relative z-10 shrink-0 px-4 sm:px-8 pt-2"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <div className="max-w-3xl mx-auto">
              {/* Quick replies */}
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-3">
                {stage0Chips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => sendMessage(chip)}
                    disabled={loading || isRecording}
                    className="vic-chip shrink-0 h-8 px-3.5 rounded-full text-[12.5px] font-medium transition-colors disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <div className="vic-input flex items-center gap-2 pl-5 pr-2 py-2 rounded-[22px]">
                <input
                  type="text"
                  value={input}
                  disabled={loading || isRecording}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && input.trim() && sendMessage(input.trim())}
                  placeholder={isRecording ? "Listening… tap the mic to stop" : loading ? "Thinking…" : "Share what's on your mind…"}
                  aria-label="Message"
                  className="flex-1 min-w-0 py-2.5 text-[15px] outline-none bg-transparent text-[#eef2f7] placeholder:text-[#737e90]"
                />
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={loading}
                  aria-label={isRecording ? "Stop recording" : "Record a voice message"}
                  className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
                    isRecording ? "bg-red-500/15 text-[#f87171] animate-pulse" : "text-[#9aa5b5] hover:text-[#6ee7b7] hover:bg-white/[0.06]"
                  }`}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8" />
                  </svg>
                </button>
                <button
                  onClick={() => input.trim() && sendMessage(input.trim())}
                  disabled={loading || isRecording || !input.trim()}
                  aria-label="Send message"
                  className="vic-send shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              </div>

              <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[11.5px] text-[#737e90] text-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Private &amp; secure — used only to support your care.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
