# Bubble Experience

Full-screen interactive bubble soundboard — pop rising bubbles to play random field recordings. Touch or click to spawn more.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Append `?debug=1` to try individual sounds from a toolbar at the top.

## Build

```bash
npm run build
npm run preview
```

## GitHub Pages

The site deploys automatically on push to `main` via GitHub Actions (to the `gh-pages` branch).

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages** and set **Source** to **Deploy from a branch**.
3. Choose branch **`gh-pages`** and folder **`/ (root)`**, then save.
4. After the workflow runs, the site is live at [https://loehx.github.io/bubble-experience/](https://loehx.github.io/bubble-experience/).

## Audio trimming

Trim leading silence from recordings in `src/soundboard/sounds/`:

```bash
./scripts/trim-soundboard-audio.sh start
```
