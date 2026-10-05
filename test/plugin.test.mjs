// node --test test/plugin.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseResults, parseFiles, rank, queryFor, titleWords } from "../plugin.js";

const search = readFileSync(new URL("./fixtures/search-inception.html", import.meta.url), "utf8");
const release = readFileSync(new URL("./fixtures/release-inception.html", import.meta.url), "utf8");

test("search rows carry the release page, its name and the original's language", () => {
  const rows = parseResults(search);
  assert.ok(rows.length >= 5);
  assert.deepEqual(rows[0], { path: "subs/1655/Inception.2010.1080p.BrRip.x264.html", release: "Inception.2010.1080p.BrRip.x264", from: "en" });
});

test("a release page gives one ready .srt per language, es-419 as Spanish with its region, never the -orig file", () => {
  const files = parseFiles(release);
  const es = files.filter((f) => f.lang === "es");
  assert.deepEqual(es.map((f) => f.region).sort(), ["", "419"]);
  assert.ok(es.every((f) => f.url.startsWith("https://www.subtitlecat.com/subs/") && f.url.endsWith(".srt")));
  assert.ok(!files.some((f) => /-orig\.srt$/.test(f.url)));
});

test("only releases of THIS title are kept: every title word and the year, or the episode's SxxEyy", () => {
  const rows = [
    { path: "a", release: "Inception.2010.1080p.BrRip.x264", from: "en" },
    { path: "b", release: "Alexa Poshspicy Esposa engaña a su esposo", from: "es" },
    { path: "c", release: "Inception.Making.Of.2011", from: "en" },
    { path: "d", release: "The.Origin.2010", from: "en" },
  ];
  assert.deepEqual(rank(rows, { kind: "movie", title: "Inception", year: 2010 }).map((r) => r.path), ["a"]);
  const eps = [
    { path: "x", release: "Breaking.Bad.S01E05.720p", from: "en" },
    { path: "y", release: "Breaking.Bad.S01E50.720p", from: "en" },
    { path: "z", release: "Breaking.Bad.S01E04.720p", from: "en" },
  ];
  assert.deepEqual(rank(eps, { kind: "series", title: "Breaking Bad", season: 1, episode: 5 }).map((r) => r.path), ["x"]);
});

test("the release closest to the playing file's name comes first", () => {
  const rows = [
    { path: "a", release: "Inception.2010.720p.BluRay", from: "en" },
    { path: "b", release: "Inception.2010.1080p.BrRip.x264.YIFY", from: "en" },
  ];
  const ranked = rank(rows, { kind: "movie", title: "Inception", year: 2010, file: { name: "Inception.2010.1080p.BrRip.x264.YIFY.mp4" } });
  assert.equal(ranked[0].path, "b");
});

test("the query is Title Year or Title SxxEyy; title words fold accents and drop articles", () => {
  assert.equal(queryFor({ kind: "movie", title: "Inception", year: 2010 }), "Inception 2010");
  assert.equal(queryFor({ kind: "series", title: "Breaking Bad", season: 1, episode: 5 }), "Breaking Bad S01E05");
  assert.equal(queryFor({ kind: "series", title: "Breaking Bad" }), null);
  assert.deepEqual(titleWords("Le Fabuleux Destin d'Amélie"), ["le", "fabuleux", "destin", "d", "amelie"]);
  assert.deepEqual(titleWords("The Lord of the Rings"), ["lord", "rings"]);
});
