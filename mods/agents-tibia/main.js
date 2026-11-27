// Agents in grouped or priority views; parents take their most urgent sub-agent's place.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout } from "herdr";
import { LOOT } from "./loot.js";
import { MONSTERS, SORCERER, DRUID, PALADIN } from "./fights.js";
import { OUTFITS, RETRO } from "./outfits.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it ("✦  Working", "⠋ - Thinking"), and Codex's blinking "[ ! ] " / "[ . ] " mark.
// Stops at an opening bracket or quote, so a title that starts with one ("[web] login") keeps it,
// and at an emoji ("🔴 login", "❤️ deploy"), except for known status marks.
const clean = (s) => (s ?? "").replace(/^(?:\[ [!.] \] |[✋⏳]\uFE0F?(?=\s)|(?!(?:\p{Emoji}\uFE0F|[#*]\u20E3))[^\p{L}\p{N}\p{Ps}\p{Pi}\p{Emoji_Presentation}])+/u, "").trim();

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    // First agent, else first focused terminal, else first terminal in the tab.
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((l?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== (l?.terminal ?? l?.address) && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
const SPRITE_SIZE = 64;
const RAIL_SPRITE_SIZE = 20;
const EDGE_PADDING = 3; // Matches the transparent PNG border from tibia860.py.
const ATTACK_FRAMES = [2663, 2664, 2665, 2666, 2667, 2668, null];
// The panel draws wide scenes; the rail, square sprites.
const SCENE_RATIO = 96 / 64;
const FLIGHT_STEPS = 5;
const SPELL_STEPS = FLIGHT_STEPS + 4; // Flight, then hit, as rendered by tibia860.py.
const SPELL_FRAMES = [...Array(SPELL_STEPS).keys(), null];
// A knight's attack: walk up, strike, walk back. Each frame has how far right of
// its spot the character is, in scene pixels, then the walking pose or the step
// of the blood spurting from the monster. null is the pause, standing at the start.
const KNIGHT_START = 6;
const STEP_MARGIN = 6; // Empty left of the walking frames, as in tibia860.py.
const STRIKE_FRAMES = [
  { x: 11, pose: 1 }, { x: 16, pose: 2 }, { x: 21, pose: 1 }, { x: 27, pose: 2 },
  { x: 27, hit: 0 }, { x: 27, hit: 1 }, { x: 27, hit: 2 }, { x: 27, hit: 3 },
  { x: 22, pose: 1 }, { x: 17, pose: 2 }, { x: 12, pose: 1 }, null,
];
const SLEEP_FRAMES = [...Array(7).keys(), null]; // Effect 33's phases.
const CALM_PAUSE = 2500; // ms between attacks in calm motion.
const LOOKTYPES = new Set([...OUTFITS, ...RETRO].flatMap(([, male, female]) => [String(male), String(female)]));
const outfitId = () => {
  const outfit = String(shared("tibia.outfit"));
  return LOOKTYPES.has(outfit) ? outfit : "130";
};

const VOCATIONS = [
  { id: "sorcerer", label: "Sorcerer", attacks: SORCERER },
  { id: "druid", label: "Druid", attacks: DRUID },
  { id: "paladin", label: "Paladin", attacks: PALADIN },
  { id: "knight", label: "Knight" }, // Strikes up close: no missiles.
];
const vocation = () => VOCATIONS.find((v) => v.id === shared("tibia.vocation")) ?? VOCATIONS[0];

// Calm, the default, keeps the eye for agents that need you: attacks pause
// longer, and the sleeping and rail sprites hold still.
const MOTIONS = [{ id: "full", label: "Full" }, { id: "calm", label: "Calm" }];
const calm = () => shared("tibia.motion") !== "full";

// The outfit picker: a grid of every outfit for one sex, the retro ones last.
const PICKER_COLUMNS = 8;
const PICKER_CELL = { w: 72, h: 76 };
const PICKER_SIZE = {
  width: PICKER_COLUMNS * PICKER_CELL.w + 12,
  // Header and padding, the "Retro" label, and the motion row.
  height: [OUTFITS, RETRO].reduce((rows, list) => rows + Math.ceil(list.length / PICKER_COLUMNS), 0) * PICKER_CELL.h + 102,
};

const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
// A kept sub-agent (one with a pane) is in agents() too: it keeps its own status, done included.
const kidStatus = (k, listed) => {
  if (listed.has(k.address)) return listed.get(k.address);
  const s = k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu || props()?.outfitMenu) return;
    this.folded = new Set();
    this.animations = {
      attack: { frames: ATTACK_FRAMES, step: 85, pause: 320, index: 0 },
      spell: { frames: SPELL_FRAMES, step: 120, pause: 600, index: 0, cycle: 0 },
      strike: { frames: STRIKE_FRAMES, step: 120, pause: 600, index: 0 },
      sleep: { frames: SLEEP_FRAMES, step: 220, pause: 660, index: 0 },
    };
    this.seed = Math.floor(Math.random() * 0x100000000);
    this.bled = new Set(); // Working stretches in which a paladin has hit.
    // Each agent's last state and when it changed (ms), kept across restarts.
    try { this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}"); } catch { this.changed = {}; }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
    try { this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]"); } catch { this.pendingPins = []; }
    if (!Array.isArray(this.pendingPins)) this.pendingPins = [];
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    cx.timer.every(30000, (cx) => cx.notify());
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      // The monster a working agent was fighting stays: it corners the character
      // or lies dead until the next working stretch.
      const fight = s === "working" ? now : this.changed[a.address]?.fight;
      this.changed[a.address] = { s, at: now, fight };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  rank(a) {
    return RANK[a.status] ?? 0;
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  outfitMenu(t) {
    const current = outfitId();
    // Opens on the chosen outfit's sex.
    this.female ??= [...OUTFITS, ...RETRO].some(([, , female]) => String(female) === current);
    const toggle = (id, label, on, select) => div()
      .id(id)
      .px(8)
      .py(2)
      .rounded(6)
      .text_size(11)
      .text_color(on ? t.foreground : t.dim)
      .when(on, (el) => el.bg(t.hover))
      .hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => {
        select();
        cx.notify();
      })
      .child(label);
    const sex = (label, female) => toggle(`sex-${label}`, label, this.female === female, () => { this.female = female; });
    const chosen = vocation().id;
    const motion = calm() ? "calm" : "full";
    const cell = ([name, male, female]) => {
      const id = String(this.female ? female : male);
      return v_flex()
        .id(`outfit-${id}`)
        .w(PICKER_CELL.w)
        .h(PICKER_CELL.h)
        .flex_none()
        .items_center()
        .justify_center()
        .gap(2)
        .rounded(7)
        .when(id === current, (el) => el.bg(t.hover).border_1().border_color(t.input))
        .hover((s) => s.bg(t.hover))
        .on_click(() => {
          setShared("tibia.outfit", id);
          closeOverlay(props().overlay);
        })
        .child(this.sprite("idle", 52, id))
        .child(div().max_w(PICKER_CELL.w).truncate().text_size(10)
          .text_color(id === current ? t.foreground : t.muted).child(name));
    };
    const grid = (list) => {
      const rows = [];
      for (let i = 0; i < list.length; i += PICKER_COLUMNS) rows.push(list.slice(i, i + PICKER_COLUMNS));
      return rows.map((row) => h_flex().flex_none().children(row.map(cell)));
    };
    return v_flex()
      .size_full()
      .p(5)
      .bg(t.popover)
      .child(h_flex()
        .h(30)
        .flex_none()
        .px(6)
        .gap(4)
        .items_center()
        .child(div().flex_1().text_size(11).text_color(t.dim).child("Outfit"))
        .children(VOCATIONS.map((v) => toggle(`vocation-${v.id}`, v.label, v.id === chosen,
          () => setShared("tibia.vocation", v.id))))
        .child(div().w(1).h(14).mx(6).flex_none().bg(t.border))
        .child(sex("Male", false))
        .child(sex("Female", true)))
      .children(grid(OUTFITS))
      .child(h_flex()
        .h(24)
        .flex_none()
        .px(6)
        .items_end()
        .text_size(11)
        .text_color(t.dim)
        .child("Retro"))
      .children(grid(RETRO))
      .child(h_flex()
        .h(30)
        .flex_none()
        .px(6)
        .gap(4)
        .items_center()
        .child(div().flex_1().text_size(11).text_color(t.dim).child("Motion"))
        .children(MOTIONS.map((m) => toggle(`motion-${m.id}`, m.label, m.id === motion,
          () => setShared("tibia.motion", m.id)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(compact ? 26 : SPRITE_SIZE + 4)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => (this.listed.has(k.address) ? run("pane.focus", { terminal: k.address }) : this.peek(k.address)))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .when(!compact, (el) => el.child(this.status({ address: k.address, status: st })));
  }

  sprite(name, size, directory = outfitId(), width = size) {
    const root = "mods/agents-tibia/sprites";
    const file = `${directory}/${name}.png`;
    if (window()?.platform !== "macos") return image(`${root}/${file}`).w(width).h(size).flex_none();
    // Clip the padded PNG's transparent border to hide macOS image-edge artifacts.
    const padding = size * EDGE_PADDING / SPRITE_SIZE;
    return div().relative().w(width).h(size).flex_none().overflow_hidden()
      .child(image(`${root}/padded/${file}`).w(width + 2 * padding).h(size + 2 * padding)
        .absolute().top(-padding).left(-padding));
  }

  // The frame an animation is on; asking for it keeps the animation running.
  frame(name) {
    const animation = this.animations[name];
    animation.drawn = true;
    return animation.frames[animation.index];
  }

  hurt(size) {
    const frame = this.frame("attack");
    return div()
      .relative()
      .w(size)
      .h(size)
      .flex_none()
      .child(this.sprite("need_help", size))
      .when(frame !== null, el => el.child(div()
        .absolute()
        .top(0)
        .left(0)
        .child(this.sprite(frame, size, "attack"))));
  }

  // A wide scene: full-size images stacked in order, each [name, directory] and,
  // to shift it right, a number of scene pixels.
  scene(size, layers) {
    const width = size * SCENE_RATIO;
    return div().relative().w(width).h(size).flex_none()
      .children(layers.filter(Boolean).map(([name, directory, x = 0]) => div().absolute().top(0)
        .left(x * size / SPRITE_SIZE)
        .child(this.sprite(name, size, directory, width))));
  }

  // The looktype of the agent's monster, which also names its corpse.
  monster(a) {
    return this.pick(MONSTERS, "monster", a, this.changed[a.address]?.fight)[0];
  }

  fight(a, size) {
    const { id, attacks } = vocation();
    if (id === "knight") return this.melee(a, size);
    const step = this.frame("spell");
    // A paladin picks anew for every shot. Each hit draws blood, and the first
    // leaves a pool for the rest of the working stretch.
    const paladin = id === "paladin";
    const stretch = this.since(a);
    const [missile] = this.pick(attacks, "spell", a, paladin ? `${stretch}:${this.animations.spell.cycle}` : stretch);
    const hit = paladin && step >= FLIGHT_STEPS; // null, the pause, compares as 0.
    const key = `${a.address}:${stretch}`;
    if (hit) this.bled.add(key);
    return this.scene(size, [
      paladin && this.bled.has(key) && ["pool", "blood"],
      ["fight", outfitId()],
      [this.monster(a), "monsters"],
      hit && [step - FLIGHT_STEPS, "blood"],
      step !== null && [`${missile}-${step}`, "spells"],
    ]);
  }

  // A knight walks up to the monster, bleeding on the floor, and strikes it,
  // drawn in front of it.
  melee(a, size) {
    const frame = this.frame("strike");
    return this.scene(size, [
      ["pool", "blood"],
      [this.monster(a), "monsters"],
      frame?.pose
        ? [`step${frame.pose}`, outfitId(), frame.x - STEP_MARGIN]
        : ["fight", outfitId(), frame?.x ?? KNIGHT_START],
      frame?.hit !== undefined && [frame.hit, "blood"],
    ]);
  }

  cornered(a, size) {
    const step = this.frame("attack");
    return this.scene(size, [
      ["pool", "cornered"],
      ["cornered", outfitId()],
      [this.monster(a), "melee"],
      step !== null && [step, "cornered"],
    ]);
  }

  // Done: the monster's corpse with a piece of loot on it.
  victory(a, size) {
    return this.scene(size, [
      ["fight", outfitId()],
      [this.monster(a), "corpses"],
      [this.pick(LOOT, "loot", a), "rewards"],
    ]);
  }

  // Idle: the character dozes.
  sleeping(size) {
    const step = calm() ? "still" : this.frame("sleep");
    return this.scene(size, [
      ["fight", outfitId()],
      step !== null && [step, "sleep"],
    ]);
  }

  updateTimers(cx) {
    for (const animation of Object.values(this.animations)) {
      if (!animation.drawn || window()?.visible === false) {
        animation.timer?.cancel();
        animation.timer = null;
        animation.index = 0;
        continue;
      }
      if (animation.timer) continue;
      const attack = animation === this.animations.spell || animation === this.animations.strike;
      const pause = attack && calm() ? CALM_PAUSE : animation.pause;
      const delay = animation.frames[animation.index] === null ? pause : animation.step;
      animation.timer = cx.timer.after(delay, cx => {
        animation.timer = null;
        if (window()?.visible === false) {
          animation.index = 0;
          return;
        }
        animation.index = (animation.index + 1) % animation.frames.length;
        if (animation.index === 0) animation.cycle += 1;
        cx.notify();
      });
    }
  }

  // A random entry that stays the same across redraws for as long as the
  // agent's state lasts. `kind` keeps one agent's choices independent.
  pick(list, kind, a, at = this.since(a)) {
    const key = `${kind}:${a.address ?? ""}:${at}`;
    let hash = this.seed;
    for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    // Mix the high bits down: short lists would otherwise move in step.
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
    return list[((hash ^ (hash >>> 16)) >>> 0) % list.length];
  }

  status(a, size = SPRITE_SIZE) {
    if (a.status === "working") {
      if (size !== RAIL_SPRITE_SIZE) return this.fight(a, size);
      // The rail has no room for a fight: the character alone, bobbing unless calm.
      // Animating the image directly can draw a line beneath it on macOS.
      return div().relative().w(size).h(size).flex_none()
        .child(div().absolute().top(0).left(0).w(size).h(size)
          .when(!calm(), (el) => el.loop("top", { from: 0, to: -1, period: 240 }))
          .child(this.sprite("working", size)));
    }
    if (a.status === "blocked") return size === RAIL_SPRITE_SIZE ? this.hurt(size) : this.cornered(a, size);
    if (a.status === "idle") return size === RAIL_SPRITE_SIZE ? this.sprite("idle", size) : this.sleeping(size);
    if (size !== RAIL_SPRITE_SIZE) return this.victory(a, size);
    // The rail: the character facing the loot.
    return div().relative().w(size).h(size).flex_none()
      .child(this.sprite("done", size))
      .child(div().absolute().top(0).left(0).child(this.sprite(String(this.pick(LOOT, "loot", a)), size, "done")));
  }

  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    if (props()?.outfitMenu) return this.outfitMenu(t);
    for (const animation of Object.values(this.animations)) animation.drawn = false;
    const collapsed = narrow();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    // A kept sub-agent (one with a pane) is in agents() too: where a tree shows
    // it, it gets no row of its own, unless it's pinned.
    const nested = new Set(collapsed ? [] : list.flatMap((a) => this.tree(all, a.address).map((s) => s.t.address)));
    list = list.filter((a) => a.pinned || !nested.has(a.address));
    const tabCounts = new Map();
    for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
    const byPriority = sort.id === "priority";
    // A helper's done is its own row's news: it doesn't pull a working parent out of Working.
    const kidRank = (k) => { const s = kidStatus(k, this.listed); return RANK[s === "done" ? "idle" : s] ?? 0; };
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => kidRank(s.t)))]));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // A row reads "space \u00b7 detail": the detail is a tab someone named or the
    // agent's own title, never an automatic tab number unless two rows would
    // otherwise read the same.
    // Read the pane snapshot once: every host read copies the whole list into JS.
    const leads = leadPanes(panes());
    const tabs = new Map(spaces().flatMap(s => s.tabs).map(tab => [tab.id, tab]));
    const labels = new Map(list.map(a => {
      const tab = tabs.get(a.tab);
      const many = tabCounts.get(a.tab) > 1;
      return [a.address, tab ? title(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : (a.title || a.program?.name || "")];
    }));
    const label = (a) => labels.get(a.address);
    const detail = new Map(list.map(a => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));
    }

    const row = (a, i, subs = []) => {
      const pic = icon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      // An agent on another machine (`vps/t7`) says which.
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      if (collapsed) {
        return h_flex()
          .id(`ag-${a.address}`)
          .h(26)
          .mx(6)
          .px(2)
          .rounded(6)
          .flex_none()
          .items_center()
          .gap(4)
          .when(a.focused, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(a.focused ? t.foreground : t.muted).child(String(i + 1)))
          .child(this.status(a, RAIL_SPRITE_SIZE));
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      // Under a space header the space goes without saying; an automatic tab number says nothing.
      // Without a space header above (priority, pinned) the row names its space.
      const full = byPriority || isPinned;
      const name = full ? a.space_name || label(a) : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      return h_flex()
        .id(`ag-${a.address}`)
        .px(8)
        .h(byPriority ? 30 : SPRITE_SIZE + 6)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(a.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
          .when(subs.length > 0, el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          })).child(pic)))
        .child(h_flex().flex_1().min_w(0).gap(5).items_center()
          .child(div().min_w(0).max_w(full && more ? 120 : 200).truncate().text_color(idle ? t.muted : t.foreground).child(name))
          .when(full && Boolean(more), el => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${more}`))))
        .when(Boolean(machine), el => el.child(div().text_size(10).text_color(t.dim).child(machine)))
        .when(subs.length > 0, el => el.child(fold(a, subs)))
        .when(this.hovered === a.address, el => el.child(pin))
        .when(this.hovered !== a.address && Boolean(when), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when))))
        .when(!byPriority, (el) => el.child(this.status(a)));
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }

    // A group's header; it folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      const groupStatus = status => g.members.find(a => a.status === status) ?? { status };
      const showsStatus = byPriority || (!open && top && top !== "idle");
      return h_flex()
        .id(g.id)
        .px(8)
        .pt(8)
        .h(showsStatus ? SPRITE_SIZE + 12 : 34)
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        // A priority section counts before its name, so no number floats past the sprite.
        .when(byPriority, (el) => el.child(div().flex_none().text_color(t.dim).child(String(g.members.length))))
        .child(div().truncate().text_color(t[g.status] ?? t.dim).child(g.label))
        .when(byPriority, (el) => el.child(this.status(groupStatus(g.status ?? top ?? "idle"))))
        .when(!byPriority && !open, (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(!byPriority && top && top !== "idle", (el) => el.child(this.status(groupStatus(top))))
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
    };
    const rows = collapsed
      ? list.flatMap(withKids)
      : groups.flatMap((g) => [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]);

    this.updateTimers(cx);

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(13)
      .when(!collapsed, (el) =>
        el.child(
          h_flex()
            .px(16)
            .h(41)
            .pt(14)
            .pb(5)
            .flex_none()
            .items_center()
            .justify_between()
            .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents"))
            .child(h_flex()
              .gap(8)
              .items_center()
              .child(
                div()
                  .id("ag-outfit")
                  .rounded(5)
                  .hover((s) => s.bg(t.hover))
                  .on_click(() => openOverlay({ mod: "agents-tibia", kind: "popup", ...PICKER_SIZE, props: { outfitMenu: true } }))
                  .tooltip("Choose outfit")
                  .child(this.sprite("idle", 30, outfitId())),
              )
              .child(
                div()
                  .id("ag-sort")
                  .text_size(11)
                  .text_color(t.dim)
                  .hover((s) => s.text_color(t.foreground))
                  .on_click(() => openOverlay({ mod: "agents-tibia", kind: "popup", width: 200, height: 140, props: { sortMenu: true } }))
                  .tooltip(`Sort agents: ${sort.label}`)
                  .child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14)),
              )),
        ),
      )
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.")),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always").children(rows))
      .when(collapsed, (el) =>
        el.child(
          h_flex()
            .h(28)
            .items_center()
            .justify_center()
            .child(
              div()
                .id("collapse")
                .text_size(13)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(toggleSidebar)
                .child("»"),
            ),
        ),
      );
  }
}
