# Mistri AI — Landing page

A self-contained static marketing site for Mistri AI. No build step — plain HTML + CSS,
using the same design language as the app (Geist type, black `M` mark, black primary
buttons, `#2f6feb` brand accent, mono micro-labels).

## Preview

Open `index.html` directly, or serve the folder:

```bash
npx serve website
# or
python3 -m http.server -d website 4321
```

## Files

- `index.html` — the page (nav, hero + product mockup, features, how-it-works, open-source, CTA, footer)
- `styles.css` — design tokens + styles, mirrored from `apps/frontend/src/index.css`
- `favicon.svg` — the black `M` mark

## Notes

- **CTA links** (`Get started`, `Sign in`) point at the dev app: `http://localhost:5174/register`
  and `/login`. Update these hrefs to your deployed app URL before publishing.
- Fonts (Geist / Geist Mono) load from Google Fonts.
