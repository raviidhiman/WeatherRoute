import { clearRecent, loadRecent, saveRecent } from "./recent";

const loc = (label: string) => ({ label, lat: 40, lon: -100 });
beforeEach(() => localStorage.clear());

describe("recent trips", () => {
  it("saves newest first, de-duplicates and caps at 5", () => {
    for (const n of ["a", "b", "c", "d", "e", "f"]) saveRecent({ origin: loc(n), destination: loc("z") });
    saveRecent({ origin: loc("c"), destination: loc("z") });
    const r = loadRecent();
    expect(r.length).toBe(5);
    expect(r[0].origin.label).toBe("c");
    expect(r.filter((t) => t.origin.label === "c").length).toBe(1);
  });
  it("ignores tampered or corrupt storage", () => {
    localStorage.setItem("weatherroute.recent.v1", JSON.stringify([{ origin: { label: 1 }, destination: null }, "x"]));
    expect(loadRecent()).toEqual([]);
    localStorage.setItem("weatherroute.recent.v1", "{not json");
    expect(loadRecent()).toEqual([]);
  });
  it("clears", () => {
    saveRecent({ origin: loc("a"), destination: loc("b") });
    clearRecent();
    expect(loadRecent()).toEqual([]);
  });
});
