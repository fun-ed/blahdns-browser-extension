# Selector structure and enabled proxy status

Target: 0.2.2. Core change, authorized as continuation of the fixes and publication.

Keep validation in the background-side parser. Track quotes, backslash escapes and a stack of bracket/parenthesis closers; reject incomplete or crossed tokens and CSS newline controls. Preserve supported quoted delimiters and valid escapes. Keep existing comment, scriptlet and injection checks. This is structural validation, not a full CSS grammar parser.

Add a unit case for each malformed token and positive escape/quote cases. The first targeted run before the fix reported 15 pass / 8 fail / 82 expectations, confirming all eight original malformed selectors were accepted. Extend the strict-CSP browser fixture with every malformed selector before a valid hide rule. Permanently assert getState.proxyStatus.applied after enabling HTTP and SOCKS5 proxies in all three browsers. Do not weaken exact PAC comparison without observed evidence.

Run native format/lint, all unit tests, ZIP/XPI build/source checks, actual Chrome/Brave/Firefox matrix, benchmark and repeat-build hashes. Require exact-source CI before publishing; download and compare every package and checksum afterward. Preserve previous tags, assets and evaluation records. No dependency, permission or public settings-schema change.
