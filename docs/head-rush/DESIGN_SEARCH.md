# HEAD RUSH — design search record

Brief (user): a 1980s retro arcade dot-eat game like Sega's *Head On* (1979), made faster and
more exhilarating the way *Pac-Man Championship Edition* reworked *Pac-Man*.
No tags drawn: the brief is specific enough (AGENTS.md).

Hard constraints: realtime, fixed screen, concentric rectangular lanes with crossover gaps,
opposite-direction rival(s), dots to eat, keyboard. The "CE" part is free: which structural
ideas of CE (time attack, half-field refresh, speed ramp, ghost train, sleeping ghosts) become
mechanics here.
Search budget reduced to 9 roots / 2 mutations: the topology and the Head On core are fixed by the brief,
so the open space is the progress conversion and the risk coupling layered on top.

Obvious first association (recorded, then forbidden for half the roots):
"Head On with faster cars and a timer" — `evade + collect + adversarial`.

## Root concepts

| id | one-sentence core | signature (operation / progress / risk / info / skill) | guard |
|---|---|---|---|
| R1 | Head On + 3-min time attack + speed ramps up every lap | evade / collect / adversarial / perfect / timing | weak: CE veneer; speed is only intensity, same decision as 1979 |
| R2 | CE half-field refresh: clear one half → flag appears on the other half → taking it refills the cleared half and raises speed | evade+route / collect→refresh / opportunity-cost / perfect / planning | survives (routing across halves) |
| R3 | Power pellet flips the rules: head-on collision, normally death, becomes the way to score | intercept / chain / danger-enables-reward / perfect / prediction | survives |
| R4 | Near-miss boost: passing an oncoming car within one lane charges speed/multiplier | evade / chain / danger-enables-reward / perfect / timing | weak: rewards proximity but the lane-logic decision is unchanged; overlaps R3's inversion less cleanly |
| R5 | Convoy (ghost train): parked cars wake when you pass them and join the rival's tail; the tail follows the rival's exact path | route / build-state / same-action-creates-risk / perfect / prediction | survives (player-created threat) |
| R6 | Drift: throttle-off lets the car slide sideways through a gap two lanes at once | evade / collect / reward-consumes-safety / perfect / dexterity | weak: adds a control axis; Head On's value is its tiny vocabulary |
| R7 | Lane painting: your lane turns into your colour; rivals slow on it | construct / territory / opportunity-cost / perfect / planning | weak: dots already express territory; systems coexist without affecting lane logic |
| R8 | Rival reads your blinker: you signal before shifting and it reacts; bluff by signalling and not shifting | predict / survive / adversarial / predictive / inference | weak: needs a second input and deceptive AI tuning; bluff is invisible to a player who never learns it |
| R9 | Relay: collected dots ride as a cargo bar; bank at the pit lane | route / deliver / delayed-debt / perfect / planning | duplicate-ish of R2 routing; adds a meter with no lane-logic interaction |

Duplicate pass: R9 ≈ R2 (route-to-a-point progress), R1 is R2 without its routing.

## Core rule trace (Head On lane logic, used by every survivor)

Each car may shift one lane per gap (gaps at mid-sides) — revised later: the player crosses up to 3 lanes when slow, 1 at full throttle; the rival stays at 1. The rival shifts one lane toward your lane
at each gap it reaches. Two cars approaching head-on on the same lane: the **last one to reach a
gap before they meet decides** whether they meet in the same lane. Holding the accelerator moves
the meeting point and so changes who is last. This is state-dependent every approach: the answer
depends on both cars' distances to their next gaps and the combined speed.

## Mutations

| id | parent | operator | rule change | expected behaviour change | new risk |
|---|---|---|---|---|---|
| M1 | R3 | invert coupling | while powered the rival flees (shifts *away* at gaps); you must be last mover **into** its lane | same timing skill, opposite goal; one read, two uses | power could be wasted too often → unrewarding |
| M2 | R3+R5 | cash-out | power turns the whole convoy edible; chain doubles per car (200·2ⁿ) along the tail, which follows the rival's lane changes | growing the convoy is stored risk that pays out only under a well-timed power | long tails may be unmanageable at high speed |

Stop: remaining uncertainty (can a human be last mover at CE speeds; is the convoy readable) needs play.

## Final slate (unranked)

1. **R2+R3+M1+R5+M2 (convoy CE)** — half-field refresh supplies the routing and speed ramp; the convoy
   is player-built risk; power inverts head-on into the payoff. Risk: too much at once. Question: does a
   human actually choose when to wake cars and when to take power? Test: this slice + bot ladder.
2. **R2 alone (refresh Head On)** — minimum CE. Risk: shallow; speed alone. Test: same slice with convoy off.
3. **R4 near-miss** — Risk: proximity reward duplicates lane logic. Test: paper.
4. **R6 drift** — Risk: dexterity overshadowing planning. Test: control prototype.

## Selection for the slice

Slate 1. It is the only candidate where CE's signature structures (refresh halves, ghost train, sleeping
ghosts, speed ramp) become Head On decisions instead of decoration. It resolves the key uncertainty:
*does the head-on inversion make the Head On lane-timing read both a survival skill and a scoring skill?*
The "convoy off" variant (slate 2) is kept as a test switch rather than a separate prototype.

- **Sensation:** diving a lane at the last gap so the rival misses by a car's width — then, powered,
  diving *into* its lane and ploughing through the whole red convoy car after car, pitch climbing.
- **Why idle loses:** the rival closes one lane per gap; an idle car in one lane is hit within a lap, loses
  time and a speed tier, and eats only one lane.
- **Why holding "in"/"out" or mashing loses:** you end on the edge lanes and the rival reaches you; mashing
  shifts at every gap, so the rival (last mover half the time) catches you at random.
- **Why holding boost loses:** (revised after tuning — the original claim "you arrive early" was false; the
  ladder showed hold-boost dominant for both human-limited and oracle bots) a car at full throttle cannot take a
  gap, so holding boost is the same as never turning, and the rival closes in (600 pts, same as idle).
  Revision 2 (user: Head On lets a slow car cross several lanes in one gap): holding a direction keeps
  crossing inside the gap (3 lanes early, 2 at high tiers); full throttle is capped at 1 lane. Forced
  always-boost for the oracle scores 16k vs 72–153k with choice, so boost stays a decision.
- **Progress event:** a dot under the car (score), a refill flag (speed tier +1, cleared half restored, a
  new parked car), and a head-on hit while powered (chain score).
- **Escalation:** each flag raises both cars' speed one tier and adds one parked car; the decision stays
  readable because lanes, gaps and the one-lane-per-gap rule never change and the rival shows its blinker.

status: review_pending (unattended default assignment; implementation pre-authorized)
  Revision 3 (user play report: moving exactly one lane at low speed was hard — a normal 0.1 s key press
  already reached the 2nd lane): extra lanes need the direction held continuously for 0.2 s; a normal press
  is always one lane, and the turn signal doubles once the hold is long enough to keep crossing.
