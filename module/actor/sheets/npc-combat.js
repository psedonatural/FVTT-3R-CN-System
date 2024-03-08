import { ActorSheetPFNPC } from "./npc.js";

export class ActorSheetPFNPCCombat extends ActorSheetPFNPC {

  /**
   * Define default rendering options for the NPC sheet
   * @return {Object}
   */
	static get defaultOptions() {
	  return mergeObject(super.defaultOptions, {
      classes: ["D35E", "sheet", "actor", "npc", "monster", "sidebar"],
        height: 0,
        popOut: false,
        id: "actor-combat-sheet"
    });
  }

  get id() {
    return "actor-combat-sheet";
  }
    
  get template() {
    return "systems/D35E/templates/actors/npc-sheet-combat.html";
  }

  _render(...args) {
    this._element = null;
    return super._render(...args);
  }
}
