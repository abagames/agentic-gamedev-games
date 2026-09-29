# Visual Design: TWIN VECTOR

**Visual Tags**: pseudo-3D, two layers (original draw)

## 1. Visual Concept
Two raster flight decks; read a lane, then send a shot behind its shield.

## 2. Color Palette
Preserve the existing eight-color cabinet palette. Cyan identifies the player and
ordinary shots; red/pink/white distinguish threats; gold identifies shields and
transferred shots; blue/ink define the decks; cream flashes mark impact; black is
negative space. No gradients, glow, antialiasing or new assets.

## 3. Object Rendering Specifications
Code-drawn pixel silhouettes. Five lane centers sit between six straight boundary
lines. Horizontal spread and vertical depth use the same projected depth fraction,
so outer-lane objects remain centered at every distance. Enemy centers rise only
one sprite-scale unit above their projected point (previously four). Muzzle and
core overlays follow that adjustment. Shields and bullets share the projection.

## 4. Background & Environment
Two fixed trapezoid decks. Dim the inactive deck without hiding its threats.

## 5. Feedback Effects
Shot transfer changes color; shield blocks spark; kills burst; layer crossing
shows a direction mark and flashing destination brackets. Preserve existing timing.

## 6. Relationship with Visual Tags
Pseudo-3D is conveyed by converging boundaries and sprite scale. Two layers remain
simultaneously visible to support shot transfer and attention switching.

## 7. AI-Generated Look Suppression Rules

### 7.1 Visual Hierarchy Rules

- Protagonist: cyan ship at the front of the active deck.
- Threat: distinct enemy silhouettes approaching on lane centers.
- Reward: destruction burst and opening of the defended lane.
- 2-second recognition check: inspect both outer lanes without relying on HUD text;
  formal blind-player recognition remains untested.

### 7.2 Limits on Familiar Template Symbols

- Adopted familiar elements (max 2): raster ship, wireframe deck.
- Replaced unique element: physical shield separated from its protected body.

### 7.3 UI-Independent Feedback

| Event | Non-UI visual response | Intensity (Low/Med/High) |
| :---- | :--------------------- | :----------------------- |
| Score | Enemy burst, shield falls | Med |
| Damage | Player explosion | High |
| Near miss | Late routed shot: two short gold dashes slip past the body | Low |
| Gap kill | Larger burst, shield halves split and fall, 3-frame stop | High |
| Boss core | Largest burst, 8-frame stop, playfield shake | Highest |

### 7.4 Composition and Gaze Guidance

- Initial focal point: cyan ship.
- Visual flow: follow its lane to the enemy, then across to the other deck.
- Anti-center-clutter implementation: small silhouettes, dark grid, no UI panels.

## Boss progression feedback

Sixth boss: one turret and its status lamp on each deck. The central shell appears
on both decks; the shield of the unlocked deck flashes before opening. Final boss:
only the occupied weak point is bright; the empty shell is dim and never flashes a
false muzzle cue. A direction mark and destination brackets precede core crossing.
Opening uses the existing swap cue, movement uses existing raster marks, and no
new UI panels or palette colors are introduced.

## Destination-only telegraphs

Remove deck letter labels and directional text. Lateral moves and layer crossings
share four small blinking gold destination corners. The active deck remains defined
by grid brightness and player position. A pair of tiny gold marks beside a moved
enemy lasts for the 30-tick interception window; the kill popup shows the complete
score, including stacking transfer and interception rewards. No additional HUD.

## 1980s cabinet pass

Sprites use three palette roles (body, eye, accent) from the same eight colors and two
animation frames; telegraphing enemies animate faster. Interior deck rungs flow toward the
player while rim lines stay fixed. Explosions step flash -> burst -> red ring -> embers; the
player ship breaks into falling fragments. HUD follows cabinet convention: blinking 1UP,
centered HI-SCORE, reserve ships bottom left, sector badges bottom right. Attract cycles
demo, score advance table and high scores. CRT scanlines rejected (post effect, readability).
