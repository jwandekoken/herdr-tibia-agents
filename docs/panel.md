# Panel internals

What each status looks like and does is in the [recipe](../RECIPE.md). This
page covers how the sprites are built and how to work on the panel.

## Sprites

The [generator](../tools/tibia860.py) draws each outfit pose with all of its
addon layers, not just the base looktype, so the panel character wears the full
outfit (for 130, the hat and the belt potion). It shades the outfit mask with
gold hair (`#FFAA00`), an indigo top (`#3F3FCC`), brown trousers (`#B46337`),
and gray boots (`#737373`). Every outfit gets these colors; they are baked into
the images. It rotates the frames −45° with bicubic resampling and scales them
with Lanczos resampling. Outfits are 64×64 (2×2 tiles) in this pack; tiles are
placed bottom-right first, following the client.

Each character is cropped to its art and drawn at 1.25× its client size, or less
when a hat, weapon, or cape wouldn't fit 44×62 px. The scale is set per outfit
from three poses (standing south, standing east, first walking step east), so a tall
extremity shrinks only that character (Nightmare's lance, for example).
`CHARACTER_SCALE`, `CHARACTER_WIDTH`, and `CHARACTER_HEIGHT` set these limits.

The same script reads the mod's `loot.js` and renders each reward once for the
rail into `sprites/done/` (bottom-right anchored, up to 29×32 px, small items
doubled with nearest sampling), so the mod overlays one shared loot image on the
outfit's done pose instead of storing a sprite per outfit and item.

The panel's scenes are layered the same way, so no image is stored per
combination:

| Layer | Files in `sprites/` | Drawing |
| --- | --- | --- |
| Character | `<outfit>/fight.png` | East-facing standing pose, bottom-left, up to 44×62 px. |
| Monster | `monsters/<looktype>.png` | West-facing, still, bottom-aligned and centered at x=72, up to 48×56 px. |
| Spell | `spells/<missile>-<0–8>.png` | Sorcerer, druid, paladin: frames 0–4 fly the 30 px missile from x=34 to the monster; 5–8 sample its hit effect. Spears (`LOW_MISSILES`) are moved up onto the flight path. |
| Walk | `<outfit>/step1.png`, `step2.png` | Knight: the two walking frames facing east, registered with `fight.png` after a 6 px left margin (`STEP_MARGIN`). `main.js` draws the character above the monster and shifts it right. |
| Hit blood | `blood/<0–3>.png`, `blood/pool.png` | Knight and paladin: four 42 px samples of the blood effect on the monster, and a splatter under it, drawn like the cornered one. |
| Cornered character | `<outfit>/cornered.png` | Needs you: south-facing, centered at x=22. |
| Floor blood | `cornered/pool.png` | Needs you: splatter under the character, up to 44 px wide and flattened. |
| Close monster | `melee/<looktype>.png` | Needs you: the same monster with its left edge at x=29. |
| Burst | `cornered/<sprite id>.png` | Needs you: 40 px, on the character. |
| Corpse | `corpses/<looktype>.png` | Done: centered at x=72, up to 48×48 px. Reuses the Working character. |
| Reward | `rewards/<item>.png` | Done: the loot on the corpse, 22–28 px on its longer side. |
| Zzz | `sleep/<0–6>.png`, `sleep/still.png` | Idle: up to 26×28 px, left edge at x=30. Reuses the Working character. |

Scene sizes and positions are constants at the top of
[`tools/tibia860.py`](../tools/tibia860.py); frame timing is in `main.js`.
`SPELL_STEPS` there must match the generator's flight and hit steps,
`STRIKE_FRAMES` use its four hit steps, and `SLEEP_FRAMES` match the phases of
the sleep effect.

## Outfits

[`outfits.js`](../mods/agents-tibia/outfits.js) lists the picker's entries as
`[name, male looktype, female looktype]`, in two tables: `OUTFITS`, and `RETRO`
for the oldschool looks under their own label. The picker and the generator both
read them. Add or remove a row, regenerate, and install; the popup grows with the
rows.

## Saved state

Herdr writes both files, under `~/.config/herdr-app/`. They stay on each
computer.

| File | Keys |
| --- | --- |
| `shared.json` | `tibia.outfit` (the chosen looktype), `tibia.vocation`, `tibia.motion`, `agents.sort`, `sidebar.width`, `sidebar.collapsed` |
| `data/agents-tibia/store.json` | `changed`: per agent, its state (`s`, with done saved as idle), the time of that change (`at`), and the fight it is in (`fight`); `pins`: old pins still being migrated |

Entries for agents that are gone are dropped after 30 days, when another agent
changes state. Monster, attack, and loot picks are not saved: they derive from
these entries and a random seed made at each panel load, so a reload picks anew.
A paladin's shot count and blood pools last only until a reload too.

## Changing monsters and attacks

In [`fights.js`](../mods/agents-tibia/fights.js), `MONSTERS` lists monsters as
`[looktype, corpse item id]` pairs. `SORCERER`, `DRUID`, and `PALADIN` list
`[missile id, hit effect id]` pairs, with each missile id in one pair only.
Knights have no list: they always draw blood. A monster's corpse item ID is the
`monster.corpse` value in its server definition (for example, TFS
`data/monsters/`). [`loot.js`](../mods/agents-tibia/loot.js) lists the loot.
After editing either file, regenerate and install, so the panel never names an
image that has not been rendered (see the [README](../README.md)).

## Previewing every status

Herdr treats any program that reports a status (OSC 7501) as an agent, so a
script can show each state without starting a real one. This opens a
`tibia-demo` space with one demo agent per status. Each works for 12 seconds,
so it has a monster, then reports its final state:

```sh
mkdir -p /tmp/tibia-demo
for state in working blocked done idle; do
  hc run --bg --rm --no-parent --no-notify --name "tibia-$state" \
    --cwd /tmp/tibia-demo \
    --label herdr.space=tibiademo --label "herdr.tab=tibiademo-$state" -- \
    sh -c 'report() { printf "\033]7501;state=%s\033\\" "$1"; }
      report working; sleep 12; report "$1"; sleep 3600' demo "$state"
done
```

An `idle` demo shows as Done until you look at it. The demos end after an hour;
`hc kill tibia-working` (and so on for each state) ends them sooner.

To try vocations and motion, keep one agent working for an hour, then change them
in the outfit popup:

```sh
mkdir -p /tmp/tibia-demo
hc run --bg --rm --no-parent --no-notify --name tibia-working \
  --cwd /tmp/tibia-demo \
  --label herdr.space=tibiademo --label herdr.tab=tibiademo-working -- \
  sh -c 'printf "\033]7501;state=working\033\\"; sleep 3600'
```

A priority header shows only its section's first agent; sort by space to see the
demo's own scene.

## macOS and Linux

- **macOS** The mod clips the 3 px transparent border around each padded PNG to
  hide thin rendering lines along the sprite edges. The rail bob moves the
  clipped sprite as a unit. `tools/tibia860.py` writes `sprites/padded/` for this.
- **Linux** The mod animates the image directly, without the padded copies.

## Herdr upgrades

Start the upgraded app, run `python3 install.py` again, and switch to `tibia`.
`mods/agents-tibia/main.js` is a modified copy of the shipped
`mods/agents/main.js` from Herdr 0.1.18: merge upstream changes into it by hand,
then verify the priority headers, grouped rows, and rail.
