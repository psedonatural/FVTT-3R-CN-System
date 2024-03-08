import { ActorSheetPF } from "../sheets/base.js";
import { CR } from "../../lib.js";
import { Roll35e } from "../../roll.js";
import {ActorSheetPFNPC} from './npc.js';

/**
 * An Actor sheet for NPC type characters in the D&D5E system.
 * Extends the base ActorSheetPF class.
 * @type {ActorSheetPF}
 */
export class ActorSheetTrap extends ActorSheetPFNPC {
  /**
   * Define default rendering options for the NPC sheet
   * @return {Object}
   */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["D35E", "sheet", "actor", "npc", "trap"],
      width: 725,
      height: 400,
    });
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */

  /* -------------------------------------------- */

  /**
   * Get the correct HTML template path to use for rendering this particular sheet
   * @type {String}
   */
  get template() {
    return "systems/D35E/templates/actors/trap-sheet.html";
  }
}
