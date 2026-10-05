// SubtitleCat (https://www.subtitlecat.com) for Kino's online subtitle search.
//
// The site is a search over subtitle releases, each with its own page that links one ready .srt per language
// (`/subs/<n>/<release>-<lang>.srt`). Most are machine translations of one original ("translated from English"): those
// go as `translated: true`, so Kino lists them after person-made tracks of the same language. Languages the site would
// translate only in the browser ("Translate" buttons) have no file and are skipped.
//
// SubtitleCat names everything by its original (mostly English) release name, while Kino's `title` is often the
// Spanish one ("El origen"): searched as is, the site answers unrelated (even adult) releases. So the title is the
// original one from Cinemeta (Stremio's public metadata, by the IMDb id Kino always sends), and a release is only kept
// when its name holds every word of that title and the year (or the episode's SxxEyy).

const BASE = "https://www.subtitlecat.com";
const PAGES = 3;          // release pages read per search: Kino gives the whole call 10 s
const PER_LANGUAGE = 4;   // tracks kept per language

// The site's language names (search rows: "translated from English") as ISO 639-1.
const NAMES = { english: "en", spanish: "es", portuguese: "pt", french: "fr", german: "de", italian: "it", dutch: "nl",
  russian: "ru", arabic: "ar", turkish: "tr", polish: "pl", romanian: "ro", greek: "el", hebrew: "he", chinese: "zh",
  japanese: "ja", korean: "ko", indonesian: "id", vietnamese: "vi", thai: "th", hungarian: "hu", czech: "cs",
  swedish: "sv", danish: "da", finnish: "fi", norwegian: "no", ukrainian: "uk", persian: "fa", croatian: "hr",
  serbian: "sr", bulgarian: "bg", malay: "ms" };

function unescapeHtml(s) {
  return String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

const CINEMETA = "https://v3-cinemeta.strem.io/meta/";
const STOP = { the: 1, a: 1, an: 1, of: 1, and: 1, el: 1, la: 1, los: 1, las: 1, de: 1, y: 1 };

// The title's significant words, accents folded ("Amélie" → amelie).
export function titleWords(title) {
  return String(title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((w) => w && !STOP[w]);
}

// The original title from Cinemeta by IMDb id, cached a month; null when unknown (the caller then uses Kino's title).
export async function originalTitle(imdbId, kind) {
  if (!/^tt\d{5,10}$/.test(String(imdbId || ""))) return null;
  const key = "title:" + imdbId;
  const cached = kino.storage.get(key);
  if (cached) return cached;
  try {
    const r = await kino.fetch(CINEMETA + (kind === "series" ? "series/" : "movie/") + imdbId + ".json", { timeoutMs: 2500 });
    if (!r.ok) return null;
    const name = r.json().meta && r.json().meta.name;
    if (typeof name !== "string" || !name.trim()) return null;
    kino.storage.set(key, name.trim(), { ttlMs: 30 * 24 * 3600 * 1000 });
    return name.trim();
  } catch (e) {
    return null;
  }
}

// What to search: "Title Year" for a movie, "Title SxxEyy" for an episode.
export function queryFor(a) {
  const title = String(a.title || "").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
  if (!title) return null;
  if (a.kind === "series") {
    const s = parseInt(a.season, 10), e = parseInt(a.episode, 10);
    if (!(s > 0 && e > 0)) return null;
    return title + " S" + String(s).padStart(2, "0") + "E" + String(e).padStart(2, "0");
  }
  return a.year ? title + " " + a.year : title;
}

// The search page's rows: [{ path, release, from }] (from: the original's language code, or "").
export function parseResults(html) {
  const out = [];
  const re = /<a href="(subs\/\d+\/[^"]+\.html)">([^<]{1,300})<\/a>\s*(?:\(translated from ([A-Za-z ]+)\))?/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({ path: unescapeHtml(m[1]), release: unescapeHtml(m[2]).trim(), from: NAMES[String(m[3] || "").trim().toLowerCase()] || "" });
  }
  return out;
}

function tokens(s) { return String(s || "").toLowerCase().replace(/\.[a-z0-9]{2,4}$/, "").split(/[^a-z0-9]+/).filter((t) => t.length > 1); }

// Rows for this title, best first: an episode's SxxEyy (or a movie's year) must be in the release; then the releases
// sharing the most words with the playing file's name, then the site's own order.
export function rank(rows, a) {
  const s = parseInt(a.season, 10), e = parseInt(a.episode, 10);
  const sxe = a.kind === "series" && s > 0 && e > 0
    ? new RegExp("s0?" + s + "[ ._-]?e0?" + e + "(?!\\d)", "i") : null;
  const year = a.kind !== "series" && a.year ? String(a.year) : null;
  const words = titleWords(a.title);
  // Every title word in the release name, and the year or SxxEyy: never a release of another title.
  let kept = rows.filter((r) => {
    const rel = new Set(titleWords(r.release));
    if (!words.length || !words.every((w) => rel.has(w))) return false;
    if (sxe) return sxe.test(r.release);
    return year ? r.release.indexOf(year) >= 0 : true;
  });
  const file = new Set(tokens(a.file && a.file.name));
  const score = (r) => tokens(r.release).filter((t) => file.has(t)).length;
  return kept.map((r, i) => ({ r, i, s: score(r) })).sort((x, y) => (y.s - x.s) || (x.i - y.i)).map((x) => x.r);
}

// A release page's ready files: [{ lang, region, url }] ("es-419" is lang "es", region "419").
export function parseFiles(html) {
  const out = [], seen = {};
  const re = /href="(\/subs\/\d+\/[^"]+?-([a-z]{2,3})(?:-([A-Za-z0-9]{2,4}))?\.srt)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[2] === "orig" || seen[m[1]]) continue;
    seen[m[1]] = 1;
    out.push({ lang: m[2], region: m[3] || "", url: BASE + encodeURI(unescapeHtml(m[1])).replace(/%25/g, "%") });
  }
  return out;
}

async function get(path, timeoutMs) {
  const r = await kino.fetch(BASE + "/" + path.replace(/^\//, ""), { timeoutMs, headers: { Accept: "text/html" } });
  if (!r.ok) throw kino.error(r.status === 404 ? "not_found" : "unavailable", "SubtitleCat respondió " + r.status);
  return r.text();
}

export async function subtitles(args) {
  const given = args || {};
  const original = await originalTitle(given.imdbId, given.kind);
  const a = Object.assign({}, given, original ? { title: original } : {});
  const query = queryFor(a);
  if (!query) return [];
  const rows = rank(parseResults(await get("index.php?search=" + encodeURIComponent(query), 4000)), a).slice(0, PAGES);
  if (!rows.length) return [];
  const pages = await Promise.all(rows.map((r) => get(r.path, 4500).then(parseFiles, () => [])));
  const wanted = (Array.isArray(a.languages) && a.languages.length ? a.languages : ["es", "en"]).map((l) => String(l).toLowerCase());
  const out = [], perLang = {};
  wanted.forEach((lang) => {
    rows.forEach((row, i) => {
      pages[i].filter((f) => f.lang === lang).forEach((f) => {
        if ((perLang[lang] || 0) >= PER_LANGUAGE) return;
        perLang[lang] = (perLang[lang] || 0) + 1;
        const region = f.region === "419" ? " (Latinoamérica)" : f.region ? " (" + f.region + ")" : "";
        const track = { lang, url: f.url, format: "srt", label: (row.release + region).slice(0, 60) };
        if (row.from && row.from !== lang) track.translated = true;
        out.push(track);
      });
    });
  });
  return out.slice(0, 30);
}
