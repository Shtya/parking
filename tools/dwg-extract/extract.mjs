/**
 * DWG → Web extractor (offline build step).
 *
 * For every floor DWG it produces:
 *   public/floors/<CODE>.svg              background plan (walls, columns, parking lines…)
 *   prisma/data/floors/<CODE>.json        spot geometry + extraction report
 *
 * Strategy
 *   • Numbered floors (B2, B1, GF, MF, 1F, 2F): every numeric TEXT on layer A-COUNT is a spot label.
 *     The nearest CARSTOP-1 insert gives the stall origin + direction; otherwise the stall orientation
 *     is inferred from the neighbouring labels (row direction). A W×L rectangle becomes the spot polygon.
 *   • Yard (final parking.dwg): no labels. Each P1 block is a stall divider line; two parallel dividers
 *     ~2.5 m apart form one stall. Stalls are auto-numbered row by row.
 *
 * Coordinates: DWG units are millimetres. SVG units are centimetres (÷10), Y axis flipped.
 *
 * NOTE: @mlightcad/libredwg-web is GPL-3.0. It is only used by this offline tool, never shipped in the app.
 */
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ASSETS = path.join(ROOT, 'docs/client-assets');
const OUT_SVG = path.join(ROOT, 'public/floors');
const OUT_JSON = path.join(ROOT, 'prisma/data/floors');

const FLOORS = [
  { code: 'B2', file: 'Second Basement.DWG', mode: 'numbered' },
  { code: 'B1', file: 'B1.dwg', mode: 'numbered' },
  { code: 'GF', file: 'GF.dwg', mode: 'numbered' },
  { code: 'MF', file: 'MF.dwg', mode: 'numbered' },
  { code: '1F', file: '1F.dwg', mode: 'numbered' },
  { code: '2F', file: '2F.dwg', mode: 'numbered' },
  { code: 'YARD', file: 'final parking.dwg', mode: 'yard' },
];

// Layers that never belong in the background plan.
const EXCLUDE_LAYER = /DIM|ANNO|TXT|TEXT|BORDR|GRID|COUNT|REVIS|RNAME|LEGN|LEVEL|DEFPOINTS|TARGET|PLANT|TREE|PAVER|HIDDEN|HATCH|^A-CO$|100A-CO|1-CO$|XREF|VIEWPORT|A-CAR$/i;
const EXCLUDE_BLOCK = /^(car-|CARSTOP|REVIS|REV|REVN|D-SCHED|RNAME|ROOM-N|GRID|G1|BLDG-SECT|ARROW|NOTE|NORTH|WSCH|DWG-NAME|NEWLOGO|E4-100|MT2|TRB|TREE|SDCTIK|_Open|A\$C)/i;
const CLASS_FOR_LAYER = (layer) => {
  if (/PARKING|CARSTOP|P1|Kerb/i.test(layer)) return 'p';
  if (/WALL|COL|FENCE|RCWALL/i.test(layer)) return 'w';
  return 'm';
};

const r1 = (n) => Math.round(n * 10) / 10;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const norm = (v) => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const median = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

function textCenter(e) {
  const aligned = (e.halign || e.valign) && e.endPoint && (e.endPoint.x || e.endPoint.y);
  if (aligned) return { x: e.endPoint.x, y: e.endPoint.y };
  const h = e.textHeight || 300;
  const w = String(e.text).length * h * (e.xScale || 1) * 0.7;
  const a = e.rotation || 0;
  return { x: e.startPoint.x + Math.cos(a) * w / 2 - Math.sin(a) * h / 2, y: e.startPoint.y + Math.sin(a) * w / 2 + Math.cos(a) * h / 2 };
}

/** 2D affine: [a b c d e f] → x' = a*x + c*y + e ; y' = b*x + d*y + f */
const IDENTITY = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
function insertMatrix(ins, block) {
  const r = ins.rotation || 0, sx = ins.xScale ?? 1, sy = ins.yScale ?? 1;
  const bp = block?.basePoint || { x: 0, y: 0 };
  const c = Math.cos(r), s = Math.sin(r);
  // T(insert) * R * S * T(-base)
  let m = [c * sx, s * sx, -s * sy, c * sy, ins.insertionPoint.x, ins.insertionPoint.y];
  return mul(m, [1, 0, 0, 1, -bp.x, -bp.y]);
}

/** Collect drawable primitives (in world coordinates) as polylines. */
function collectGeometry(entities, blocks, matrix = IDENTITY, parentLayer = null, depth = 0, out = []) {
  for (const e of entities) {
    const layer = e.layer === '0' && parentLayer ? parentLayer : e.layer;
    if (!e.isVisible && e.isVisible !== undefined) continue;
    if (EXCLUDE_LAYER.test(layer)) continue;
    const cls = CLASS_FOR_LAYER(layer);
    const push = (pts, closed = false) => out.push({ cls, pts: pts.map((p) => apply(matrix, p)), closed });
    switch (e.type) {
      case 'LINE': push([e.startPoint, e.endPoint]); break;
      case 'LWPOLYLINE': case 'POLYLINE2D': {
        const v = e.vertices || []; if (v.length < 2) break;
        push(v.map((p) => ({ x: p.x, y: p.y })), (e.flag & 1) === 1);
        break;
      }
      case 'ARC': case 'CIRCLE': {
        const a0 = e.type === 'CIRCLE' ? 0 : e.startAngle; let a1 = e.type === 'CIRCLE' ? Math.PI * 2 : e.endAngle;
        if (a1 < a0) a1 += Math.PI * 2;
        const steps = Math.max(6, Math.min(48, Math.ceil(((a1 - a0) * e.radius) / 150)));
        const pts = []; for (let i = 0; i <= steps; i++) { const a = a0 + ((a1 - a0) * i) / steps; pts.push({ x: e.center.x + Math.cos(a) * e.radius, y: e.center.y + Math.sin(a) * e.radius }); }
        push(pts, e.type === 'CIRCLE');
        break;
      }
      case 'INSERT': {
        if (depth > 4 || EXCLUDE_BLOCK.test(e.name)) break;
        const b = blocks.get(e.name); if (!b?.entities?.length) break;
        collectGeometry(b.entities, blocks, mul(matrix, insertMatrix(e, b)), layer, depth + 1, out);
        break;
      }
      default: break;
    }
  }
  return out;
}

function rectPolygon(center, axis, W, L) {
  const ax = norm(axis), px = { x: -ax.y, y: ax.x };
  const hw = W / 2, hl = L / 2;
  return [
    { x: center.x - ax.x * hl - px.x * hw, y: center.y - ax.y * hl - px.y * hw },
    { x: center.x + ax.x * hl - px.x * hw, y: center.y + ax.y * hl - px.y * hw },
    { x: center.x + ax.x * hl + px.x * hw, y: center.y + ax.y * hl + px.y * hw },
    { x: center.x - ax.x * hl + px.x * hw, y: center.y - ax.y * hl + px.y * hw },
  ];
}

function numberedSpots(ms, warnings) {
  const labels = ms.filter((e) => (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer === 'A-COUNT' && /^\s*\d{1,3}\s*$/.test(e.text || ''))
    .map((e) => ({ label: String(e.text).trim(), c: textCenter(e) }));
  const stops = ms.filter((e) => e.type === 'INSERT' && /^CARSTOP/i.test(e.name)).map((e) => {
    const r = e.rotation || 0, sy = e.yScale ?? 1;
    // block local +Y points into the stall (bar sits at y≈0.7 m from the base point)
    return { p: e.insertionPoint, dir: norm({ x: -Math.sin(r) * sy, y: Math.cos(r) * sy }), used: false };
  });
  const nn = labels.map((a) => Math.min(...labels.filter((b) => b !== a).map((b) => dist(a.c, b.c))));
  const W = Math.min(3200, Math.max(2200, median(nn.filter((d) => d > 1500 && d < 4000)) || 2500));
  const L = 5000;
  const spots = [];
  const seen = new Map();
  for (const lab of labels) {
    let best = null, bestD = Infinity;
    for (const s of stops) { const d = dist(s.p, lab.c); if (d < bestD) { bestD = d; best = s; } }
    let center, axis, source;
    if (best && bestD < L * 0.95) {
      axis = best.dir;
      const along = (lab.c.x - best.p.x) * axis.x + (lab.c.y - best.p.y) * axis.y;
      if (along < 0) axis = { x: -axis.x, y: -axis.y };
      center = { x: best.p.x + axis.x * (L / 2), y: best.p.y + axis.y * (L / 2) };
      source = 'carstop';
    } else {
      const neighbours = labels.filter((b) => b !== lab).map((b) => ({ b, d: dist(b.c, lab.c) })).sort((x, y) => x.d - y.d);
      const n = neighbours.find((x) => x.d < W * 1.8);
      const row = n ? norm({ x: n.b.c.x - lab.c.x, y: n.b.c.y - lab.c.y }) : { x: 1, y: 0 };
      axis = { x: -row.y, y: row.x };
      center = lab.c;
      source = 'inferred';
    }
    let label = lab.label;
    if (seen.has(label)) {
      const n = seen.get(label) + 1; seen.set(label, n);
      const suffix = String.fromCharCode(64 + n); // B, C …
      warnings.push(`Duplicate label ${label} in drawing → stored as ${label}${suffix}`);
      label = `${label}${suffix}`;
    } else seen.set(label, 1);
    spots.push({ label, number: parseInt(lab.label, 10), source, poly: rectPolygon(center, axis, W * 0.92, L * 0.96), c: center });
  }
  const max = Math.max(...spots.map((s) => s.number));
  const have = new Set(spots.map((s) => s.number));
  const missing = []; for (let i = 1; i <= max; i++) if (!have.has(i)) missing.push(i);
  if (missing.length) warnings.push(`Missing numbers in drawing: ${missing.join(', ')}`);
  return { spots, W };
}

function yardSpots(ms, blocks, warnings) {
  const segs = [];
  for (const e of ms) {
    if (e.type !== 'INSERT' || e.name !== 'P1') continue;
    const b = blocks.get('P1');
    const rect = b.entities.find((x) => x.type === 'LWPOLYLINE');
    if (!rect) continue;
    const m = insertMatrix(e, b);
    const v = rect.vertices.map((p) => apply(m, p));
    // centre line along the long edges
    const e01 = dist(v[0], v[1]), e12 = dist(v[1], v[2]);
    const [a, bq] = e01 < e12 ? [mid(v[0], v[1]), mid(v[2], v[3])] : [mid(v[1], v[2]), mid(v[3], v[0])];
    segs.push({ a, b: bq, c: mid(a, bq), len: dist(a, bq), dir: norm({ x: bq.x - a.x, y: bq.y - a.y }) });
  }
  // de-duplicate identical dividers
  const uniq = [];
  for (const s of segs) if (!uniq.some((u) => dist(u.c, s.c) < 200)) uniq.push(s);
  if (uniq.length !== segs.length) warnings.push(`${segs.length - uniq.length} duplicated divider blocks ignored`);
  const stalls = [];
  for (const s of uniq) {
    const perp = { x: -s.dir.y, y: s.dir.x };
    let best = null, bestOff = Infinity;
    for (const t of uniq) {
      if (t === s) continue;
      if (Math.abs(s.dir.x * t.dir.x + s.dir.y * t.dir.y) < 0.98) continue; // parallel only
      const d = { x: t.c.x - s.c.x, y: t.c.y - s.c.y };
      const off = d.x * perp.x + d.y * perp.y; // only one side → no duplicates
      const along = Math.abs(d.x * s.dir.x + d.y * s.dir.y);
      if (off > 1800 && off < 3400 && along < s.len * 0.3 && off < bestOff) { best = t; bestOff = off; }
    }
    if (!best) continue;
    const center = { x: (s.c.x + best.c.x) / 2, y: (s.c.y + best.c.y) / 2 };
    stalls.push({ c: center, poly: rectPolygon(center, s.dir, bestOff * 0.9, s.len * 0.96), W: bestOff });
  }
  // number row by row: top→bottom (world Y desc), then left→right
  const rowH = 2500;
  stalls.sort((p, q) => (Math.round(q.c.y / rowH) - Math.round(p.c.y / rowH)) || (p.c.x - q.c.x));
  const spots = stalls.map((s, i) => ({ label: String(i + 1), number: i + 1, source: 'divider-pair', poly: s.poly, c: s.c }));
  warnings.push(`Yard stalls are unnumbered in the drawing; auto-numbered 1..${spots.length} row by row (drawing note says 517).`);
  return { spots, W: median(stalls.map((s) => s.W)) || 2500 };
}
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function toSvg(code, geom, spots, bbox) {
  const tx = (p) => `${r1((p.x - bbox.minX) / 10)},${r1((bbox.maxY - p.y) / 10)}`;
  const W = r1((bbox.maxX - bbox.minX) / 10), H = r1((bbox.maxY - bbox.minY) / 10);
  const byCls = { w: [], p: [], m: [] };
  const inside = (p) => p.x >= bbox.minX && p.x <= bbox.maxX && p.y >= bbox.minY && p.y <= bbox.maxY;
  for (const g of geom) {
    if (!g.pts.some(inside)) continue;
    byCls[g.cls].push(`M${g.pts.map(tx).join('L')}${g.closed ? 'Z' : ''}`);
  }
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" data-floor="${code}" preserveAspectRatio="xMidYMid meet">`,
    `<g class="plan-m" fill="none" stroke="#c3ccd8" stroke-width="3" stroke-linecap="round"><path d="${byCls.m.join('')}"/></g>`,
    `<g class="plan-p" fill="none" stroke="#8795a8" stroke-width="4" stroke-linecap="round"><path d="${byCls.p.join('')}"/></g>`,
    `<g class="plan-w" fill="none" stroke="#334155" stroke-width="7" stroke-linecap="round"><path d="${byCls.w.join('')}"/></g>`,
    `</svg>`,
  ].join('');
  const spotJson = spots.map((s) => ({
    label: s.label,
    number: s.number,
    source: s.source,
    points: s.poly.map((p) => [r1((p.x - bbox.minX) / 10), r1((bbox.maxY - p.y) / 10)]),
    cx: r1((s.c.x - bbox.minX) / 10),
    cy: r1((bbox.maxY - s.c.y) / 10),
  }));
  return { svg, spotJson, viewBox: [0, 0, W, H] };
}

const lib = await LibreDwg.create(path.join(HERE, 'node_modules/@mlightcad/libredwg-web/wasm/'));
fs.mkdirSync(OUT_SVG, { recursive: true });
fs.mkdirSync(OUT_JSON, { recursive: true });
const only = process.argv[2];
for (const f of FLOORS) {
  if (only && only !== f.code) continue;
  const t0 = Date.now();
  const dwg = lib.dwg_read_data(new Uint8Array(fs.readFileSync(path.join(ASSETS, f.file))), Dwg_File_Type.DWG);
  const db = lib.convert(dwg);
  const blocks = new Map(db.tables.BLOCK_RECORD.entries.map((b) => [b.name, b]));
  const msHandle = db.tables.BLOCK_RECORD.entries.find((b) => /^\*model_space$/i.test(b.name))?.handle;
  const ms = db.entities.filter((e) => e.ownerBlockRecordSoftId === msHandle);
  const warnings = [];
  const { spots, W } = f.mode === 'yard' ? yardSpots(ms, blocks, warnings) : numberedSpots(ms, warnings);
  const pts = spots.flatMap((s) => s.poly);
  const margin = W * 4;
  const bbox = {
    minX: Math.min(...pts.map((p) => p.x)) - margin, maxX: Math.max(...pts.map((p) => p.x)) + margin,
    minY: Math.min(...pts.map((p) => p.y)) - margin, maxY: Math.max(...pts.map((p) => p.y)) + margin,
  };
  const geom = collectGeometry(ms, blocks);
  const { svg, spotJson, viewBox } = toSvg(f.code, geom, spots, bbox);
  fs.writeFileSync(path.join(OUT_SVG, `${f.code}.svg`), svg);
  const report = {
    code: f.code,
    sourceFile: f.file,
    dwgVersion: Buffer.from(fs.readFileSync(path.join(ASSETS, f.file)).subarray(0, 6)).toString(),
    viewBox,
    spotCount: spotJson.length,
    sources: spotJson.reduce((a, s) => ((a[s.source] = (a[s.source] || 0) + 1), a), {}),
    warnings,
    spots: spotJson,
  };
  fs.writeFileSync(path.join(OUT_JSON, `${f.code}.json`), JSON.stringify(report));
  console.log(`${f.code.padEnd(5)} spots=${String(spotJson.length).padStart(4)} ${JSON.stringify(report.sources)} svg=${Math.round(svg.length / 1024)}KB ${Date.now() - t0}ms`);
  for (const w of warnings.slice(0, 6)) console.log(`      ⚠ ${w}`);
  if (warnings.length > 6) console.log(`      … ${warnings.length - 6} more warnings`);
  lib.dwg_free(dwg);
}
