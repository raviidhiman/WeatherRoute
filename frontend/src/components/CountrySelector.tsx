import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControl, InputLabel, MenuItem, Select, Typography } from "@mui/material";
import { useState } from "react";
import { COMING_SOON_MESSAGE, COUNTRIES } from "../lib/countries";

/** The active country is always the United States. Choosing another country only opens the Coming Soon dialog. */
export default function CountrySelector() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <FormControl size="small" sx={{ minWidth: 190 }}>
        <InputLabel id="country-label" sx={{ color: "#CFE3E8", "&.Mui-focused": { color: "#fff" } }}>Country</InputLabel>
        <Select
          labelId="country-label" label="Country" value="US"
          onChange={(e) => { if (COUNTRIES.find((c) => c.code === e.target.value)?.enabled === false) setOpen(true); }}
          sx={{ color: "#fff", ".MuiOutlinedInput-notchedOutline": { borderColor: "#5E8A96" }, ".MuiSvgIcon-root": { color: "#fff" } }}
        >
          {COUNTRIES.map((c) => (
            <MenuItem key={c.code} value={c.code}>
              {c.name}
              {!c.enabled && <Typography component="span" variant="caption" sx={{ ml: 1, color: "text.secondary" }}>Coming soon</Typography>}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Dialog open={open} onClose={() => setOpen(false)} aria-labelledby="cs-title" aria-describedby="cs-body">
        <DialogTitle id="cs-title">Coming soon</DialogTitle>
        <DialogContent><DialogContentText id="cs-body">{COMING_SOON_MESSAGE}</DialogContentText></DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)} autoFocus variant="contained">Back to the United States</Button></DialogActions>
      </Dialog>
    </>
  );
}
