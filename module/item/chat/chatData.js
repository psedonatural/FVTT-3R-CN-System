import { Roll35e } from "../../roll.js";
import { ItemCombatChangesHelper } from "../helpers/itemCombatChangesHelper.js";

export class ItemChatData {
  /**
   * @param {Item35E} item Item
   */
  constructor(item) {
    this.item = item;
  }

  async getChatData(htmlOptions, rollData) {
    if (!htmlOptions) htmlOptions = {};
    const itemChatData = duplicate(this.item.system);
    const labels = this.item.labels;
    if (!rollData) {
      rollData = this.item.actor ? this.item.actor.getRollData(null, true) : {};
      rollData.item = itemChatData;
      if (this.item.actor) {
        let allCombatChanges = [];
        let attackType = this.item.type;
        this.item.actor.combatChangeItems
          .filter((o) => ItemCombatChangesHelper.canHaveCombatChanges(o, rollData, attackType))
          .forEach((i) => {
            allCombatChanges = allCombatChanges.concat(i.combatChanges.getPossibleCombatChanges(attackType, rollData));
          });

        this.item._addCombatChangesToRollData(allCombatChanges, rollData);
      }
    }

    // Get the spell specific info
    let spellbookIndex,
      spellAbility,
      ablMod = 0;
    let spellbook = null;
    let cl = 0;
    let sl = 0;
    if (this.item.type === "spell") {
      spellbookIndex = itemChatData.spellbook;
      spellbook = getProperty(this.item.actor.system, `attributes.spells.spellbooks.${spellbookIndex}`) || {};
      spellAbility = spellbook.ability;
      if (spellAbility !== "") ablMod = getProperty(this.item.actor.system, `abilities.${spellAbility}.mod`);

      cl += getProperty(spellbook, "cl.total") || 0;
      cl += itemChatData.clOffset || 0;
      cl += rollData.featClBonus || 0;
      cl -= this.item.actor.system.attributes.energyDrain || 0;

      sl += itemChatData.level;
      sl += itemChatData.slOffset || 0;

      rollData.cl = cl;
      rollData.sl = sl;
      rollData.ablMod = ablMod;
    } else if (this.item.type === "card") {
      let deckIndex = itemChatData.deck;
      let deck = getProperty(this.item.actor.system, `attributes.cards.decks.${deckIndex}`) || {};
      spellAbility = deck.ability;
      if (spellAbility !== "") ablMod = getProperty(this.item.actor.system, `abilities.${spellAbility}.mod`);

      cl += getProperty(deck, "cl.total") || 0;
      cl += itemChatData.clOffset || 0;
      cl += rollData.featClBonus || 0;
      cl -= this.item.actor.system.attributes.energyDrain || 0;

      sl += itemChatData.level;
      sl += itemChatData.slOffset || 0;

      rollData.cl = cl;
      rollData.sl = sl;
      rollData.ablMod = ablMod;
    }

    htmlOptions.async = true;
    htmlOptions.rollData = rollData;
    // Rich text description
    itemChatData.description.value = await TextEditor.enrichHTML(
      await this.item.getChatDescription(),
      htmlOptions
    );

    // General equipment properties
    const props = [];
    if (itemChatData.hasOwnProperty("equipped") && ["weapon", "equipment"].includes(this.item.data.type)) {
      props.push(itemChatData.equipped ? game.i18n.localize("D35E.Equipped") : game.i18n.localize("D35E.NotEquipped"));
    }
    if (this.item.broken) {
      props.push(game.i18n.localize("D35E.Broken"));
    }

    if (!this.item.showUnidentifiedData) {
      // Gather dynamic labels
      const dynamicLabels = {};
      dynamicLabels.range = labels.range || "";
      dynamicLabels.level = labels.sl || "";
      let rangeModifier = rollData.spellEnlarged ? 2 : 1;
      // Range
      if (itemChatData.range != null) {
        if (itemChatData.range.units === "close")
          dynamicLabels.range = game.i18n
            .localize("D35E.RangeNote")
            .format(rangeModifier * 25 + rangeModifier * Math.floor(cl / 2) * 5);
        else if (itemChatData.range.units === "medium")
          dynamicLabels.range = game.i18n
            .localize("D35E.RangeNote")
            .format(rangeModifier * 100 + rangeModifier * cl * 10);
        else if (itemChatData.range.units === "long")
          dynamicLabels.range = game.i18n
            .localize("D35E.RangeNote")
            .format(rangeModifier * 400 + rangeModifier * cl * 40);
        else if (
          ["ft", "mi", "spec"].includes(itemChatData.range.units) &&
          typeof itemChatData.range.value === "string"
        ) {
          let range = new Roll35e(itemChatData.range.value.length > 0 ? itemChatData.range.value : "0", rollData).roll()
            .total;
          dynamicLabels.range = [
            range > 0 ? "Range:" : null,
            range,
            CONFIG.D35E.distanceUnits[itemChatData.range.units],
          ].filterJoin(" ");
        }
      }
      // Duration
      if (itemChatData.duration != null) {
        if (
          !["inst", "perm"].includes(itemChatData.duration.units) &&
          typeof itemChatData.duration.value === "string"
        ) {
          let duration = new Roll35e(
            itemChatData.duration.value.length > 0 ? itemChatData.duration.value : "0",
            rollData
          ).roll().total;
          dynamicLabels.duration = [duration, CONFIG.D35E.timePeriods[itemChatData.duration.units]].filterJoin(" ");
        }
      }

      // Duration
      if (itemChatData.spellDurationData != null) {
        let isPerLevel = ["hourPerLevel", "minutePerLevel", "roundPerLevel"].includes(
          itemChatData.spellDurationData.units
        );
        if (
          !["inst", "perm"].includes(itemChatData.spellDurationData.units) &&
          typeof itemChatData.spellDurationData.value === "string"
        ) {
          let rollString = itemChatData.spellDurationData.value.length > 0 ? itemChatData.spellDurationData.value : "0";
          let duration = itemChatData.spellDurationData.value;
          if (rollString.indexOf("@cl") !== -1) {
            duration = new Roll35e(rollString, rollData).roll().total;
            let multiplier = 0;
            if (itemChatData.spellDurationData.units === "hourPerLevel") {
              multiplier = 600;
            } else if (itemChatData.spellDurationData.units === "minutePerLevel") {
              multiplier = 10;
            } else if (itemChatData.spellDurationData.units === "roundPerLevel") {
              multiplier = 1;
            }
            rollData.spellDuration = duration * multiplier;
          }
          if (!!itemChatData.spellDurationData.units) {
            if (itemChatData.spellDurationData.units === "spec") {
              dynamicLabels.duration = duration;
            } else {
              dynamicLabels.duration = [
                duration,
                CONFIG.D35E.timePeriodsSpells[itemChatData.spellDurationData.units.replace("PerRound", "")],
              ].filterJoin(" ");
            }
          }
        }
      }

      // Item type specific properties
      const fn = this[`_${this.item.data.type}ChatData`];
      if (fn) fn.bind(this)(itemChatData, labels, props);

      // Ability activation properties
      if (itemChatData.hasOwnProperty("activation")) {
        props.push(labels.target, labels.activation, dynamicLabels.range, dynamicLabels.duration);
      }

      rollData.powerAbl = 0;
      if (itemChatData.school === "bol") rollData.powerAbl = getProperty(this.item.actor.system, `abilities.str.mod`);
      if (itemChatData.school === "kin") rollData.powerAbl = getProperty(this.item.actor.system, `abilities.con.mod`);
      if (itemChatData.school === "por") rollData.powerAbl = getProperty(this.item.actor.system, `abilities.dex.mod`);
      if (itemChatData.school === "met") rollData.powerAbl = getProperty(this.item.actor.system, `abilities.int.mod`);
      if (itemChatData.school === "cla") rollData.powerAbl = getProperty(this.item.actor.system, `abilities.wis.mod`);
      if (itemChatData.school === "tel") rollData.powerAbl = getProperty(this.item.actor.system, `abilities.cha.mod`);

      // Add save DC
      if (
        itemChatData.hasOwnProperty("actionType") &&
        (getProperty(itemChatData, "save.description") || getProperty(itemChatData, "save.type")) &&
        getProperty(itemChatData, "save.description") !== "None"
      ) {
        let saveDC = new Roll35e(itemChatData.save.dc.length > 0 ? itemChatData.save.dc : "0", rollData).roll().total;
        let saveType = itemChatData.save.type
          ? CONFIG.D35E.savingThrowTypes[itemChatData.save.type]
          : itemChatData.save.description;
        if (this.item.type === "spell") {
          saveDC += new Roll35e(spellbook.baseDCFormula || "", rollData).roll().total;
        }
        saveDC += new Roll35e(rollData.featSpellDCBonus || "0", rollData).roll().total || 0;
        if (saveDC > 0 && saveType) {
          props.push(`DC ${saveDC}`);
          props.push(saveType);
        }

        //
        // //game.D35E.logger.log('Calculated spell DC for props', saveDC)
      }
    }

    // Add SR reminder
    if (this.item.type === "spell") {
      if (itemChatData.sr) {
        props.push(game.i18n.localize("D35E.SpellResistance"));
      }
      if (itemChatData.pr) {
        props.push(game.i18n.localize("D35E.PowerResistance"));
      }
    }

    // Filter properties and return
    itemChatData.properties = props.filter((p) => !!p);
    return itemChatData;
  }
}
