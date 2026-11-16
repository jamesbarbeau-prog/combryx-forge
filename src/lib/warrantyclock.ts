// Tarion warranty form calendar for a home. Warranty start = possession / closing date = day 0.
// Current Tarion schedule (homes with a warranty start on or after 1 May 2024): items are submitted to the builder
// automatically at day 41 (Initial), day 183 (Mid-Year) and day 365 (Year-End); every submission opens a 120-day builder
// repair period (BRP). Second-Year items can be submitted at any time in year two. Where Tarion's own BRP date is on the case it wins.
// These are reminder dates, not legal advice — the real dates come from Tarion (BuilderLink) once synced.
export type FormId = 'initial' | 'mid_year' | 'year_end' | 'second_year';
export const BRP_DAYS = 120;
export const FORMS: { id: FormId; label: string; short: string; submitDay: number; color: string }[] = [
  { id: 'initial',     label: 'Initial form',     short: 'Initial',     submitDay: 41,  color: '#1E5FC8' },
  { id: 'mid_year',    label: 'Mid-Year form',    short: 'Mid-Year',    submitDay: 183, color: '#7AAEF0' },
  { id: 'year_end',    label: 'Year-End form',    short: 'Year-End',    submitDay: 365, color: '#F2B134' },
  { id: 'second_year', label: 'Second-Year form', short: 'Second-Year', submitDay: 730, color: '#16A34A' },
];
export const FORM_BY_ID = Object.fromEntries(FORMS.map(f => [f.id, f])) as Record<FormId, (typeof FORMS)[number]>;
const DAY = 86400000;
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const parseDay = (s: string | null | undefined): Date | null => { if (!s) return null; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);

export interface FormCase { id: string; case_number: string; type: string | null; status: string; opened: string | null; closed: string | null; brp_end: string | null; items: number; open: number }
export type FormState = 'upcoming' | 'brp' | 'expired' | 'done';
export interface StageInfo { id: FormId; submit: Date; brpEnd: Date; state: FormState; daysToSubmit: number; daysLeft: number; fromTarion: boolean; cases: FormCase[]; open: number; items: number }

export function stagesFor(start: Date | null, cases: FormCase[], today = new Date()): StageInfo[] {
  if (!start) return [];
  return FORMS.map(f => {
    const cs = cases.filter(c => c.type === f.id);
    const tarion = parseDay(cs.map(c => c.brp_end).find(Boolean) ?? null);
    const submit = f.id === 'second_year' ? addDays(start, 366) : addDays(start, f.submitDay);
    const brpEnd = tarion ?? addDays(f.id === 'second_year' ? addDays(start, 730) : submit, BRP_DAYS);
    const open = cs.reduce((n, c) => n + c.open, 0), items = cs.reduce((n, c) => n + c.items, 0);
    const toSubmit = daysBetween(today, submit), left = daysBetween(today, brpEnd);
    let state: FormState = toSubmit > 0 ? 'upcoming' : left >= 0 ? 'brp' : 'expired';
    if (cs.length && items > 0 && open === 0 && toSubmit <= 0) state = 'done';
    return { id: f.id, submit, brpEnd, state, daysToSubmit: toSubmit, daysLeft: left, fromTarion: !!tarion, cases: cs, open, items };
  });
}
/** The form the home is "at" now: the latest form whose submission day has passed; before day 41 it is still pre-Initial. */
export function currentForm(start: Date | null, today = new Date()): FormId | 'pre' | 'msd' | null {
  if (!start) return null;
  const d = daysBetween(start, today);
  if (d < 41) return 'pre'; if (d < 183) return 'initial'; if (d < 365) return 'mid_year'; if (d < 730) return 'year_end';
  return d < 366 + 365 * 5 ? 'second_year' : 'msd';
}
export const fmtDay = (d: Date) => d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
