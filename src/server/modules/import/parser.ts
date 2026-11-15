/**
 * Parser for the client's "PARKING STATEMENT" workbook.
 *
 * Sheet1 layout (header rows 1–4, one tenant per row from row 5):
 *   A  extra spots over leased area         B  total spots
 *   C..I  rented (PAID) spot counts   : C=open yard, D=yard shaded, E=VIP(1F), F=M, G=G, H=B1, I=B2
 *   J..P  spots INCLUDED with office  : same order
 *   Q..V  spot numbers per location   : Q=yard shaded, R=VIP(1F), S=M, T=G, U=B1, V=B2
 *   W  office unit numbers   X  tenant name   Y  serial
 *   Totals block: "TOTAL Parking on Site" row → capacity per location in J..P
 * Sheet4: office units (floor, unit, area, parking by contract, parking by area, status)
 */
import ExcelJS from 'exceljs';

export type Zone = 'OPEN' | 'SHADED' | '1F' | 'MF' | 'GF' | 'B1' | 'B2';
export type Severity = 'error' | 'warning' | 'info';

export interface ImportIssue {
  severity: Severity;
  code: string;
  message: string;
  row?: number;
  column?: string;
  tenant?: string;
}

export interface ParsedSpot { floorCode: string; label: string; kind: 'INCLUDED' | 'PAID' }
export interface ParsedAllocation { floorCode: string; quantity: number; kind: 'INCLUDED' | 'PAID' }

export interface ParsedTenant {
  key: string;
  rows: number[];
  nameAr: string;
  nameEn: string | null;
  code: string | null;
  officeUnits: string | null;
  declaredTotal: number;
  counts: Record<Zone, { paid: number; included: number }>;
  spots: ParsedSpot[];
  allocations: ParsedAllocation[];
}

export interface ParsedUnit {
  floorLabel: string;
  unitNo: string;
  area: number;
  parkingByContract: number;
  parkingByArea: number;
  status: string;
}

export interface ParseResult {
  tenants: ParsedTenant[];
  units: ParsedUnit[];
  floorCapacities: Partial<Record<string, number>>;
  issues: ImportIssue[];
  summary: {
    tenants: number;
    rows: number;
    numberedSpots: number;
    unnumberedSpots: number;
    declaredTotal: number;
    units: number;
    conflicts: number;
    errors: number;
    warnings: number;
    byFloor: Record<string, number>;
  };
}

const ZONES: { zone: Zone; floorCode: string; paidCol: string; inclCol: string; numCol?: string }[] = [
  { zone: 'OPEN', floorCode: 'YARD', paidCol: 'C', inclCol: 'J' },
  { zone: 'SHADED', floorCode: 'SHADED', paidCol: 'D', inclCol: 'K', numCol: 'Q' },
  { zone: '1F', floorCode: '1F', paidCol: 'E', inclCol: 'L', numCol: 'R' },
  { zone: 'MF', floorCode: 'MF', paidCol: 'F', inclCol: 'M', numCol: 'S' },
  { zone: 'GF', floorCode: 'GF', paidCol: 'G', inclCol: 'N', numCol: 'T' },
  { zone: 'B1', floorCode: 'B1', paidCol: 'H', inclCol: 'O', numCol: 'U' },
  { zone: 'B2', floorCode: 'B2', paidCol: 'I', inclCol: 'P', numCol: 'V' },
];

function cellValue(cell: ExcelJS.Cell): string | number | null {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
    if (o.result !== undefined && o.result !== null) return typeof o.result === 'number' ? o.result : String(o.result);
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.text) return o.text;
  }
  return null;
}
const str = (c: ExcelJS.Cell) => {
  const v = cellValue(c);
  return v === null ? '' : String(v).trim();
};
const num = (c: ExcelJS.Cell) => {
  const v = cellValue(c);
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const LATIN = /^[\x20-\x7E&.,()\-/']+$/;
export const normalizeName = (s: string) => s.replace(/\s+/g, ' ').replace(/[ـ]/g, '').trim();

/**
 * Parses a spot-number cell such as "45 to 61\n246 to 251", "153 to 156 18", "47,48,77,80, 158,159".
 * Digits glued together because a comma was lost (e.g. "176177" or "130131164") are split into 3-digit (or 2-digit) chunks.
 */
export function parseSpotNumbers(raw: string): { numbers: number[]; merged: string[]; unparsed: string[] } {
  const s = raw.replace(/[–—]/g, '-').replace(/\bto\b/gi, '-').trim();
  if (!s || s === '*') return { numbers: [], merged: [], unparsed: [] };
  const numbers: number[] = [];
  const merged: string[] = [];
  const re = /(\d+)\s*-\s*(\d+)|(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[1] && m[2]) {
      const a = +m[1];
      const b = +m[2];
      if (b < a || b - a > 400) {
        merged.push(m[0]);
        continue;
      }
      for (let i = a; i <= b; i++) numbers.push(i);
    } else {
      const t = m[3];
      if (t.length <= 3) numbers.push(+t);
      else if (t.length % 3 === 0) {
        merged.push(t);
        for (let i = 0; i < t.length; i += 3) numbers.push(+t.slice(i, i + 3));
      } else if (t.length % 2 === 0) {
        merged.push(t);
        for (let i = 0; i < t.length; i += 2) numbers.push(+t.slice(i, i + 2));
      } else merged.push(t);
    }
  }
  const leftovers = s.replace(re, '').replace(/[\s,|/\n\r*.]+/g, '');
  return { numbers, merged, unparsed: leftovers ? [leftovers] : [] };
}

function summaryOf(issues: ImportIssue[]): ParseResult['summary'] {
  return {
    tenants: 0, rows: 0, numberedSpots: 0, unnumberedSpots: 0, declaredTotal: 0, units: 0, byFloor: {},
    conflicts: issues.filter((i) => i.code === 'SPOT_CONFLICT').length,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
  };
}

export async function parseStatement(buffer: Buffer | ArrayBuffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const issues: ImportIssue[] = [];
  const ws = wb.worksheets.find((w) => /sheet1/i.test(w.name)) ?? wb.worksheets[0];
  if (!ws) throw new Error('Workbook has no sheets');

  // ── header check ──
  const header = [str(ws.getCell('X3')), str(ws.getCell('W3')), str(ws.getCell('Q1'))].join('|');
  if (!/المستأجر/.test(header) || !/الوحدة/.test(header)) {
    issues.push({ severity: 'error', code: 'UNKNOWN_FORMAT', message: 'Sheet1 does not look like the PARKING STATEMENT layout (expected tenant name in X3, unit in W3).' });
    return { tenants: [], units: [], floorCapacities: {}, issues, summary: summaryOf(issues) };
  }

  // ── capacities ──
  const floorCapacities: Partial<Record<string, number>> = {};
  ws.eachRow((row, r) => {
    if (/TOTAL Parking on Site/i.test(str(row.getCell('Q'))) && !Object.keys(floorCapacities).length) {
      ZONES.forEach((z) => {
        const v = num(ws.getCell(`${z.inclCol}${r}`));
        if (v > 0) floorCapacities[z.floorCode] = v;
      });
    }
  });

  // ── tenant rows ──
  const tenants = new Map<string, ParsedTenant>();
  const owner = new Map<string, { tenant: string; row: number }>(); // "B2#45" → first owner
  let rows = 0;
  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = normalizeName(str(row.getCell('X')));
    const q = str(row.getCell('Q'));
    if (/total/i.test(q) || /total/i.test(str(row.getCell('C')))) break;
    if (!name) continue;
    rows++;
    const key = name.toLowerCase();
    const units = str(row.getCell('W'));
    let t = tenants.get(key);
    if (!t) {
      const paren = name.match(/\(([A-Za-z0-9 .&-]{2,})\)/)?.[1]?.trim() ?? name.match(/[A-Za-z][A-Za-z0-9&.\- ]+[A-Za-z0-9]/)?.[0]?.trim() ?? null;
      const isLatin = LATIN.test(name);
      t = {
        key, rows: [], nameAr: name, nameEn: isLatin ? name : paren, code: (paren ?? (isLatin ? name : null))?.toUpperCase().slice(0, 30) ?? null,
        officeUnits: null, declaredTotal: 0,
        counts: Object.fromEntries(ZONES.map((z) => [z.zone, { paid: 0, included: 0 }])) as ParsedTenant['counts'],
        spots: [], allocations: [],
      };
      tenants.set(key, t);
    } else {
      issues.push({ severity: 'warning', code: 'DUPLICATE_TENANT', row: r, tenant: name, message: `Tenant appears again (rows ${t.rows.join(', ')} and ${r}) — rows merged into one tenant/contract.` });
    }
    t.rows.push(r);
    if (units && units !== '*') t.officeUnits = t.officeUnits ? `${t.officeUnits} / ${units}` : units;
    const declared = num(row.getCell('B'));
    t.declaredTotal += declared;
    let rowCount = 0;

    for (const z of ZONES) {
      const paid = Math.max(0, Math.round(num(row.getCell(z.paidCol))));
      const included = Math.max(0, Math.round(num(row.getCell(z.inclCol))));
      t.counts[z.zone].paid += paid;
      t.counts[z.zone].included += included;
      rowCount += paid + included;
      const wanted = paid + included;

      if (!z.numCol) {
        // open yard: unnumbered quantities
        if (paid) t.allocations.push({ floorCode: z.floorCode, quantity: paid, kind: 'PAID' });
        if (included) t.allocations.push({ floorCode: z.floorCode, quantity: included, kind: 'INCLUDED' });
        continue;
      }
      const raw = str(row.getCell(z.numCol));
      const { numbers, merged, unparsed } = parseSpotNumbers(raw);
      if (merged.length)
        issues.push({
          severity: 'warning', code: 'MERGED_NUMBERS', row: r, column: z.numCol, tenant: name,
          message: `"${merged.join('", "')}" looks like numbers without separators — split into ${numbers.filter((n) => merged.some((mm) => mm.includes(String(n)))).join(', ')}. Please verify.`,
        });
      if (unparsed.length) issues.push({ severity: 'warning', code: 'UNPARSED_TEXT', row: r, column: z.numCol, tenant: name, message: `Could not read "${unparsed.join(' ')}" in ${z.floorCode} spot numbers.` });
      const unique = [...new Set(numbers)];
      if (unique.length !== numbers.length) issues.push({ severity: 'warning', code: 'REPEATED_NUMBER', row: r, column: z.numCol, tenant: name, message: `Same spot listed twice in ${z.floorCode}.` });

      const accepted: number[] = [];
      for (const n of unique) {
        const k = `${z.floorCode}#${n}`;
        const prev = owner.get(k);
        if (prev && prev.tenant !== key) {
          issues.push({
            severity: 'warning', code: 'SPOT_CONFLICT', row: r, column: z.numCol, tenant: name,
            message: `${z.floorCode} spot ${n} is already assigned to "${tenants.get(prev.tenant)?.nameAr}" (row ${prev.row}). Kept for the first tenant, skipped here.`,
          });
          continue;
        }
        if (!prev) owner.set(k, { tenant: key, row: r });
        if (!t.spots.some((s) => s.floorCode === z.floorCode && s.label === String(n))) accepted.push(n);
      }
      if (wanted && unique.length !== wanted) {
        issues.push({ severity: 'warning', code: 'COUNT_MISMATCH', row: r, column: z.numCol, tenant: name, message: `${z.floorCode}: ${wanted} spot(s) declared but ${unique.length} number(s) listed.` });
      }
      // first `included` numbers are INCLUDED with the office, the rest PAID
      accepted.forEach((n, i) => t!.spots.push({ floorCode: z.floorCode, label: String(n), kind: i < included ? 'INCLUDED' : 'PAID' }));
      const missing = wanted - unique.length;
      if (missing > 0) {
        const inclMissing = Math.max(0, included - Math.min(included, accepted.length));
        const paidMissing = missing - inclMissing;
        if (inclMissing) t.allocations.push({ floorCode: z.floorCode, quantity: inclMissing, kind: 'INCLUDED' });
        if (paidMissing > 0) t.allocations.push({ floorCode: z.floorCode, quantity: paidMissing, kind: 'PAID' });
      }
    }
    if (declared && rowCount !== declared) issues.push({ severity: 'warning', code: 'TOTAL_MISMATCH', row: r, tenant: name, message: `Total column says ${declared} but location counts add up to ${rowCount}.` });
  }

  for (const t of tenants.values()) {
    const total = t.spots.length + t.allocations.reduce((a, b) => a + b.quantity, 0);
    if (total < 2) issues.push({ severity: 'info', code: 'BELOW_MINIMUM', row: t.rows[0], tenant: t.nameAr, message: `Has ${total} spot(s), below the 2-spot minimum — imported as is (exception).` });
    if (!t.officeUnits) issues.push({ severity: 'info', code: 'NO_UNIT', row: t.rows[0], tenant: t.nameAr, message: 'No office unit number.' });
  }

  // ── office units (Sheet4) ──
  const units: ParsedUnit[] = [];
  const unitSheet = wb.worksheets.find((w) => /sheet4/i.test(w.name)) ?? wb.worksheets.find((w) => /level floor/i.test(str(w.getCell('A1'))));
  if (unitSheet) {
    const seen = new Set<string>();
    for (let r = 2; r <= unitSheet.rowCount; r++) {
      const row = unitSheet.getRow(r);
      const floorLabel = str(row.getCell('A'));
      const unitNo = str(row.getCell('B'));
      const area = num(row.getCell('C'));
      if (!floorLabel || !unitNo || /total|الإجمالي/i.test(floorLabel + unitNo) || !area) continue;
      const k = `${floorLabel}#${unitNo}`;
      if (seen.has(k)) {
        issues.push({ severity: 'warning', code: 'DUPLICATE_UNIT', row: r, message: `Unit ${unitNo} on ${floorLabel} listed twice in ${unitSheet.name}.` });
        continue;
      }
      seen.add(k);
      const status = str(row.getCell('F')).replace(/^Avaliable$/i, 'Available') || 'Unknown';
      units.push({ floorLabel, unitNo, area, parkingByContract: Math.round(num(row.getCell('D'))), parkingByArea: Math.round(num(row.getCell('E')) * 100) / 100, status });
    }
  } else issues.push({ severity: 'info', code: 'NO_UNITS_SHEET', message: 'Office units sheet (Sheet4) not found — units skipped.' });

  const list = [...tenants.values()];
  return {
    tenants: list,
    units,
    floorCapacities,
    issues,
    summary: {
      ...summaryOf(issues),
      tenants: list.length,
      rows,
      numberedSpots: list.reduce((a, t) => a + t.spots.length, 0),
      unnumberedSpots: list.reduce((a, t) => a + t.allocations.reduce((x, y) => x + y.quantity, 0), 0),
      declaredTotal: list.reduce((a, t) => a + t.declaredTotal, 0),
      units: units.length,
      byFloor: list.reduce<Record<string, number>>((acc, t) => {
        t.spots.forEach((s) => (acc[s.floorCode] = (acc[s.floorCode] ?? 0) + 1));
        t.allocations.forEach((a) => (acc[a.floorCode] = (acc[a.floorCode] ?? 0) + a.quantity));
        return acc;
      }, {}),
    },
  };
}
