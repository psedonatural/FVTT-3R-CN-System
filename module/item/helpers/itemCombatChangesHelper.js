import { ItemActiveHelper } from "./itemActiveHelper.js";

export class ItemCombatChangesHelper {
  static canHaveCombatChanges(item, rollData, action) {
    return this.isCombatChangeItemType(item) && item.combatChanges.hasCombatChange(action, rollData);
  }

  static isCombatChangeItemType(item) {
    let combatChangeItemType =
      (item.type === "feat" || item.type === "aura" || item.type === "buff" || item.type === "equipment") &&
      ItemActiveHelper.isActive(item);
    return combatChangeItemType && (getProperty(item.system, "combatChanges") || []).length;
  }

  static getAllSelectedCombatChangesForRoll(
    items,
    attackType,
    rollData,
    allCombatChanges,
    rollModifiers,
    optionalFeatIds,
    optionalFeatRanges
  ) {
    items
      .filter((o) => this.isCombatChangeItemType(o))
      .forEach((i) => {
        if (i.combatChanges.hasCombatChange(attackType, rollData)) {
          allCombatChanges = allCombatChanges.concat(i.combatChanges.getPossibleCombatChanges(attackType, rollData));
          rollModifiers.push(`${i.system.combatChangeCustomReferenceName || i.name}`);
        }
        if (
          i.combatChanges.hasCombatChange(attackType + "Optional", rollData) &&
          optionalFeatIds.indexOf(i._id) !== -1
        ) {
          allCombatChanges = allCombatChanges.concat(
            i.combatChanges.getPossibleCombatChanges(attackType + "Optional", rollData, optionalFeatRanges.get(i._id))
          );

          if (optionalFeatRanges.get(i._id)) {
            let ranges = [];
            if (optionalFeatRanges.get(i._id).base) ranges.push(optionalFeatRanges.get(i._id).base);
            if (optionalFeatRanges.get(i._id).slider1) ranges.push(optionalFeatRanges.get(i._id).slider1);
            if (optionalFeatRanges.get(i._id).slider2) ranges.push(optionalFeatRanges.get(i._id).slider2);
            if (optionalFeatRanges.get(i._id).slider3) ranges.push(optionalFeatRanges.get(i._id).slider3);
            rollModifiers.push(`${i.system.combatChangeCustomReferenceName || i.name} (${ranges.join(", ")})`);
          } else rollModifiers.push(`${i.system.combatChangeCustomReferenceName || i.name}`);

          i.addCharges(
            -1 *
              (i.system.combatChangesUsesCost === "chargesPerUse"
                ? i.system?.uses?.chargesPerUse || 1
                : optionalFeatRanges.get(i._id).base)
          );
        }
      });
    return allCombatChanges;
  }
}
