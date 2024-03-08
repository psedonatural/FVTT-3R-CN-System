import { Roll35e } from "../../roll.js";
import { CombatChange } from "./combatChange.js";

export class ItemCombatChanges {
  /**
   * @param {Item35E} item Item
   */
  constructor(item) {
    this.item = item;
  }

  hasCombatChange(itemType, rollData) {
    let combatChanges = getProperty(this.item.system, "combatChanges") || [];
    let attackType = getProperty(rollData, "item.actionType") || "";
    let combatChangesRollData = duplicate(rollData);
    combatChangesRollData.self = mergeObject(this.item.system, this.item.getRollData(), { inplace: false });
    combatChangesRollData.source = combatChangesRollData.self;
    try {
      combatChanges.forEach((change) => {
        this.#mapToFields(change);
      });
      return combatChanges.some((change) => {
        return (
          (change["itemType"] === "all" || change["itemType"] === itemType) &&
          (change["actionType"] === "" || attackType === change["actionType"]) &&
          (change["condition"] === "" || new Roll35e(change["condition"], combatChangesRollData).roll().total === true)
        );
      });
    } catch {
      return false;
    }
  }

  /**
   * @param {*} itemType
   * @param {*|object} rollData
   * @returns {CombatChange[]}
   */
  getPossibleCombatChanges(itemType, rollData, range = { base: 0, slider1: 0, slider2: 0, slider3: 0 }) {
    if (itemType.endsWith("Optional") && this.item.isCharged && !this.item.charges) return [];
    let combatChanges = getProperty(this.item.system, "combatChanges") || [];
    let attackType = getProperty(rollData, "item.actionType") || "";
    let combatChangesRollData = duplicate(rollData);
    combatChangesRollData.self = mergeObject(this.item.system, this.item.getRollData(), { inplace: false });
    combatChangesRollData.source = combatChangesRollData.self;
    combatChangesRollData.range = range.base || 0;
    combatChangesRollData.range1 = range.slider1 || 0;
    combatChangesRollData.range2 = range.slider2 || 0;
    combatChangesRollData.range3 = range.slider3 || 0;
    combatChanges.forEach((change) => {
      this.#mapToFields(change);
    });
    return combatChanges
      .filter((change) => {
        return (
          (change["itemType"] === "all" || change["itemType"] === itemType) &&
          (change["actionType"] === "" || attackType === change["actionType"]) &&
          (change["condition"] === "" || new Roll35e(change["condition"], combatChangesRollData).roll().total === true)
        );
      })
      .map((c) => {
        let hasAction = false;
        if (typeof c["formula"] === "string") {
          c["formula"] = c["formula"].replace(/@range1/g, combatChangesRollData.range1);
          c["formula"] = c["formula"].replace(/@range2/g, combatChangesRollData.range2);
          c["formula"] = c["formula"].replace(/@range3/g, combatChangesRollData.range3);
          c["formula"] = c["formula"].replace(/@range/g, combatChangesRollData.range);
          let regexpSource = /@source.([a-zA-Z\.0-9]+)/g;
          for (const match of c["formula"].matchAll(regexpSource)) {
            c["formula"] = c["formula"].replace(`@source.${match[1]}`, getProperty(this.item.system, match[1]) || 0);
          }
          if (c["formula"] !== "" && c["formula"] !== undefined) hasAction = true;
        }
        // We do not pre-roll things that have a roll inside, we assume they will be rolled later
        if (c["formula"].indexOf("d") === -1 && c["field"].indexOf("&") === -1) {
          if (c["formula"] !== "") {
            if (c["formula"].toString().indexOf("@") !== -1) {
              c["formula"] = new Roll35e(`${c["formula"]}`, combatChangesRollData).roll().total;
            }
            hasAction = true;
          } else {
            c["formula"] = 0;
          }
        }
        if (c.length === 6 || c.length === 7) {
          if (typeof c["specialAction"] === "string") {
            c["specialAction"] = c["specialAction"].replace(/@range1/g, combatChangesRollData.range1);
            c["specialAction"] = c["specialAction"].replace(/@range2/g, combatChangesRollData.range2);
            c["specialAction"] = c["specialAction"].replace(/@range3/g, combatChangesRollData.range3);
            c["specialAction"] = c["specialAction"].replace(/@range/g, combatChangesRollData.range);
            let regexpSource = /@source.([a-zA-Z\.0-9]+)/g;
            for (const match of c["specialAction"].matchAll(regexpSource)) {
              c["specialAction"] = c["specialAction"].replace(
                `@source.${match[1]}`,
                getProperty(this.item.system, match[1]) || 0
              );
            }
            hasAction = true;
          }
          c["itemId"] = this.item.id;
          c["itemName"] = this.item.name;
          c["itemImg"] = this.item.img;
          c["applyActionsOnlyOnce"] = getProperty(this.item.system, "applyActionsOnlyOnce") || false;
        }
        if (!hasAction) {
          ui.notifications.warn(game.i18n.localize("D35E.EmptyCombatChange").format(this.item.name));
        }
        c["sourceName"] = this.item.name;
        return CombatChange.fromObject(c);
      });
  }

  #mapToFields(combatChange) {
    combatChange["itemType"] = combatChange[0];
    combatChange["actionType"] = combatChange[1];
    combatChange["condition"] = combatChange[2];
    combatChange["field"] = combatChange[3];
    combatChange["formula"] = combatChange[4];
    combatChange["specialAction"] = combatChange[5] || "";
    combatChange["specialActionCondition"] = combatChange[6] || "";
  }
}
