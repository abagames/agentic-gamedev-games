# ライセンスのまとめ

取得日はすべて 2026-10-07。リメイクのリポジトリに原作や第三者の物を取り込む前に、ここを確認する。

## 原作

| 対象 | ライセンス | 根拠 |
| --- | --- | --- |
| ソースコード | BSD 2-Clause（Copyright 2003 Kenta Cho） | 著者の言明、配布物の `readme_e.txt` |
| 弾幕・動きの XML | 同上（配布物の一部） | 同上 |
| 音声（効果音 11 個、BGM 4 曲） | 著者の自作。BSD 2-Clause の条件で利用できる | 著者の言明（2026-10-08） |
| 画像（`title.bmp`） | 著者の自作。BSD 2-Clause の条件で利用できる | 著者の言明（2026-10-08） |

**取り込むときの条件**: 再配布する場合は、著作権表示・条文・免責を添える。
原作の XML や素材をリメイクに入れるなら、リポジトリに原作のライセンス文を置き、どのファイルが原作由来かを記録する。

原作の素材は、音声もタイトル画像もすべて著者の自作である（確認済み）。

## 原作に同梱されているもの

| 対象 | ライセンス | 根拠 | リメイクとの関係 |
| --- | --- | --- | --- |
| Mersenne Twister（`src/mt.d`） | BSD 3-Clause（Matsumoto・Nishimura、D への移植 Andrew C. Edwards） | ファイル冒頭の表示 | 使わない（リメイクは独自の乱数を使っている） |
| libBulletML（`bulletml.dll`、`lib/bulletml.lib`） | 未確認。配布元のページ（https://shinh.skr.jp/libbulletml/index_en.html ）にライセンスの記載が見当たらなかった | — | 使わない（ブラウザでは動かない） |
| SDL、SDL_mixer（dll） | 未確認（版も確認していない） | — | 使わない |
| SDL・OpenGL の D 用ヘッダ（`import/`） | 未確認 | — | 使わない |

これらはリメイクに取り込まないので、未確認のままでも制作は止まらない。

## 第三者の移植

| 対象 | ライセンス | 根拠 |
| --- | --- | --- |
| M-HT/parsec47 の原作由来の部分 | BSD 2-Clause（原作と同じ） | 同リポジトリの README と readme |
| M-HT/parsec47 で加えられた変更 | 未確認。リポジトリに LICENSE ファイルが無く、README にも変更部分の条件は書かれていない | — |
| BindBC-SDL（同フォークが使用） | Boost Software License | 同リポジトリの README |
| Debian のパッチ | 未確認 | — |

フォークのコードはリメイクに取り込まない。比較用にビルドするだけなら条件は問題にならない。

## リメイクで使う候補

| 対象 | ライセンス | 根拠 |
| --- | --- | --- |
| bulletml.js（daishihmr） | MIT | `package.json` の license 欄 |
| bulletml.js 2.0（daishihmr/bulletml.js2） | MIT | 同上 |
| Playwright（開発時のみ） | Apache-2.0 | npm パッケージの表示（未確認: 条文は読んでいない） |
| `tools/vendor/` のスクリプト | MIT（agentic-gamedev-skills、Copyright 2026 abagames） | 元リポジトリの LICENSE |

## 現在 `original/` の外にある原作由来の物

- `reference/screenshots/` の画面写真 2 枚（著者のページの画像）。2026-10-12 に git の管理対象から外し、公開していない
- `reference/overview.md` の紹介文と readme からの引用

原作のコード、XML、音声、タイトル画像は、`original/` の外に置いていない。
