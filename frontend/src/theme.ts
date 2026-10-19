import { createTheme } from "@mui/material/styles";

export type Mode = "light" | "dark";

export const makeTheme = (mode: Mode) => {
  const dark = mode === "dark";
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? "#1F7A92" : "#0B4A5C" },
      secondary: { main: "#B25E09" },
      background: dark ? { default: "#0D181D", paper: "#14242B" } : { default: "#F2F5F6", paper: "#FFFFFF" },
      text: dark ? { primary: "#E6EEF1", secondary: "#A9BCC3" } : { primary: "#112A33", secondary: "#42565E" },
      divider: dark ? "#2C4650" : "#D5DEE1",
    },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      h1: { fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.01em" },
      h2: { fontSize: "1.05rem", fontWeight: 700 },
      h3: { fontSize: "0.95rem", fontWeight: 700 },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      // Scrolling still works (wheel, touch, keyboard); only the visible scrollbars are hidden.
      MuiCssBaseline: { styleOverrides: { html: { colorScheme: mode }, "*": { scrollbarWidth: "none" }, "*::-webkit-scrollbar": { display: "none" } } },
      MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: ({ theme }) => ({ border: `1px solid ${theme.palette.divider}`, backgroundImage: "none" }) } },
      MuiButton: { styleOverrides: { textPrimary: dark ? { color: "#8FD0E0" } : {} } },
      MuiButtonBase: { defaultProps: { disableRipple: false } },
    },
  });
};
