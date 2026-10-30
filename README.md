# TrafficHopper

Welche Spur ist im Stau schneller? TrafficHopper sagt dir, ob du **links, rechts oder in der Mitte** bleiben bzw. wechseln sollst.

**Live:** https://nephlonor.github.io/TrafficHopper/

## So funktioniert's

1. Anzahl Spuren wählen und die eigene Spur antippen.
2. Antippen, wenn eine Nachbarspur **an dir vorbeizieht** oder **du sie überholst**. Ältere Beobachtungen verlieren nach ~2 Minuten an Gewicht.
3. Optional die Situation angeben: Einfahrt voraus, Ausfahrt mit Rückstau, endende Spur, Unfall, LKW-Spuren.
4. Die App empfiehlt immer nur **einen** Spurwechsel auf einmal und nur dann, wenn der Vorteil die Kosten des Wechsels übersteigt.
5. Im **Stillstand** gibt es nie eine Wechselempfehlung, dann gilt: Rettungsgasse bilden.

Alles läuft lokal im Browser, es werden keine Daten gesendet. Als PWA installierbar und offline nutzbar.

> ⚠️ Nur als Beifahrer:in oder im Stillstand bedienen. Die Empfehlung ist eine Heuristik, keine Garantie.

## Entwicklung

Keine Abhängigkeiten, kein Build.

```bash
npm start   # http://localhost:8080
npm test    # Unit-Tests der Empfehlungslogik (node --test)
```

## Deployment

Jeder Push auf `main` testet und deployt per GitHub Actions auf GitHub Pages (`.github/workflows/deploy.yml`).
Einmalig nötig: *Settings → Pages → Source: **GitHub Actions***.
