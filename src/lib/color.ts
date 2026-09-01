// Small hex-color helpers shared by anything that needs to lighten/darken a
// player's arm color for shading — originally lived only in Token.tsx, but
// the board-finish "gradient" option (see src/game/cosmetics.ts) needs the
// same math, so it's pulled out here rather than duplicated.

// Blends `hex` toward white (amount > 0) or black (amount < 0) — used for a
// gentle radial/linear gradient across an otherwise-flat fill (still one
// flat color at a glance, just enough falloff to read as subtly lit) and
// for a soft highlight, not a glossy gem.
export function shade(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mix = (c: number) => Math.round(c * (1 - t) + target * t);
  // Hex (not rgb()) so a shaded result can itself be fed back into shade()
  // — see discColor in Token.tsx, which darkens the base color once and is
  // then shaded again (lighter/darker) for the gradient's own stops.
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

// Darkens `hex` for contrast by reducing HSL lightness (not blending toward
// black in RGB) — RGB blending drags a bright, low-saturation hue like
// yellow through olive/brown well before it reads as "a darker yellow."
// Cutting lightness by a fixed amount keeps the hue and saturation intact,
// so it stays recognizably the same color, just deeper.
export function darkenForContrast(hex: string, lightnessDrop: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  const l2 = Math.max(0, l - lightnessDrop);

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r2: number;
  let g2: number;
  let b2: number;
  if (s === 0) {
    r2 = g2 = b2 = l2;
  } else {
    const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s;
    const p = 2 * l2 - q;
    r2 = hue2rgb(p, q, h + 1 / 3);
    g2 = hue2rgb(p, q, h);
    b2 = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (c: number) =>
    Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}
