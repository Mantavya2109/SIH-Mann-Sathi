/**
 * "Mann Saathi" in the scripts of India's 22 scheduled languages + English.
 *
 * The brand name is TRANSLITERATED (written phonetically in each script),
 * not translated — the way brand names are normally written. Several
 * languages share a script (e.g. Devanagari), so their spellings match;
 * the language name shown next to it tells them apart.
 *
 * Please have native speakers double-check spellings before launch.
 */

export interface IndianLanguage {
  code: string;
  /** Language name in its own script. */
  name: string;
  /** English name, for the menu and screen readers. */
  english: string;
  /** "Mann Saathi" written in this language's script. */
  text: string;
  /** Display font (loaded on demand, subset to just these characters). */
  font: string;
  rtl?: boolean;
}

const DEVANAGARI = '"Tiro Devanagari Hindi", "Tiro Devanagari Marathi", serif';
const BANGLA = '"Tiro Bangla", serif';
const NASTALIQ = '"Noto Nastaliq Urdu", serif';

// Order interleaves scripts so the typing animation keeps changing shape.
export const INDIAN_LANGUAGES: IndianLanguage[] = [
  { code: "en", name: "English", english: "English", text: "Mann Saathi", font: '"Plus Jakarta Sans", Inter, sans-serif' },
  { code: "hi", name: "हिन्दी", english: "Hindi", text: "मन साथी", font: DEVANAGARI },
  { code: "bn", name: "বাংলা", english: "Bengali", text: "মন সাথী", font: BANGLA },
  { code: "ta", name: "தமிழ்", english: "Tamil", text: "மன் சாத்தி", font: '"Tiro Tamil", serif' },
  { code: "te", name: "తెలుగు", english: "Telugu", text: "మన్ సాథీ", font: '"Tiro Telugu", serif' },
  { code: "ur", name: "اردو", english: "Urdu", text: "من ساتھی", font: NASTALIQ, rtl: true },
  { code: "gu", name: "ગુજરાતી", english: "Gujarati", text: "મન સાથી", font: '"Noto Serif Gujarati", serif' },
  { code: "kn", name: "ಕನ್ನಡ", english: "Kannada", text: "ಮನ್ ಸಾಥಿ", font: '"Tiro Kannada", serif' },
  { code: "ml", name: "മലയാളം", english: "Malayalam", text: "മൻ സാഥി", font: '"Noto Serif Malayalam", serif' },
  { code: "pa", name: "ਪੰਜਾਬੀ", english: "Punjabi", text: "ਮਨ ਸਾਥੀ", font: '"Tiro Gurmukhi", serif' },
  { code: "or", name: "ଓଡ଼ିଆ", english: "Odia", text: "ମନ ସାଥୀ", font: '"Noto Serif Oriya", serif' },
  { code: "mr", name: "मराठी", english: "Marathi", text: "मन साथी", font: DEVANAGARI },
  { code: "as", name: "অসমীয়া", english: "Assamese", text: "মন সাথী", font: BANGLA },
  { code: "sat", name: "ᱥᱟᱱᱛᱟᱲᱤ", english: "Santali", text: "ᱢᱚᱱ ᱥᱟᱛᱷᱤ", font: '"Noto Sans Ol Chiki", sans-serif' },
  { code: "ks", name: "کٲشُر", english: "Kashmiri", text: "من ساتھی", font: NASTALIQ, rtl: true },
  { code: "mni", name: "ꯃꯤꯇꯩꯂꯣꯟ", english: "Manipuri", text: "ꯃꯟ ꯁꯥꯊꯤ", font: '"Noto Sans Meetei Mayek", sans-serif' },
  { code: "sd", name: "سنڌي", english: "Sindhi", text: "من ساٿي", font: '"Noto Naskh Arabic", serif', rtl: true },
  { code: "ne", name: "नेपाली", english: "Nepali", text: "मन साथी", font: DEVANAGARI },
  { code: "kok", name: "कोंकणी", english: "Konkani", text: "मन साथी", font: DEVANAGARI },
  { code: "mai", name: "मैथिली", english: "Maithili", text: "मन साथी", font: DEVANAGARI },
  { code: "doi", name: "डोगरी", english: "Dogri", text: "मन साथी", font: DEVANAGARI },
  { code: "brx", name: "बड़ो", english: "Bodo", text: "मन साथी", font: DEVANAGARI },
  { code: "sa", name: "संस्कृतम्", english: "Sanskrit", text: "मन साथी", font: DEVANAGARI },
];

/**
 * One Google Fonts request for every script, subset (`text=`) to only the
 * characters used above — a few KB instead of megabytes of full fonts.
 */
export function loadIndianScriptFonts() {
  if (typeof document === "undefined" || document.getElementById("indian-script-fonts")) return;
  const chars = Array.from(new Set(INDIAN_LANGUAGES.flatMap((l) => Array.from(l.text + l.name)))).join("");
  const families = [
    "Tiro+Devanagari+Hindi",
    "Tiro+Devanagari+Marathi",
    "Tiro+Bangla",
    "Tiro+Tamil",
    "Tiro+Telugu",
    "Tiro+Kannada",
    "Tiro+Gurmukhi",
    "Noto+Serif+Gujarati",
    "Noto+Serif+Oriya",
    "Noto+Serif+Malayalam",
    "Noto+Nastaliq+Urdu",
    "Noto+Naskh+Arabic",
    "Noto+Sans+Ol+Chiki",
    "Noto+Sans+Meetei+Mayek",
  ];
  const link = document.createElement("link");
  link.id = "indian-script-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?" +
    families.map((f) => `family=${f}`).join("&") +
    `&text=${encodeURIComponent(chars)}&display=swap`;
  document.head.appendChild(link);
}

/** Split into user-perceived characters so conjuncts/matras type as a unit. */
export function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (t: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  return Array.from(text);
}
