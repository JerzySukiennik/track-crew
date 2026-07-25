// Track Crew — wagon economy table: prices, levels and capacities (approved economy).

export const WAGONS = {
  loco:     { name: "Locomotive", unique: true,  levels: [ {}, { price: 60, speedMul: 0.85, unlocks: "forest" }, { price: 110, speedMul: 0.85, unlocks: "desert" } ] },
  tank:     { name: "Water Tank", unique: true,  levels: [ {}, { price: 35, heatMul: 0.75 }, { price: 70, heatMul: 0.60 } ] },
  crafter:  { name: "Crafter",  price: 30, store: "Holds 10 wood + 10 iron", levels: [ { capWood: 10, capIron: 10, perCycle: 1, label: "Holds 10 + 10" }, { price: 30, capWood: 20, capIron: 20, perCycle: 1, label: "Holds 20 + 20" }, { price: 60, capWood: 30, capIron: 30, perCycle: 2, label: "Holds 30 + 30, crafts 2x" } ] },
  holder:   { name: "Holder",   price: 25, levels: [ { capRails: 10 }, { price: 25, capRails: 20 }, { price: 50, capRails: 30 } ] },
  ghost:    { name: "Ghost",    price: 20, levels: [ {} ] },
  dynamite: { name: "Dynamite", price: 45, levels: [ { sticks: 1, radius: 2.5 }, { price: 40, sticks: 2, radius: 3.75 } ] },
  workshop: { name: "Workshop", price: 70, levels: [ {} ] },
  vault:    { name: "Vault",    price: 55, levels: [ { cap: 10 }, { price: 40, cap: 20 } ] }
};

export const START_CONSIST = [
  { type: "loco", level: 0 },
  { type: "tank", level: 0 },
  { type: "crafter", level: 0 },
  { type: "holder", level: 0 }
];

export const FIXED_SLOTS = { loco: 0, tank: 1 };

export const SHOP_TYPES = ["crafter", "holder", "ghost", "dynamite", "workshop", "vault"];

export const OFFER_COUNT = 5;
