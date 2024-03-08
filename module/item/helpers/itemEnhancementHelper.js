import { Item35E } from "../entity.js";
import { Roll35e } from "../../roll.js";

export class ItemEnhancementHelper {
  static getEnhancementData(enhancement) {
    let data = mergeObject(enhancement.data || {}, enhancement.system || {});
    if (!enhancement.system) enhancement.system = duplicate(enhancement.data || {});
    delete enhancement.data;
    return enhancement.system;
  }

  static restoreEnhancementUses(enhancementData, daily = false) {
    let hasItemUpdates = false;
    if (
      !!enhancementData?.uses &&
      (!daily || enhancementData.uses.per === "day") &&
      enhancementData.uses.value !== enhancementData.uses.max
    ) {
      if (enhancementData.uses.rechargeFormula) {
        enhancementData.uses.value = Math.min(
          enhancementData.uses.value + new Roll35e(enhancementData.uses.rechargeFormula, enhancementData).roll().total,
          enhancementData.uses.max
        );
      } else {
        enhancementData.uses.value = enhancementData.uses.max;
      }
      hasItemUpdates = true;
    }
    return hasItemUpdates;
  }

  static getEnhancementItemFromData(itemData, actor, owner) {
    let data = duplicate(itemData);
    data._id = foundry.utils.randomID();
    data.actor = actor;
    return new Item35E(data, { owner: owner });
  }
}
