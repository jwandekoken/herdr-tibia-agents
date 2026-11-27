# Tibia Agents for Herdr

Herdr's Agents panel, with an animated Tibia scene for each agent status.

![The Agents panel and its outfit picker](preview.png)

Pick your character in the panel header: 24 outfits and 7 retro ones, male or
female, and your vocation: Sorcerer, Druid, Paladin, or Knight.

| Status | Scene |
| --- | --- |
| Needs you | The monster closes in; blood on the character and the floor. |
| Done | The monster's corpse with a piece of loot on it. |
| Working | The character attacks a monster: sorcerers and druids cast spells, paladins shoot, knights step up and strike. |
| Idle | The character dozes. |

The art is CipSoft's, taken from Tibia client files. Keep this repository
private, or remove `mods/agents-tibia/sprites/` **and its Git history** before
publishing it.

## Install or update

Needs Herdr (built against 0.1.18), started at least once, and `python3`. The
sprites are included. From this directory:

```sh
python3 install.py
herdr-app do layout.switch '{"name":"tibia"}'
```

The installer checks the mod, copies it to
`~/.config/herdr-app/mods/agents-tibia/`, and writes `layouts/tibia.json` from
your shipped `main` layout. It saves any mod and layout it replaces under
`~/.config/herdr-app/backups/`. Run it again after pulling changes or after a
Herdr upgrade.

`layouts/tibia.json` is rebuilt each time, so reapply any changes you made to
it. For another Herdr home, pass `--home`.

To go back: `herdr-app do layout.switch '{"name":"main"}'`.

## Customize

- **Character:** click the character in the panel header and pick an outfit,
  male or female: Citizen through Wayfarer, or the retro (oldschool) looks of
  the first seven. The default is the male mage. To offer other outfits, edit
  `outfits.js` as below.
- **Vocation:** chosen in the same popup, independently of the outfit. It
  changes the Working scene only; the default is Sorcerer.
- **Outfits, monsters, attacks, loot:** edit `outfits.js`, `fights.js`, or
  `loot.js` in `mods/agents-tibia/`, regenerate the sprites, and run the
  installer.

See [panel internals](docs/panel.md) for the sprite layers, previewing every
status with demo agents, platform notes, and Herdr upgrades.

## Regenerate the sprites

Needs Pillow, plus `Tibia.spr` and `Tibia.dat` of the extended 8.6 profile
(`cip860-extended`, from release `15.25.0a00a0` of
[tibia-client](https://github.com/dudantas/tibia-client/releases/latest)) in
`~/Documents/tibia-8.6/`:

```sh
python3 tools/dump-dat-860.py     # once per client version
python3 tools/tibia860.py         # writes mods/agents-tibia/sprites/
python3 install.py
```

For client files kept elsewhere, pass `--dat <path>/Tibia.dat` to the dump and
`--source <path>` to the generator. The generator also writes a contact sheet,
`preview-860.png`, beside the client files.

When changing the animations, keep `SPELL_STEPS`, `SLEEP_FRAMES`, and the hit
steps of `STRIKE_FRAMES` in `main.js` in line with the frames the generator
writes.
