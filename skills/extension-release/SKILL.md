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

3. Test the release build in real Chrome, Brave, and Firefox. Review generated manifests and permissions, then verify Chromium ZIP, Firefox ZIP and unsigned Firefox XPI against their exact source revision. Require XPI and Firefox ZIP to be byte-identical, test the unmodified XPI in Firefox, and produce SHA-256 checksums for every artifact. Also verify both UI appearances and the manually updated default-list cache.
4. Update the changelog and release notes with only verified behavior and limitations. Keep DNS described as manual setup plus endpoint diagnostic, proxy routing scoped by destination host, and HTTP/2, HTTP/3, and QUIC behavior browser-controlled. Do not promise CAPTCHA bypass or fingerprint anonymity.
5. Prepare a clearly labeled prerelease for [fun-ed/blahdns-browser-extension](https://github.com/fun-ed/blahdns-browser-extension). GitHub ZIPs and unsigned XPI are development packages. Ordinary Firefox requires Mozilla signing for permanent installation. Store signing, review, submission, and CRX key generation require a separate release path and explicit authorization. Preserve previous release tags and package bytes.
6. Give manual install steps for the artifact layout. Chrome/Brave use `chrome://extensions`, Developer mode, then **Load unpacked** with the extracted Chromium folder containing `manifest.json`. Firefox uses `about:debugging#/runtime/this-firefox`, **Load Temporary Add-on**, then the intact unsigned XPI or `manifest.json` in the extracted Firefox ZIP. Only source builds use `dist/chromium` and `dist/firefox`. Temporary Firefox installs end at restart.
7. If a required browser or release service is unavailable, mark that gate blocked and keep the release status pending. Never publish a check as passed without evidence.
