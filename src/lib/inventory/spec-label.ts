/** Pretty-print a spec key: "max_power_mw" → "Max Output Power" style. */
export function specLabel(key: string): string {
  const special: Record<string, string> = {
    kv: "KV",
    elrs: "ExpressLRS",
    vtx: "VTX",
    aio: "AIO",
    fps: "FPS",
    ir: "IR",
    osd: "OSD",
    dvr: "DVR",
    pwm: "PWM",
    rf: "RF",
    id: "ID",
    mw: "mW",
  };
  const title = key
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return special[title.toLowerCase()] ?? title;
}
