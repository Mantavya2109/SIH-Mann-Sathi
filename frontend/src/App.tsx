import { useState } from "react";
import LoginScreen from "./screens/LoginScreen";
import VictimChat from "./screens/VictimChat";
import CounsellorDashboard from "./screens/CounsellorDashboard";

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

  const handleLogin = (authenticatedUser: User) => {
    setUser(authenticatedUser);
    setScreen(authenticatedUser.role === "victim" ? "victim" : "counsellor");
  };

  const handleLogout = () => {
    setUser(null);
    setScreen("login");
  };

  if (screen === "victim" && user) {
    return <VictimChat user={user} onLogout={handleLogout} />;
  }
  if (screen === "counsellor" && user) {
    return <CounsellorDashboard user={user} onLogout={handleLogout} />;
  }
  return <LoginScreen onLogin={handleLogin} />;
}
