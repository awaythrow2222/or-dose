# OR Dose (web)

Weight-based anesthesia dose/volume calculator with a pediatric section. Static site: plain HTML/CSS/JS, no build step, no dependencies, no network calls.

## Run locally
    python3 -m http.server 8765      # then open http://localhost:8765
    node tests/run.js                # calculation checks

## Use on an iPhone
Host the folder over HTTPS (GitHub Pages, Netlify, Cloudflare Pages, or any static host), open it in Safari,
then Share → Add to Home Screen. It launches full-screen and, once loaded, works offline (service worker).
Offline mode needs HTTPS (localhost counts); opening index.html straight from disk works but is online-only.

## Updating
Edit the files, then bump `CACHE` in `sw.js` (e.g. `ordose-v4`) so installed copies refresh.

## Screens
- **Home**: age, weight, height, starting Hgb, NPO time (+ sex) → ETT depth, maintenance rate and NPO deficit, tidal volume 4–6 mL/kg PBW, induction doses (propofol, rocuronium, succinylcholine), max allowable blood loss.
- **Adult**: Meds (full list) and Calcs (more tidal volumes, both ETT-depth formulas, fluids by weight basis, blood-loss with editable blood volume).
- **Pediatrics** and **Info**.

## Files
- `calc.js`  body-weight formulas, dose/volume math, pediatric estimates (UI-free, unit-tested)
- `data.js`  default drug table — review against your formulary before clinical use
- `app.js`, `index.html`, `styles.css`  the interface
- `sw.js`, `manifest.webmanifest`, `icons/`  offline + home-screen install
