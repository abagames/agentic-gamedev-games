# tools/vendor/

agentic-gamedev-skills（https://github.com/abagames/agentic-gamedev-skills 、MIT、Copyright 2026 abagames）のスキルに同梱されているスクリプトを、そのまま写したものである。
スキルはユーザー単位で導入されていてリポジトリに入っていないので、検査をリポジトリだけで再現できるように写しを置いている。

| ファイル | 元のスキル（特記のないものはプラグイン web-mini-game-kit 0.1.1） | 使い方 |
| --- | --- | --- |
| `smoke-test.mjs` | smoke-testing-web-games の `scripts/smoke-test.mjs` | `tools/smoke.mjs` から呼ぶ。書き換えない |
| `probe-template.mjs` | probing-web-game-mechanics の `scripts/probe-template.mjs` | 参照用。`tools/probe.mjs` はこれを元に、このゲームのデバッグハンドル向けに書いたもの |
| `validate-audio-kit.mjs` | building-era-authentic-game-audio（プラグイン retro-arcade-game-finisher 0.1.3）の `scripts/validate-audio-kit.mjs` | `tools/audio.mjs` から呼ぶ。書き換えない |

`test/fixtures/fixture-ok.html` と `test/fixtures/fixture-input-crash.html` も、smoke-testing-web-games の `assets/fixtures/` の写しである。

スキル側が更新されたら、写しを取り直す。ここのファイルを直接直さない。
