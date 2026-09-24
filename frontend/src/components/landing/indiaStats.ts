/**
 * Real, sourced figures shown while the globe is centred on India.
 * Update these when newer reports come out (NCRB publishes "Crime in India"
 * yearly; NJDG pendency is live at njdg.ecourts.gov.in).
 */

export interface StatCard {
  /** Number to count up to. */
  value: number;
  /** How to print the number (Indian digit grouping by default). */
  format?: (n: number) => string;
  suffix?: string;
  label: string;
  source: string;
  icon: "shield" | "gavel" | "mind" | "doctor";
}

const inr = (n: number) => Math.round(n).toLocaleString("en-IN");

const CARDS: StatCard[] = [
  {
    value: 448211,
    label: "crimes against women registered in a single year",
    source: "NCRB, Crime in India 2023",
    icon: "shield",
  },
  {
    value: 5.05,
    format: (n) => n.toFixed(2),
    suffix: " crore",
    label: "cases pending across Indian courts",
    source: "NJDG, via Supreme Court report, Dec 2023",
    icon: "gavel",
  },
  {
    value: 92,
    format: (n) => `70–${Math.max(70, Math.round(n))}`,
    suffix: "%",
    label: "of people with mental disorders get no treatment",
    source: "National Mental Health Survey 2015–16",
    icon: "mind",
  },
  {
    value: 0.75,
    format: (n) => n.toFixed(2),
    label: "psychiatrists for every 1 lakh people",
    source: "National Mental Health Survey 2015–16",
    icon: "doctor",
  },
];

export const STAT_CARDS: (StatCard & { format: (n: number) => string })[] = CARDS.map((c) => ({ format: inr, ...c }));

/** Top 5 states by crimes against women registered, NCRB Crime in India 2023. */
export interface StateMarker {
  name: string;
  lat: number;
  lng: number;
  cases: number;
  /** Short state code, used on phones. */
  short: string;
  /** Where the label sits relative to the dot, in px (fanned out so labels don't overlap). */
  label: [number, number];
}

export const STATE_MARKERS: StateMarker[] = [
  { name: "Uttar Pradesh", short: "UP", lat: 26.85, lng: 80.95, cases: 66381, label: [70, -80] },
  { name: "Maharashtra", short: "MH", lat: 19.45, lng: 75.7, cases: 47101, label: [-120, 80] },
  { name: "Rajasthan", short: "RJ", lat: 26.6, lng: 73.9, cases: 45450, label: [-110, -70] },
  { name: "West Bengal", short: "WB", lat: 23.1, lng: 87.9, cases: 34691, label: [90, 30] },
  { name: "Madhya Pradesh", short: "MP", lat: 23.4, lng: 78.0, cases: 32342, label: [-150, 5] },
];

export const STATE_MARKERS_CAPTION = "Crimes against women registered, 2023 · NCRB";
