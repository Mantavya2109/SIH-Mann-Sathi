import { useState } from "react";
import LoginScreen from "./screens/LoginScreen";
import VictimChat from "./screens/VictimChat";
import CounsellorDashboard from "./screens/CounsellorDashboard";
import DotField from "./components/interactive/DotField";
import { CursorSpotlight } from "./components/interactive/CursorSpotlight";

type Screen = "login" | "victim" | "counsellor";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [user, setUser] = useState<User | null>(null);

  const handleSelectPortal = (role: "victim" | "counsellor") => {
    const activeUser: User =
      role === "victim"
        ? { id: "user_victim_1", name: "Ananya Sharma", email: "ananya@example.com", role: "victim" }
        : { id: "counsellor_1", name: "Dr. Rajesh Kumar", email: "rajesh@mannsathi.org", role: "counsellor" };
    setUser(activeUser);
    setScreen(role);
  };

  const handleLogout = () => {
    setUser(null);
    setScreen("login");
  };

  return (
    <div className="min-h-screen w-full bg-[#E2EFE9] relative overflow-x-hidden">
      {/* 1. Fullscreen Interactive Dot Grid Background */}
      <DotField
        dotRadius={2.5}
        dotSpacing={18}
        cursorRadius={400}
        bulgeStrength={70}
        glowRadius={250}
        waveAmplitude={3}
        gradientFrom="rgba(5, 150, 105, 0.85)" // High-contrast Emerald
        gradientTo="rgba(16, 185, 129, 0.65)"   // Mint Green
        glowColor="rgba(16, 185, 129, 0.4)"
      />

      {/* 2. Cursor Ambient Spotlight */}
      <CursorSpotlight />

      {/* 3. Foreground Page Content */}
      <div className="relative z-10 w-full min-h-screen">
        {screen === "victim" && user && (
          <VictimChat user={user} onLogout={handleLogout} />
        )}

        {screen === "counsellor" && user && (
          <CounsellorDashboard user={user} onLogout={handleLogout} />
        )}

        {screen === "login" && (
          <LoginScreen onSelectPortal={handleSelectPortal} />
        )}
      </div>
    </div>
  );
}