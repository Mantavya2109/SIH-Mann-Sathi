import { useCallback, useState } from "react";
import GlobeLanding from "./screens/GlobeLanding";
import VictimChat from "./screens/VictimChat";
import CounsellorDashboard from "./screens/CounsellorDashboard";
import DotField from "./components/interactive/DotField";
import { CursorSpotlight } from "./components/interactive/CursorSpotlight";
import LoadingTransition from "./components/common/LoadingTransition";
import { LAST_PAGE_KEYS, clearLastPage, readLast, writeLast } from "./lib/lastPage";

type Screen = "login" | "victim" | "counsellor";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

// Demo users for the portal switcher (there is no real login yet).
function demoUser(role: "victim" | "counsellor"): User {
  return role === "victim"
    ? { id: "user_victim_1", name: "Rohan", email: "ananya@example.com", role: "victim" }
    : { id: "counsellor_1", name: "Dr. Rajesh Kumar", email: "rajesh@mannsathi.org", role: "counsellor" };
}

// Re-open the portal the user was last in (survives refresh / re-opening the site).
function restoredRole(): "victim" | "counsellor" | null {
  const saved = readLast(LAST_PAGE_KEYS.session);
  return saved === "victim" || saved === "counsellor" ? saved : null;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => restoredRole() ?? "login");
  const [user, setUser] = useState<User | null>(() => {
    const role = restoredRole();
    return role ? demoUser(role) : null;
  });
  // Post-login breathing screen: shown over the destination page while it
  // mounts (and starts loading its data) underneath, then fades away.
  const [transitionRole, setTransitionRole] = useState<"victim" | "counsellor" | null>(null);

  const handleSelectPortal = (role: "victim" | "counsellor") => {
    const activeUser = demoUser(role);
    writeLast(LAST_PAGE_KEYS.session, role);
    setTransitionRole(role);
    setUser(activeUser);
    setScreen(role);
  };

  const handleTransitionDone = useCallback(() => setTransitionRole(null), []);

  const handleLogout = () => {
    clearLastPage();
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
      {/* Mint cursor glow reads as a smudge on the dark landing; show it elsewhere only */}
      {screen !== "login" && !transitionRole && <CursorSpotlight />}

      {/* 3. Foreground Page Content */}
      <div className="relative z-10 w-full min-h-screen">
        {screen === "victim" && user && (
          <VictimChat user={user} onLogout={handleLogout} />
        )}

        {screen === "counsellor" && user && (
          <CounsellorDashboard user={user} onLogout={handleLogout} />
        )}

        {screen === "login" && (
          <GlobeLanding onSelectPortal={handleSelectPortal} />
        )}
      </div>

      {/* 4. Post-login breathing transition (~2s, then fades into the page) */}
      {transitionRole && (
        <LoadingTransition role={transitionRole} durationMs={2000} onDone={handleTransitionDone} />
      )}
    </div>
  );
}
