import { CssBaseline, ThemeProvider } from "@mui/material";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { makeTheme, type Mode } from "./theme";

const KEY = "wr-theme";
function initialMode(): Mode {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* storage can be blocked: fall through */ }
  return "light";
}

function Root() {
  const [mode, setMode] = useState<Mode>(initialMode);
  const theme = useMemo(() => makeTheme(mode), [mode]);
  useEffect(() => { try { localStorage.setItem(KEY, mode); } catch { /* ignore */ } }, [mode]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App mode={mode} onToggleMode={() => setMode((m) => (m === "dark" ? "light" : "dark"))} />
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
