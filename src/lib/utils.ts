import { clsx, type ClassValue } from 'clsx';
import { format, parseISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtCurrency(value?: number | null, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

export function fmtNumber(value?: number | null) {
  return new Intl.NumberFormat('en-CA').format(value ?? 0);
}

export function fmtPercent(value?: number | null) {
  return `${Math.round(value ?? 0)}%`;
}

export function fmtDate(value?: string | Date | null, pattern = 'MMM d, yyyy') {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  return format(date, pattern);
}

export function toIsoDate(value?: string | Date | null) {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>((acc, value) => acc + (value ?? 0), 0);
}