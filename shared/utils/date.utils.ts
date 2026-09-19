export const MONTH_MAP: Record<string, string> = {
  'janvier': '01', 'janv': '01', 'jan': '01', 'gennaio': '01', 'gen': '01',
  'fevrier': '02', 'fevr': '02', 'fev': '02', 'febbraio': '02', 'feb': '02',
  'mars': '03', 'marzo': '03', 'mar': '03',
  'avril': '04', 'avr': '04', 'aprile': '04', 'apr': '04',
  'mai': '05', 'maggio': '05', 'mag': '05',
  'juin': '06', 'giugno': '06', 'giu': '06',
  'juillet': '07', 'juil': '07', 'jul': '07', 'luglio': '07', 'lug': '07',
  'aout': '08', 'aou': '08', 'agosto': '08', 'ago': '08',
  'septembre': '09', 'sept': '09', 'sep': '09', 'settembre': '09', 'sett': '09', 'set': '09',
  'octobre': '10', 'oct': '10', 'ottobre': '10', 'ott': '10',
  'novembre': '11', 'nov': '11',
  'decembre': '12', 'dec': '12', 'dicembre': '12', 'dic': '12',
};

export function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function parseDateToIso(rawDate?: string): string | undefined {
  if (!rawDate) return undefined;

  const cleaned = rawDate.trim().replace(/\./g, '');

  // 1. Direct match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // 2. Direct match DD/MM/YYYY
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // 3. Textual date parsing (French / Italian) e.g. "vendredi 28 août 2026", "martedì 1 settembre 2026"
  const tokens = cleaned.split(/\s+/);
  let year: string | undefined;
  let month: string | undefined;
  let day: string | undefined;

  for (const token of tokens) {
    if (/^\d{4}$/.test(token)) {
      year = token;
    } else if (/^\d{1,2}$/.test(token) && !day) {
      day = token.padStart(2, '0');
    } else {
      const normalizedToken = normalizeText(token);
      if (MONTH_MAP[normalizedToken]) {
        month = MONTH_MAP[normalizedToken];
      }
    }
  }

  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }

  return rawDate;
}

export function parseUmapDateRange(datePart: string): { startDate?: string; endDate?: string } {
  const cleaned = datePart.trim();

  // 1. Multi-day range: e.g. "5-7 dicembre 2026", "17-29 settembre 2026", "25-29 agosto 2026"
  const rangeMatch = cleaned.match(
    /(\d{1,2})\s*-\s*(\d{1,2})\s+([a-zA-Z\u00C0-\u017F]+)\s+(\d{4})/i,
  );
  if (rangeMatch) {
    const [, d1, d2, monthRaw, y] = rangeMatch;
    const normalizedMonth = normalizeText(monthRaw);
    const m = MONTH_MAP[normalizedMonth];
    if (m) {
      return {
        startDate: `${y}-${m}-${d1.padStart(2, '0')}`,
        endDate: `${y}-${m}-${d2.padStart(2, '0')}`,
      };
    }
  }

  // 2. Single day with potential weekday: e.g. "14 maggio 2027", "Domenica 17 dicembre 2026", "Martedì 1 settembre 2026"
  const singleMatch = cleaned.match(
    /(\d{1,2})\s+([a-zA-Z\u00C0-\u017F]+)\s+(\d{4})/i,
  );
  if (singleMatch) {
    const [, d, monthRaw, y] = singleMatch;
    const normalizedMonth = normalizeText(monthRaw);
    const m = MONTH_MAP[normalizedMonth];
    if (m) {
      const iso = `${y}-${m}-${d.padStart(2, '0')}`;
      return { startDate: iso, endDate: iso };
    }
  }

  // 3. Fallback to parseDateToIso
  const fallbackIso = parseDateToIso(cleaned);
  if (fallbackIso) {
    return { startDate: fallbackIso, endDate: fallbackIso };
  }

  return {};
}
