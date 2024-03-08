import { DicePF } from "../dice.js";
import { createCustomChatMessage } from "../chat.js";
import { alterRoll, createTag, getOriginalNameIfExists, linkData } from "../lib.js";
import { ActorPF } from "../actor/entity.js";
import AbilityTemplate from "../pixi/ability-template.js";
import { ChatAttack } from "./chat/chatAttack.js";
import { D35E } from "../config.js";
import { CACHE } from "../cache.js";
import { Roll35e } from "../roll.js";
import { ItemCharges } from "./extensions/charges.js";
import { ItemRolls } from "./extensions/rolls.js";
import { ItemChatData } from "./chat/chatData.js";
import { ItemChatAction } from "./chat/chatAction.js";
import { ItemSpellHelper } from "./helpers/itemSpellHelper.js";
import { ItemEnhancements } from "./extensions/enhancement.js";
import { ItemChargeUpdateHelper } from "./helpers/itemChargeUpdateHelper.js";
import { ItemEnhancementConverter } from "./converters/enhancement.js";
import { ItemCombatChangesHelper } from "./helpers/itemCombatChangesHelper.js";
import { ItemCombatChanges } from "./extensions/combatChanges.js";
import { ItemUse } from "./extensions/use.js";
import { ItemEnhancementHelper } from "./helpers/itemEnhancementHelper.js";
import { ItemBase35E } from "./base.js";

/**
 * Override and extend the basic :class:`Item` implementation
 */
export class Item35E extends ItemBase35E {
  //static LOG_V10_COMPATIBILITY_WARNINGS = false;
  /* -------------------------------------------- */
  /*  Item Properties                             */

  /* -------------------------------------------- */

  constructor(...args) {
    super(...args);
    this.extensionMap = new Map();
    this.rolls = new ItemRolls(this);
    this.charge = new ItemCharges(this);
    this.uses = new ItemUse(this);
    this.combatChanges = new ItemCombatChanges(this);
  }

  getExtension(extension) {
    if (!this.extensionMap.has(extension)) throw `This item does not support ${extension}`;
    return this.extensionMap.get(extension);
  }

  hasExtension(extension) {
    return this.extensionMap.has(extension);
  }

  get enhancements() {
    return this.getExtension("enhancement");
  }

  /**
   * Does the Item implement an attack roll as part of its usage
   * @type {boolean}
   */
  get hasAttack() {
    return ["mwak", "rwak", "msak", "rsak"].includes(getProperty(this.system, "actionType"));
  }

  get tag() {
    return createTag(this.name);
  }

  get isAura() {
    return this.type === "aura";
  }

  get hasRolltableDraw() {
    return this.system?.rollTableDraw?.id || false;
  }

  get hasMultipleAttacks() {
    return (
      this.hasAttack &&
      getProperty(this.system, "attackParts") != null &&
      getProperty(this.system, "attackParts")?.length > 0
    );
  }

  get hasTemplate() {
    const v = getProperty(this.system, "measureTemplate.type");
    const s = getProperty(this.system, "measureTemplate.size");
    return (
      typeof v === "string" && v !== "" && ((typeof s === "string" && s.length > 0) || (typeof s === "number" && s > 0))
    );
  }

  get hasAction() {
    return (
      this.hasAttack ||
      this.hasDamage ||
      this.hasEffect ||
      this.hasRolltableDraw ||
      this.hasTemplate ||
      getProperty(this.system, "actionType") === "special" ||
      getProperty(this.system, "actionType") === "summon"
    );
  }

  get isSingleUse() {
    return getProperty(this.system, "uses.per") === "single";
  }

  get isCharged() {
    if (this.type === "card") return true;
    if (getProperty(this.system, "requiresPsionicFocus") && !this.actor?.system?.attributes?.psionicFocus) return false;
    if (this.type === "consumable" && getProperty(this.system, "uses.per") === "single") return true;
    return ["day", "week", "charges"].includes(getProperty(this.system, "uses.per"));
  }

  get displayName() {
    let name = null;
    if (this.system.identified === undefined) return this.name;
    if (this.showUnidentifiedData)
      name = getProperty(this.system, "unidentified.name") || game.i18n.localize("D35E.Unidentified");
    else name = getProperty(this.system, "identifiedName") || this.originalName;
    return name;
  }

  get combatChangeName() {
    return getProperty(this.system, "combatChangeCustomDisplayName") || this.name;
  }

  async getChatDescription() {
    return this.getDescription(this.showUnidentifiedData);
  }

  get getCombatChangesShortDescription() {
    return getProperty(this.system, "description.value");
  }

  get autoDeductCharges() {
    return this.type === "spell"
      ? getProperty(this.system, "preparation.autoDeductCharges") === true
      : this.isCharged && getProperty(this.system, "uses.autoDeductCharges") === true;
  }

  get originalName() {
    if (typeof Babele !== "undefined")
      return this.getFlag("babele", "translated") ? this.getFlag("babele", "originalName") : this.name;
    else return this.name;
  }

  get broken() {
    return (this.system?.hp?.value === 0 && this.system?.hp?.max > 0) || false;
  }

  isSpellLike() {
    return (
      this.type === "spell" ||
      getProperty(this.system, "actionType") === "rsak" ||
      getProperty(this.system, "actionType") === "msak" ||
      getProperty(this.system, "actionType") === "spellsave" ||
      getProperty(this.system, "actionType") === "heal" ||
      getProperty(this.system, "isFromSpell")
    );
  }

  get charges() {
    return new ItemCharges(this).getCharges();
  }

  get maxCharges() {
    return new ItemCharges(this).getMaxCharges();
  }

  get chargeCost() {
    return new ItemCharges(this).getChargeCost();
  }

  async addCharges(value, data = null) {
    await new ItemCharges(this).addCharges(value, data);
  }

  get isRecharging() {
    return new ItemCharges(this).isRecharging();
  }

  get hasTimedRecharge() {
    return new ItemCharges(this).hasTimedRecharge();
  }

  static setMaxUses(data, rollData) {
    ItemChargeUpdateHelper.setMaxUses(data, rollData);
  }

  /**
   * @param {String} type - The item type (such as "attack" or "equipment")
   * @param {Number} colorType - 0 for the primary color, 1 for the secondary color
   * @returns {String} A color hex, in the format "#RRGGBB"
   */
  static getTypeColor(type, colorType) {
    switch (colorType) {
      case 0:
        switch (type) {
          case "feat":
            return "#8900EA";
          case "spell":
            return "#5C37FF";
          case "class":
            return "#85B1D2";
          case "race":
            return "#00BD29";
          case "attack":
            return "#F21B1B";
          case "weapon":
          case "equipment":
          case "consumable":
          case "loot":
            return "#E5E5E5";
          case "buff":
            return "#FDF767";
          default:
            return "#FFFFFF";
        }
      case 1:
        switch (type) {
          case "feat":
            return "#5F00A3";
          case "spell":
            return "#4026B2";
          case "class":
            return "#6A8DA8";
          case "race":
            return "#00841C";
          case "attack":
            return "#A91212";
          case "weapon":
          case "equipment":
          case "consumable":
          case "loot":
            return "#B7B7B7";
          case "buff":
            return "#FDF203";
          default:
            return "#C1C1C1";
        }
    }

    return "#FFFFFF";
  }

  get typeColor() {
    return this.constructor.getTypeColor(this.type, 0);
  }

  get typeColor2() {
    return this.constructor.getTypeColor(this.type, 1);
  }

  /* -------------------------------------------- */

  /**
   * Does the Item implement a damage roll as part of its usage
   * @type {boolean}
   */
  get hasDamage() {
    return !!(getProperty(this.system, "damage") && getProperty(this.system, "damage.parts")?.length);
  }

  /* -------------------------------------------- */

  /**
   * Does the item provide an amount of healing instead of conventional damage?
   * @return {boolean}
   */
  get isHealing() {
    return getProperty(this.system, "actionType") === "heal" && getProperty(this.system, "damage.parts")?.length;
  }

  get hasEffect() {
    return (
      this.hasDamage ||
      (getProperty(this.system, "effectNotes") && getProperty(this.system, "effectNotes")?.length > 0) ||
      (getProperty(this.system, "specialActions") && getProperty(this.system, "specialActions")?.length > 0)
    );
  }

  /* -------------------------------------------- */

  /**
   * Does the Item implement a saving throw as part of its usage
   * @type {boolean}
   */
  get hasSave() {
    return !!(getProperty(this.system, "save") && getProperty(this.system, "save.ability"));
  }

  /**
   * Should the item show unidentified data
   * @type {boolean}
   */
  get showUnidentifiedData() {
    return !game.user.isGM && getProperty(this.system, "identified") === false;
  }

  /* -------------------------------------------- */
  /*	Data Preparation														*/

  /* -------------------------------------------- */

  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    super.prepareData();

    const itemData = this;
    const data = itemData.system;
    const C = CONFIG.D35E;
    const labels = {};

    // Physical items
    if (hasProperty(data, "weight")) {
      // Sync name
      if (!hasProperty(this.system, "identifiedName")) setProperty(this.system, "identifiedName", this.name);
      // Prepare unidentified cost
      if (!hasProperty(this.system, "unidentified.price")) setProperty(this.system, "unidentified.price", 0);

      // Set basic data
      itemData.system.hp = itemData.system.hp || { max: 10, value: 10 };
      itemData.system.hardness = itemData.system.hardness || 0;
      itemData.system.carried = itemData.system.carried == null ? true : itemData.system.carried;

      // Equipped label
      labels.equipped = "";
      if (itemData.system.equipped === true) labels.equipped = game.i18n.localize("D35E.Yes");
      else labels.equipped = game.i18n.localize("D35E.No");

      // Carried label
      labels.carried = "";
      if (itemData.system.carried === true) labels.carried = game.i18n.localize("D35E.Yes");
      else labels.carried = game.i18n.localize("D35E.No");

      // Identified label
      labels.identified = "";
      if (itemData.system.identified === true) labels.identified = game.i18n.localize("D35E.YesShort");
      else labels.identified = game.i18n.localize("D35E.NoShort");

      // Slot label
      if (itemData.system.slot) {
        // Add equipment slot
        const equipmentType = getProperty(this.system, "equipmentType") || null;
        if (equipmentType != null) {
          const equipmentSlot = getProperty(this.system, "slot") || null;
          labels.slot = equipmentSlot == null ? null : CONFIG.D35E.equipmentSlots[equipmentType][equipmentSlot];
        } else labels.slot = null;
      }
    }

    // Spell Level,  School, and Components
    if (itemData.type === "spell") {
      labels.level = C.spellLevels[data.level];
      labels.school = C.spellSchools[data.school];
      labels.components = Object.entries(data.components)
        .map((component) => {
          component[1] === true ? component[0].titleCase().slice(0, 1) : null;
        })
        .filterJoin(",");
      if (this.actor) {
        let spellbook = this.actor?.system?.attributes?.spells.spellbooks[data.spellbook];
        if (spellbook) data.spellbookData = { class: spellbook.class, name: spellbook.name };
      }
    }

    // Feat Items
    else if (itemData.type === "feat") {
      labels.featType = C.featTypes[data.featType];
    }


    // Feat Items
    else if (itemData.type === "attack") {
      itemData.system.isNaturalAttack = getProperty(this.system, "attackType") === "natural" || getProperty(this.system, "isNaturalEquivalent") || false;
    }

    // Buff Items
    else if (itemData.type === "buff") {
      labels.buffType = C.buffTypes[data.buffType];
    }

    // Weapon Items
    else if (itemData.type === "weapon") {
      // Type and subtype labels
      let wType = getProperty(this.system, "weaponType");
      let typeKeys = Object.keys(C.weaponTypes);
      if (!typeKeys.includes(wType)) wType = typeKeys[0];

      let wSubtype = getProperty(this.system, "weaponSubtype");
      let subtypeKeys = Object.keys(C.weaponTypes[wType]).filter((o) => !o.startsWith("_"));
      if (!subtypeKeys.includes(wSubtype)) wSubtype = subtypeKeys[0];

      labels.weaponType = C.weaponTypes[wType]._label;
      labels.weaponSubtype = C.weaponTypes[wType][wSubtype];
    }

    // Equipment Items
    else if (itemData.type === "equipment") {
      // Type and subtype labels
      let eType = getProperty(this.system, "equipmentType");
      let typeKeys = Object.keys(C.equipmentTypes);
      if (!typeKeys.includes(eType)) eType = typeKeys[0];

      let eSubtype = getProperty(this.system, "equipmentSubtype");
      let subtypeKeys = Object.keys(C.equipmentTypes[eType]).filter((o) => !o.startsWith("_"));
      if (!subtypeKeys.includes(eSubtype)) eSubtype = subtypeKeys[0];

      labels.equipmentType = C.equipmentTypes[eType]._label;
      labels.equipmentSubtype = C.equipmentTypes[eType][eSubtype];

      // AC labels
      labels.armor = data.armor.value ? `${data.armor.value} AC` : "";
      if (data.armor.dex === "") data.armor.dex = null;
      else if (typeof data.armor.dex === "string" && /\d+/.test(data.armor.dex)) {
        data.armor.dex = parseInt(data.armor.dex);
      }
      // Add enhancement bonus
      if (data.armor.enh == null) data.armor.enh = 0;
    }

    // Activated Items
    if (data.hasOwnProperty("activation")) {
      // Ability Activation Label
      let act = data.activation || {};
      if (act)
        labels.activation = [
          ["minute", "hour"].includes(act.type) ? act.cost.toString() : "",
          C.abilityActivationTypes[act.type],
        ].filterJoin(" ");

      // Target Label
      let tgt = data.target || {};
      if (["none", "touch", "personal"].includes(tgt.units)) tgt.value = null;
      if (["none", "personal"].includes(tgt.type)) {
        tgt.value = null;
        tgt.units = null;
      }
      labels.target = [tgt.value, C.distanceUnits[tgt.units], C.targetTypes[tgt.type]].filterJoin(" ");
      if (labels.target) labels.target = `Target: ${labels.target}`;

      // Range Label
      let rng = data.range || {};
      if (!["ft", "mi", "spec"].includes(rng.units)) {
        rng.value = null;
        rng.long = null;
      }
      labels.range = [rng.value, rng.long ? `/ ${rng.long}` : null, C.distanceUnits[rng.units]].filterJoin(" ");
      if (labels.range.length > 0) labels.range = ["Range:", labels.range].join(" ");

      // Duration Label
      let dur = data.duration || {};
      if (["inst", "perm", "spec"].includes(dur.units)) dur.value = null;
      labels.duration = [dur.value, C.timePeriods[dur.units]].filterJoin(" ");
    }

    // Item Actions
    if (data.hasOwnProperty("actionType")) {
      // Save DC
      let save = data.save || {};
      if (save.description || save.type) {
        labels.save = `DC ${save.dc}`;
      }

      // Damage
      let dam = data.damage || {};
      if (dam.parts) {
        labels.damage = dam.parts
          .map((d) => d[0])
          .join(" + ")
          .replace(/\+ -/g, "- ");
        labels.damageTypes = dam.parts.map((d) => d[1]).join(", ");
      }

      // Add attack parts
      if (!data.attack) data.attack = { parts: [] };
    }
    itemData["custom"] = {};
    if (data.hasOwnProperty("customAttributes")) {
      //game.D35E.logger.log(data.customAttributes)
      for (let prop in data.customAttributes || {}) {
        let propData = data.customAttributes[prop];
        itemData["custom"][(propData.name || propData.id).replace(/ /g, "").toLowerCase()] =
          propData?.selectListArray || false ? propData.selectListArray[propData.value] : propData.value;
      }
    }
    //game.D35E.logger.log('Custom properties', itemData['custom'])

    // Assign labels and return the Item
    this.labels = labels;
  }

  static _fillTemplate(templateString, templateVars) {
    return new Function("return `" + templateString + "`;").call(templateVars);
  }

  async update(updated, options = {}) {
    if (options["recursive"] !== undefined && options["recursive"] === false) {
      //game.D35E.logger.log('Skipping update logic since it is not recursive')
      await super.update(updated, options);
      return;
    }
    game.D35E.logger.log("Is true/false", updated, getProperty(this.system, "active"));
    let expandedData = expandObject(updated);
    const srcData = mergeObject(this.toObject(), expandedData);

    let needsUpdate = false; // if we do not have changes we often do not need to update actor
    if (
      this.type === "class" ||
      srcData.system?.changes?.length > 0 ||
      srcData.system?.damageReduction?.length > 0 ||
      srcData.system?.resistances?.length > 0 ||
      srcData.system?.requirements?.length > 0 ||
      srcData.system.uses?.isResource ||
      srcData.system.uses?.canBeLinked ||
      updated["system.quantity"] !== undefined ||
      updated["system.equipped"] !== undefined ||
      updated["system.carried"] !== undefined
    )
      needsUpdate = true;

    game.D35E.logger.log("Should be true/false, is true true", updated, getProperty(this.system, "active"));

    for (var key in expandedData?.system?.customAttributes) {
      if (updated[`system.customAttributes.${key}`] === null) continue;
      if (expandedData.system.customAttributes.hasOwnProperty(key)) {
        let customAttribute = expandedData.system.customAttributes[key];
        let addedAttributes = new Set();
        if (customAttribute.selectList !== undefined) {
          if (customAttribute.selectList) {
            updated[`system.customAttributes.${key}.selectListArray`] = {};
            for (let selectAttribute of customAttribute.selectList.split("|")) {
              if (selectAttribute.indexOf(":") !== -1) {
                if (!selectAttribute.split(":")[1]) continue;
                addedAttributes.add(selectAttribute.split(":")[1]);
                updated[`system.customAttributes.${key}.selectListArray`][selectAttribute.split(":")[1]] =
                  selectAttribute.split(":")[0];
              } else {
                if (!selectAttribute) continue;
                addedAttributes.add(selectAttribute);
                updated[`system.customAttributes.${key}.selectListArray`][selectAttribute] = selectAttribute;
              }
            }
          }
          let existingCustomAttribute = this.system.customAttributes[key];
          for (var _key in existingCustomAttribute.selectListArray) {
            if (!addedAttributes.has(_key)) updated[`system.customAttributes.${key}.selectListArray.-=${_key}`] = null;
          }
        }
      }
    }

    //const srcDataWithRolls = srcsystem;
    if (updated["firstChangeTarget"]) {
      updated["system.changes.0.2"] = updated["firstChangeTarget"].split(":")[0];
      updated["system.changes"][0][2] = updated["firstChangeTarget"].split(":")[0];
      srcData.firstChangeTargetName = updated["firstChangeTarget"].split(":")[1];
      delete updated["firstChangeTarget"];
    }
    if (updated["data.nameFromFormula"] || getProperty(this.system, "nameFromFormula")) {
      const srcDataWithRolls = this.getRollData(srcData);
      srcDataWithRolls.firstChangeTargetName = srcData.firstChangeTargetName;
      updated["name"] =
        Item35E._fillTemplate(
          updated["data.nameFormula"] || getProperty(this.system, "nameFormula"),
          srcDataWithRolls
        ) || updated["name"];
    }
    // Update name
    if (updated["system.identifiedName"]) updated["name"] = updated["system.identifiedName"];
    else if (updated["name"]) updated["system.identifiedName"] = updated["name"];

    let activateBuff = updated["system.active"] && updated["system.active"] !== getProperty(this.system, "active");
    let deactivateBuff =
      getProperty(this.system, "active") && updated["system.active"] !== undefined && !updated["system.active"];
    deactivateBuff = deactivateBuff || options.forceDeactivate;
    // Update description

    // Set weapon subtype
    if (
      updated["system.weaponType"] != null &&
      updated["system.weaponType"] !== getProperty(this.system, "weaponType")
    ) {
      const type = updated["system.weaponType"];
      const subtype = updated["system.weaponSubtype"] || getProperty(this.system, "weaponSubtype") || "";
      const keys = Object.keys(CONFIG.D35E.weaponTypes[type]).filter((o) => !o.startsWith("_"));
      if (!subtype || !keys.includes(subtype)) {
        updated["system.weaponSubtype"] = keys[0];
      }
    }

    if (
      updated["system.hasSpellbook"] != null &&
      updated["system.hasSpellbook"] !== getProperty(this.system, "hasSpellbook")
    ) {
      const curValue = getProperty(this.system, "spellbook");
      if (curValue == null || curValue.length === 0) {
        let spellbook = [];
        for (let a = 0; a < 10; a++) {
          spellbook.push({ level: a, spells: [] });
        }
        updated["system.spellbook"] = spellbook;
      }
    }

    if (this.pack && this.pack.startsWith("D35E")) {
      updated["system.originVersion"] = getProperty(this.system, "originVersion") + 1;
    }

    if (
      updated["system.weaponData.size"] &&
      updated["system.weaponData.size"] !== getProperty(this.system, "weaponData.size")
    ) {
      let newSize = Object.keys(CONFIG.D35E.actorSizes).indexOf(updated["system.weaponData.size"] || "");
      let oldSize = Object.keys(CONFIG.D35E.actorSizes).indexOf(getProperty(this.system, "weaponData.size") || "");
      let weightChange = Math.pow(2, newSize - oldSize);
      updated["system.weight"] = getProperty(this.system, "weight") * weightChange;
    }

    //game.D35E.logger.log("D35E Item Update", data)
    if (updated["system.convertedWeight"] !== undefined && updated["system.convertedWeight"] !== null) {
      const conversion = game.settings.get("D35E", "units") === "metric" ? 2 : 1;
      updated["system.weight"] = updated["system.convertedWeight"] * conversion;
    }

    if (updated["system.classType"] !== undefined && updated["system.classType"] === "template") {
      updated["system.hp"] = 0;
    }

    this._updateCalculateAutoDC(updated);

    if (updated["system.convertedCapacity"] !== undefined && updated["system.convertedCapacity"] !== null) {
      const conversion = game.settings.get("D35E", "units") === "metric" ? 2 : 1;
      updated["system.capacity"] = updated["system.convertedCapacity"] * conversion;
    }

    if (updated["system.selectedMaterial"] && updated["system.selectedMaterial"] !== "none") {
      updated["system.material"] = duplicate(CACHE.Materials.get(updated["system.selectedMaterial"]));
    } else if (updated["system.selectedMaterial"] && updated["system.selectedMaterial"] === "none") {
      updated["system.-=material"] = null;
    }

    {
      let rollData = {};
      if (this.actor != null) rollData = this.actor.getRollData();
      this._updateCalculateTimelineData(updated, rollData);
      this._updateCalculateDamagePoolData(updated, rollData);
      this._updateCalculateMaxDamageDice(updated, rollData);
      for (let extension of this.extensionMap.values()) {
        extension.prepareUpdateData(updated, srcData, rollData);
      }
    }

    // Set equipment subtype and slot
    if (
      updated["system.equipmentType"] != null &&
      updated["system.equipmentType"] !== getProperty(this.system, "equipmentType")
    ) {
      // Set subtype
      const type = updated["system.equipmentType"];
      const subtype = updated["system.equipmentSubtype"] || getProperty(this.system, "equipmentSubtype") || "";
      let keys = Object.keys(CONFIG.D35E.equipmentTypes[type]).filter((o) => !o.startsWith("_"));
      if (!subtype || !keys.includes(subtype)) {
        updated["system.equipmentSubtype"] = keys[0];
      }

      // Set slot
      const slot = updated["system.slot"] || getProperty(this.system, "slot") || "";
      keys = Object.keys(CONFIG.D35E.equipmentSlots[type]);
      if (!slot || !keys.includes(slot)) {
        updated["system.slot"] = keys[0];
      }
    }

    this._updateMaxUses(updated, { srcData: srcData });

    let updatedItem = null;
    // if (Object.keys(diff).length) {
    //     updatedItem = await super.update(diff, options);
    // }

    if (activateBuff) {
      updated["system.timeline.elapsed"] = 0;
      updated["system.damagePool.current"] =
        updated["system.damagePool.total"] || getProperty(this.system, "damagePool.total");
    }
    updated["system.index.subType"] = this.updateGetSubtype(updated);
    updated["system.index.uniqueId"] = updated["uniqueId"] || getProperty(this.system, "uniqueId");

    let updateData = await super.update(updated, options);
    if (this.actor !== null && !options.massUpdate) {
      if (activateBuff) {
        //Buff or item was activated
        updated["system.timeline.elapsed"] = 0;
        let actionValue = (getProperty(this.system, "activateActions") || []).map((a) => a.action).join(";");
        if (!actionValue) await this.actor.refresh(options);
        else {
          if (this.actor && this.actor.token !== null) {
            const srcDataWithRolls = this.getRollData(srcData);
            await this.actor.token.actor.applyActionOnSelf(
              actionValue,
              this.actor.token.actor,
              srcDataWithRolls,
              "self"
            );
          } else if (this.actor) {
            const srcDataWithRolls = this.getRollData(srcData);
            await this.actor.applyActionOnSelf(actionValue, this.actor, srcDataWithRolls, "self");
          }
        }
        if (getProperty(this.system, "buffType") === "shapechange") {
          if (
            getProperty(this.system, "shapechange.type") === "wildshape" ||
            getProperty(this.system, "shapechange.type") === "polymorph"
          ) {
            let itemsToCreate = [];
            for (const i of getProperty(this.system, "shapechange.source.items")) {
              if (
                i.type === "attack" &&
                (i.system.attackType === "natural" || i.system.attackType === "extraordinary")
              ) {
                //game.D35E.logger.log('add polymorph attack')
                if (!this.actor) continue;
                let data = duplicate(i);
                data.system.fromPolymorph = true;
                data.name = i.name;
                delete data._id;
                itemsToCreate.push(data);
              }
            }

            if (this.actor.token !== null) {
              await this.actor.token.actor.createEmbeddedDocuments("Item", itemsToCreate, { stopUpdates: true });
            } else {
              await this.actor.createEmbeddedDocuments("Item", itemsToCreate, { stopUpdates: true });
            }
          }
        }
        if (this.type === "aura") {
          await this.actor.refresh({ reloadAuras: true });
        }
        if (game.combats.active) {
          game.combats.active.addBuffsToCombat([{ buff: this, actor: this.actor }]);
        }
      } else if (deactivateBuff) {
        if (getProperty(this.system, "buffType") === "shapechange") {
          if (
            getProperty(this.system, "shapechange.type") === "wildshape" ||
            getProperty(this.system, "shapechange.type") === "polymorph"
          ) {
            let itemsToDelete = [];
            if (this.actor) {
              for (const i of this.actor.items) {
                if (i.system.fromPolymorph) {
                  //game.D35E.logger.log('remove polymorph attack',i,this.actor,this.actor.token)
                  itemsToDelete.push(i._id);
                }
              }
            }
            if (itemsToDelete.length)
              if (this.actor.token !== null) {
                await this.actor.token.actor.deleteEmbeddedDocuments("Item", itemsToDelete, { stopUpdates: true });
              } else {
                await this.actor.deleteEmbeddedDocuments("Item", itemsToDelete, { stopUpdates: true });
              }
          }
        }
        let actionValue = (getProperty(this.system, "deactivateActions") || []).map((a) => a.action).join(";");
        if (!actionValue) await this.actor.refresh(options);
        else {
          if (this.actor && this.actor.token !== null) {
            const srcDataWithRolls = this.getRollData(srcData);
            await this.actor.token.actor.applyActionOnSelf(
              actionValue,
              this.actor.token.actor,
              srcDataWithRolls,
              "self"
            );
          } else if (this.actor) {
            const srcDataWithRolls = this.getRollData(srcData);
            await this.actor.applyActionOnSelf(actionValue, this.actor, srcDataWithRolls, "self");
          }
        }
        if (this.type === "aura") {
          await this.actor.refresh({ reloadAuras: true });
        }
        if (game.combats.active) {
          game.combats.active.removeBuffsFromCombat([this.id]);
        }
      } else {
        if ((updated["system.range"] || updated["system.auraTarget"]) && this.type === "aura") {
          await this.actor.refresh({ reloadAuras: true });
        } else {
          if (needsUpdate) await this.actor.refresh(options);
        }
      }
    }

    game.D35E.logger.log("ITEM UPDATE | Updated");
    return Promise.resolve(updateData);
    // return super.update(data, options);
  }

  _updateCalculateAutoDC(data) {
    if (
      data["system.save.dcAutoType"] !== undefined &&
      data["system.save.dcAutoType"] !== null &&
      data["system.save.dcAutoType"] !== ""
    ) {
      let autoDCBonus = 0;
      let autoType = data["system.save.dcAutoType"];
      if (this.actor) {
        switch (autoType) {
          case "racialHD":
            if (this.actor.racialHD)
              autoDCBonus += this.actor.racialHD.system.levels;
            break;
          case "halfRacialHD":
            if (this.actor.racialHD) {
              autoDCBonus += this.actor.racialHD.system.levels;
              autoDCBonus = Math.floor(autoDCBonus / 2.0);
            }
            break;
          case "HD":
            autoDCBonus += this.actor.system.attributes.hd.total;
            break;
          case "halfHD":
            autoDCBonus += this.actor.system.attributes.hd.total;
            autoDCBonus = Math.floor(autoDCBonus / 2.0);
            break;
          default:
            break;
        }
        let ability = data["system.save.dcAutoAbility"];
        data["system.save.dc"] = 10 +
            (this.actor.system.abilities[ability]?.mod || 0) + autoDCBonus;
      } else {
        data["system.save.dc"] = 10;
      }
    }
  }

  _updateCalculateMaxDamageDice(data, rollData) {
    if (
      data["system.maxDamageDiceFormula"] != null &&
      data["system.maxDamageDiceFormula"] !== getProperty(this.system, "maxDamageDiceFormula")
    ) {
      let roll = new Roll35e(data["system.maxDamageDiceFormula"], rollData).roll();
      data["system.maxDamageDice"] = roll.total;
    }
  }

  _updateCalculateDamagePoolData(data, rollData) {
    let rollFormula = getProperty(this.system, "damagePool.formula");
    if (
      data["system.damagePool.formula"] != null &&
      data["system.damagePool.formula"] !== getProperty(this.system, "damagePool.formula")
    )
      rollFormula = data["system.damagePool.formula"];
    if (rollFormula !== undefined && rollFormula !== null && rollFormula !== "") {
      rollData.item = {};
      rollData.item.level = getProperty(this.system, "level");
      if (data["system.level"] != null && data["system.level"] !== getProperty(this.system, "level"))
        rollData.item.level = data["system.level"];
      try {
        data["system.damagePool.total"] = new Roll35e(rollFormula, rollData).roll().total;
      } catch (e) {
        data["system.damagePool.total"] = 0;
      }
    }
  }

  _updateCalculateTimelineData(data, rollData) {
    let rollFormula = getProperty(this.system, "timeline.formula");
    if (
      data["system.timeline.formula"] != null &&
      data["system.timeline.formula"] !== getProperty(this.system, "timeline.formula")
    )
      rollFormula = data["system.timeline.formula"];
    if (rollFormula !== undefined && rollFormula !== null && rollFormula !== "") {
      rollData.item = {};
      rollData.item.level = getProperty(this.system, "level");
      if (data["system.level"] != null && data["system.level"] !== getProperty(this.system, "level"))
        rollData.item.level = data["system.level"];
      try {
        data["system.timeline.total"] = new Roll35e(rollFormula.toString(), rollData).roll().total;
      } catch (e) {
        data["system.timeline.total"] = 0;
      }
    }
  }

  _updateMaxUses(data, { srcData = null, actorData = null, actorRollData = null } = {}) {
    ItemChargeUpdateHelper.updateMaxUses(this, data, {
      srcData: srcData,
      actorData: actorData,
      actorRollData: actorRollData,
    });
  }
  /* -------------------------------------------- */

  /**
   * Roll the item to Chat, creating a chat card which contains follow up attack or damage roll options
   * @return {Promise}
   */
  async roll(altChatData = {}, tempActor = null) {
    return new ItemRolls(this).roll(altChatData, tempActor);
  }

  /* -------------------------------------------- */
  /*  Chat Cards																	*/

  /* -------------------------------------------- */

  async getChatData(htmlOptions, rollData) {
    return new ItemChatData(this).getChatData(htmlOptions, rollData);
  }

  async getDescription(unidentified = false) {
    if (unidentified) return this.getUnidentifiedDescription();
    return this.system.description.value;
  }

  async getUnidentifiedDescription() {
    return this.system.description.unidentified;
  }

  _addCombatChangesToRollData(allCombatChanges, rollData) {
    let changeId = null;
    let changeVal = null;
    allCombatChanges.forEach((change) => {
      if (change.field.indexOf("$") !== -1) {
        changeId = change.field.substr(1);
        changeVal = Item35E._fillTemplate(change.formula, rollData);
        setProperty(rollData, changeId, changeVal);
      } else if (change.field.indexOf("&") !== -1) {
        changeId = change.field.substr(1);
        changeVal = Item35E._fillTemplate(change.formula, rollData);
        setProperty(
          rollData,
          change.field.substr(1),
          (getProperty(rollData, change.field.substr(1)) || "0") + " + " + changeVal
        );
      } else {
        changeId = change.field;
        changeVal = parseInt(change.formula || 0);
        setProperty(rollData, change.field, (getProperty(rollData, change.field) || 0) + changeVal);
      }
      var listId = changeId.indexOf(".") !== -1 ? `${changeId.replace(".", "List.")}` : `${changeId}List`;
      setProperty(
        rollData,
        listId,
        (getProperty(rollData, listId) || []).concat([{ value: changeVal, sourceName: change["sourceName"] }])
      );
    });
  }

  async use(
    { ev = null, skipDialog = false, replacementId = null, rollModeOverride = null, temporaryItem = false },
    tempActor = null,
    skipChargeCheck = false
  ) {
    return await this.uses.use(
      tempActor,
      replacementId,
      ev,
      skipDialog,
      rollModeOverride,
      temporaryItem,
      skipChargeCheck
    );
  }

  getActorItemRollData() {
    const itemData = this.getRollData();
    const rollData = this.actor ? duplicate(this.actor.getRollData(null, true)) : {};
    rollData.item = duplicate(itemData);
    return rollData;
  }

  getCombatActor(actor) {
    return actor.isToken
      ? game.combats.active.getCombatantByToken(actor.token.id)
      : game.combats.active.getCombatantByActor(actor.id);
  }

  /**
   *
   * @param {CombatChange[]} allCombatChanges
   * @param attack
   * @param actor
   * @param rollData
   * @param optionalFeatRanges
   * @param attackId
   * @returns {Promise<void>}
   * @private
   */
  async _addCombatSpecialActionsToAttack(allCombatChanges, attack, actor, rollData, optionalFeatRanges, attackId) {
    for (const c of allCombatChanges) {
      if (c.specialAction && c.specialAction !== "") {
        if (c.applyActionsOnlyOnce && attackId !== 0) continue;
        if (c.specialActionCondition && c.specialActionCondition !== "") {
          if (new Roll35e(c.specialActionCondition, rollData).roll().total !== true) continue;
        }
        await attack.addCommandAsSpecial(
          c.itemName,
          c.itemImg,
          c.specialAction,
          actor,
          rollData.useAmount || 1,
          rollData.cl,
          optionalFeatRanges.get(c.itemId)?.base || 0,
          this.uuid
        );
      }
    }
  }

  isCombatChangeItemType() {
    return ItemCombatChangesHelper.isCombatChangeItemType();
  }

  get hasUseableChange() {
    if (this.isCharged && !this.charges) return false;
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Adjust a cantrip damage formula to scale it for higher level characters and monsters
   * @private
   */
  _scaleCantripDamage(parts, level, scale) {
    const add = Math.floor((level + 1) / 6);
    if (add === 0) return;
    if (scale && scale !== parts[0]) {
      parts[0] = parts[0] + " + " + scale.replace(new RegExp(Roll.diceRgx, "g"), (match, nd, d) => `${add}d${d}`);
    } else {
      parts[0] = parts[0].replace(new RegExp(Roll.diceRgx, "g"), (match, nd, d) => `${parseInt(nd) + add}d${d}`);
    }
  }

  /* -------------------------------------------- */

  /**
   * Place an attack roll using an item (weapon, feat, spell, or equipment)
   * Rely upon the DicePF.d20Roll logic for the core implementation
   */
  async rollFormula(options = {}) {
    const itemData = this.system;
    if (!itemData.formula) {
      throw new Error(game.i18n.localize("D35E.ErrorNoFormula").format(this.name));
    }

    // Define Roll Data
    const rollData = this.actor.getRollData();
    rollData.item = itemData;
    const title = `${this.name} - ${game.i18n.localize("D35E.OtherFormula")}`;

    const roll = new Roll35e(itemData.formula, rollData).roll();
    return roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: itemData.chatFlavor || title,
      rollMode: game.settings.get("core", "rollMode"),
    });
  }

  /* -------------------------------------------- */

  /**
   * Use a consumable item
   */
  async rollConsumable(options = {}) {
    let itemData = this.system;
    const labels = this.labels;
    let parts = itemData.damage.parts;
    const data = this.actor.getRollData();

    // Add effect string
    let effectStr = "";
    if (typeof itemData.effectNotes === "string" && itemData.effectNotes.length) {
      effectStr = DicePF.messageRoll({
        data: data,
        msgStr: itemData.effectNotes,
      });
    }

    parts = parts.map((obj) => {
      return obj[0];
    });
    // Submit the roll to chat
    if (effectStr === "") {
      new Roll35e(parts.join("+")).toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: game.i18n.localize("D35E.UsesItem").format(this.name),
      });
    } else {
      const chatTemplate = "systems/D35E/templates/chat/roll-ext.html";
      const chatTemplateData = { hasExtraText: true, extraText: effectStr };
      // Execute the roll
      let roll = new Roll35e(parts.join("+"), data).roll();

      // Create roll template data
      const rollData = mergeObject(
        {
          user: game.user.id,
          formula: roll.formula,
          tooltip: await roll.getTooltip(),
          total: roll.total,
        },
        chatTemplateData || {}
      );

      // Create chat data
      let chatData = {
        user: game.user.id,
        type: CONST.CHAT_MESSAGE_TYPES.CHAT,
        sound: CONFIG.sounds.dice,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: game.i18n.localize("D35E.UsesItem").format(this.name),
        rollMode: game.settings.get("core", "rollMode"),
        roll: roll,
        content: await renderTemplate(chatTemplate, rollData),
      };
      // Handle different roll modes
      switch (chatData.rollMode) {
        case "gmroll":
          chatData["whisper"] = game.users.contents.filter((u) => u.isGM).map((u) => u._id);
          break;
        case "selfroll":
          chatData["whisper"] = [game.user.id];
          break;
        case "blindroll":
          chatData["whisper"] = game.users.contents.filter((u) => u.isGM).map((u) => u._id);
          chatData["blind"] = true;
      }

      // Send message
      ChatMessage.create(chatData);
    }
  }

  /* -------------------------------------------- */

  /**
   * @returns {Object} An object with data to be used in rolls in relation to this item.
   */
  getRollData(customData = null) {
    let _base = this.toObject(false).system;
    let result = {};
    if (customData) result = mergeObject(_base, customData.system);
    else result = _base;

    if (this.type === "buff" || this.type === "aura") result.level = result.level;
    if (this.type === "enhancement") result.enhancement = result.enh;
    if (this.type === "enhancement") result.enhIncrease = result.enhIncrease;
    if (this.type === "spell") result.name = this.name;
    result["custom"] = {};
    result["customNames"] = {};
    if (result.hasOwnProperty("customAttributes")) {
      for (let prop in result.customAttributes || {}) {
        let propData = result.customAttributes[prop];
        result["custom"][(propData.name || propData.id).replace(/ /g, "").toLowerCase()] = propData.value;
        result["customNames"][(propData.name || propData.id).replace(/ /g, "").toLowerCase()] =
          propData?.selectListArray || false ? propData.selectListArray[propData.value] : propData.value;
      }
    }
    result.uuid = this.uuid;
    //game.D35E.logger.log('Roll data', result)
    return result;
  }

  /* -------------------------------------------- */

  static parseAction(action) {
    let actions = [];
    for (let group of action.split(";")) {
      let condition = "";
      let groupAction = group;
      if (group.indexOf(" if ") !== -1) {
        condition = group.split(" if ")[1];
        groupAction = group.split(" if ")[0];
      }
      let actionParts = groupAction.match("([A-Za-z]+) (.*?) on (target|self)");
      if (actionParts !== null)
        actions.push({
          originalAction: group,
          action: actionParts[1],
          condition: condition,
          parameters: actionParts[2].match(/(?:[^\s"]+|"[^"]*")+/g),
          body: actionParts[2],
          target: actionParts[3],
        });
    }
    return actions;
  }

  resetPerEncounterUses() {
    if (
      getProperty(this.system, "uses") != null &&
      getProperty(this.system, "activation") != null &&
      getProperty(this.system, "activation.type") !== ""
    ) {
      let itemData = this.system;
      let updateData = {};
      if (itemData.uses && itemData.uses.per === "encounter" && itemData.uses.value !== itemData.uses.max) {
        updateData["system.uses.value"] = itemData.uses.max;
        this.update(updateData);
      }
    }
  }

  async addElapsedTime(time) {
    if (getProperty(this.system, "timeline") !== undefined && getProperty(this.system, "timeline") !== null) {
      if (!getProperty(this.system, "timeline.enabled")) return;
      if (!getProperty(this.system, "active")) return;
      if (getProperty(this.system, "timeline.elapsed") + time >= getProperty(this.system, "timeline.total")) {
        if (!getProperty(this.system, "timeline.deleteOnExpiry")) {
          let updateData = {};
          updateData["system.active"] = false;
          await this.update(updateData);
        } else {
          if (!this.actor) return;
          await this.actor.deleteOwnedItem(this.id);
        }
      } else {
        let updateData = {};
        updateData["system.timeline.elapsed"] = getProperty(this.system, "timeline.elapsed") + time;
        await this.update(updateData);
      }
    }
  }

  getElapsedTimeUpdateData(time) {
    if (getProperty(this.system, "timeline") !== undefined && getProperty(this.system, "timeline") !== null) {
      if (getProperty(this.system, "timeline.enabled") && getProperty(this.system, "active")) {
        if (getProperty(this.system, "timeline.elapsed") + time >= getProperty(this.system, "timeline.total")) {
          if (!getProperty(this.system, "timeline.deleteOnExpiry")) {
            let updateData = {};
            updateData["system.active"] = false;
            updateData["system.timeline.elapsed"] = 0;
            updateData["_id"] = this._id;
            return updateData;
          } else {
            if (!this.actor) return;
            if (this.actor.token) {
              let updateData = {};
              updateData["system.active"] = false;
              //updateData["system.timeline.elapsed"] = 0;
              updateData["_id"] = this._id;
              updateData["delete"] = true;
              return updateData;
            } else return { _id: this._id, delete: true, "data.active": false };
          }
        } else {
          let updateData = {};
          updateData["system.active"] = true;
          updateData["system.timeline.elapsed"] = getProperty(this.system, "timeline.elapsed") + time;
          updateData["_id"] = this._id;
          return updateData;
        }
      }
    }
    if (getProperty(this.system, "recharge") !== undefined && getProperty(this.system, "recharge") !== null) {
      if (getProperty(this.system, "recharge.enabled")) {
        if (getProperty(this.system, "recharge.current") - time < 1) {
          let updateData = {};
          updateData["system.recharge.current"] = 0;
          updateData["system.uses.value"] = getProperty(this.system, "uses.max");
          updateData["_id"] = this._id;
          return updateData;
        } else {
          let updateData = {};
          updateData["system.recharge.current"] = getProperty(this.system, "recharge.current") - time;
          updateData["_id"] = this._id;
          return updateData;
        }
      }
    }
    return { _id: this._id, ignore: true };
  }

  getTimelineTimeLeft() {
    if (getProperty(this.system, "timeline") !== undefined && getProperty(this.system, "timeline") !== null) {
      if (!getProperty(this.system, "timeline.enabled")) return -1;
      if (!getProperty(this.system, "active")) return -1;
      return getProperty(this.system, "timeline.total") - this.system.timeline.elapsed;
    }
    return 0;
  }

  getTimelineTimeLeftDescriptive() {
    if (getProperty(this.system, "timeline") !== undefined && getProperty(this.system, "timeline") !== null) {
      if (!getProperty(this.system, "timeline.enabled")) return "Indefinite";
      if (!getProperty(this.system, "active")) return "Not active";
      if (getProperty(this.system, "timeline.total") - getProperty(this.system, "timeline.elapsed") >= 600) {
        return (
          Math.floor(
            (getProperty(this.system, "timeline.total") - getProperty(this.system, "timeline.elapsed")) / 600
          ) + "h"
        );
      } else if (getProperty(this.system, "timeline.total") - getProperty(this.system, "timeline.elapsed") >= 10) {
        return (
          Math.floor((getProperty(this.system, "timeline.total") - getProperty(this.system, "timeline.elapsed")) / 10) +
          "min"
        );
      } else if (getProperty(this.system, "timeline.total") - getProperty(this.system, "timeline.elapsed") > 1)
        return getProperty(this.system, "timeline.total") - getProperty(this.system, "timeline.elapsed") + " rounds";
      return "Last round";
    }
    return "Indefinite";
  }

  /* -------------------------------------------- */

  static async toPolymorphBuff(origData, type) {
    let data = duplicate(game.system.template.Item.buff);
    for (let t of data.templates) {
      mergeObject(data, duplicate(game.system.template.Item.templates[t]));
    }
    delete data.templates;
    data = await this.polymorphBuffFromActor(data, origData, type);
    return data;
  }

  static async polymorphBuffFromActor(shapechangeData, origData, type) {
    shapechangeData = {
      type: "buff",
      name: origData.name,
      img: origData.img,
      system: shapechangeData,
    };

    shapechangeData.system.shapechange = { source: origData.toObject(false), type: type };
    shapechangeData.system.buffType = "shapechange";
    shapechangeData.system.sizeOverride = origData.system.traits.size;

    shapechangeData.system.changes = [];
    shapechangeData.system.changes.push(...(origData.items.find((i) => i.type === "class")?.system?.changes || []));
    if (type === "polymorph" || type === "wildshape") {
      shapechangeData.system.changes = shapechangeData.system.changes.concat([
        [
          `${getProperty(origData, "system.abilities.str.total")}`,
          "ability",
          "str",
          "replace",
          getProperty(origData, "system.abilities.str.total"),
        ],
      ]); // Strength
      shapechangeData.system.changes = shapechangeData.system.changes.concat([
        [
          `${getProperty(origData, "system.abilities.dex.total")}`,
          "ability",
          "dex",
          "replace",
          getProperty(origData, "system.abilities.dex.total"),
        ],
      ]); // Dexterity
      shapechangeData.system.changes = shapechangeData.system.changes.concat([
        [
          `${getProperty(origData, "system.abilities.con.total")}`,
          "ability",
          "con",
          "replace",
          getProperty(origData, "system.abilities.con.total"),
        ],
      ]); // Constitution
      shapechangeData.system.changes = shapechangeData.system.changes.concat([
        [
          `${getProperty(origData, "system.attributes.speed.land.total")}`,
          "speed",
          "landSpeed",
          "replace",
          getProperty(origData, "system.attributes.speed.land.total"),
        ],
      ]);
      shapechangeData.system.changes = shapechangeData.system.changes.concat([
        [
          `${getProperty(origData, "system.attributes.speed.climb.total")}`,
          "speed",
          "climbSpeed",
          "replace",
          getProperty(origData, "system.attributes.speed.climb.total"),
        ],
      ]);
      shapechangeData.system.changes = shapechangeData.system.changes.concat([
        [
          `${getProperty(origData, "system.attributes.speed.swim.total")}`,
          "speed",
          "swimSpeed",
          "replace",
          getProperty(origData, "system.attributes.speed.swim.total"),
        ],
      ]);
      shapechangeData.system.changes = shapechangeData.system.changes.concat([
        [
          `${getProperty(origData, "system.attributes.speed.burrow.total")}`,
          "speed",
          "burrowSpeed",
          "replace",
          getProperty(origData, "system.attributes.speed.burrow.total"),
        ],
      ]);
      shapechangeData.system.changes = shapechangeData.system.changes.concat([
        [
          `${getProperty(origData, "system.attributes.speed.fly.total")}`,
          "speed",
          "flySpeed",
          "replace",
          getProperty(origData, "system.attributes.speed.fly.total"),
        ],
      ]);
      shapechangeData.system.changes = shapechangeData.system.changes.concat([
        [
          `${getProperty(origData, "system.attributes.naturalACTotal")}`,
          "ac",
          "nac",
          "base",
          getProperty(origData, "system.attributes.naturalACTotal"),
        ],
      ]);
    }

    shapechangeData.system.activateActions = [];
    if (type === "wildshape") {
      shapechangeData.system.activateActions = shapechangeData.system.activateActions.concat([
        {
          name: "Activate Wildshape",
          action: "Condition set wildshaped to true on self",
          condition: "",
          img: "",
        },
        {
          name: "Set Portrait",
          action: `Update set data.shapechangeImg to ${origData.system.tokenImg} on self`,
          condition: "",
          img: "",
        },
        {
          name: "Meld weapons",
          action:
            "Set attack * field data.melded to true on self; Set weapon * field data.melded to true on self; Set equipment * field data.melded to true on self",
          condition: "",
          img: "",
        },
      ]);
    } else if (type === "polymorph") {
      shapechangeData.system.activateActions = shapechangeData.system.activateActions.concat([
        {
          name: "Activate Polymorph",
          action: "Condition set polymorph to true on self",
          condition: "",
          img: "",
        },
        {
          name: "Set Portrait",
          action: `Update set data.shapechangeImg to ${origData.system.tokenImg} on self`,
          condition: "",
          img: "",
        },
        {
          name: "Meld weapons",
          action: "Set attack:natural * field data.melded to true on self;",
          condition: "",
          img: "",
        },
      ]);
    } else if (type === "alter-self") {
      shapechangeData.system.activateActions = shapechangeData.system.activateActions.concat([
        {
          name: "Set Portrait",
          action: `Update set data.shapechangeImg to ${origData.system.tokenImg} on self`,
          condition: "",
          img: "",
        },
      ]);
    }

    shapechangeData.system.deactivateActions = [];

    if (type === "wildshape") {
      shapechangeData.system.deactivateActions = shapechangeData.system.deactivateActions.concat([
        {
          name: "Deactivate Wildshape",
          action: "Condition set wildshaped to false on self",
          condition: "",
          img: "",
        },
        {
          name: "Unmeld weapons",
          action:
            "Set attack * field data.melded to false on self; Set weapon * field data.melded to false on self; Set equipment * field data.melded to false on self",
          condition: "",
          img: "",
        },
        {
          name: "Set Portrait",
          action: `Update set data.shapechangeImg to icons/svg/mystery-man.svg on self`,
          condition: "",
          img: "",
        },
      ]);
    } else if (type === "polymorph") {
      shapechangeData.system.deactivateActions = shapechangeData.system.deactivateActions.concat([
        {
          name: "Deactivate Polymorph",
          action: "Condition set polymorph to false on self",
          condition: "",
          img: "",
        },
        {
          name: "Unmeld weapons",
          action: "Set attack:natural * field data.melded to false on self;",
          condition: "",
          img: "",
        },
        {
          name: "Set Portrait",
          action: `Update set data.shapechangeImg to icons/svg/mystery-man.svg on self`,
          condition: "",
          img: "",
        },
      ]);
    } else if (type === "alter-self") {
      shapechangeData.system.deactivateActions = shapechangeData.system.deactivateActions.concat([
        {
          name: "Set Portrait",
          action: `Update set data.shapechangeImg to icons/svg/mystery-man.svg on self`,
          condition: "",
          img: "",
        },
      ]);
    }

    // Speedlist
    let speedDesc = [];
    for (let speedKey of Object.keys(origData.system.attributes.speed)) {
      if (getProperty(origData, `data.attributes.speed.${speedKey}.total`) > 0)
        speedDesc.push(
          speedKey.charAt(0).toUpperCase() +
            speedKey.slice(1) +
            " " +
            getProperty(origData, `data.attributes.speed.${speedKey}.total`) +
            " ft."
        );
    }

    // Set description
    shapechangeData.system.description.value = await renderTemplate(
      "systems/D35E/templates/internal/shapechange-description.html",
      {
        size: game.i18n.localize(CONFIG.D35E.actorSizes[origData.system.traits.size]),
        type: origData.system.details.type,
        speed: speedDesc.join(", "),
        str: origData.system.abilities.str.total,
        dex: origData.system.abilities.dex.total,
        con: origData.system.abilities.con.total,
      }
    );
    return shapechangeData;
  }

  static async toAttack(origData, type) {
    let data = duplicate(game.system.template.Item.attack);
    for (let t of data.templates) {
      mergeObject(data, duplicate(game.system.template.Item.templates[t]));
    }
    delete data.templates;
    data = {
      type: "attack",
      name: origData.name,
      data: data,
    };

    const slcl = ItemSpellHelper.getMinimumCasterLevelBySpellData(origData.system);

    data.name = `${origData.name}`;
    data.img = `${origData.img}`;

    // Set activation method
    system.activation.type = "standard";

    // Set measure template
    if (type !== "potion" && type !== "tattoo") {
      system.measureTemplate = getProperty(origdata, "system.measureTemplate");
    }

    // Set damage formula
    system.actionType = origData.system.actionType;
    for (let d of getProperty(origdata, "system.damage.parts")) {
      d[0] = d[0].replace(/@sl/g, slcl[0]);
      d[0] = d[0].replace(/@cl/g, slcl[1]);
      system.damage.parts.push(d);
    }
    system.attackType = "misc";
    // Set saves
    system.save.description = origData.system.save.description;
    system.save.type = origData.system.save.type;
    system.save.ability = origData.system.save.ability;
    system.save.dc = 10 + slcl[0] + Math.floor(slcl[0] / 2);

    // Copy variables
    system.attackNotes = origData.system.attackNotes;
    system.effectNotes = origData.system.effectNotes;
    system.attackBonus = origData.system.attackBonus;
    system.critConfirmBonus = origData.system.critConfirmBonus;
    system.specialActions = origData.system.specialActions;
    system.attackCountFormula = origData.system.attackCountFormula.replace(/@cl/g, slcl[1]).replace(/@sl/g, slcl[0]);

    // Determine aura power
    let auraPower = "faint";
    for (let a of CONFIG.D35E.magicAuraByLevel.item) {
      if (a.level <= slcl[1]) auraPower = a.power;
    }
    if (type === "potion") {
      data.img = `systems/D35E/icons/items/potions/generated/${auraPower}.png`;
    }
    // Determine caster level label
    ItemSpellHelper.calculateSpellCasterLevelLabels(slcl);

    // Set description
    system.description.value = getProperty(origdata, "system.description.value");

    return data;
  }

  static async toTrait(origData, type) {
    let data = duplicate(game.system.template.Item.feat);
    for (let t of data.templates) {
      mergeObject(data, duplicate(game.system.template.Item.templates[t]));
    }
    delete data.templates;
    data = {
      type: "feat",
      name: origData.name,
      data: data,
    };

    const slcl = ItemSpellHelper.getMinimumCasterLevelBySpellData(origData.system);

    data.name = `${origData.name}`;
    data.img = origData.img;

    system.featType = "trait";

    system.activation.type = "standard";

    system.measureTemplate = getProperty(origdata, "system.measureTemplate");

    // Set damage formula
    system.actionType = origData.system.actionType;
    for (let d of getProperty(origdata, "system.damage.parts")) {
      d[0] = d[0].replace(/@sl/g, slcl[0]);
      d[0] = d[0].replace(/@cl/g, "@attributes.hd.total");
      system.damage.parts.push(d);
    }

    // Set saves
    system.save.description = origData.system.save.description;
    system.save.dc = origData.system.save.dc;
    system.save.type = origData.system.save.type;

    // Copy variables
    system.attackNotes = origData.system.attackNotes;
    system.effectNotes = origData.system.effectNotes;
    system.attackBonus = origData.system.attackBonus;
    system.critConfirmBonus = origData.system.critConfirmBonus;
    system.specialActions = origData.system.specialActions;
    system.attackCountFormula = origData.system.attackCountFormula.replace(/@cl/g, slcl[1]).replace(/@sl/g, slcl[0]);

    system.description.value = getProperty(origdata, "system.description.value");

    return data;
  }

  /*
    ---- Conditional modifiers support
     */
  /**
   * Generates a list of targets this modifier can have.
   * @param {Item35E} item - The item for which the modifier is to be created.
   * @returns {Object.<string, string>} A list of targets
   */
  getConditionalTargets() {
    let result = {};
    if (this.hasAttack) result["attack"] = game.i18n.localize(CONFIG.D35E.conditionalTargets.attack._label);
    if (this.hasDamage) result["damage"] = game.i18n.localize(CONFIG.D35E.conditionalTargets.damage._label);
    if (this.type === "spell" || this.hasSave)
      result["effect"] = game.i18n.localize(CONFIG.D35E.conditionalTargets.effect._label);
    // Only add Misc target if subTargets are available
    if (Object.keys(this.getConditionalSubTargets("misc")).length > 0) {
      result["misc"] = game.i18n.localize(CONFIG.D35E.conditionalTargets.misc._label);
    }
    return result;
  }

  /**
   * Generates lists of conditional subtargets this attack can have.
   * @param {string} target - The target key, as defined in CONFIG.PF1.conditionTargets.
   * @returns {Object.<string, string>} A list of conditionals
   */
  getConditionalSubTargets(target) {
    let result = {};
    // Add static targets
    if (hasProperty(CONFIG.D35E.conditionalTargets, target)) {
      for (let [k, v] of Object.entries(CONFIG.D35E.conditionalTargets[target])) {
        if (!k.startsWith("_")) result[k] = v;
      }
    }
    // Add subtargets depending on attacks
    if (["attack", "damage"].includes(target)) {
      // Add specific attacks
      if (this.hasAttack) {
        result["attack.0"] = `${game.i18n.localize("D35E.Attack")} 1`;
      }
      if (this.hasMultipleAttacks) {
        for (let [k, v] of Object.entries(getProperty(this.system, "attackParts"))) {
          result[`attack.${Number(k) + 1}`] = v[1];
        }
      }
    }
    // Add subtargets affecting effects
    if (target === "effect") {
      if (this.type === "spell") result["cl"] = game.i18n.localize("D35E.CasterLevel");
      if (this.hasSave) result["dc"] = game.i18n.localize("D35E.DC");
    }
    // Add misc subtargets
    if (target === "misc") {
      // Add charges subTarget with specific label
      if (this.type === "spell" && this.useSpellPoints())
        result["charges"] = game.i18n.localize("D35E.SpellPointsCost");
      else if (this.isCharged) result["charges"] = game.i18n.localize("D35E.ChargeCost");
    }
    return result;
  }

  /* Generates lists of conditional modifier bonus types applicable to a formula.
   * @param {string} target - The target key as defined in CONFIG.PF1.conditionTargets.
   * @returns {Object.<string, string>} A list of bonus types.
   * */
  getConditionalModifierTypes(target) {
    let result = {};
    if (target === "attack") {
      // Add bonusModifiers from CONFIG.PF1.bonusModifiers
      for (let [k, v] of Object.entries(CONFIG.D35E.bonusModifiers)) {
        result[k] = v;
      }
    }
    if (target === "damage") {
      for (let [k, v] of CACHE.DamageTypes.entries()) {
        result[k] = v.data.name;
      }
    }
    return result;
  }

  /* Generates a list of critical applications for a given formula target.
   * @param {string} target - The target key as defined in CONFIG.D35E.conditionalTargets.
   * @returns {Object.<string, string>} A list of critical applications.
   * */
  getConditionalCritical(target) {
    let result = {};
    // Attack bonuses can only apply as critical confirm bonus
    if (target === "attack") {
      result = { ...result, normal: "D35E.Normal" };
    }
    // Damage bonuses can be multiplied or not
    if (target === "damage") {
      result = { ...result, normal: "D35E.Normal" };
    }
    return result;
  }
  static get defaultConditional() {
    return {
      default: false,
      name: "",
      modifiers: [],
    };
  }

  static get defaultConditionalModifier() {
    return {
      formula: "",
      target: "",
      subTarget: "",
      type: "",
      critical: "",
    };
  }

  useSpellPoints() {
    if (!this.actor) return false;
    if (getProperty(this.system, "atWill")) return false;

    const spellbook = getProperty(this.actor.system, `attributes.spells.spellbooks.${this.system.spellbook}`);
    return spellbook.usePowerPoints;
  }

  async addLinkedItemFromData(itemData) {
    return this.update(await this.getLinkDataFromData(itemData));
  }

  async getLinkDataFromData(itemData) {
    const updateData = {};
    let _linkedItems = duplicate(getProperty(this.system, `linkedItems`) || []);
    let linkedData = {};
    linkedData.name = itemData.name;
    linkedData.img = itemData.img;
    linkedData.itemId = itemData._id;
    linkedData.packId = itemData.document.pack;
    _linkedItems.push(linkedData);
    updateData[`system.linkedItems`] = _linkedItems;
    return updateData;
  }

  getRawEffectData() {
    const createData = {
      label: this.name,
      name: this.name,
      icon: this.img,
      origin: this.uuid,
      disabled: this.type === "aura" ? false : !getProperty(this.system, "active"),
    };
    if (this.type === "buff")
      createData["flags.D35E.show"] =
        !getProperty(this.system, "hideFromToken") && !game.settings.get("D35E", "hideTokenConditions");
    if (this.type === "aura")
      createData["flags.D35E.show"] =
        !getProperty(this.system, "hideFromToken") && !game.settings.get("D35E", "hideTokenConditions");
    return createData;
  }

  async renderBuffEndChatCard() {
    const chatTemplate = "systems/D35E/templates/chat/roll-ext.html";

    // Create chat data
    let chatData = {
      user: game.user.id,
      type: CONST.CHAT_MESSAGE_TYPES.CHAT,
      sound: CONFIG.sounds.dice,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      rollMode: game.settings.get("core", "rollMode"),
      content: await renderTemplate(chatTemplate, { item: this, actor: this.actor }),
    };
    // Handle different roll modes
    switch (chatData.rollMode) {
      case "gmroll":
        chatData["whisper"] = game.users.contents.filter((u) => u.isGM).map((u) => u._id);
        break;
      case "selfroll":
        chatData["whisper"] = [game.user.id];
        break;
      case "blindroll":
        chatData["whisper"] = game.users.contents.filter((u) => u.isGM).map((u) => u._id);
        chatData["blind"] = true;
    }

    // Send message
    await createCustomChatMessage(
      "systems/D35E/templates/chat/deactivate-buff.html",
      { items: [this], actor: this.actor },
      chatData,
      { rolls: [] }
    );
  }

  capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  hasUnmetRequirements(rollData) {
    if (!rollData) {
      if (!this.actor) return []; //There are no requirements when item has no actor!
      rollData = this.actor.getRollData();
    }
    let unmetRequirements = [];
    rollData.item = this.getRollData();
    for (const _requirement of getProperty(this.system, "requirements") || []) {
      if (!_requirement[1]) continue;
      if (_requirement[2] === "generic") {
        if (!new Roll35e(_requirement[1], rollData).roll().total) {
          unmetRequirements.push(_requirement[0]);
        }
      } else if (_requirement[2] === "feat") {
        if (!this.actor.getItemByTag(_requirement[1])) {
          unmetRequirements.push(_requirement[0]);
        }
      } else if (_requirement[2] === "bab") {
        if (rollData.attributes.bab.total < parseInt(_requirement[1])) {
          unmetRequirements.push(_requirement[0] || game.i18n.localize("D35E.BAB") + " " + _requirement[1]);
        }
      } else {
        if (_requirement[2] && rollData.abilities[_requirement[2]].value < parseInt(_requirement[1])) {
          unmetRequirements.push(
            _requirement[0] ||
              game.i18n.localize(`D35E.Ability${this.capitalizeFirstLetter(_requirement[2])}`) + " " + _requirement[1]
          );
        }
      }
    }
    return unmetRequirements;
  }

  async addSpellToClassSpellbook(level, spell) {
    const updateData = {};
    let _spellbook = duplicate(this.system?.spellbook || []);
    let _spells = _spellbook[level]?.spells || [];
    for (let _spell of _spells) {
      if (_spell.id === spell.id) return;
    }
    _spells.push(spell);
    updateData[`system.spellbook`] = _spellbook;
    await this.update(updateData);
  }

  async deleteSpellFromClassSpellbook(level, spellId) {
    const updateData = {};
    let _spellbook = duplicate(this.system?.spellbook || []);
    let _spells = (_spellbook[level]?.spells || []).filter((_spell) => _spell.id !== spellId);
    _spellbook[level].spells = _spells;
    updateData[`system.spellbook`] = _spellbook;
    await this.update(updateData);
  }
}
