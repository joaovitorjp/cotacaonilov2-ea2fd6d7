import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startI18n } from "./lib/i18n";

// Restaura a rota original quando a hospedagem estática caiu no 404.html.
try {
  const saved = sessionStorage.getItem("spa_redirect_path");
  if (saved) {
    sessionStorage.removeItem("spa_redirect_path");
    if (saved.startsWith("/") && !saved.startsWith("//")) {
      window.history.replaceState(null, "", saved);
    }
  }
} catch {
  /* sessionStorage indisponível */
}

createRoot(document.getElementById("root")!).render(<App />);

// Tradução automática da interface (português padrão, inglês e espanhol).
startI18n();
