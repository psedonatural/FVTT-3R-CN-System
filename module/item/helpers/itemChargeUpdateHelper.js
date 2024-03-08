import { Roll35e } from "../../roll.js";
import { linkData } from "../../lib.js";

export class ItemChargeUpdateHelper {
  /**
   *
   * @param data
   * @param rollData
   */
  static setMaxUses(system, rollData) {
    if (hasProperty(system, "uses.maxFormula")) {
      if (getProperty(system, "uses.maxFormula") !== "") {
        let roll = new Roll35e(getProperty(system, "uses.maxFormula"), rollData).roll();
        system.uses.max = roll.total;
      }
    }

    if (hasProperty(system, "uses.maxPerUseFormula")) {
      if (getProperty(system, "uses.maxPerUseFormula") !== "") {
        let roll = new Roll35e(getProperty(system, "uses.maxPerUseFormula"), rollData).roll();
        system.uses.maxPerUse = roll.total;
      }
    }

    if (hasProperty(system, "enhancements.uses.maxFormula")) {
      if (getProperty(system, "enhancements.uses.maxFormula") !== "") {
        let roll = new Roll35e(getProperty(system, "enhancements.uses.maxFormula"), rollData).roll();
        system.enhancements.uses.max = roll.total;
      }
    }
  }

  /**
   *
   * @param data
   * @param srcData
   * @param actorData
   * @param actorRollData
   */
  static updateMaxUses(item, data, { srcData = null, actorData = null, actorRollData = null } = {}) {

    if (data["system.uses.max"] !== undefined) {
      return;
    }
    let doLinkData = true;
    if (srcData == null) {
      srcData = item;
      doLinkData = false;
    }
    let rollData = {};
    if (actorRollData == null) {
      if (item.actor != null) rollData = item.actor.getRollData();
      if (actorData !== null) {
        rollData = mergeObject(rollData, actorsystem, { inplace: false });
      }
    } else {
      rollData = actorRollData;
    }
    rollData.item = item.getRollData();

    if (hasProperty(srcData, "system.uses.maxFormula")) {
      if (getProperty(srcData, "system.uses.maxFormula") !== "") {
        let roll = new Roll35e(getProperty(srcData, "system.uses.maxFormula"), rollData).roll();
        if (doLinkData) linkData(srcData, data, "system.uses.max", roll.total);
        else data["system.uses.max"] = roll.total;
      }
    }

    if (hasProperty(srcData, "system.uses.maxPerUseFormula")) {
      if (getProperty(srcData, "system.uses.maxPerUseFormula") !== "") {
        let roll = new Roll35e(getProperty(srcData, "system.uses.maxPerUseFormula"), rollData).roll();
        if (doLinkData) linkData(srcData, data, "system.uses.maxPerUse", roll.total);
        else data["system.uses.maxPerUse"] = roll.total;
      }
    }

    if (hasProperty(srcData, "system.enhancements.uses.maxFormula")) {
      if (getProperty(srcData, "system.enhancements.uses.maxFormula") !== "") {
        let roll = new Roll35e(getProperty(srcData, "system.enhancements.uses.maxFormula"), rollData).roll();
        if (doLinkData) linkData(srcData, data, "system.enhancements.uses.max", roll.total);
        else data["system.enhancements.uses.max"] = roll.total;
      }
    }

    if (hasProperty(srcData, "system.combatChangesRange.maxFormula")) {
      if (getProperty(srcData, "system.combatChangesRange.maxFormula") !== "") {
        let roll = new Roll35e(getProperty(srcData, "system.combatChangesRange.maxFormula"), rollData).roll();
        if (doLinkData) linkData(srcData, data, "system.combatChangesRange.max", roll.total);
        else data["system.combatChangesRange.max"] = roll.total;
      }
    }
    for (let i = 1; i <= 3; i++)
      if (hasProperty(srcData, `system.combatChangesAdditionalRanges.slider${i}.maxFormula`)) {
        if (getProperty(srcData, `system.combatChangesAdditionalRanges.slider${i}.maxFormula`) !== "") {
          let roll = new Roll35e(
            getProperty(srcData, `system.combatChangesAdditionalRanges.slider${i}.maxFormula`),
            rollData
          ).roll();
          if (doLinkData) linkData(srcData, data, `system.combatChangesAdditionalRanges.slider${i}.max`, roll.total);
          else data[`system.combatChangesAdditionalRanges.slider${i}.max`] = roll.total;
        }
      }
  }
}
