# StickTime FPV — documentation site

This folder is the **user documentation site** for StickTime FPV, written in [Mintlify](https://mintlify.com) format (`docs.json` + MDX pages).

## Preview locally

```sh
npx mintlify dev
```

Run it from this `docs/` folder, then open the printed local URL (usually `http://localhost:3000`).

## Publish on Mintlify

Any of these works — the folder is a self-contained Mintlify project:

1. **Git-connected:** push this repo and connect it in the Mintlify dashboard, setting the docs directory to `docs`.
2. **Mintlify GitHub app:** install the app on the repo and select the `docs/` folder as the deployment root.
3. **CLI deploy:** `npx mintlify deploy` from this folder.

## Layout

| Path | Contents |
| --- | --- |
| `docs.json` | Site config: theme, colors, navigation |
| `*.mdx` | One page per app area (user guide) |
| `images/` | Real screenshots of the app used throughout the pages |

Screenshots are captured with a headless browser against the local dev environment. Re-capture after major UI changes.

## Validate

Before pushing, check that navigation, pages, links and images all line up:

```sh
node validate.mjs   # from inside docs/
```
