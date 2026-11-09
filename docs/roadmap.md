# Roadmap

Current release: [0.2.5 preview](https://github.com/fun-ed/blahdns-browser-extension/releases/tag/v0.2.5). See [verified behavior and limits](evals/0.2.5/acceptance-output.md).

Before extending compatibility claims:

- Test the declared minimum browser versions and native optional-permission dialogs.
- Verify natural Firefox event-page idle recovery; the current wake test covers forced crash recovery.
- Test HTTPS and SOCKS4 proxies, authenticated endpoints, WebRTC media and HTTP/2/HTTP/3/QUIC with controlled fixtures.
- Measure browser-native fingerprint protection and site compatibility without collecting browsing history.

Store distribution requires the owner's store accounts, Mozilla signing and a separate submission process.
