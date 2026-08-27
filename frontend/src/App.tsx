import { useState } from "react";
import LoginScreen from "./screens/LoginScreen";
import VictimChat from "./screens/VictimChat";
import CounsellorDashboard from "./screens/CounsellorDashboard";

type Screen = "login" | "victim" | "counsellor";

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");

  if (screen === "victim") return <VictimChat onLogout={() => setScreen("login")} />;
  if (screen === "counsellor") return <CounsellorDashboard onLogout={() => setScreen("login")} />;
  return <LoginScreen onLogin={(role) => setScreen(role === "victim" ? "victim" : "counsellor")} />;
}
