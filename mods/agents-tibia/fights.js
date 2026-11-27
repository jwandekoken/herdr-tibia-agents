// What a working agent fights: a monster and an attack, drawn independently and
// kept for that working stretch. The monster stays for what follows: cornering
// the character, or lying dead once the agent is done. tools/tibia860.py reads
// these tables to render the fight sprites.
// [monster looktype, corpse item id]
export const MONSTERS = [
  [34, 5973],   // dragon
  [35, 5995],   // demon
  [22, 5962],   // cyclops
  [5, 5966],    // orc
  [38, 5977],   // giant spider
  [121, 6048],  // hydra
  [26, 5967],   // rotworm
  [33, 5972],   // skeleton
];

// How sorcerers, druids and paladins shoot, as [missile id, hit effect id].
// Sorcerers and druids draw one attack per working stretch, paladins one per
// shot. A missile id belongs to one pair only, as it names the rendered frames.
export const SORCERER = [
  [4, 16],  // fire
  [5, 12],  // energy
  [36, 11], // energy ball
  [32, 18], // sudden death
];
export const DRUID = [
  [29, 44], // ice
  [37, 42], // small ice
  [30, 9],  // earth
  [15, 17], // poison
];
export const PALADIN = [
  [3, 1],   // arrow
  [6, 1],   // poison arrow
  [7, 7],   // burst arrow
  [22, 1],  // sniper arrow
  [23, 1],  // onyx arrow
  [33, 1],  // flash arrow
  [34, 1],  // flaming arrow
  [35, 1],  // shiver arrow
  [40, 1],  // earth arrow
  [2, 1],   // bolt
  [14, 1],  // power bolt
  [16, 1],  // infernal bolt
  [24, 1],  // piercing bolt
  [1, 1],   // spear
  [17, 1],  // hunting spear
  [18, 1],  // enchanted spear
  [21, 1],  // royal spear
  [28, 1],  // ethereal spear
  [8, 1],   // throwing star
  [19, 1],  // assassin star
  [20, 1],  // viper star
  [9, 1],   // throwing knife
  [31, 49], // holy burst
  [38, 40], // small holy
];
