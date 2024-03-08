import { Roll35e } from "../../roll.js";

export class ItemCharges {
  /**
   * @param {Item35E} item Item
   */
  constructor(item) {
    this.item = item;
  }

  getCharges() {
    if (this.item.type === "card") return this.item.system.state === "hand";
    if (this.item.system?.linkedChargeItem?.id) {
      if (!this.item.actor) return 0;
      return this.item.actor.getChargesFromItemById(this.item.system?.linkedChargeItem?.id);
    } else {
      if (getProperty(this.item.system, "uses.per") === "single") return getProperty(this.item.system, "quantity");
      if (this.item.type === "spell") return this.#getSpellUses();
      return getProperty(this.item.system, "uses.value") || 0;
    }
  }

  getMaxCharges() {
    if (this.item.system?.linkedChargeItem?.id) {
      if (!this.item.actor) return 0;
      return this.item.actor.getMaxChargesFromItemById(this.item.system?.linkedChargeItem?.id);
    } else {
      if (getProperty(this.item.system, "uses.per") === "single") return getProperty(this.item.system, "quantity");
      if (this.item.type === "spell") return this.#getSpellUses();
      return getProperty(this.item.system, "uses.max") || 0;
    }
  }

  /**
   * Generic charge addition (or subtraction) function that either adds charges
   * or quantity, based on item data.
   * @param {number} value       - The amount of charges to add.
   * @param {Object} [data=null] - An object in the style of that of an update call to alter, rather than applying the change immediately.
   * @returns {Promise}
   */
  async addCharges(value, data = null) {
    let chargeItem = this.item;
    let isChargeLinked = false;
    if (this.item.system?.linkedChargeItem?.id) {
      isChargeLinked = true;
      chargeItem = this.item.actor.getItemByUidOrId(this.item.system?.linkedChargeItem?.id);
      if (!chargeItem) return;
    }

    if (getProperty(this.item.system, "requiresPsionicFocus")) {
      if (this.item.actor) {
        await this.item.actor.update({ "system.attributes.psionicFocus": false });
      }
    }

    if (getProperty(chargeItem.system, "uses.per") === "single" && getProperty(chargeItem.system, "quantity") == null)
      return;

    if (this.item.type === "card") return this.#addCardCharges(value, data);
    if (this.item.type === "spell") return this.#addSpellUses(value, data);

    let prevValue = this.item.isSingleUse
      ? getProperty(chargeItem.system, "quantity")
      : getProperty(chargeItem.system, "uses.value");
    if (data != null && this.item.isSingleUse && data["system.quantity"] != null) prevValue = data["system.quantity"];
    else if (data != null && !this.item.isSingleUse && data["system.uses.value"] != null)
      prevValue = data["system.uses.value"];

    let newUses = prevValue + value;
    let rechargeTime = 0;
    let rechargeFormula = null;
    if (!isChargeLinked && newUses === 0) {
      rechargeFormula = getProperty(this.item.system, "recharge.formula");
    } else if (isChargeLinked && newUses === 0) {
      rechargeFormula = getProperty(chargeItem.system, "recharge.formula");
    }

    if (rechargeFormula) {
      rechargeTime = new Roll35e(rechargeFormula, {}).roll().total;
    }
    game.D35E.logger.log("Recharge and uses", data, newUses, rechargeFormula, rechargeTime);
    if (data != null && !isChargeLinked) {
      if (this.item.isSingleUse) {
        data["system.quantity"] = newUses;
      } else {
        data["system.uses.value"] = newUses;
        data["system.recharge.current"] = rechargeTime;
      }
    } else {
      if (this.item.isSingleUse) await chargeItem.update({ "system.quantity": newUses }, { stopUpdates: true });
      else
        await chargeItem.update(
          { "system.uses.value": newUses, "system.recharge.current": rechargeTime },
          { stopUpdates: true }
        );
    }
  }

  #getSpellUses() {
    if (!this.item.actor) return 0;
    if (getProperty(this.item.system, "atWill")) return Number.POSITIVE_INFINITY;

    if (getProperty(this.item.system, "requiresPsionicFocus") && !this.item.actor?.system?.attributes?.psionicFocus)
      return 0;
    const spellbook = getProperty(this.item.actor.system, `attributes.spells.spellbooks.${this.item.system.spellbook}`),
      isSpontaneous = spellbook.spontaneous,
      usePowerPoints = spellbook.usePowerPoints,
      isEpic = getProperty(this.item.system, "level") > 9,
      spellLevel = getProperty(this.item.system, "level");
    return usePowerPoints
      ? getProperty(spellbook, `powerPoints`) - getProperty(this.item.system, "powerPointsCost") >= 0 || 0
      : isSpontaneous && !isEpic
      ? getProperty(spellbook, `spells.spell${spellLevel}.value`) || 0
      : getProperty(this.item.system, "preparation.preparedAmount") || 0;
  }

  async #addCardCharges(value, data) {
    let newState = "deck";
    if (value < 0) newState = "discarded";
    if (value >= 0) newState = "hand";
    const key = "system.state";
    if (data == null) {
      data = {};
      data[key] = newState;
      return this.item.update(data);
    } else {
      data[key] = newState;
    }
  }

  async #addSpellUses(value, data = null) {
    if (!this.item.actor) return;
    if (getProperty(this.item.system, "atWill")) return;
    //if (getProperty(this.item.system,"level") === 0) return;

    //game.D35E.logger.log(`Adding spell uses ${value}`)
    const spellbook = getProperty(this.item.actor.system, `attributes.spells.spellbooks.${this.item.system.spellbook}`),
      isSpontaneous = spellbook.spontaneous,
      usePowerPoints = spellbook.usePowerPoints,
      spellbookKey = getProperty(this.item.system, "spellbook") || "primary",
      spellLevel = getProperty(this.item.system, "level");
    const newCharges = usePowerPoints
      ? Math.max(
          0,
          (getProperty(spellbook, `powerPoints`) || 0) + value * getProperty(this.item.system, "powerPointsCost")
        )
      : isSpontaneous
      ? Math.max(0, (getProperty(spellbook, `spells.spell${spellLevel}.value`) || 0) + value)
      : Math.max(0, (getProperty(this.item.system, "preparation.preparedAmount") || 0) + value);

    if (!isSpontaneous && !usePowerPoints) {
      const key = "system.preparation.preparedAmount";
      if (data == null) {
        data = {};
        data[key] = newCharges;
        return this.item.update(data);
      } else {
        data[key] = newCharges;
      }
    } else if (usePowerPoints) {
      const key = `system.attributes.spells.spellbooks.${spellbookKey}.powerPoints`;
      const actorUpdateData = {};
      if (getProperty(this.item.system, "requiresPsionicFocus"))
        actorUpdateData["system.attributes.psionicFocus"] = false;
      actorUpdateData[key] = newCharges;
      return this.item.actor.update(actorUpdateData);
    } else {
      const key = `system.attributes.spells.spellbooks.${spellbookKey}.spells.spell${spellLevel}.value`;
      const actorUpdateData = {};
      actorUpdateData[key] = newCharges;
      return this.item.actor.update(actorUpdateData);
    }

    return null;
  }

  getChargeCost() {
    if (getProperty(this.item.system, "uses.per") === "single") return 1;
    if (this.item.type === "spell") return 1;
    return getProperty(this.item.system, "uses.chargesPerUse") || 1;
  }

  isRecharging() {
    return this.item.system?.recharge?.enabled && this.item.system?.recharge?.current;
  }

  hasTimedRecharge() {
    return this.item.system?.recharge?.enabled;
  }
}
