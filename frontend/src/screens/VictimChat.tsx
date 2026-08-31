import { useState, useRef, useEffect } from "react";

interface Props {
  user: { id: string; name: string; email: string; role: string };
  onLogout: () => void;
}

type Message = {
  id: number;
  role: "ai" | "user";
  text: string;
};

const navItems = [
  { icon: HomeIcon, label: "Home" },
  { icon: ChatIcon, label: "AI Check-in" },
  { icon: PulseIcon, label: "Biosignal Device" },
  { icon: SupportIcon, label: "My Support" },
  { icon: CalendarIcon, label: "Appointments" },
  { icon: FolderIcon, label: "Case Updates" },
  { icon: BookIcon, label: "Resources" },
];

const initialMessages: Message[] = [
  { id: 1, role: "ai", text: "Hi. I'm here to check in with you today. You can take your time." },
  { id: 2, role: "ai", text: "How have you been feeling recently?" },
];

export default function VictimChat({ user, onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<string>("AI Check-in");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Biosignal Prototype State
  const [deviceConnected, setDeviceConnected] = useState(true);
  const [bioData, setBioData] = useState<any>(null);
  const [bioLoading, setBioLoading] = useState(false);
  const [lastSyncText, setLastSyncText] = useState("Just now");
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const initializedRef = useRef(false);

  useEffect(() => {
    async function loadUserBiosignals() {
      try {
        setBioLoading(true);
        const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
        const res = await fetch(`${baseUrl}/api/biosignals/user/${user.id}`);
        if (res.ok) {
          const data = await res.json();
          setBioData(data);
        }
      } catch (err) {
        console.error("Failed to load biosignals:", err);
      } finally {
        setBioLoading(false);
      }
    }
    loadUserBiosignals();
  }, [user.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
          body: formData
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
            <span className="text-white font-bold text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Mann Sathi</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.label;
            return (
              <button
                key={item.label}
                onClick={() => setActiveTab(item.label)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                  isActive ? "text-white" : "text-blue-300 hover:text-white"
                }`}
                style={{
                  background: isActive ? "rgba(255,255,255,0.12)" : "transparent",
                  fontFamily: "Manrope, sans-serif",
                }}
              >
                <item.icon active={isActive} />
                {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
              </button>
            );
          })}
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

      {/* MAIN VIEW */}
      {activeTab === "Biosignal Device" ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto" style={{ background: "#f7f8fb" }}>
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
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-[#0f172a] text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Biosignal Device Hub</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-700 border border-purple-200">
                    Prototype / Demo Device
                  </span>
                </div>
                <p className="text-xs text-[#64748b]">Real-time physiological telemetry preview (Demonstration Mode)</p>
              </div>
            </div>

            <button
              onClick={() => setActiveTab("AI Check-in")}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#0d9488] bg-[#f0fdfa] border border-[#99f6e4] hover:bg-teal-100 transition-all"
            >
              ← Back to AI Check-in
            </button>
          </div>

          <div className="p-6 space-y-6 max-w-5xl">
            {/* Device Connection Card */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${deviceConnected ? "bg-teal-50 text-teal-600" : "bg-slate-100 text-slate-400"}`}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-base">Sahaaya Biosignal Prototype</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${deviceConnected ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${deviceConnected ? "bg-green-600 animate-pulse" : "bg-slate-400"}`} />
                        {deviceConnected ? "Connected" : "Not Connected"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">Connection: <span className="font-semibold text-slate-700">Demo / Simulated</span> • Last Sync: <span className="font-semibold text-slate-700">{lastSyncText}</span></p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setDeviceConnected(!deviceConnected);
                      setLastSyncText("Just now");
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      deviceConnected
                        ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        : "bg-teal-600 text-white hover:bg-teal-700 shadow-sm"
                    }`}
                  >
                    {deviceConnected ? "Disconnect Device" : "Simulate Device Connection"}
                  </button>
                  {deviceConnected && (
                    <button
                      onClick={() => setLastSyncText("Just now")}
                      className="px-3 py-2 rounded-xl text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-all"
                    >
                      Sync Now
                    </button>
                  )}
                </div>
              </div>

              {/* Demo Notice */}
              <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl flex items-center gap-2.5 text-xs text-blue-800">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <span><strong>Simulated Prototype Data:</strong> This interface demonstrates future integration with wearable biosensors for holistic well-being monitoring. No physical hardware is currently attached.</span>
              </div>
            </div>

            {/* Biosignal Variables Grid */}
            {deviceConnected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-sm">Monitored Biosignal Channels</h4>
                  <span className="text-[10px] uppercase font-bold text-slate-400">All Metrics Labeled: Demo Data</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Sleep Duration & Quality */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-semibold text-slate-500">Sleep Duration & Quality</div>
                        <div className="text-2xl font-black text-slate-800 mt-1">
                          {bioData?.sleep?.duration_formatted || "6h 42m"}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-50 border border-purple-100 text-purple-700">
                        {bioData?.sleep?.quality || "Moderate"}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex justify-between text-xs text-slate-600">
                      <span>Consistency: <strong>{bioData?.sleep?.consistency || 72}%</strong></span>
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        DEMO DATA
                      </span>
                    </div>
                  </div>

                  {/* Heart Rate */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-semibold text-slate-500">Heart Rate (PPG)</div>
                        <div className="text-2xl font-black text-slate-800 mt-1">
                          {bioData?.heart_rate?.resting_bpm || 74} <span className="text-xs font-normal text-slate-500">BPM</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-green-50 border border-green-100 text-green-700">
                        {bioData?.heart_rate?.status || "Normal"}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex justify-between text-xs text-slate-600">
                      <span>Range: <strong>{bioData?.heart_rate?.range_formatted || "62–101 BPM"}</strong></span>
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        SIMULATED
                      </span>
                    </div>
                  </div>

                  {/* Skin Conductance */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-semibold text-slate-500">Skin Conductance (GSR)</div>
                        <div className="text-2xl font-black text-slate-800 mt-1">
                          {bioData?.skin_conductance?.average_us || 2.8} <span className="text-xs font-normal text-slate-500">µS</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-orange-50 border border-orange-100 text-orange-700">
                        {bioData?.skin_conductance?.status || "Elevated"}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex justify-between text-xs text-slate-600">
                      <span>Stress Events: <strong>{bioData?.skin_conductance?.stress_events || 4} markers</strong></span>
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        SIMULATED
                      </span>
                    </div>
                  </div>

                  {/* Blood Oxygen (SpO2) */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-semibold text-slate-500">Blood Oxygen (SpO2)</div>
                        <div className="text-2xl font-black text-slate-800 mt-1">
                          {bioData?.blood_oxygen?.average_spo2 || 98}%
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-teal-50 border border-teal-100 text-teal-700">
                        {bioData?.blood_oxygen?.status || "Normal"}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex justify-between text-xs text-slate-600">
                      <span>Min recorded: <strong>{bioData?.blood_oxygen?.min_spo2 || 96}%</strong></span>
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        DEMO DATA
                      </span>
                    </div>
                  </div>

                  {/* Respiratory Rate */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-semibold text-slate-500">Respiratory Rate</div>
                        <div className="text-2xl font-black text-slate-800 mt-1">
                          {bioData?.respiratory_rate?.average_bpm || 15} <span className="text-xs font-normal text-slate-500">/ min</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-green-50 border border-green-100 text-green-700">
                        {bioData?.respiratory_rate?.status || "Normal"}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex justify-between text-xs text-slate-600">
                      <span>Rhythm: <strong>Regular</strong></span>
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        SIMULATED
                      </span>
                    </div>
                  </div>

                  {/* Body Temperature */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-semibold text-slate-500">Skin Temperature</div>
                        <div className="text-2xl font-black text-slate-800 mt-1">
                          36.6 <span className="text-xs font-normal text-slate-500">°C</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-green-50 border border-green-100 text-green-700">
                        Normal
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex justify-between text-xs text-slate-600">
                      <span>Circadian baseline: <strong>Stable</strong></span>
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        DEMO DATA
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                </div>
                <h4 className="font-bold text-slate-700 text-sm">Device Disconnected</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">Click "Simulate Device Connection" above to activate the prototype biosignal feed.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* MAIN CHAT */
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
                <h2 className="font-bold text-[#0f172a] text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Mann Sathi AI</h2>
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
                    background: msg.role === "user" ? "#1e3a8a" : "#ffffff",
                    color: msg.role === "user" ? "#ffffff" : "#0f172a",
                    border: msg.role === "user" ? "none" : "1px solid #e2e8f0",
                    borderTopRightRadius: msg.role === "user" ? 4 : 16,
                    borderTopLeftRadius: msg.role === "user" ? 16 : 4,
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ))}

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
                  className="px-4 py-3 rounded-2xl text-sm"
                  style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderTopLeftRadius: 4 }}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#0d9488] animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 rounded-full bg-[#0d9488] animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 rounded-full bg-[#0d9488] animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick reply chips */}
          <div className="px-6 py-2 flex items-center gap-2 overflow-x-auto" style={{ background: "#ffffff", borderTop: "1px solid #f1f5f9" }}>
            {stage0Chips.map((chip) => (
              <button
                key={chip}
                onClick={() => sendMessage(chip)}
                disabled={loading || isRecording}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all flex-shrink-0 hover:bg-[#f0fdfa] hover:text-[#0d9488] disabled:opacity-50"
                style={{
                  background: "#f8fafc",
                  color: "#475569",
                  border: "1px solid #e2e8f0",
                  fontFamily: "Manrope, sans-serif",
                }}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div
            className="px-6 py-4"
            style={{ background: "#ffffff", borderTop: "1px solid #e2e8f0" }}
          >
            <div
              className="flex items-center gap-3 px-4 py-1.5 rounded-2xl transition-all"
              style={{
                background: "#f8fafc",
                border: "1.5px solid #e2e8f0",
              }}
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
      )}
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

function PulseIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "currentColor"} strokeWidth="1.8" strokeLinecap="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
  );
}
