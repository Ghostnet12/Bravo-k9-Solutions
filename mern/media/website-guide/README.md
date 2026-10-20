# Public website tutorial

The approved 9:14 website walkthrough is stored losslessly in ordered binary parts so each source upload fits the repository connector’s request size. These are public tutorial assets using a demo account, not paid lessons or member recordings.

`npm run build` and `npm run dev` reassemble the original MP4 in `client/public/assets/` and verify its byte length and SHA-256 before Vite runs. `manifest.json` is the source of truth. The generated MP4 is ignored by Git; do not edit individual parts. Captions, poster and chapter/transcript data are tracked alongside the page.
