import { fetchRadarTiles } from "./radar";

const mock = (body: unknown, ok = true) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => body }));
const ctl = () => new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());

describe("radar tiles", () => {
  it("builds a tile template from a valid index", async () => {
    mock({ host: "https://tilecache.rainviewer.com", radar: { past: [{ path: "/v2/radar/111" }, { path: "/v2/radar/222" }] } });
    expect(await fetchRadarTiles(ctl())).toBe("https://tilecache.rainviewer.com/v2/radar/222/256/{z}/{x}/{y}/2/1_1.png");
  });
  it.each([
    [{ host: "https://evil.example.com", radar: { past: [{ path: "/v2/radar/1" }] } }],
    [{ host: "http://tilecache.rainviewer.com", radar: { past: [{ path: "/v2/radar/1" }] } }],
    [{ host: "https://tilecache.rainviewer.com.evil.com", radar: { past: [{ path: "/v2/radar/1" }] } }],
    [{ host: "https://tilecache.rainviewer.com", radar: { past: [{ path: "/../../x" }] } }],
    [{ host: "https://tilecache.rainviewer.com", radar: { past: [] } }], [null],
  ])("rejects unexpected index %#", async (body) => {
    mock(body);
    await expect(fetchRadarTiles(ctl())).rejects.toThrow();
  });
  it("fails when the service is down", async () => {
    mock({}, false);
    await expect(fetchRadarTiles(ctl())).rejects.toThrow();
  });
});
