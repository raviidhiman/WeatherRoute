import { zodResolver } from "@hookform/resolvers/zod";
import SearchIcon from "@mui/icons-material/Search";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import { Button, CircularProgress, FormControlLabel, IconButton, InputAdornment, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useEffect, useMemo, useRef } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import type { ApiError } from "../api";
import { INTERVALS, makeSchema, US_ZONES, type FormValues } from "../lib/validation";
import { convertWeightInput, fromCanonical, UNIT_LABEL, type UnitPrefs } from "../lib/units";
import type { PinTarget } from "../lib/pin";
import type { AnalyzeRequest, Location } from "../types";
import LocationField from "./LocationField";

const pad = (n: number) => String(n).padStart(2, "0");
function defaultDeparture() {
  const d = new Date(Date.now() + 3600_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}
function defaultZone() {  // only a default; the user sees and can change it
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return US_ZONES.find((z) => z[0] === tz)?.[0] ?? "America/New_York";
}

type Props = { units: UnitPrefs; busy: boolean; serverError: ApiError | null; onSubmit: (req: AnalyzeRequest) => void; prefill?: { origin?: Location; destination?: Location; departure_local?: string; n: number };
  pickTarget: PinTarget | null; onPickTarget: (t: PinTarget | null) => void; onPoints: (p: { origin: Location | null; destination: Location | null }) => void };

export default function RouteForm({ units, busy, serverError, onSubmit, prefill, pickTarget, onPickTarget, onPoints }: Props) {
  const unitRef = useRef(units.weight);
  const resolver: Resolver<FormValues> = useMemo(() => (v, c, o) => zodResolver(makeSchema(unitRef.current))(v, c, o), []);
  const { control, register, handleSubmit, setValue, getValues, setError, formState: { errors } } = useForm<FormValues>({
    resolver,
    defaultValues: { origin: null, destination: null, departure_local: defaultDeparture(), timezone: defaultZone(), load_weight: "28000", checkpoint_interval: 25, hos: false },
  });

  // Switching weight units converts the number already typed, preserving its physical meaning.
  useEffect(() => {
    if (unitRef.current !== units.weight) {
      setValue("load_weight", convertWeightInput(getValues("load_weight"), unitRef.current, units.weight));
      unitRef.current = units.weight;
    }
  }, [units.weight, getValues, setValue]);

  useEffect(() => {
    if (!prefill) return;
    if (prefill.origin) setValue("origin", prefill.origin);
    if (prefill.destination) setValue("destination", prefill.destination);
    if (prefill.departure_local) setValue("departure_local", prefill.departure_local);
  }, [prefill, setValue]);

  const [origin, destination] = useWatch({ control, name: ["origin", "destination"] });
  useEffect(() => { onPoints({ origin, destination }); }, [origin, destination, onPoints]); // the map shows these as A / B pins

  const swap = () => {
    const { origin, destination } = getValues();
    setValue("origin", destination); setValue("destination", origin);
  };

  // Field errors returned by the server's validation are shown next to the field.
  useEffect(() => {
    if (!serverError) return;
    for (const [path, msg] of Object.entries(serverError.fields)) {
      const field = path.split(".")[0] as keyof FormValues;
      if (field in getValues()) setError(field, { message: msg });
    }
  }, [serverError, getValues, setError]);

  const submit = handleSubmit((v) =>
    onSubmit({
      origin: v.origin!, destination: v.destination!, departure_local: v.departure_local, timezone: v.timezone,
      load_weight: Number(v.load_weight), load_unit: units.weight, checkpoint_interval: v.checkpoint_interval, hos: v.hos,
    }),
  );
  const intervalLabel = (mi: number) => `${Math.round(fromCanonical(mi, units.distance) * 10) / 10} ${UNIT_LABEL[units.distance]}`;

  return (
    <form onSubmit={submit} noValidate aria-label="Trip details">
      <Stack spacing={1.5}>
        <Controller name="origin" control={control} render={({ field }) => <LocationField label="Origin" value={field.value} onChange={field.onChange} error={errors.origin?.message} picking={pickTarget === "origin"} onPick={() => onPickTarget(pickTarget === "origin" ? null : "origin")} />} />
        <Stack direction="row" justifyContent="center" sx={{ my: -0.75 }}>
          <IconButton size="small" onClick={swap} aria-label="Swap origin and destination"><SwapVertIcon /></IconButton>
        </Stack>
        <Controller name="destination" control={control} render={({ field }) => <LocationField label="Destination" value={field.value} onChange={field.onChange} error={errors.destination?.message} picking={pickTarget === "destination"} onPick={() => onPickTarget(pickTarget === "destination" ? null : "destination")} />} />
        <Stack direction={{ xs: "column", sm: "row", md: "column", lg: "row" }} spacing={2}>
          <TextField {...register("departure_local")} type="datetime-local" label="Departure" size="small" fullWidth InputLabelProps={{ shrink: true }} error={!!errors.departure_local} helperText={errors.departure_local?.message} />
          <TextField {...register("timezone")} select label="Time zone" size="small" fullWidth defaultValue={getValues("timezone")} slotProps={{ select: { native: true } }}>
            {US_ZONES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </TextField>
        </Stack>
        <TextField {...register("load_weight")} label="Cargo weight" size="small" inputMode="decimal" error={!!errors.load_weight} helperText={errors.load_weight?.message}
          slotProps={{ input: { endAdornment: <InputAdornment position="end">{UNIT_LABEL[units.weight]}</InputAdornment> } }} />
        <Stack spacing={0.75}>
          <Typography variant="body2" id="interval-label">Weather checkpoint every</Typography>
          <Controller name="checkpoint_interval" control={control} render={({ field }) => (
            <ToggleButtonGroup exclusive fullWidth size="small" value={field.value} aria-labelledby="interval-label" onChange={(_, v) => v && field.onChange(v)}>
              {INTERVALS.map((mi) => <ToggleButton key={mi} value={mi}>{intervalLabel(mi)}</ToggleButton>)}
            </ToggleButtonGroup>
          )} />
        </Stack>
        <Controller name="hos" control={control} render={({ field }) => (
          <FormControlLabel label="Include driver rest breaks (hours of service)" control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
            slotProps={{ typography: { variant: "body2" } }} />
        )} />
        <Button type="submit" variant="contained" size="large" disabled={busy} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}>
          {busy ? "Analyzing routes…" : "Compare routes"}
        </Button>
      </Stack>
    </form>
  );
}
