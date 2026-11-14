// 计算样式里的颜色可能是 rgb()、oklab()（color-mix 的结果）或 oklch()（令牌原样保留）。
// 用浏览器本身做一次归一化：先把值赋给探针元素，再读回计算值，最后统一换算成 sRGB。
export type Rgba = [number, number, number, number];

export const cssColorInPage = () => {
  let probe: HTMLSpanElement | null = null;

  const encode = (linear: number) => {
    const v = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };

  function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;
    return [
      encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ];
  }

  const alphaOf = (raw?: string) =>
    raw === undefined ? 1 : raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);

  const parseColor = (value: string): Rgba => {
    if (!value) return [0, 0, 0, 0];
    if (!probe) {
      probe = document.createElement("span");
      probe.style.display = "none";
      document.body.append(probe);
    }
    probe.style.color = "";
    probe.style.color = value;
    const computed = getComputedStyle(probe).color;
    const fn = computed.match(/^([a-z]+)\(([^)]*)\)/);
    if (!fn) return [0, 0, 0, 1];
    const parts = fn[2].split(/[ ,/]+/).filter(Boolean);
    if (fn[1] === "rgb" || fn[1] === "rgba") {
      return [Number(parts[0]), Number(parts[1]), Number(parts[2]), alphaOf(parts[3])];
    }
    const [L, a, b] = parts.map((part) => (part.endsWith("%") ? parseFloat(part) / 100 : parseFloat(part)));
    const alphaIndex = computed.includes("/") ? parts.length - 1 : -1;
    const alpha = alphaIndex > 0 && !/^(?:-?\d*\.?\d+%?)$/.test(parts[3] ?? "") === false && parts[3] !== undefined
      ? alphaOf(parts[3])
      : 1;
    // oklab() 的 alpha 位置与 oklch() 相同；色相分量不存在时 b 直接取自第四段
    if (fn[1] === "oklch") {
      const hue = (parseFloat(parts[2]) * Math.PI) / 180;
      const [r, g, bl] = oklabToRgb(L, parseFloat(parts[1]) * Math.cos(hue), parseFloat(parts[1]) * Math.sin(hue));
      return [r, g, bl, alphaOf(parts[3])];
    }
    const [r, g, bl] = oklabToRgb(L, a, b);
    return [r, g, bl, alpha];
  };

  return parseColor;
};

export function composite(fg: Rgba, bg: Rgba): Rgba {
  return [
    fg[0] * fg[3] + bg[0] * (1 - fg[3]),
    fg[1] * fg[3] + bg[1] * (1 - fg[3]),
    fg[2] * fg[3] + bg[2] * (1 - fg[3]),
    1,
  ];
}

export function luminance(rgb: Rgba): number {
  const [r, g, b] = rgb.slice(0, 3).map((channel) => {
    const v = channel / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
