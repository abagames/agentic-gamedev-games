# 調査の記録（出所と確度）

確度は「著者の言明」「確認済」「推測」「未確認」のいずれかである。取得日はすべて 2026-10-07。

## 原作

| 主張 | 出所 | 確度 |
| --- | --- | --- |
| PARSEC47 は ABA Games（Kenta Cho）の作品で、2003-11 にリリースされた | 著者（依頼書）。readme の履歴でも初版 0.1 は 2003-11-29 | 著者の言明、確認済 |
| 最新版は 0.21（2018-01-20、SDL の更新） | `original/p47_0_21/p47/readme_e.txt` の履歴 | 確認済 |
| 配布ページと zip の場所 | https://www.asahi-net.or.jp/~Cs8K-Cyu/windows/p47.html → https://abagames.sakura.ne.jp/windows/p47_0_21.zip | 確認済 |
| 配布 zip にソース、BulletML の XML、画像、音声、Windows 用の実行ファイルが入っている | 展開して確認 | 確認済 |
| 原作のライセンスは BSD 2-Clause | 著者の言明。`readme_e.txt` の License 節に条文がある | 著者の言明、確認済 |
| 音声（効果音・BGM）は著者の自作 | 著者（2026-10-08） | 著者の言明 |
| 素材（画像・音声）も同じ条件で利用できる | 著者（当初「MIT」と述べ、のちに BSD 2-Clause に訂正） | 著者の言明 |
| 意図的な処理落ちと弾の出現演出は、リメイクに必須ではない | 著者（2026-10-08） | 著者の言明 |
| アイテムを下端で拾えること、回転中のロールで敵を削れることは、意図した仕様である | 著者（2026-10-08） | 著者の言明 |
| 使用技術は D、OpenGL、SDL、SDL_mixer（Ogg Vorbis）、libBulletML、Mersenne Twister | https://www.asahi-net.or.jp/~cs8k-cyu/windows/p47_e.html 、readme の Acknowledgement | 確認済 |
| 紹介文と遊び方の説明 | 同上。`reference/overview.md` に転記 | 確認済 |
| 操作、モード、エクステンドの点数、起動オプション | `readme_e.txt` | 確認済 |
| メカニクスの数値（`reference/mechanics.md` の内容） | `original/p47_0_21/p47/src/` を読んで書き出した | 確認済（ソース上）。実機での挙動は未確認 |
| 弾幕の構成（`reference/barrage.md` の内容） | 弾幕の XML とソース | 確認済（構成）。個々の部品の見た目は推測（名前と記述から） |
| 0.2 と 0.21 の違いは SDL の更新だけ | 著者（2026-10-08）。readme の履歴とも一致する | 著者の言明 |
| タイトル画像は著者の自作 | 著者（2026-10-08） | 著者の言明 |

## ビルドについて

| 主張 | 出所 | 確度 |
| --- | --- | --- |
| 2003-12-01 に著者が「PARSEC47をビルドする方法」を書いた。Windows 向けと Linux 向けの手順を書いた第三者の記事を紹介している | https://aba.hatenablog.com/entry/20031201/p1 | 確認済 |
| 原作のビルドは Ant（`build.xml`）で、dmd と Borland C++（bcc32）を使う | `original/p47_0_21/p47/build.xml` | 確認済 |
| 紹介されている Linux 用 Makefile の記事が今も読めるか | 記事内のリンク先 | 未確認 |

## 第三者による移植・配布

| 主張 | 出所 | 確度 |
| --- | --- | --- |
| M-HT/parsec47 は D2・Linux・SDL2・Pandora・DragonBox Pyra への移植 | https://github.com/M-HT/parsec47 の README | 確認済 |
| 最終コミットは 2024-04-09 | 同リポジトリのコミット履歴 | 確認済 |
| 弾幕・動きの XML、画像、音声は原作 0.21 と同一 | `original/` で比較 | 確認済 |
| 同梱の readme は ver. 0.2 のもの | 同リポジトリの `readme_e.txt` | 確認済 |
| ソースの原作との差分の範囲 |  | 未確認 |
| gdc と SDL2、libBulletML があれば Linux でビルドできる | `sources/buildLinux.sh` を読んだ | 推測（試していない） |
| Debian に `parsec47` パッケージがあり、現行は 0.2.dfsg1-11（forky/sid）。0.2 が元 | https://sources.debian.org/patches/parsec47/ | 確認済 |
| Debian のパッチは 9 個（directories, dlang_v2, dotfile, fixes, gdc-8, imports, makefile, window-resizing, windowed） | https://sources.debian.org/src/parsec47/0.2.dfsg1-11/debian/patches/ | 確認済（名前だけ） |
| Debian のパッチの中身（`fixes.patch` が挙動を変えているか等） |  | 未確認 |
| 版に `dfsg` が付いている理由（何が取り除かれたか） |  | 未確認 |

## プレイ動画・紹介

| 主張 | 出所 | 確度 |
| --- | --- | --- |
| プレイ動画がある | https://www.youtube.com/watch?v=pFLJdqyE-II （検索結果に出た題名「[PC] PARSEC47 -- Gameplay」） | 未確認（開いていない） |
| 画面写真 | 著者の紹介ページの 2 枚。`reference/screenshots/`（画像は公開していない） | 確認済 |

## 未確認事項のまとめ

1. 実機での挙動全般（参照実装を動かせていない）
2. M-HT フォークのソース差分と、変更部分のライセンス
3. Debian のパッチの中身と `dfsg` の理由
4. 同梱ライブラリ（libBulletML、SDL、SDL_mixer）のライセンス表記（`licenses.md`）
5. プレイ動画の内容
6. ゲームパッドの割り当ての詳細
