# Hero delivery copy — September 27, 2026

The full 47.667-second owner-published film remains in MongoDB. Its delivery copy is a muted H.264 MP4 with front-loaded playback metadata, served as a content-named static asset through Vercel's existing immutable `/assets/` cache policy. This removes database and function round trips from video and initial-poster requests.

Original SHA-256: `bbced6d452946e5566ae0b5dbf42f2e9593d535138fc1bc59dc36aec43421a6a`

Encoding command (no trim or crop):

```sh
ffmpeg -i original.mov -map 0:v:0 -an -vf 'fps=24,scale=540:-2' -c:v libx264 -preset slow -crf 29 -maxrate 950k -bufsize 1900k -pix_fmt yuv420p -movflags +faststart opening.mp4
```

The original selected poster is copied byte-for-byte. The server chooses the video rendition only when the current upload's hashed identity matches the source. Replacing the film automatically selects the new upload; changing its title or fit retains the matching rendition. Changing the poster or publishing any later revision stops selecting the copied first-revision poster. Nothing writes to or changes the original media records.

New uploaded films continue through the existing editor and media service. To optimize a future film, generate a delivery copy and add its exact source identity and content-named assets rather than matching a revision number alone.

Autoplay remains muted and inline. The player checks its actual initial viewport immediately, and still honors Pause, reduced motion, page visibility, and browser autoplay restrictions. No implementation can promise zero network or decoding time on every device.
