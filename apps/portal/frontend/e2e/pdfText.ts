/**
 * P24 · minimal PDF text-layer reader for Chromium `page.pdf()` output (Skia/PDF 1.4: plain objects,
 * Flate streams, Type0/Identity-H fonts with a ToUnicode CMap). No dependency, no network.
 * It returns the page count and the text of every page, so a print probe can assert that the
 * sidebar/top bar words are NOT in the text layer (not merely "not visible in the DOM").
 */
import { inflateSync } from "node:zlib";

interface PdfObject {
  dict: string;
  stream: Buffer | null;
}

function parseObjects(pdf: Buffer): Map<number, PdfObject> {
  const text = pdf.toString("latin1");
  const out = new Map<number, PdfObject>();
  const re = /(\d+) 0 obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    const end = text.indexOf("endobj", start);
    if (end < 0) break;
    const body = text.slice(start, end);
    const sIdx = body.indexOf("stream");
    let dict = body;
    let stream: Buffer | null = null;
    if (sIdx >= 0) {
      dict = body.slice(0, sIdx);
      let from = start + sIdx + "stream".length;
      if (text[from] === "\r") from += 1;
      if (text[from] === "\n") from += 1;
      const len = /\/Length (\d+)(?! 0 R)/.exec(dict);
      const to = len ? from + Number(len[1]) : text.indexOf("endstream", from);
      let raw = pdf.subarray(from, to);
      if (/\/FlateDecode/.test(dict)) {
        try {
          raw = inflateSync(raw);
        } catch {
          raw = Buffer.alloc(0);
        }
      }
      stream = raw;
    }
    out.set(Number(m[1]), { dict, stream });
    re.lastIndex = end;
  }
  return out;
}

function toUnicodeMap(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  const hexToStr = (h: string) => {
    let s = "";
    for (let i = 0; i + 3 < h.length + 1; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
    return s;
  };
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(p[1], 16), hexToStr(p[2]));
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g)) {
      const lo = parseInt(p[1], 16);
      const hi = parseInt(p[2], 16);
      if (p[3].startsWith("[")) {
        [...p[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((x, i) => map.set(lo + i, hexToStr(x[1])));
      } else {
        const base = hexToStr(p[3].slice(1, -1));
        for (let c = lo; c <= hi; c += 1) map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - lo)));
      }
    }
  }
  return map;
}

export interface PdfText {
  pages: number;
  text: string[];
}

export function readPdfText(pdf: Buffer): PdfText {
  const objs = parseObjects(pdf);
  const fontMaps = new Map<number, Map<number, string>>();
  for (const [id, o] of objs) {
    const tu = /\/ToUnicode (\d+) 0 R/.exec(o.dict);
    if (/\/Type\s*\/Font\b/.test(o.dict) && tu) {
      const cm = objs.get(Number(tu[1]));
      fontMaps.set(id, cm?.stream ? toUnicodeMap(cm.stream.toString("latin1")) : new Map());
    }
  }
  const pages: PdfText["text"] = [];
  const pageObjs = [...objs.entries()].filter(([, o]) => /\/Type\s*\/Page\b(?!s)/.test(o.dict)).sort((a, b) => a[0] - b[0]);
  for (const [, page] of pageObjs) {
    const resRef = /\/Resources (\d+) 0 R/.exec(page.dict);
    const resDict = resRef ? (objs.get(Number(resRef[1]))?.dict ?? "") : page.dict;
    const fonts = new Map<string, Map<number, string>>();
    const fontBlock = /\/Font\s*(?:(\d+) 0 R|<<([\s\S]*?)>>)/.exec(resDict);
    const fontDict = fontBlock ? (fontBlock[1] ? (objs.get(Number(fontBlock[1]))?.dict ?? "") : fontBlock[2]) : "";
    for (const f of fontDict.matchAll(/\/(\w+) (\d+) 0 R/g)) fonts.set(f[1], fontMaps.get(Number(f[2])) ?? new Map());
    const contents = [...(/\/Contents (?:(\d+) 0 R|\[([^\]]*)\])/.exec(page.dict) ?? [])];
    const ids = contents[1] ? [Number(contents[1])] : [...(contents[2] ?? "").matchAll(/(\d+) 0 R/g)].map((x) => Number(x[1]));
    let out = "";
    for (const id of ids) {
      const content = objs.get(id)?.stream?.toString("latin1") ?? "";
      let cur = new Map<number, string>();
      for (const tok of content.matchAll(/\/(\w+)\s+[\d.]+\s+Tf|<([0-9a-fA-F]+)>\s*Tj|\[((?:<[0-9a-fA-F]*>|[-\d.\s])*)\]\s*TJ|\bET\b|\bT\*|\bTd\b|\bTm\b/g)) {
        if (tok[1]) cur = fonts.get(tok[1]) ?? new Map();
        else if (tok[2] !== undefined || tok[3] !== undefined) {
          const hexes = tok[2] !== undefined ? [tok[2]] : [...tok[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => x[1]);
          for (const h of hexes) for (let i = 0; i + 3 < h.length + 1; i += 4) out += cur.get(parseInt(h.slice(i, i + 4), 16)) ?? "";
        } else out += " ";
      }
      out += "\n";
    }
    pages.push(out.replace(/[ \t]+/g, " "));
  }
  return { pages: pages.length || (pdf.toString("latin1").match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length, text: pages };
}
