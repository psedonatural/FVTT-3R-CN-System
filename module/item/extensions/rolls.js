import { Roll35e } from "../../roll.js";
import { alterRoll } from "../../lib.js";
import { CACHE } from "../../cache.js";
import { Item35E } from "../entity.js";
import { createCustomChatMessage } from "../../chat.js";
import { ItemSpellHelper as ItemSpellHelper } from "../helpers/itemSpellHelper.js";
import { ItemCombatCalculationsHelper } from "../helpers/itemCombatCalculationsHelper.js";

/**
 * Place an attack roll using an item (weapon, feat, spell, or equipment)
 * Rely upon the DicePF.d20Roll logic for the core implementation
 */
export class ItemRolls {
  /**
   * @param {Item35E} item Item
   */
  constructor(item) {
    this.item = item;
  }

  /**
   * Roll the item to Chat, creating a chat card which contains follow up attack or damage roll options
   * @return {Promise}
   */
  async roll(altChatData = {}, tempActor = null) {
    let actor = this.item.actor;
    if (tempActor != null) actor = tempActor;
    if (actor && !actor.isOwner) return ui.notifications.warn(game.i18n.localize("D35E.ErrorNoActorPermission"));

    // Basic template rendering data
    const token = actor ? actor.token : null;
    const templateData = {
      actor: actor,
      name: this.item.displayName,
      tokenId: token ? `${token.parent.id}.${token.id}` : null,
      item: this.item,
      data: await this.item.getChatData(),
      labels: this.item.labels,
      hasAttack: this.item.hasAttack,
      hasMultipleAttacks: this.item.hasMultipleAttacks,
      hasAction: this.item.hasAction || this.item.isCharged,
      isHealing: this.item.isHealing,
      hasDamage: this.item.hasDamage,
      hasEffect: this.item.hasEffect,
      isVersatile: this.item.isVersatile,
      hasSave: this.item.hasSave,
      isSpell: this.item.data.type === "spell",
    };

    // Roll spell failure chance
    if (templateData.isSpell && this.item.actor != null && this.item.actor.spellFailure > 0) {
      const spellbook = getProperty(
        this.item.actor.system,
        `attributes.spells.spellbooks.${this.item.system.spellbook}`
      );
      if (spellbook && spellbook.arcaneSpellFailure) {
        templateData.spellFailure = new Roll35e("1d100").roll().total;
        templateData.spellFailureSuccess = templateData.spellFailure > this.item.actor.spellFailure;
      }
    }

    // Render the chat card template
    const templateType = ["consumable"].includes(this.item.data.type) ? this.item.data.type : "item";
    const template = `systems/D35E/templates/chat/${templateType}-card.html`;

    // Basic chat message data
    const chatData = mergeObject(
      {
        user: game.user.id,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
      },
      altChatData
    );

    // Toggle default roll mode
    let rollMode = chatData.rollMode || game.settings.get("core", "rollMode");
    if (["gmroll", "blindroll"].includes(rollMode)) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM");
    if (rollMode === "blindroll") chatData["blind"] = true;

    // Create the chat message
    return createCustomChatMessage(template, templateData, chatData);
  }

  rollAttack(options = {}) {
    const itemData = this.item.system;
    let rollData;
    if (!options.data) {
      rollData = this.item.actor.getRollData();
      rollData.item = mergeObject(duplicate(itemData), this.item.getRollData(), { inplace: false });
    } else rollData = options.data;

    // Add CL

    if (this.item.isSpellLike()) {
      ItemSpellHelper.adjustSpellCL(this.item, itemData, rollData);
    }
    // Determine size bonus
    rollData.sizeBonus = CONFIG.D35E.sizeMods[rollData.traits.actualSize];
    // Add misc bonuses/penalties
    rollData.item.proficiencyPenalty = -4;

    // Determine ability score modifier
    let abl = rollData.item.ability.attack;

    // Define Roll parts
    let parts = [];
    let descriptionParts = [];
    // Add ability modifier
    if (abl != "" && rollData.abilities[abl] != null) {
      parts.push(`@abilities.${abl}.mod`);
      descriptionParts.push({
        name: game.i18n.localize("D35E.AttackAbilityModifier"),
        value: rollData.abilities[abl].mod,
      });
    }
    // Add bonus parts
    if (options.parts != null) parts = parts.concat(options.parts);
    // Add size bonus
    if (rollData.sizeBonus !== 0) {
      parts.push("@sizeBonus");
      descriptionParts.push({ name: game.i18n.localize("D35E.AttackSizeBonus"), value: rollData.sizeBonus });
    }
    if (rollData.featAttackBonusList) {
      for (let [i, bonus] of rollData.featAttackBonusList.entries()) {
        if (typeof bonus["value"] === "string" || bonus["value"] instanceof String)
          bonus["value"] = new Roll35e(bonus["value"], rollData).roll().total;
        parts.push("${this.featAttackBonusList[" + i + "].value}");
        descriptionParts.push({ name: bonus["sourceName"], value: bonus["value"] });
      }
    }

    // Add attack bonus
    if (rollData.item.attackBonus !== "") {
      let attackBonus = new Roll35e(rollData.item.attackBonus, rollData).roll().total;
      rollData.item.attackBonus = attackBonus.toString();
      parts.push("@item.attackBonus");
      descriptionParts.push({ name: game.i18n.localize("D35E.AttackItemBonus"), value: rollData.item.attackBonus });
    }

    // Add certain attack bonuses
    if (rollData.attributes.attack.general !== 0) {
      parts.push("@attributes.attack.general");
      descriptionParts.push({
        name: game.i18n.localize("D35E.AttackGeneralBonus"),
        value: rollData.attributes.attack.general,
      });
    }
    if (["mwak", "msak"].includes(itemData.actionType) && rollData.attributes.attack.melee !== 0) {
      parts.push("@attributes.attack.melee");
      descriptionParts.push({
        name: game.i18n.localize("D35E.AttackGeneralMeleeBonus"),
        value: rollData.attributes.attack.melee,
      });
    } else if (["rwak", "rsak"].includes(itemData.actionType) && rollData.attributes.attack.ranged !== 0) {
      parts.push("@attributes.attack.ranged");
      descriptionParts.push({
        name: game.i18n.localize("D35E.AttackGeneralRangedBonus"),
        value: rollData.attributes.attack.ranged,
      });
    }
    // Add BAB
    if (rollData.attributes.bab.total != null) {
      parts.push("@attributes.bab.total");
      descriptionParts.push({ name: game.i18n.localize("D35E.AttackBAB"), value: rollData.attributes.bab.total });
    }
    rollData.item.enh = options?.replacedEnh || 0;
    // Add item's enhancement bonus
    if (rollData.item.enh !== 0 && rollData.item.enh != null) {
      parts.push("@item.enh");
      descriptionParts.push({ name: game.i18n.localize("D35E.AttackEnhancementBonus"), value: rollData.item.enh });
    }
    // Subtract energy drain
    if (rollData.attributes.energyDrain != null && rollData.attributes.energyDrain !== 0) {
      parts.push("- max(0, abs(@attributes.energyDrain))");
      descriptionParts.push({
        name: game.i18n.localize("D35E.AttackEnergyDrainPenalty"),
        value: rollData.attributes.energyDrain,
      });
    }
    // Add proficiency penalty
    if (this.item.type === "attack" && !itemData.proficient) {
      parts.push("@item.proficiencyPenalty");
      descriptionParts.push({
        name: game.i18n.localize("D35E.AttackProficiencyPenalty"),
        value: rollData.item.proficiencyPenalty,
      });
    }
    // Add masterwork bonus
    if (this.item.type === "attack" && itemData.masterwork === true && itemData.enh < 1) {
      rollData.item.masterworkBonus = 1;
      parts.push("@item.masterworkBonus");
      descriptionParts.push({
        name: game.i18n.localize("D35E.AttackMasterworkBonus"),
        value: rollData.item.masterworkBonus,
      });
    }
    // Add secondary natural attack penalty
    if (options.primaryAttack === false) {
      if (this.item.actor.getFlag("D35E", "improvedMultiattack")) {
        descriptionParts.push({ name: game.i18n.localize("D35E.AttackSecondaryAttackPenalty"), value: 0 });
      } else if (this.item.actor.getFlag("D35E", "multiAttack")) {
        parts.push("-2");
        descriptionParts.push({ name: game.i18n.localize("D35E.AttackSecondaryAttackPenalty"), value: -2 });
      } else {
        parts.push("-5");
        descriptionParts.push({ name: game.i18n.localize("D35E.AttackSecondaryAttackPenalty"), value: -5 });
      }
    }

    if (options.bonus) {
      rollData.bonus = options.bonus;
      parts.push("@bonus");
      descriptionParts.push({ name: game.i18n.localize("D35E.AttackArbitraryBonus"), value: options.bonus });
    }
    // Add extra parts
    if (options.extraParts != null) {
      for (let part of options.extraParts) {
        parts.push(part.part);
        descriptionParts.push({ name: part.source, value: part.value });
      }
    }
    let roll = null;
    if (options.bonusOnly) {
      roll = new Roll35e(parts.join("+"), rollData).roll();
    } else {
      roll = new Roll35e(["1d20"].concat(parts).join("+"), rollData).roll();
    }
    roll.descriptionParts = descriptionParts;
    return roll;
  }

  /* -------------------------------------------- */

  /**
   * Only roll the item's effect.
   */
  async rollEffect({ critical = false, primaryAttack = true } = {}, tempActor = null, _rollData = rollData) {
    const itemData = this.item.system;
    let actor = this.item.actor;
    if (tempActor !== null) {
      actor = tempActor;
    }

    const actorData = actor.system;
    const rollData = mergeObject(
      duplicate(actorData),
      {
        item: mergeObject(itemData, this.item.getRollData(), { inplace: false }),
        ablMult: 0,
      },
      { inplace: false }
    );

    if (!this.item.hasEffect) {
      throw new Error("You may not make an Effect Roll with this Item.");
    }

    // Add spell data
    if (this.item.isSpellLike()) {
      ItemSpellHelper.adjustSpellCL(this.item, itemData, rollData);
      const sl = getProperty(this.item.system, "level") + (getProperty(this.item.system, "slOffset") || 0);
      rollData.sl = sl;
    }

    // Determine critical multiplier
    rollData.critMult = 1;
    if (critical) rollData.critMult = rollData.item.ability.critMult;
    // Determine ability multiplier
    rollData.ablMult = ItemCombatCalculationsHelper.calculateAbilityModifier(
      this.item,
      rollData.item.ability.damageMult,
      rollData.item.attackType,
      primaryAttack
    );

    // Create effect string
    let notes = [];
    const noteObjects = actor.getContextNotes("attacks.effect");

    for (let noteObj of noteObjects) {
      rollData.item = {};
      //if (noteObj.item != null) rollData.item = duplicate(noteObj.item.system);
      if (noteObj.item != null)
        rollData.item = mergeObject(duplicate(noteObj.item.system), noteObj.item.getRollData(), { inplace: false });

      for (let note of noteObj.notes) {
        for (let _note of note.split(/[\n\r]+/)) {
          notes.push(
            await TextEditor.enrichHTML(`<span class="tag">${Item35E._fillTemplate(_note, rollData)}</span>`, {
              rollData: rollData,
            })
          );
        }
      }
    }
    for (let _note of (itemData.effectNotes || "").split(/[\n\r]+/)) {
      notes.push(
        await TextEditor.enrichHTML(`<span class="tag">${Item35E._fillTemplate(_note, rollData)}</span>`, {
          rollData: rollData,
        })
      );
    }

    const inner = notes.join("");
    if (notes.length > 0) {
      return `<div class="flexcol property-group"><label>${game.i18n.localize(
        "D35E.EffectNotes"
      )}</label><div class="flexrow">${inner}</div></div>`;
    } else return "";
  }

  /**
   * Place a damage roll using an item (weapon, feat, spell, or equipment)
   * Rely upon the DicePF.damageRoll logic for the core implementation
   */
  rollDamage({
    data = null,
    critical = false,
    extraParts = [],
    primaryAttack = true,
    modifiers = {},
    replacedEnh = 0,
  } = {}) {
    const itemData = this.item.system;
    let rollData = null;
    let baseModifiers = [];
    if (!data) {
      rollData = this.item.actor.getRollData();
      rollData.item = duplicate(itemData);
    } else rollData = data;
    rollData.item.enh = replacedEnh;
    if (!this.item.hasDamage) {
      throw new Error("You may not make a Damage Roll with this Item.");
    }

    // Add CL
    if (this.item.isSpellLike()) {
      ItemSpellHelper.adjustSpellCL(this.item, itemData, rollData);
    }

    // Determine critical multiplier
    rollData.critMult = 1;
    rollData.ablMult = 1;
    if (critical) rollData.critMult = getProperty(this.item.system, "ability.critMult");
    // Determine ability multiplier from the rollData override or from the item itself
    if (rollData.damageAbilityMultiplier !== undefined && rollData.damageAbilityMultiplier !== null) {
      rollData.ablMult = rollData.damageAbilityMultiplier;
    } else {
      rollData.ablMult = rollData.item.ability.damageMult;
    }
    rollData.ablMult = ItemCombatCalculationsHelper.calculateAbilityModifier(
      this.item,
      rollData.ablMult,
      rollData.item.attackType,
      primaryAttack
    );

    // Define Roll parts
    let parts = this.#_mapDamageTypes(rollData.item.damage.parts);

    parts[0].base = alterRoll(parts[0].base, 0, rollData.critMult);

    // Determine ability score modifier
    let abl = rollData.item.ability.damage;
    if (typeof abl === "string" && abl !== "") {
      rollData.ablDamage = Math.floor(rollData.abilities[abl].mod * (rollData.ablMult || 1));
      if (rollData.abilities[abl].mod < 0) rollData.ablDamage = rollData.abilities[abl].mod;
      if (rollData.ablDamage < 0)
        parts.push({
          base: "@ablDamage",
          extra: [],
          damageType: "Ability",
          damageTypeUid: parts[0].damageTypeUid,
        });
      else if (rollData.critMult !== 1)
        parts.push({
          base: "@ablDamage * @critMult",
          extra: [],
          damageType: `Ability (${rollData.ablMult || 1})`,
          damageTypeUid: parts[0].damageTypeUid,
        });
      else if (rollData.ablDamage !== 0)
        parts.push({
          base: "@ablDamage",
          extra: [],
          damageType: "Ability",
          damageTypeUid: parts[0].damageTypeUid,
        });
    }
    // Add enhancement bonus
    if (rollData.item.enh != null && rollData.item.enh !== 0 && rollData.item.enh != null) {
      if (rollData.critMult !== 1)
        parts.push({
          base: "@item.enh * @critMult",
          extra: [],
          damageType: "Enhancement",
          damageTypeUid: parts[0].damageTypeUid,
        });
      else
        parts.push({
          base: "@item.enh",
          extra: [],
          damageType: "Enhancement",
          damageTypeUid: parts[0].damageTypeUid,
        });
    }

    // Add general damage
    if (rollData.attributes.damage.general !== 0) {
      if (rollData.critMult !== 1)
        parts.push({
          base: "@attributes.damage.general * @critMult",
          extra: [],
          damageType: "General",
          damageTypeUid: parts[0].damageTypeUid,
        });
      else
        parts.push({
          base: "@attributes.damage.general",
          extra: [],
          damageType: "General",
          damageTypeUid: parts[0].damageTypeUid,
        });
    }
    // Add melee or spell damage
    if (rollData.attributes.damage.weapon !== 0 && ["mwak", "rwak"].includes(itemData.actionType)) {
      if (rollData.critMult !== 1)
        parts.push({
          base: "@attributes.damage.weapon * @critMult",
          extra: [],
          damageType: "Weapon",
          damageTypeUid: parts[0].damageTypeUid,
        });
      else
        parts.push({
          base: "@attributes.damage.weapon",
          extra: [],
          damageType: "Weapon",
          damageTypeUid: parts[0].damageTypeUid,
        });
    } else if (rollData.attributes.damage.spell !== 0 && ["msak", "rsak", "spellsave"].includes(itemData.actionType)) {
      if (rollData.critMult !== 1)
        parts.push({
          base: "@attributes.damage.spell * @critMult",
          extra: [],
          damageType: "Spell",
          damageTypeUid: parts[0].damageTypeUid,
        });
      else
        parts.push({
          base: "@attributes.damage.spell",
          extra: [],
          damageType: "Spell",
          damageTypeUid: parts[0].damageTypeUid,
        });
    }
    let simpleExtraParts = extraParts.filter((p) => !Array.isArray(p));
    parts = parts.concat(
      extraParts
        .filter((p) => Array.isArray(p))
        .map((p) => {
          if (p[2] === "base")
            return { base: p[0], extra: [], damageType: p[1], damageTypeUid: parts[0].damageTypeUid };
          if (p[2] && p[2] !== null) p[1] = CACHE.DamageTypes.get(p[2]).name;
          else if (p[1]) {
            let uidDamageType = CACHE.DamageTypes.get(p[1]);
            if (uidDamageType) {
              p[2] = p[1];
              p[1] = uidDamageType.name;
            } else {
              for (let damageType of CACHE.DamageTypes.values()) {
                if (damageType.system.identifiers.some((i) => i[0].toLowerCase() === p[1].toLowerCase())) {
                  p[2] = damageType.system.uniqueId;
                  p[1] = damageType.name;
                }
              }
            }
          }
          return { base: p[0], extra: [], damageType: p[1], damageTypeUid: p[2], source: p[3] };
        })
    );
    // Create roll
    let rolls = [];
    for (let a = 0; a < parts.length; a++) {
      const part = parts[a];
      let roll = {};
      if (a === 0) {
        let rollString = `${modifiers.multiplier ? modifiers.multiplier + "*" : ""}((${[
          part.base,
          ...part.extra,
          ...simpleExtraParts,
        ].join("+")}))`;
        if (modifiers.maximize) rollString = rollString.replace(/d([1-9]+)/g, "*$1");
        roll = {
          roll: new Roll35e(rollString, rollData).roll(),
          damageType: part.damageType,
          damageTypeUid: part.damageTypeUid,
          source: part.source,
          base: part.base,
        };
      } else {
        let rollString = `${modifiers.multiplier && modifiers.multiplier !== 1 ? modifiers.multiplier + "*" : ""}((${[
          part.base,
          ...part.extra,
        ].join("+")}))`;
        if (modifiers.maximize) rollString = rollString.replace(/d([1-9]+)/g, "*$1");
        roll = {
          roll: new Roll35e(rollString, rollData).roll(),
          damageType: part.damageType,
          damageTypeUid: part.damageTypeUid,
          source: part.source,
          base: part.base,
        };
      }
      rolls.push(roll);
    }
    for (let roll of rolls) {
      if ((roll.base || "").indexOf("@cl") !== -1 && !roll.source) {
        roll.source = "Caster Level";
      }
      if ((roll.base || "").indexOf("@sl") !== -1 && !roll.source) {
        roll.source = "Spell Level";
      }
    }
    // //game.D35E.logger.log(rolls);
    return rolls;
  }

  rollAlternativeDamage({ data = null } = {}) {
    const itemData = this.item.system;
    let rollData = null;
    let baseModifiers = [];
    if (!data) {
      rollData = this.item.actor.getRollData();
      rollData.item = duplicate(itemData);
    } else rollData = data;

    // Add CL
    if (this.item.isSpellLike()) {
      ItemSpellHelper.adjustSpellCL(this.item, itemData, rollData);
    }

    // Define Roll parts
    let parts = this.#_mapDamageTypes(itemData.damage.alternativeParts);

    let rolls = [];
    for (let a = 0; a < parts.length; a++) {
      const part = parts[a];
      let roll = {};
      let rollString = `((${[part.base, ...part.extra].join("+")}))`;
      roll = {
        roll: new Roll35e(rollString, rollData).roll(),
        damageType: part.damageType,
        damageTypeUid: part.damageTypeUid,
      };
      rolls.push(roll);
    }
    return rolls;
  }

  /**
   * Map damage types in damage parts
   * @private
   */
  #_mapDamageTypes(damageParts) {
    let parts = damageParts.map((p) => {
      if (p[2]) p[1] = CACHE.DamageTypes.get(p[2]).data.name;
      else if (p[1]) {
        for (let damageType of CACHE.DamageTypes.values()) {
          let identifiers = damageType.system.identifiers;
          if (identifiers.some((i) => i[0].toLowerCase() === p[1].toLowerCase())) p[2] = damageType.system.uniqueId;
        }
      }

      return { base: p[0], extra: [], damageType: p[1], damageTypeUid: p[2] };
    });
    return parts;
  }
}
