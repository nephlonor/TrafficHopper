# TrafficHopper – Hinweise für Claude

Statische PWA (Vanilla JS, ES-Module, kein Build), deployt auf GitHub Pages via Actions.

## Struktur
- `js/advisor.js` – reine Empfehlungslogik, kein DOM. Alle Regeln/Gewichte hier, immer mit Tests in `tests/advisor.test.js`.
- `js/app.js` – UI, State (localStorage, in try/catch), Rendering.
- `index.html`, `css/style.css` – Mobile-first, Dark-Mode als Standard.
- `sw.js` – Offline-Cache. **`CACHE`-Version erhöhen**, wenn Assets sich ändern; neue Dateien in `ASSETS` eintragen.
- `.github/workflows/deploy.yml` – Tests + Pages-Deploy. Neue Top-Level-Ordner/Dateien im Schritt „Collect site files“ ergänzen.
- `ROADMAP.md` – Phasen; aktuelle Phase dort pflegen.

## Regeln
- UI-Texte auf Deutsch, Code/Kommentare auf Englisch.
- Spuren werden von links gezählt (0 = linke Spur).
- Sicherheit vor Zeitgewinn: im Stillstand nie einen Wechsel empfehlen, immer nur einen Spurwechsel auf einmal.
- Vor dem Commit: `npm test`.
