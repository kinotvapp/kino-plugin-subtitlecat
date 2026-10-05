# SubtitleCat -- a Kino subtitle plugin

Adds [SubtitleCat](https://www.subtitlecat.com) to Kino's **Buscar subtítulos en línea** (phone and TV), for any movie
or episode, from any source. Subtitles only: this plugin plays nothing (`"capabilities": ["subtitles"]`).

## En español (lo que ve la persona)

Instálalo desde **Plugins ▸ Recomendados**, o en **Plugins ▸ +** pega `kinotvapp/kino-plugin-subtitlecat`. Después,
en el reproductor, toca **Subtítulos ▸ Buscar subtítulos en línea**: aparecen los de SubtitleCat bajo su nombre. La
mayoría son **traducciones automáticas** de un original (casi siempre en inglés); Kino los marca "(traducido)" y los
pone después de los hechos por personas del mismo idioma. "(Latinoamérica)" es la versión `es-419`.

## How it works

1. **The original title.** Kino's `title` is often the Spanish one ("El origen") while SubtitleCat names releases by
   their original name. The plugin asks Stremio's public Cinemeta (`v3-cinemeta.strem.io/meta/<type>/<imdbId>.json`,
   no key) for the original title, cached a month. Without an IMDb id it uses Kino's title.
2. **Search.** `index.php?search=<Title Year>` (or `<Title SxxEyy>`), and only releases whose name holds **every word of
   the title and the year** (or the episode's `SxxEyy`) are kept: a search that matches loosely never brings another
   title's subtitles. The release closest to the playing file's name (`file.name`, when Kino knows it) goes first.
3. **Files.** Up to 3 release pages are read; each links one ready `.srt` per language
   (`/subs/<n>/<release>-<lang>.srt`). Languages the site would only translate in the browser are skipped. Up to 4
   tracks per language, the person's languages first.

Hosts: `www.subtitlecat.com` (and `subtitlecat.com`, which redirects there) and `v3-cinemeta.strem.io`.

## Develop and test

```
node sdk/validate.mjs .
node --test test/plugin.test.mjs
node sdk/run.mjs . subtitles '{"imdbId":"tt1375666","kind":"movie","title":"El origen","year":2010,"languages":["es","en"]}'
node sdk/run.mjs . subtitles '{"imdbId":"tt0903747","kind":"series","season":1,"episode":5,"title":"Breaking Bad","languages":["es"]}'
```
