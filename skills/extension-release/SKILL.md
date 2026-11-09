---
name: extension-release
description: Use when preparing, packaging, reviewing, or publishing a prerelease of this browser extension.
---

# Extension release

1. Read `AGENTS.md`, `CONTRIBUTING.md`, `CONTRACT.md`, `plan.md`, `CHANGELOG.md`, `PRIVACY.md`, and `docs/roadmap.md`. Confirm the release scope, supported browser versions, source-list revisions, license notes, and known issues against the current checkout.
2. Use the mise-pinned Bun 1.4.4 and its built-in `bun fmt --check`; `bun lint` is the repository's own check. Run every gate through mise and record its actual result:

   ```sh
   mise exec -- bun fmt --check
   mise exec -- bun lint
   mise exec -- bun test
   mise exec -- bun run build
   mise exec -- bun run check
   mise exec -- bun run test:browser
   mise exec -- bun run benchmark
   ```

3. Test the release build in real Chrome, Brave, and Firefox. Review generated manifests and permissions, then verify the Chromium and Firefox packages against their exact source revision. Produce and check SHA-256 checksums for every artifact.
4. Update the changelog and release notes with only verified behavior and limitations. Keep DNS described as manual setup plus endpoint diagnostic, proxy routing scoped by destination host, and HTTP/2, HTTP/3, and QUIC behavior browser-controlled. Do not promise CAPTCHA bypass or fingerprint anonymity.
5. Prepare a clearly labeled prerelease for [fun-ed/blahdns-browser-extension](https://github.com/fun-ed/blahdns-browser-extension). GitHub ZIPs are for manual installation; they are not signed store packages. Firefox needs a signed XPI for permanent installation; this prerelease uses temporary add-on loading. Store signing, review, and submission require a separate release path and explicit authorization.
6. Give manual install steps for the artifact layout. Chrome/Brave use `chrome://extensions`, Developer mode, then **Load unpacked** with the extracted Chromium folder that contains `manifest.json`. Firefox uses `about:debugging#/runtime/this-firefox`, **Load Temporary Add-on**, then `manifest.json` in the extracted Firefox folder. Only source builds use the paths `dist/chromium` and `dist/firefox`. Temporary Firefox installs end at restart.
7. If a required browser or release service is unavailable, mark that gate blocked and keep the release status pending. Never publish a check as passed without evidence.
