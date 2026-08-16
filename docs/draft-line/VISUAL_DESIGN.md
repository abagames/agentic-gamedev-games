# Visual Design: DRAFT LINE

**Concept-Derived Visual Tags**: `render-flat-pixel-bands`, `geometry-diagonal-dominance`, `composition-readable-centre`

## 1. Visual Concept

高速道路の斜線と平面塗りで奥行きを作り、運転判断に必要な中央視野だけは常に空ける1985年型の道路景観。

## 2. Color Palette

| Role | Color | Hex | Usage |
|:---|:---|:---|:---|
| Player | Magenta | `#d8489c` | プレイヤー車。背景に使わない |
| Warning / Reward | Gold | `#ffd76b` | 警告、ゲート、チャージ。景観に使わない |
| Scenic structure | Cool grey | `#414955` | 遠景高架の路面帯 |
| Scenic edge | Blue grey | `#596370` | 高架の輪郭 |
| Overhead underside | Dark slate | `#252c35` | 頭上通過時の下面 |

## 3. Object Rendering Specifications

- 平面交差道路は奥行き40m、左右各240mを最低長とし、各走査線で画面端から24px外まで必要量だけ延長する。主道路と同じ投影面、曲率、勾配、丘クリップを使い、画面内に垂直な端面を残さない。
- 平面交差道路は1080mで透明から始まり、260mの smoothstep で不透明になる。遠景で細い一枚帯が突然出ず、近景でも景観色のまま車・警告・中心線より下層に留める。
- 高架は既存道路と同じ投影テーブルから作る平面ポリゴンとする。
- 遠景では路面帯、輪郭、橋脚2本だけを表示する。
- 近景では16分割した下面を前方近接面でクリップし、座標発散を避ける。
- 真下では固定ワールド分割した下面を近接面で切り、実投影のまま画面外へ連続させる。

## 4. Background & Environment

描画順は、空・丘 → 遠景高架 → 地形・主道路 → 頭上高架下面 → 道路脇物・警告 → ゲート → 車。高架は路面を遮蔽できるが、車、黄色い警告、ゲート、HUDを遮蔽しない。

## 5. Feedback Effects

| Event | Visual Response | Tag Reference |
|:---|:---|:---|
| 高架への接近 | 斜め梁が拡大し、遠景から近景へクロスフェード | `geometry-diagonal-dominance` |
| 真下を通過 | 暗い下面の実投影が画面上端へ抜ける | `render-flat-pixel-bands` |
| 退出 | 下面帯が滑らかに消え、空が戻る | `composition-readable-centre` |

## 6. Relationship with Visual Tags

斜線は速度感と進行方向を補強し、平面塗りは既存景観に合わせる。中央視野の可読性を最優先し、景観構造物はゲームプレイ色と描画優先度を共有しない。

## 7. AI-Generated Look Suppression Rules

### 7.1 Visual Hierarchy Rules

- Protagonist: マゼンタのプレイヤー車。
- Threat: 青い交通車、赤いライバル、黄色い道路警告。
- Reward: 金色のチャージとゲート表現。
- 2-second recognition check: 高架を見た静止画でも、プレイヤー車、道路中心、黄色い警告を先に識別できること。

### 7.2 Limits on Familiar Template Symbols

- Adopted familiar elements (max 2): 路面帯、橋脚。
- Replaced unique element: 写実的テクスチャを使わず、疑似3Dの分割平面と上端を掃く下面帯で通過を表す。

### 7.3 UI-Independent Feedback

| Event | Non-UI visual response | Intensity (Low/Med/High) |
| :---- | :--------------------- | :----------------------- |
| Score | 既存のゲーム側表現 | Low |
| Damage | 既存のスピン・路面痕 | High |
| Near miss | 既存の速度・車間表現 | Med |
| Underpass | 梁の拡大、暗い上端帯、退出フェード | Med |

### 7.4 Composition and Gaze Guidance

- Initial focal point: プレイヤー車から道路消失点へ向かう中央軸。
- Visual flow: 高架の斜線は中央軸を横切りつつ、進行先へ視線を戻す。
- Anti-center-clutter implementation: 橋脚は中央から外し、高架より後に警告・ゲート・車を描く。
