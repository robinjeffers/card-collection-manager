import type { Collection } from "./types"

export const DECK_TAGS = ["Consumable", "Tier 1", "Tier 2", "Tier 3", "Spells", "Unique"]

export const defaultCollection: Collection = {
  columns: [
    { id: "name", name: "Card Name", type: "text", locked: true },
    { id: "artwork", name: "Artwork Path", type: "image", locked: true, isArtwork: true },
    { id: "tags", name: "Deck Tags", type: "tag", options: [...DECK_TAGS], locked: true },
    { id: "strength", name: "Strength", type: "number", locked: true },
    { id: "dexterity", name: "Dexterity", type: "number", locked: true },
    { id: "intellect", name: "Intellect", type: "number", locked: true },
    { id: "faith", name: "Faith", type: "number", locked: true },
  ],
  rows: [
    {
      id: "card-ember-knight",
      values: {
        name: "Ember Knight",
        artwork: "/cards/ember-knight.png",
        tags: ["Tier 2", "Unique"],
        strength: 8,
        dexterity: 5,
        intellect: 2,
        faith: 3,
      },
    },
    {
      id: "card-frost-sorceress",
      values: {
        name: "Frost Sorceress",
        artwork: "/cards/frost-sorceress.png",
        tags: ["Spells", "Tier 3"],
        strength: 2,
        dexterity: 4,
        intellect: 9,
        faith: 6,
      },
    },
    {
      id: "card-healing-potion",
      values: {
        name: "Healing Potion",
        artwork: "/cards/healing-potion.png",
        tags: ["Consumable", "Tier 1"],
        strength: 0,
        dexterity: 0,
        intellect: 1,
        faith: 4,
      },
    },
    {
      id: "card-ancient-golem",
      values: {
        name: "Ancient Golem",
        artwork: "/cards/ancient-golem.png",
        tags: ["Tier 3", "Unique"],
        strength: 10,
        dexterity: 1,
        intellect: 3,
        faith: 2,
      },
    },
    {
      id: "card-shadow-assassin",
      values: {
        name: "Shadow Assassin",
        artwork: "/cards/shadow-assassin.png",
        tags: ["Tier 2", "Spells"],
        strength: 6,
        dexterity: 9,
        intellect: 5,
        faith: 1,
      },
    },
  ],
}
