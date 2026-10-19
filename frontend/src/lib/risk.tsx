import BlockIcon from "@mui/icons-material/Block";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { SvgIconComponent } from "@mui/icons-material";
import { Stack, Typography, useTheme } from "@mui/material";
import type { Level } from "../types";

export type RiskMeta = { label: string; color: string; darkColor: string; Icon: SvgIconComponent };
// Colors pass 4.5:1 on white for text/icons; level is always conveyed by label + icon, never color alone.
export const RISK: RiskMeta[] = [
  { label: "Low", color: "#1B6E3C", darkColor: "#5FD08A", Icon: CheckCircleOutlineIcon },
  { label: "Moderate", color: "#8A6A00", darkColor: "#F2C94C", Icon: InfoOutlinedIcon },
  { label: "High", color: "#B54708", darkColor: "#FB923C", Icon: WarningAmberIcon },
  { label: "Severe", color: "#B42318", darkColor: "#F87171", Icon: ErrorOutlineIcon },
  { label: "No Travel", color: "#5B2A86", darkColor: "#C9A8F2", Icon: BlockIcon },
];
export const UNKNOWN: RiskMeta = { label: "Unknown", color: "#55636A", darkColor: "#A9BCC3", Icon: HelpOutlineIcon };
/** Text/icon color that stays readable on the current theme. */
export const riskColor = (m: RiskMeta, dark: boolean) => (dark ? m.darkColor : m.color);
export const metaOf = (level: Level | null | -1): RiskMeta => (level === null || level === -1 ? UNKNOWN : RISK[level]);

export function RiskLabel({ level, size = "0.8125rem" }: { level: Level | null | -1; size?: string }) {
  const m = metaOf(level);
  const { label, Icon } = m;
  const color = riskColor(m, useTheme().palette.mode === "dark");
  return (
    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color }}>
      <Icon fontSize="inherit" aria-hidden sx={{ fontSize: size }} />
      <Typography component="span" sx={{ fontSize: size, fontWeight: 600, color: "inherit" }}>{label}</Typography>
    </Stack>
  );
}

/** Documentation of the assessment thresholds for the legend (canonical units). Decisions are made by the backend. */
export const LEGEND_ROWS: { level: Level; wind: string; rain: string; snow: string }[] = [
  { level: 0, wind: "< 25 mph", rain: "< 0.10", snow: "< 0.5" },
  { level: 1, wind: "25 – 34", rain: "0.10 – 0.25", snow: "0.5 – 1.0" },
  { level: 2, wind: "35 – 44", rain: "0.25 – 0.50", snow: "1.0 – 2.0" },
  { level: 3, wind: "45 – 54", rain: "0.50 – 1.00", snow: "2.0 – 3.0" },
  { level: 4, wind: "≥ 55", rain: "> 1.00", snow: "> 3.0" },
];
