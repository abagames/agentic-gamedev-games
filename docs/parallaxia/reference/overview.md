# PARSEC47 の概要（公開されている説明）

- 根拠: 著者の紹介ページ（https://www.asahi-net.or.jp/~cs8k-cyu/windows/p47_e.html 、2026-10-07 取得）と、配布物の `readme_e.txt`（`original/p47_0_21/p47/`）

## 紹介文

> Defeat retro enemies modenly.
> Retromodern hispeed shmup, 'PARSEC47'.

> Control your ship and destroy enemies. While holding a slow key, the ship becomes slow and you can fire the roll shot or the lock-on laser.

Windows 用のフリーソフト（OpenGL が必要）。作者は ABA Games（Kenta Cho）。

## 操作（readme）

| 操作 | キーボード | ジョイスティック |
| --- | --- | --- |
| 移動 | 矢印キー／テンキー | スティック |
| ショット | Z、左 Ctrl | トリガー 1, 4, 5, 8 |
| スロー／ロール、ロック | X、左 Alt、左 Shift | トリガー 2, 3, 6, 7 |
| ポーズ | P | — |

## 遊び方（readme の要約）

- キーボードかジョイスティックでステージを選び、ショットキーで始める
- ステージはすべて終わりがなく、毎回ランダムに作られる。自機をすべて失うまで続く
- スローキーを押している間、自機が遅くなる
- モードは 2 種類。タイトル画面でスローキーを押すと切り替わる。モードごとに弾幕が違う
  - **ROLL モード**: スローキーを押し続けてロールショットをため、離すと発射する
  - **LOCK モード**: スローキーを押している間、前方の敵を狙うロックオンレーザーを撃てる
- 20 万点と、以後 50 万点ごとに自機が増える

## 起動オプション（readme）

| オプション | 効果 |
| --- | --- |
| `-brightness n` | 画面の明るさ（0〜100、既定 100） |
| `-luminous n` | 発光の強さ（0〜100、既定 0） |
| `-lowres` | 低解像度 |
| `-nosound` | 音を止める |
| `-window` | ウィンドウ表示 |
| `-reverse` | ショットキーとスローキーを入れ替える |
| `-slowship` | すべてのモードで遅い自機を使う |
| `-nowait` | 意図的な処理落ちを無効にする |

## 更新履歴（readme）

| 日付 | 版 | 内容 |
| --- | --- | --- |
| 2003-11-29 | 0.1 | 初版 |
| 2003-11-30 | 0.11 | 線の描画の修正、フィールドの大きさの調整、弾幕の調整、ロールショットの威力を下げた |
| 2003-12-05 | 0.12 | 敵の出現位置の調整、弾幕の調整 |
| 2003-12-21 | 0.13 | `-slowship` の追加、遅い弾がしばらくすると消えるようにした、画面リサイズの不具合修正 |
| 2004-01-01 | 0.2 | ロックモードの追加、弾幕の調整、弾が消える不具合の修正 |
| 2018-01-20 | 0.21 | SDL の更新 |

## 使われている技術（著者のページ）

D 言語、OpenGL、SDL、SDL_mixer（Ogg Vorbis）、libBulletML、Mersenne Twister。

## プレイ動画

ダウンロードはしていない。内容も確認していない（検索結果に出た URL の記録だけ）。

- 「[PC] PARSEC47 -- Gameplay」 https://www.youtube.com/watch?v=pFLJdqyE-II
