import { ItemCharges } from "./charges.js";
import { getOriginalNameIfExists } from "../../lib.js";
import { Roll35e } from "../../roll.js";
import { CACHE } from "../../cache.js";
import { ChatAttack } from "../chat/chatAttack.js";
import AbilityTemplate from "../../pixi/ability-template.js";
import { createCustomChatMessage } from "../../chat.js";
import { D35E } from "../../config.js";
import { ItemSpellHelper as ItemSpellHelper } from "../helpers/itemSpellHelper.js";
import { ItemCombatChangesHelper } from "../helpers/itemCombatChangesHelper.js";
import { Item35E } from "../entity.js";
import { ItemActiveHelper } from "../helpers/itemActiveHelper.js";

export class ItemUse {
  /**
   * @param {Item35E} item Item
   */
  constructor(item) {
    this.item = item;
    this.itemUpdateData = {};
    this.itemData = {};
  }

  async use(tempActor, replacementId, ev, skipDialog, rollModeOverride, temporaryItem, skipChargeCheck) {
    let actor = this.item.actor;
    if (tempActor !== null) {
      actor = tempActor;
    }

    if (getProperty(this.item.system, "requiresPsionicFocus") && !this.item.actor?.system?.attributes?.psionicFocus)
      return ui.notifications.warn(game.i18n.localize("D35E.RequiresPsionicFocus"));
    if (this.item.type === "spell") {
      if (replacementId) {
        return this.useSpell(
          ev,
          {
            skipDialog: skipDialog,
            replacement: true,
            replacementItem: actor.items.get(replacementId),
            rollModeOverride: rollModeOverride,
          },
          actor
        );
      } else {
        return this.useSpell(ev, { skipDialog: skipDialog, rollModeOverride: rollModeOverride }, actor);
      }
    } else if (this.item.type === "full-attack") {
      if (game.settings.get("D35E", "showFullAttackChatCard")) await this.item.roll();
      for (let attack of Object.values(getProperty(this.item.system, "attacks"))) {
        if (!attack.id) continue;
        let attackItem = actor.items.find((i) => i._id === attack.id);
        for (let i = 0; i < attack.count; i++) {
          let result = await new ItemUse(attackItem).useAttack(
            {
              ev: ev,
              skipDialog: skipDialog,
              attackType: attack.attackMode,
              isFullAttack: true,
              rollModeOverride: rollModeOverride,
              temporaryItem: temporaryItem,
            },
            actor,
            skipChargeCheck
          );
          if (!result.wasRolled && !ev.originalEvent?.shiftKey) return;
        }
      }
      return;
    } else if (this.item.type === "enhancement" || this.item.hasAction) {
      return this.useAttack(
        {
          ev: ev,
          skipDialog: skipDialog,
          rollModeOverride: rollModeOverride,
          temporaryItem: temporaryItem,
          attackType: getProperty(this.item.system, "weaponSubtype") === "2h" ? "two-handed" : "primary",
        },
        actor,
        skipChargeCheck
      );
    }

    if (this.item.isCharged && !skipChargeCheck) {
      if (this.item.charges < this.item.chargeCost) {
        if (this.item.isSingleUse) return ui.notifications.warn(game.i18n.localize("D35E.ErrorNoQuantity"));
        return ui.notifications.warn(game.i18n.localize("D35E.ErrorNoCharges").format(this.item.name));
      }
      await this.item.addCharges(-1 * this.item.chargeCost);
    }
    return this.item.roll({ rollMode: rollModeOverride });
  }

  async rollAttack(fullAttack, form, temporaryItem, actor, rollData, skipChargeCheck) {
    let attackExtraParts = [],
      damageExtraParts = [],
      primaryAttack = true,
      useMeasureTemplate = false,
      useAmmoId = "none",
      useAmmoDamage = "",
      useAmmoAttack = "",
      useAmmoDamageType = "",
      useAmmoNote = "",
      useAmmoName = "",
      useAmmoEnhancement = "",
      rapidShot = false,
      flurryOfBlows = false,
      manyshot = false,
      nonLethal = false,
      manyshotCount = 0,
      greaterManyshot = false,
      greaterManyshotCount = 0,
      twoWeaponFightingOffhand = false,
      hasTwoWeaponFightingFeat =
        actor.items.filter((o) => o.type === "feat" && getOriginalNameIfExists(o) === "双武器战斗Two-Weapon Fighting")?.length >
        0,
      multiweaponFighting =
        actor.items.filter(
          (o) =>
            o.type === "feat" &&
            (getOriginalNameIfExists(o) === "Multiweapon Fighting" || o.system.changeFlags.multiweaponAttack)
        ).length > 0,
      hasTwoImprovedWeaponFightingFeat =
        actor.items.filter((o) => o.type === "feat" && getOriginalNameIfExists(o) === "精通双武器战斗Improved Two-Weapon Fighting")
          ?.length > 0,
      hasTwoGreaterFightingFeat =
        actor.items.filter((o) => o.type === "feat" && getOriginalNameIfExists(o) === "高等双武器战斗Greater Two-Weapon Fighting")
          ?.length > 0,
      rollMode = null,
      optionalFeatIds = [],
      optionalFeatRanges = new Map(),
      enabledConditionals = [],
      props = [],
      rollModifiers = [],
      extraText = "",
      ammoMaterial = null,
      ammoEnh = 0,
      summonPack = "",
      summonId = "",
      summonName = "",
      summonFormula = "",
      summonImg = "";

    let selectedTargets = [];
    let selectedTargetIds = "";

    let damageModifiers = {
      maximize: false,
      multiplier: 1,
    };
    // Get form data
    if (form) {
      const formData = this.extractFormData(
        rollData,
        form,
        attackExtraParts,
        rollModifiers,
        damageExtraParts,
        rollMode,
        useAmmoId,
        useAmmoDamage,
        useAmmoDamageType,
        useAmmoAttack,
        useAmmoEnhancement,
        useAmmoNote,
        useAmmoName,
        actor,
        ammoMaterial,
        ammoEnh,
        manyshot,
        manyshotCount,
        nonLethal,
        greaterManyshotCount,
        greaterManyshot,
        rapidShot,
        flurryOfBlows,
        primaryAttack,
        useMeasureTemplate,
        hasTwoWeaponFightingFeat,
        multiweaponFighting,
        twoWeaponFightingOffhand,
        selectedTargetIds,
        selectedTargets,
        optionalFeatIds,
        optionalFeatRanges,
        enabledConditionals,
        summonPack,
        summonId,
        summonName,
        summonImg,
        summonFormula
      );
      rollMode = formData.rollMode;
      useAmmoId = formData.useAmmoId;
      useAmmoNote = formData.useAmmoNote;
      useAmmoName = formData.useAmmoName;
      ammoMaterial = formData.ammoMaterial;
      ammoEnh = formData.ammoEnh;
      manyshot = formData.manyshot;
      manyshotCount = formData.manyshotCount;
      nonLethal = formData.nonLethal;
      greaterManyshotCount = formData.greaterManyshotCount;
      greaterManyshot = formData.greaterManyshot;
      rapidShot = formData.rapidShot;
      flurryOfBlows = formData.flurryOfBlows;
      primaryAttack = formData.primaryAttack;
      useMeasureTemplate = formData.useMeasureTemplate;
      twoWeaponFightingOffhand = formData.twoWeaponFightingOffhand;
      selectedTargetIds = formData.selectedTargetIds;
      selectedTargets = formData.selectedTargets;
      summonPack = formData.summonPack;
      summonId = formData.summonId;
      summonName = formData.summonName;
      summonImg = formData.summonImg;
      summonFormula = formData.summonFormula;
    }

    // Prepare the chat message data
    let chatTemplateData = {
      name: this.item.name,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      rollMode: rollMode,
    };

    let allAttacks = [];
    // Auto scaling attacks

    let autoScaleAttacks =
      (game.settings.get("D35E", "autoScaleAttacksBab") &&
        actor.type !== "npc" &&
        getProperty(this.item.system, "attackType") === "weapon" &&
        getProperty(this.item.system, "autoScaleOption") !== "never") ||
      getProperty(this.item.system, "autoScaleOption") === "always";
    if (autoScaleAttacks && fullAttack) {
      allAttacks.push({ bonus: 0, label: `${game.i18n.localize("D35E.Attack")}` });
      for (let a = 5; a < (getProperty(actor.system, "attributes.bab.nonepic") || 0); a += 5) {
        allAttacks.push({
          bonus: `-${a}`,
          label: `${game.i18n.localize("D35E.Attack")} ${Math.floor((a + 5) / 5)}`,
        });
      }
    } else {
      allAttacks = fullAttack
        ? this.item.system.attackParts.reduce(
            (cur, r) => {
              cur.push({ bonus: r[0], label: r[1] });
              return cur;
            },
            [{ bonus: 0, label: `${game.i18n.localize("D35E.Attack")}` }]
          )
        : [
            {
              bonus: 0,
              label: `${game.i18n.localize("D35E.Attack")}`,
            },
          ];
    }

    if ((fullAttack || actor.system.attributes.bab.total < 6) && rapidShot) {
      allAttacks.unshift({
        bonus: 0,
        label: `Rapid Shot`,
      });
      rollData.rapidShotPenalty = -2;
      attackExtraParts.push({
        part: "@rapidShotPenalty",
        value: rollData.rapidShotPenalty,
        source: game.i18n.localize("D35E.AttackRapidShot"),
      });
    }

    if (flurryOfBlows) {
      allAttacks.push({
        bonus: 0,
        label: game.i18n.localize("D35E.AttackFlurryOfBlows"),
      });
      let monkClass = (actor?.items || []).filter(
        (o) => o.type === "class" && (o.name === "Monk" || o.system.customTag === "monk")
      )[0];
      //1-4 = -2
      if (monkClass.system.levels < 5) {
        rollData.flurryOfBlowsPenalty = -2;
        attackExtraParts.push({
          part: "@flurryOfBlowsPenalty",
          value: rollData.rapidShotPenalty,
          source: game.i18n.localize("D35E.AttackFlurryOfBlows"),
        });
      }
      //5-8 = -1
      else if (monkClass.system.levels < 9) {
        rollData.flurryOfBlowsPenalty = -1;
        attackExtraParts.push({
          part: "@flurryOfBlowsPenalty",
          value: rollData.rapidShotPenalty,
          source: game.i18n.localize("D35E.AttackFlurryOfBlows"),
        });
        //9+ = 0
        //11+ = 2nd extra attack
      } else if (monkClass.system.levels > 10) {
        allAttacks.push({
          bonus: 0,
          label: game.i18n.localize("D35E.AttackFlurryOfBlows"),
        });
      }
    }

    let isHasted =
      (actor?.items || []).filter(
        (o) => ItemActiveHelper.isActive(o) && (o.name === "Haste" || o.system.changeFlags.hasted)
      ).length > 0;
    if (
      (fullAttack || actor.system.attributes.bab.total < 6) &&
      isHasted &&
      (getProperty(this.item.system, "attackType") === "weapon" ||
        getProperty(this.item.system, "attackType") === "natural")
    ) {
      allAttacks.unshift({
        bonus: 0,
        label: `Haste`,
      });
    }

    if (hasTwoImprovedWeaponFightingFeat && twoWeaponFightingOffhand) {
      allAttacks.push({
        bonus: "-5",
        label: `${game.i18n.localize("D35E.Attack")} 2`,
      });
    }
    if (hasTwoGreaterFightingFeat && twoWeaponFightingOffhand) {
      allAttacks.push({
        bonus: "-10",
        label: `${game.i18n.localize("D35E.Attack")} 3`,
      });
    }

    // //game.D35E.logger.log('Enabled conditionals', enabledConditionals)
    let attackEnhancementMap = new Map();
    let damageEnhancementMap = new Map();
    for (let enabledConditional of enabledConditionals) {
      let conditional = this.itemData.conditionals.find((c) => c.name === enabledConditional);
      rollModifiers.push(`${conditional.name}`);
      for (let modifier of conditional.modifiers) {
        if (modifier.target === "attack") {
          if (modifier.subTarget !== "allAttack") {
            if (!attackEnhancementMap.has(modifier.subTarget)) attackEnhancementMap.set(modifier.subTarget, []);
            attackEnhancementMap
              .get(modifier.subTarget)
              .push({ part: modifier.formula, value: modifier.formula, source: `${conditional.name}` });
          } else {
            attackExtraParts.push({ part: modifier.formula, value: modifier.formula, source: `${conditional.name}` });
          }
        }
        if (modifier.target === "damage") {
          if (modifier.subTarget !== "allDamage") {
            if (!damageEnhancementMap.has(modifier.subTarget)) damageEnhancementMap.set(modifier.subTarget, []);
            damageEnhancementMap.get(modifier.subTarget).push({
              formula: modifier.formula,
              type: modifier.type,
              source: conditional.name,
            });
          } else
            damageExtraParts.push([
              modifier.formula,
              CACHE.DamageTypes.get(modifier.type)?.data?.name || game.i18n.localize("D35E.UnknownDamageType"),
              modifier.type,
              `${conditional.name}`,
            ]);
        }
      }
    }

    // Getting all combat changes from items
    let allCombatChanges = [];
    let attackType = this.item.type;
    allCombatChanges = ItemCombatChangesHelper.getAllSelectedCombatChangesForRoll(
      actor.items,
      attackType,
      rollData,
      allCombatChanges,
      rollModifiers,
      optionalFeatIds,
      optionalFeatRanges
    );

    this.item._addCombatChangesToRollData(allCombatChanges, rollData);

    if (rollData.isKeen && !getProperty(this.item.system, "threatRangeExtended")) {
      let baseCrit = getProperty(this.item.system, "ability.critRange") || 20;
      baseCrit = 21 - 2 * (21 - baseCrit);
      rollData.item.ability.critRange = baseCrit;
      //getProperty(this.item.system,"ability.critRange") = baseCrit;
    }

    if (rollData.featDamageBonusList) {
      for (let [i, bonus] of rollData.featDamageBonusList.entries()) {
        damageExtraParts.push([
          "@critMult*(${this.featDamageBonusList[" + i + "].value})",
          bonus["sourceName"],
          "base",
        ]);
      }
    }
    if (rollData.featDamagePrecisionList) {
      for (let [i, bonus] of rollData.featDamagePrecisionList.entries()) {
        damageExtraParts.push(["(${this.featDamagePrecisionList[" + i + "].value})", bonus["sourceName"]]);
      }
    }
    if (rollData.featDamageList) {
      for (let dmg of Object.keys(rollData.featDamageList)) {
        // //game.D35E.logger.log('Bonus damage!', dmg, rollData.featDamage[dmg])
        for (let [i, bonus] of rollData.featDamageList[dmg].entries()) {
          let extraDamagePart = [
            "(${this.featDamageList['" + dmg + "'][" + i + "].value})",
            dmg,
            null,
            bonus["sourceName"],
          ];
          damageExtraParts.push(extraDamagePart);
        }
      }
    }

    if (rollData.featAdditionalAttacksBAB) {
      if (rollData.featAdditionalAttacksBAB > 0) {
        for (let i = 0; i < rollData.featAttackNumberBonus; i++) {
          allAttacks.push({
            bonus: "0",
            label: `${game.i18n.localize("D35E.Feat")} Bonus Attack`,
          });
        }
      }
    }

    let manyshotAttacks = [];
    if (greaterManyshot) {
      allAttacks.forEach((attack) => {
        let label = attack.label;
        for (let i = 0; i < greaterManyshotCount; i++) {
          let _attack = duplicate(attack);
          _attack.label = label + ` (Greater Manyshot Arrow ${i + 1})`;
          manyshotAttacks.push(_attack);
        }
      });
      allAttacks = manyshotAttacks;
    }

    // Determine spell CL / SL / ablMod (does notthing for other items)
    this.#_determineSpellInfo(rollData)

    // Lock useAmount for powers to max value and add aliases
    if (this.item.type === "spell" && getProperty(this.item.system, "isPower")) {
      rollData.useAmount = Math.max(
        0,
        Math.min(rollData.useAmount, rollData.cl - (getProperty(this.item.system, "powerPointsCost") || 0))
      );
      rollData.powerPointsUsed = rollData.useAmount + parseInt(getProperty(this.item.system, "powerPointsCost"));
      rollData.additionalPowerPointsUsed = rollData.useAmount;
      rollData.augmentation = rollData.useAmount;
    }

    let dc = this.#_getSpellDC(rollData);
    rollData.dc = dc;
    rollData.spellPenetration = rollData.cl + (new Roll35e(rollData.featSpellPenetrationBonus || "0", rollData).roll().total || 0);
    this.#_applyMetamagicModifiers(damageModifiers, rollModifiers);

    let attacks = [];
    if (this.item.hasAttack) {
      let attackId = 0;
      // Scaling number of attacks for spells (based on formula provided)
      if (rollData.item.attackCountFormula && rollData.item.attackParts.length === 0) {
        if (this.item.isSpellLike()) {
          ItemSpellHelper.adjustSpellCL(this.item, this.itemData, rollData);
        }
        let attackCount = (new Roll35e(rollData.item.attackCountFormula, rollData).roll().total || 1) - 1;
        for (let i = 0; i < attackCount; i++) {
          allAttacks.push({
            bonus: "0",
            label: "Attack",
          });
        }
      }
      for (let atk of allAttacks) {
        // Create attack object
        let attack = new ChatAttack(this.item, atk.label, actor, rollData, ammoMaterial, ammoEnh);
        let localAttackExtraParts = duplicate(attackExtraParts);
        for (let aepConditional of attackEnhancementMap.get(`attack.${attackId}`) || []) {
          localAttackExtraParts.push(aepConditional);
        }
        let localDamageExtraParts = duplicate(damageExtraParts);
        for (let aepConditional of damageEnhancementMap.get(`attack.${attackId}`) || []) {
          localDamageExtraParts.push([
            aepConditional.formula,
            CACHE.DamageTypes.get(aepConditional.type)?.data?.name || game.i18n.localize("D35E.UnknownDamageType"),
            aepConditional.type,
            aepConditional.source,
          ]);
        }
        await attack.addAttack({
          bonus: atk.bonus || 0,
          extraParts: localAttackExtraParts,
          primaryAttack: primaryAttack,
          actor: actor,
          critConfirmBonus:
            new Roll35e(`${getProperty(this.item.system, "critConfirmBonus")}` || "0", rollData).roll().total +
            (rollData.featCritConfirmBonus || 0),
        });
        if (this.item.hasDamage) {
          await attack.addDamage({
            extraParts: localDamageExtraParts,
            primaryAttack: primaryAttack,
            critical: false,
            actor: actor,
            modifiers: damageModifiers,
          });
          if (attack.hasCritConfirm) {
            await attack.addDamage({
              extraParts: localDamageExtraParts,
              primaryAttack: primaryAttack,
              critical: true,
              actor: actor,
              modifiers: damageModifiers,
            });
          }
          if (manyshot) {
            for (let i = 1; i < manyshotCount; i++) {
              await attack.addDamage({
                extraParts: localDamageExtraParts,
                primaryAttack: primaryAttack,
                critical: false,
                actor: actor,
                multiattack: i,
                modifiers: damageModifiers,
              });
            }
          }
        }
        await attack.addEffect({
          primaryAttack: primaryAttack,
          actor: actor,
          useAmount: rollData.useAmount || 1,
          cl: rollData.cl || null,
          spellPenetration: rollData.spellPenetration || null,
        });
        await this.item._addCombatSpecialActionsToAttack(
          allCombatChanges,
          attack,
          actor,
          rollData,
          optionalFeatRanges,
          attackId
        );
        // Add to list
        attacks.push(attack);
        attackId++;
      }
    }
    // Add damage only
    else if (this.item.hasDamage) {
      let attackCount = 1;
      if (rollData.item.attackCountFormula) {
        if (this.item.isSpellLike()) {
          ItemSpellHelper.adjustSpellCL(this.item, this.itemData, rollData);
        }
        attackCount = new Roll35e(rollData.item.attackCountFormula, rollData).roll().total || 1;
      }
      for (let i = 0; i < attackCount; i++) {
        let attack = new ChatAttack(this.item, "", actor, rollData, ammoMaterial, ammoEnh);
        attack.rollData = rollData;
        await attack.addDamage({
          extraParts: damageExtraParts,
          primaryAttack: primaryAttack,
          critical: false,
          modifiers: damageModifiers,
        });
        await attack.addEffect({
          primaryAttack: primaryAttack,
          actor: actor,
          useAmount: rollData.useAmount || 1,
          cl: rollData.cl || null,
          spellPenetration: rollData.spellPenetration || null,
        });

        await this.item._addCombatSpecialActionsToAttack(
          allCombatChanges,
          attack,
          actor,
          rollData,
          optionalFeatRanges,
          0
        );

        attacks.push(attack);
      }
    }
    // Add effect notes only
    else if (this.item.hasEffect) {
      let attack = new ChatAttack(this.item, "", actor, rollData, ammoMaterial, ammoEnh);
      attack.rollData = rollData;
      if (this.item.isSpellLike()) {
        ItemSpellHelper.adjustSpellCL(this.item, this.itemData, rollData);
      }
      await attack.addEffect({
        primaryAttack: primaryAttack,
        actor: actor,
        useAmount: rollData.useAmount || 1,
        cl: rollData.cl || null,
        spellPenetration: rollData.spellPenetration || null,
      });
      await this.item._addCombatSpecialActionsToAttack(
        allCombatChanges,
        attack,
        actor,
        rollData,
        optionalFeatRanges,
        0
      );
      // Add to list
      attacks.push(attack);
    } else if (getProperty(this.item.system, "actionType") === "special") {
      let attack = new ChatAttack(this.item, "", actor, rollData, ammoMaterial, ammoEnh);
      if (this.item.isSpellLike()) {
        ItemSpellHelper.adjustSpellCL(this.item, this.itemData, rollData);
      }
      attack.rollData = rollData;
      await attack.addSpecial(actor, rollData.useAmount || 1, rollData.cl, rollData.spellPenetration);
      await this.item._addCombatSpecialActionsToAttack(
        allCombatChanges,
        attack,
        actor,
        rollData,
        optionalFeatRanges,
        0
      );
      // Add to list
      attacks.push(attack);
    }
    let rolls = [];
    attacks.forEach((a) => {
      rolls.push(...a.rolls);
    });
    chatTemplateData.attacks = attacks;

    if (summonName) {
      let _actor = game.actors.find((a) => a.name === summonName);
      if (_actor) {
        summonId = _actor.id;
        summonPack = "";
      }
    }

    let hiddenTargets = [];

    // Prompt measure template
    let templateId = "";
    let templateX = 0;
    let templateY = 0;
    if (useMeasureTemplate) {
      // //game.D35E.logger.log(`Creating measure template.`)
      // Create template
      let optionalData = {};
      const template = AbilityTemplate.fromItem(this, rollData.spellWidened ? 2 : 1, rollData, optionalData);
      let result;
      if (template) {
        const sheetRendered = this.item.parent?.sheet?._element != null;
        if (sheetRendered) this.item.parent.sheet.minimize();
        result = await template.drawPreview(event);
        if (!result.result) {
        }
        if (sheetRendered) this.item.parent.sheet.maximize();
      }
      let _template = await result.place();
      if (selectedTargets.length == 0) {
        // We can override selected targets
        selectedTargets = template.getTokensWithin().filter((t) => !t.data.hidden);
        hiddenTargets = template.getTokensWithin().filter((t) => t.data.hidden);
      }
      templateId = _template.id;
      templateX = template.data.x;
      templateY = template.data.y;
    }

    // //game.D35E.logger.log(`Updating item on attack.`)
    // Deduct charge
    if (this.item.autoDeductCharges && !skipChargeCheck) {
      // //game.D35E.logger.log(`Deducting ${this.item.chargeCost} charges.`)
      if (rollData.useAmount === undefined) await this.item.addCharges(-1 * this.item.chargeCost, this.itemUpdateData);
      else await this.item.addCharges(-1 * parseFloat(rollData.useAmount) * this.item.chargeCost, this.itemUpdateData);
    } else {
      if (getProperty(this.item.system, "requiresPsionicFocus")) {
        if (this.item.actor) {
          await this.item.actor.update({ "data.attributes.psionicFocus": false });
        }
      }
    }
    if (useAmmoId !== "none" && actor !== null && !getProperty(this.item.system, "returning")) {
      await actor.quickChangeItemQuantity(useAmmoId, -1 * attacks.length * (1 + Math.max(0, manyshotCount - 1)));
    }
    // Update item, only if it has an id (is real item, not item from enhancement)
    if (this.itemUpdateData._id && !temporaryItem) await this.item.update(this.itemUpdateData);

    // Set chat data
    let chatData = {
      speaker: ChatMessage.getSpeaker({ actor: actor }),
      rollMode: rollMode,
      sound: CONFIG.sounds.dice,
      "flags.D35E.noRollRender": true,
    };

    // Post message
    if (this.item.data.type === "spell" || getProperty(this.item.system, "isFromSpell")) {
      if (!game.settings.get("D35E", "hideSpellDescriptionsIfHasAction"))
        await this.item.roll({ rollMode: rollMode }, actor);
    }
    let rolled = false;
    if (
      this.item.hasAttack ||
      this.item.hasDamage ||
      this.item.hasEffect ||
      getProperty(this.item.system, "actionType") === "special" ||
      getProperty(this.item.system, "actionType") === "summon"
    ) {
      // //game.D35E.logger.log(`Generating chat message.`)
      // Get extra text and properties
      let hasBoxInfo = this.item.hasAttack || this.item.hasDamage || this.item.hasEffect;
      let attackNotes = [];
      const noteObjects = actor.getContextNotes("attacks.attack");
      if (typeof this.itemData.attackNotes === "string" && this.itemData.attackNotes.length) {
        noteObjects.push({ notes: [this.itemData.attackNotes] });
      }

      if (useAmmoNote !== "") {
        noteObjects.push({ notes: [useAmmoNote] });
      }
      for (let noteObj of noteObjects) {
        rollData.item = {};
        if (noteObj.item != null) rollData.item = duplicate(noteObj.item.system);

        for (let note of noteObj.notes) {
          let source = noteObj?.item?.name || game.i18n.localize("D35E.Unknown");
          for (let _note of note.split(/[\n\r]+/)) {
            let attackNote = await TextEditor.enrichHTML(
              `<span class="tag tooltip"><span class="tooltipcontent">${source}</span> ${Item35E._fillTemplate(_note, rollData)}</span>`,
              {
                rollData: rollData,
              }
            );
            attackNotes.push(attackNote);
          }
        }
      }
      let attackStr = "";
      for (let an of attackNotes) {
        attackStr += `${an}`;
      }

      if (attackStr.length > 0) {
        const innerHTML = await TextEditor.enrichHTML(attackStr, { rollData: rollData });
        extraText += `<div class="flexcol property-group"><label>${game.i18n.localize(
          "D35E.AttackNotes"
        )}</label><div class="flexrow">${innerHTML}</div></div>`;
      }

      const properties = (await this.item.getChatData({}, rollData)).properties;
      if (properties.length > 0)
        props.push({
          header: game.i18n.localize("D35E.InfoShort"),
          value: properties,
        });
      if (rollModifiers.length > 0)
        props.push({
          header: game.i18n.localize("D35E.RollModifiers"),
          value: rollModifiers,
        });
      hiddenTargets = hiddenTargets.map((t) => {
        return {
          name: t.document.name,
          img: t.document.texture.src,
        };
      });
      selectedTargets = selectedTargets.map((t) => {
        return {
          id: t.id,
          name: t.document.name,
          img: t.document.texture.src,
        };
      });
      const token = actor ? actor.token : null;
      const templateData = mergeObject(
        chatTemplateData,
        {
          extraText: extraText,
          hasExtraText: extraText.length > 0,
          properties: props,
          hasProperties: props.length > 0,
          item: this.item.data,
          actor: actor.data,
          tokenId: token ? `${token.parent.id}.${token.id}` : null,
          hasBoxInfo: hasBoxInfo,
          useAmmoName: useAmmoName,
          dc: dc,
          nonLethal: nonLethal,
          useAmmoId: useAmmoId,
          incorporeal: getProperty(this.item.system, "incorporeal") || this.item.actor?.system?.traits?.incorporeal,
          targets: selectedTargets,
          hiddenTargets: hiddenTargets,
          targetIds: selectedTargetIds,
          hasTargets: selectedTargets.length || hiddenTargets.length,
          isSpell: this.item.type === "spell",
          hasPr: getProperty(this.item.system, "pr"),
          hasSr: getProperty(this.item.system, "sr"),
          cl: rollData.cl,
          summonPack: summonPack,
          summonId: summonId,
          summonName: summonName,
          summonImg: summonImg,
          summonFormula: summonFormula,
          userId: game.user.id,
          measureId: templateId,
          measureX: templateX,
          measureY: templateY,
          spellPenetration: rollData.spellPenetration,
        },
        { inplace: false }
      );
      // Create message
      await createCustomChatMessage("systems/D35E/templates/chat/attack-roll.html", templateData, chatData, {
        rolls: rolls,
      });
      rolled = true;
    }
    if (this.item.hasRolltableDraw) {
      let rollTable = await game.packs
        .get(getProperty(this.item.system, "rollTableDraw.pack"))
        .getDocument(getProperty(this.item.system, "rollTableDraw.id"));
      if (getProperty(this.item.system, "rollTableDraw.formula")) {
        var roll = new Roll35e(getProperty(this.item.system, "rollTableDraw.formula"), rollData);
        await rollTable.draw({ roll: roll, rollMode: rollMode });
      } else {
        await rollTable.draw({ rollMode: rollMode });
      }
    }
    return { rolled: rolled, rollData: rollData };
  }

  #_applyMetamagicModifiers(damageModifiers, rollModifiers) {
    if (this.item.system?.metamagicFeats?.maximized) {
      damageModifiers.maximize = true;
      rollModifiers.push(`${game.i18n.localize("D35E.SpellMaximized")}`);
    }
    if (this.item.system?.metamagicFeats?.empowered) {
      damageModifiers.multiplier = 1.5;
      rollModifiers.push(`${game.i18n.localize("D35E.SpellEmpowered")}`);
    }
    if (this.item.system?.metamagicFeats?.intensified) {
      damageModifiers.maximize = true;
      damageModifiers.multiplier = 2;
      rollModifiers.push(`${game.i18n.localize("D35E.SpellIntensified")}`);
    }
    if (this.item.system?.metamagicFeats?.enlarged) {
      rollData.spellEnlarged = true;
      rollModifiers.push(`${game.i18n.localize("D35E.SpellEnlarged")}`);
    }
    if (this.item.system?.metamagicFeats?.widened) {
      rollData.spellWidened = true;
      rollModifiers.push(`${game.i18n.localize("D35E.SpellWidened")}`);
    }
    if (this.item.system?.metamagicFeats?.enhanced) {
      rollData.maxDamageDice += 10;
      rollModifiers.push(`${game.i18n.localize("D35E.SpellEnhanced")}`);
    }
  }

  async useAttack(
    {
      ev = null,
      skipDialog = false,
      attackType = "primary",
      isFullAttack = false,
      rollModeOverride = null,
      temporaryItem = false,
    } = {},
    tempActor = null,
    skipChargeCheck = false
  ) {
    if (ev && ev.originalEvent) ev = ev.originalEvent;
    let actor = this.item.actor;
    if (tempActor !== null) {
      actor = tempActor;
    }
    if (actor && !actor.isOwner) return ui.notifications.warn(game.i18n.localize("D35E.ErrorNoActorPermission"));

    const itemQuantity = getProperty(this.item.system, "quantity");
    if (itemQuantity != null && itemQuantity <= 0 && !skipChargeCheck) {
      return ui.notifications.warn(game.i18n.localize("D35E.ErrorNoQuantity"));
    }

    if (
      getProperty(this.item.system, "requiresPsionicFocus") &&
      !this.item.actor?.system?.attributes?.psionicFocus &&
      !skipChargeCheck
    )
      return ui.notifications.warn(game.i18n.localize("D35E.RequiresPsionicFocus"));

    if (this.item.isCharged && this.item.charges < this.item.chargeCost && !skipChargeCheck) {
      return ui.notifications.warn(game.i18n.localize("D35E.ErrorNoCharges").format(this.item.name));
    }

    this.itemData = this.item.getRollData();
    const rollData = actor ? duplicate(actor.getRollData(null, true)) : {};
    rollData.item = duplicate(this.itemData);
    this.itemUpdateData = {};
    this.itemUpdateData._id = this.item._id;
    game.D35E.logger.log("Attack item update", this.itemUpdateData);

    let rolled = false;

    // Handle fast-forwarding
    if (
      skipDialog ||
      (ev instanceof MouseEvent && (ev.shiftKey || ev.button === 2)) ||
      getProperty(this.item.system, "actionType") === "special"
    )
      return {
        wasRolled: true,
        roll: this.rollAttack(true, null, temporaryItem, actor, rollData, skipChargeCheck),
      };

    // Render modal dialog
    let template = "systems/D35E/templates/apps/attack-roll-dialog.html";
    let weaponName = getProperty(this.item.system, "baseWeaponType") || "";
    let featWeaponName = `(${weaponName})`;
    let bonusMaxPowerPoints = 0;
    if (this.item.type === "spell" && getProperty(this.item.system, "isPower")) {
      let spellbookIndex = getProperty(this.item.system, "spellbook");
      let spellbook = getProperty(this.item.actor.system, `attributes.spells.spellbooks.${spellbookIndex}`) || {};
      let availablePowerPoints = (spellbook.powerPoints || 0) - (getProperty(this.item.system, "powerPointsCost") || 0);
      bonusMaxPowerPoints = Math.max(
        spellbook.maximumPowerPointLimit
          ? Math.min(
              (spellbook?.cl?.total || 0) - (getProperty(this.item.system, "powerPointsCost") || 0),
              availablePowerPoints
            )
          : availablePowerPoints,
        0
      );
    }
    let autoScaleAttacks =
      (game.settings.get("D35E", "autoScaleAttacksBab") &&
        actor.type !== "npc" &&
        getProperty(this.item.system, "attackType") === "weapon" &&
        getProperty(this.item.system, "autoScaleOption") !== "never") ||
      getProperty(this.item.system, "autoScaleOption") === "always";
    let extraAttacksCount = autoScaleAttacks
      ? Math.ceil((getProperty(actor.system, "attributes.bab.nonepic") || 0) / 5.0)
      : (getProperty(this.item.system, "attackParts") || []).length + 1;
    let rc = game.settings.get("D35E", `rollConfig`).rollConfig;
    let summonableMonsters = [];
    if (this.item.system.summon instanceof Array && this.item.system.summon) {
      for (let summon of this.item.system.summon) {
        const pack = game.packs.get(summon.pack || "D35E.summoning-roll-tables");
        const table = await pack.getDocument(summon.id);
        for (let result of table.results) {
          summonableMonsters.push({ data: result.data, formula: summon.formula || "1" });
        }
      }
    }
    let dialogData = {
      data: rollData,
      id: this.item.id,
      item: this.item,
      targets: Array.from(game.user.targets) || [],
      hasTargets: (game.user.targets || new Set()).size,
      rollMode: rollModeOverride
        ? rollModeOverride
        : game.settings.get("D35E", `rollConfig`).rollConfig[actor.type]?.attack ||
          game.settings.get("core", "rollMode"),
      rollModes: CONFIG.Dice.rollModes,
      twoWeaponAttackTypes: D35E.twoWeaponAttackType,
      attackType: attackType ? attackType : "primary",
      attackTypeSet: isFullAttack,
      hasAttack: this.item.hasAttack,
      hasDamage: this.item.hasDamage,
      allowNoAmmo: game.settings.get("D35E", "allowNoAmmo") || actor.type === "npc",
      nonLethal: getProperty(this.item.system, "nonLethal") || false,
      allowMultipleUses: this.item.system?.uses?.allowMultipleUses,
      multipleUsesMax: this.item.system?.uses?.maxPerUse
        ? Math.min(
            Math.floor(this.item.charges / this.item.chargeCost),
            getProperty(this.item.system, "uses.maxPerUse")
          )
        : Math.floor(this.item.charges / this.item.chargeCost),
      bonusPowerPointsMax: bonusMaxPowerPoints,
      isSpell: this.item.type === "spell" && !getProperty(this.item.system, "isPower"),
      isPower: this.item.type === "spell" && getProperty(this.item.system, "isPower"),
      hasDamageAbility: getProperty(this.item.system, "ability.damage") !== "",
      isNaturalAttack: getProperty(this.item.system, "attackType") === "natural",
      isPrimaryAttack: getProperty(this.item.system, "primaryAttack") || false,
      isWeaponAttack: getProperty(this.item.system, "attackType") === "weapon",
      isRangedWeapon:
        getProperty(this.item.system, "attackType") === "weapon" &&
        getProperty(this.item.system, "actionType") === "rwak",
      ammunition: getProperty(this.item.system, "thrown")
        ? actor.items.filter((o) => o._id === getProperty(this.item.system, "originalWeaponId"))
        : actor.items.filter((o) => o.type === "loot" && o.system.subType === "ammo" && o.system.quantity > 0),
      extraAttacksCount: extraAttacksCount,
      hasTemplate: this.item.hasTemplate,
      isAlreadyProne: this?.actor?.system?.attributes?.conditions?.prone || false,
      canPowerAttack: actor.items.filter((o) => o.type === "feat" && o.originalName === "猛力攻击Power Attack")?.length > 0,
      maxPowerAttackValue: getProperty(actor.system, "attributes.bab.total"),
      canManyshot: actor.items.filter((o) => o.type === "feat" && o.originalName === "多重射击Manyshot")?.length > 0,
      maxManyshotValue: 2 + Math.floor((getProperty(actor.system, "attributes.bab.total") - 6) / 5),
      canGreaterManyshot:
        actor.items.filter((o) => o.type === "feat" && o.originalName === "高等多重射击Greater Manyshot")?.length > 0,
      canRapidShot: actor.items.filter((o) => o.type === "feat" && o.originalName === "快速射击Rapid Shot")?.length > 0,
      canFlurryOfBlows:
        actor.items.filter(
          (o) => o.type === "feat" && (o.originalName === "疾风连击Flurry of Blows" || o.system.customTag === "flurryOfBlows")
        ).length > 0,
      maxGreaterManyshotValue: getProperty(actor.system, "abilities.wis.mod"),
      weaponFeats: actor.combatChangeItems.filter((o) =>
        ItemCombatChangesHelper.canHaveCombatChanges(o, rollData, `${this.item.type}`)
      ),
      weaponFeatsOptional: actor.combatChangeItems.filter((o) =>
        ItemCombatChangesHelper.canHaveCombatChanges(o, rollData, `${this.item.type}Optional`)
      ),
      conditionals: getProperty(this.item.system, "conditionals"),
      summonableMonsters: summonableMonsters,
    };

    dialogData.hasFeats = dialogData.weaponFeats.length || dialogData.weaponFeatsOptional.length;
    dialogData.hasFeatsOrSummons =
      dialogData.weaponFeats.length || dialogData.weaponFeatsOptional.length || dialogData.summonableMonsters.length;
    const html = await renderTemplate(template, dialogData);
    // //game.D35E.logger.log(dialogData)
    let roll;
    const buttons = {};
    let wasRolled = false;
    if (this.item.hasAttack) {
      if (this.item.type !== "spell") {
        buttons.normal = {
          label: game.i18n.localize("D35E.SingleAttack"),
          callback: (html) => {
            wasRolled = true;
            roll = this.rollAttack(false, html, temporaryItem, actor, rollData, skipChargeCheck);
            if (game.combats.active) {
              let combatActor = this.item.getCombatActor(actor);
              if (combatActor) {
                combatActor.useAction(this.item.system.activation);
              }
            }
          },
        };
      }
      if (extraAttacksCount > 1 || this.item.type === "spell") {
        buttons.multi = {
          label:
            this.item.type === "spell"
              ? game.i18n.localize("D35E.Cast")
              : game.i18n.localize("D35E.FullAttack") + " (" + extraAttacksCount + " attacks)",
          callback: (html) => {
            wasRolled = true;
            roll = this.rollAttack(true, html, temporaryItem, actor, rollData, skipChargeCheck);

            if (game.combats.active) {
              let combatActor = this.item.getCombatActor(actor);
              if (combatActor) {
                if (extraAttacksCount > 1) combatActor.useFullAttackAction();
                else combatActor.useAction(this.item.system.activation);
              }
            }
          },
        };
      }
    } else {
      buttons.normal = {
        label: this.item.type === "spell" ? game.i18n.localize("D35E.Cast") : game.i18n.localize("D35E.Use"),
        callback: (html) => {
          wasRolled = true;
          roll = this.rollAttack(false, html, temporaryItem, actor, rollData, skipChargeCheck);
          if (game.combats.active) {
            let combatActor = this.item.getCombatActor(actor);
            if (combatActor) {
              combatActor.useAction(this.item.system.activation);
            }
          }
        },
      };
    }
    await new Promise((resolve) => {
      new Dialog(
        {
          title: `${game.i18n.localize("D35E.Use")}: ${this.item.name} - ${actor.name}`,
          content: html,
          buttons: buttons,
          classes: ["custom-dialog"],
          default: buttons.multi != null ? "multi" : "normal",
          close: (html) => {
            return resolve(rolled ? roll : false);
          },
        },
        {
          classes: ["roll-defense", "dialog", dialogData.hasFeatsOrSummons ? "twocolumn" : "single"],
          width: dialogData.hasFeatsOrSummons ? 800 : 400,
        }
      ).render(true);
    });
    return { wasRolled: wasRolled, roll: roll };
  }

  extractFormData(
    rollData,
    form,
    attackExtraParts,
    rollModifiers,
    damageExtraParts,
    rollMode,
    useAmmoId,
    useAmmoDamage,
    useAmmoDamageType,
    useAmmoAttack,
    useAmmoEnhancement,
    useAmmoNote,
    useAmmoName,
    actor,
    ammoMaterial,
    ammoEnh,
    manyshot,
    manyshotCount,
    nonLethal,
    greaterManyshotCount,
    greaterManyshot,
    rapidShot,
    flurryOfBlows,
    primaryAttack,
    useMeasureTemplate,
    hasTwoWeaponFightingFeat,
    multiweaponFighting,
    twoWeaponFightingOffhand,
    selectedTargetIds,
    selectedTargets,
    optionalFeatIds,
    optionalFeatRanges,
    enabledConditionals,
    summonPack,
    summonId,
    summonName,
    summonImg,
    summonFormula
  ) {
    rollData.attackBonus = form.find('[name="attack-bonus"]').val();
    if (rollData.attackBonus) {
      attackExtraParts.push({
        part: "@attackBonus",
        value: rollData.attackBonus,
        source: game.i18n.localize("D35E.AttackRollBonus"),
      });
      rollModifiers.push(`${game.i18n.localize("D35E.AttackRollBonus")} ${rollData.attackBonus}`);
    }
    rollData.damageBonus = form.find('[name="damage-bonus"]').val();
    if (rollData.damageBonus) {
      damageExtraParts.push(["@damageBonus", game.i18n.localize("D35E.DamageBonus"), "base"]);
      rollModifiers.push(`${game.i18n.localize("D35E.DamageBonus")} ${rollData.damageBonus}`);
    }
    rollMode = form.find('[name="rollMode"]').val();

    rollData.useAmount = form.find('[name="use"]').val();
    if (rollData.useAmount === undefined) {
      // Spells by default do not have any useAmount, as useAmount can be used with them only as *bonus* power points
      if (this.item.type !== "spell") rollData.useAmount = 1;
      else rollData.useAmount = 0;
    } else {
      rollData.useAmount = parseFloat(form.find('[name="use"]').val());
    }

    if (form.find('[name="ammunition-id"]').val() !== undefined) {
      useAmmoId = form.find('[name="ammunition-id"]').val();
      useAmmoDamage = form.find('[name="ammo-dmg-formula"]').val();
      useAmmoDamageType = form.find('[name="ammo-dmg-type"]').val();
      let useAmmoDamageUid = form.find('[name="ammo-dmg-uid"]').val();
      useAmmoAttack = form.find('[name="ammo-attack"]').val();
      useAmmoEnhancement = form.find('[name="ammo-enh"]').val();
      useAmmoNote = form.find('[name="ammo-note"]').val();
      useAmmoName = form.find('[name="ammo-name"]').val();
      var ammo = actor.items.get(useAmmoId);
      if (ammo) {
        useAmmoDamageType = ammo.system.bonusAmmoDamageType || "";
        useAmmoDamageUid = ammo.system.bonusAmmoDamageUid || "";
        useAmmoAttack = ammo.system.bonusAmmoAttack || 0;
        useAmmoNote = ammo.system.bonusAmmoNote || "";
        useAmmoName = ammo.name;
        useAmmoDamage = ammo.system.bonusAmmoDamage || 0;
        ammoMaterial = JSON.stringify(ammo.system.material);
      }
      if (useAmmoDamage !== "") {
        damageExtraParts.push([useAmmoDamage, useAmmoDamageType, useAmmoDamageUid]);
      }
      if (useAmmoAttack !== "") {
        rollData.useAmmoAttack = parseInt(useAmmoAttack);
        attackExtraParts.push({
          part: "@useAmmoAttack",
          value: rollData.useAmmoAttack,
          source: `${useAmmoName} ${game.i18n.localize("D35E.Bonus")}`,
        });
      }
      if (useAmmoEnhancement !== undefined && useAmmoEnhancement !== "") {
        ammoEnh = new Roll35e(useAmmoEnhancement, {}).roll().total;
      }
      rollModifiers.push(`${useAmmoName}`);
      // //game.D35E.logger.log('Selected ammo', useAmmoDamage, useAmmoAttack)
    }

    // Power Attack
    rollData.powerAttackBonus = form.find('[name="power-attack"]').val();
    if (rollData.powerAttackBonus !== undefined) {
      rollData.powerAttackBonus = parseInt(form.find('[name="power-attack"]').val());
      rollData.weaponHands = 1;
      damageExtraParts.push([
        "floor(@powerAttackBonus * @weaponHands) * @critMult",
        game.i18n.localize("D35E.PowerAttack"),
        "base",
      ]);
      rollData.powerAttackPenalty = -rollData.powerAttackBonus;
      attackExtraParts.push({
        part: "@powerAttackPenalty",
        value: rollData.powerAttackPenalty,
        source: game.i18n.localize("D35E.PowerAttack"),
      });
      if (rollData.powerAttackBonus > 0)
        rollModifiers.push(`${game.i18n.localize("D35E.PowerAttack")} ${rollData.powerAttackBonus}`);
    }
    if (form.find('[name="manyshot"]').prop("checked")) {
      manyshot = true;
      manyshotCount = parseInt(form.find('[name="manyshot-count"]').val());
      rollData.manyshotPenalty = -manyshotCount * 2;
      attackExtraParts.push({
        part: "@manyshotPenalty",
        value: rollData.manyshotPenalty,
        source: game.i18n.localize("D35E.FeatManyshot"),
      });
      rollModifiers.push(`${game.i18n.localize("D35E.FeatManyshot")}`);
    }

    if (form.find('[name="nonLethal"]').prop("checked")) {
      nonLethal = true;
    }
    const itemNonLethal = getProperty(this.item.system, "nonLethal") || getProperty(this.item.system, "nonLethalNoPenalty") || false;
    if (nonLethal && nonLethal !== itemNonLethal) {
      rollData.nonLethalPenalty = -4;
      attackExtraParts.push({
        part: "@nonLethalPenalty",
        value: rollData.nonLethalPenalty,
        source: game.i18n.localize("D35E.WeaponPropNonLethal"),
      });
      rollModifiers.push(`${game.i18n.localize("D35E.WeaponPropNonLethal")}`);
    }

    if (form.find('[name="prone"]').prop("checked")) {
      rollData.pronePenalty = -4;
      if (!rollData.attackToggles) rollData.attackToggles = {};
      rollData.attackToggles.prone = true;
      attackExtraParts.push({
        part: "@pronePenalty",
        value: rollData.pronePenalty,
        source: game.i18n.localize("D35E.Prone"),
      });
      rollModifiers.push(`${game.i18n.localize("D35E.Prone")}`);
    }
    if (form.find('[name="squeezing"]').prop("checked")) {
      rollData.squeezingPenalty = -4;
      if (!rollData.attackToggles) rollData.attackToggles = {};
      rollData.attackToggles.squeezing = true;
      attackExtraParts.push({
        part: "@squeezingPenalty",
        value: rollData.squeezingPenalty,
        source: game.i18n.localize("D35E.Squeezing"),
      });
      rollModifiers.push(`${game.i18n.localize("D35E.Squeezing")}`);
    }
    if (form.find('[name="highground"]').prop("checked")) {
      rollData.highground = 1;
      if (!rollData.attackToggles) rollData.attackToggles = {};
      rollData.attackToggles.highGround = true;
      attackExtraParts.push({
        part: "@highground",
        value: rollData.highground,
        source: game.i18n.localize("D35E.HighGround"),
      });
      rollModifiers.push(`${game.i18n.localize("D35E.HighGround")}`);
    }
    if (form.find('[name="defensive"]').prop("checked")) {
      rollData.defensive = -4;
      if (!rollData.attackToggles) rollData.attackToggles = {};
      rollData.attackToggles.defensive = true;
      attackExtraParts.push({
        part: "@defensive",
        value: rollData.attackToggles.defensive,
        source: game.i18n.localize("D35E.DefensiveFighting"),
      });
      rollModifiers.push(`${game.i18n.localize("D35E.DefensiveFighting")}`);
    }
    if (form.find('[name="charge"]').prop("checked")) {
      rollData.charge = 2;
      if (!rollData.attackToggles) rollData.attackToggles = {};
      rollData.attackToggles.charge = true;
      attackExtraParts.push({
        part: "@charge",
        value: rollData.charge,
        source: game.i18n.localize("D35E.Charge"),
      });
      rollModifiers.push(`${game.i18n.localize("D35E.Charge")}`);
    }
    if (form.find('[name="ccshot"]').prop("checked")) {
      rollData.closeQuartersShot = -4;
      if (!rollData.attackToggles) rollData.attackToggles = {};
      rollData.attackToggles.closeQuartersShot = true;
      attackExtraParts.push({
        part: "@closeQuartersShot",
        value: rollData.closeQuartersShot,
        source: game.i18n.localize("D35E.CloseQuartersShot"),
      });
      rollModifiers.push(`${game.i18n.localize("D35E.CloseQuartersShot")}`);
    }
    if (form.find('[name="flanking"]').prop("checked")) {
      rollData.flanking = 2;
      if (!rollData.attackToggles) rollData.attackToggles = {};
      rollData.attackToggles.flanking = true;
      attackExtraParts.push({
        part: "@flanking",
        value: rollData.flanking,
        source: game.i18n.localize("D35E.Flanking"),
      });
      rollModifiers.push(`${game.i18n.localize("D35E.Flanking")}`);
    }

    if (form.find('[name="greater-manyshot"]').prop("checked")) {
      greaterManyshotCount = parseInt(form.find('[name="greater-manyshot-count"]').val());
      greaterManyshot = true;
      rollData.greaterManyshotPenalty = -greaterManyshotCount * 2;
      attackExtraParts.push({
        part: "@greaterManyshotPenalty",
        value: rollData.greaterManyshotPenalty,
        source: game.i18n.localize("D35E.FeatGreaterManyshot"),
      });
      rollModifiers.push(`${game.i18n.localize("D35E.FeatGreaterManyshot")}`);
    }
    if (form.find('[name="rapid-shot"]').prop("checked")) {
      rapidShot = true;
    }
    if (form.find('[name="flurry-of-blows"]').prop("checked")) {
      flurryOfBlows = true;
    }
    // Primary Attack (for natural attacks)
    let html = form.find('[name="primary-attack"]');
    if (typeof html.prop("checked") === "boolean") {
      primaryAttack = html.prop("checked");
      rollData.primaryAttack = true;
    }
    // Use measure template
    html = form.find('[name="measure-template"]');
    if (typeof html.prop("checked") === "boolean") {
      useMeasureTemplate = html.prop("checked");
    }
    // Damage ability multiplier
    html = form.find('[name="damage-ability-multiplier"]');
    if (html.length > 0) {
      rollData.damageAbilityMultiplier = parseFloat(html.val());
    }

    let twoWeaponMode = "";
    if (form.find('[name="twf-attack-mode"]').val() !== undefined) {
      twoWeaponMode = form.find('[name="twf-attack-mode"]').val();
      if (twoWeaponMode === "main-offhand-light") {
        rollData.twoWeaponPenalty = -4;
        if (hasTwoWeaponFightingFeat) rollData.twoWeaponPenalty = -2;
        if (multiweaponFighting) rollData.twoWeaponPenalty = -2;
        attackExtraParts.push({
          part: "@twoWeaponPenalty",
          value: rollData.twoWeaponPenalty,
          source: game.i18n.localize("D35E.TwoWeaponPenalty"),
        });
      } else if (twoWeaponMode === "main-offhand-normal") {
        rollData.twoWeaponPenalty = -6;
        if (hasTwoWeaponFightingFeat) rollData.twoWeaponPenalty = -4;
        if (multiweaponFighting) rollData.twoWeaponPenalty = -4;
        attackExtraParts.push({
          part: "@twoWeaponPenalty",
          value: rollData.twoWeaponPenalty,
          source: game.i18n.localize("D35E.TwoWeaponPenalty"),
        });
      } else if (twoWeaponMode === "offhand-light") {
        rollData.twoWeaponPenalty = -8;
        if (hasTwoWeaponFightingFeat) rollData.twoWeaponPenalty = -2;
        if (multiweaponFighting) rollData.twoWeaponPenalty = -2;
        attackExtraParts.push({
          part: "@twoWeaponPenalty",
          value: rollData.twoWeaponPenalty,
          source: game.i18n.localize("D35E.TwoWeaponPenalty"),
        });
        twoWeaponFightingOffhand = true;
      } else if (twoWeaponMode === "offhand-normal") {
        rollData.twoWeaponPenalty = -10;
        if (hasTwoWeaponFightingFeat) rollData.twoWeaponPenalty = -4;
        if (multiweaponFighting) rollData.twoWeaponPenalty = -4;
        attackExtraParts.push({
          part: "@twoWeaponPenalty",
          value: rollData.twoWeaponPenalty,
          source: game.i18n.localize("D35E.TwoWeaponPenalty"),
        });
        twoWeaponFightingOffhand = true;
      } else if (twoWeaponMode === "two-handed") {
        rollData.weaponHands = 2;
      }
    }

    if (form.find('[name="target-ids"]').val() !== undefined) {
      selectedTargetIds = form.find('[name="target-ids"]').val();
      let targetIdSet = new Set(selectedTargetIds.split(";"));
      selectedTargets = canvas.tokens.objects.children.filter((t) => targetIdSet.has(t.data._id));
    }
    $(form)
      .find('[data-type="optional"]')
      .each(function () {
        if ($(this).prop("checked")) {
          let featId = $(this).attr("data-feat-optional");
          optionalFeatIds.push(featId);
          if ($(form).find(`[name="optional-range-${featId}"]`).val() !== undefined)
            optionalFeatRanges.set(featId, {
              base: $(form).find(`[name="optional-range-${featId}"]`)?.val() || 0,
              slider1: $(form).find(`[name="optional-range-1-${featId}"]`)?.val() || 0,
              slider2: $(form).find(`[name="optional-range-2-${featId}"]`)?.val() || 0,
              slider3: $(form).find(`[name="optional-range-3-${featId}"]`)?.val() || 0,
            });
        }
      });
    $(form)
      .find('[data-type="conditional"]')
      .each(function () {
        if ($(this).prop("checked")) enabledConditionals.push($(this).attr("data-conditional-optional"));
      });
    summonPack = form.find('[name="monster-collection"]').val();
    summonId = form.find('[name="monster-resultId"]').val();
    summonName = form.find('[name="monster-text"]').val();
    summonImg = form.find('[name="monster-img"]').val();
    summonFormula = form.find('[name="monster-formula"]').val();
    return {
      rollMode,
      useAmmoId,
      useAmmoNote,
      useAmmoName,
      ammoMaterial,
      ammoEnh,
      manyshot,
      manyshotCount,
      nonLethal,
      greaterManyshotCount,
      greaterManyshot,
      rapidShot,
      flurryOfBlows,
      primaryAttack,
      useMeasureTemplate,
      twoWeaponFightingOffhand,
      selectedTargetIds,
      selectedTargets,
      summonPack,
      summonId,
      summonName,
      summonImg,
      summonFormula,
    };
  }

  /**
   * Cast a Spell, consuming a spell slot of a certain level
   * @param {Item35E} item   The spell being cast by the actor
   * @param {MouseEvent} ev The click event
   */
  async useSpell(
    ev,
    { skipDialog = false, replacement = false, replacementItem = null, rollModeOverride = null } = {},
    actor = null
  ) {
    let usedItem = replacementItem ? replacementItem : this.item;
    if (!actor.testUserPermission(game.user, "OWNER"))
      return ui.notifications.warn(game.i18n.localize("D35E.ErrorNoActorPermission"));
    if (this.item.data.type !== "spell") throw new Error("Wrong Item type");
    if (getProperty(this.item.system, "requiresPsionicFocus") && !this.item.actor?.system?.attributes?.psionicFocus)
      return ui.notifications.warn(game.i18n.localize("D35E.RequiresPsionicFocus"));
    if (getProperty(this.item.system, "preparation.mode") !== "atwill" && new ItemCharges(this.item).getCharges() <= 0)
      return ui.notifications.warn(game.i18n.localize("D35E.ErrorNoSpellsLeft"));

    // Invoke the Item roll
    if (usedItem.hasAction) {
      let attackResult = await new ItemUse(usedItem).useAttack(
        { ev: ev, skipDialog: skipDialog, rollModeOverride: rollModeOverride },
        actor,
        true
      );
      if (!attackResult.wasRolled) return;
      let roll = await attackResult.roll;
      await new ItemCharges(this.item).addCharges(-1 + (-1 * roll?.rollData?.useAmount || 0));
      return;
    }

    await new ItemCharges(this.item).addCharges(-1);
    return usedItem.roll({ rollMode: rollModeOverride });
  }

  #_determineSpellInfo(_rollData) {
    const data = duplicate(this.item.system);
    const rollData = _rollData ? _rollData : this.item.actor ? this.item.actor.getRollData() : {};
    if (!_rollData) {
      rollData.item = data;
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

    // Determines CL, SL and ability modifier
    let spellSource;
    let cl = 0;
    let sl = 0;
    let ablMod = 0;
    if (this.item.type === "spell") {
      const spellbookIndex = data.spellbook;
      spellSource = getProperty(this.item.actor.system, `attributes.spells.spellbooks.${spellbookIndex}`) || {};
    } else if (this.item.type === "card") {
      const deckIndex = data.deck;
      spellSource = getProperty(this.item.actor.system, `attributes.cards.decks.${deckIndex}`) || {};
    } else {
      return; // The values are left undefined for other kinds of items.
    }

    const spellAbility = spellSource.ability;
    if (spellAbility !== "") ablMod = getProperty(this.item.actor.system, `abilities.${spellAbility}.mod`);

    cl += getProperty(spellSource, "cl.total") || 0;
    cl += data.clOffset || 0;
    cl += rollData.featClBonus || 0;
    cl -= this.item.actor.system.attributes.energyDrain || 0;

    sl += data.level;
    sl += data.slOffset || 0;

    rollData.cl = cl;
    rollData.sl = sl;
    rollData.ablMod = ablMod;
  }

  #_getSpellDC(_rollData) {
    const data = duplicate(this.item.system);
    let spellDC = { dc: null, type: null, description: null };

    const rollData = _rollData ? _rollData : this.item.actor ? this.item.actor.getRollData() : {};
    if (!_rollData) {
      rollData.item = data;
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

    spellDC.cl = rollData.cl;

    if (
      data.hasOwnProperty("actionType") &&
      (getProperty(data, "save.description") || getProperty(data, "save.type")) &&
      getProperty(data, "save.description") !== "None"
    ) {
      let saveDC = new Roll35e(data.save.dc.length > 0 ? data.save.dc : data.save.dc.toString() || "0", rollData).roll()
        .total;
      let saveDesc = data.save.description;
      if (this.item.type === "spell") {
        const spellbook = getProperty(this.item.actor.system, `attributes.spells.spellbooks.${data.spellbook}`) || {};
        saveDC += new Roll35e(spellbook.baseDCFormula || "", rollData).roll().total;
      }

      if (saveDC > 0 && data?.save?.type) {
        spellDC.dc = saveDC + (new Roll35e(rollData.featSpellDCBonus || "0", rollData).roll().total || 0);
        spellDC.type = data.save.type;
        spellDC.ability = data.save.ability;
        spellDC.isHalf = data.save.type.indexOf("half") !== -1;
        spellDC.isPartial = data.save.type.indexOf("partial") !== -1;
        spellDC.description = `${CONFIG.D35E.savingThrowTypes[data.save.type]}`;
        if (data.save.ability) spellDC.description += ` (${CONFIG.D35E.abilitiesShort[data.save.ability]})`;
      } else if (saveDC > 0 && saveDesc) {
        spellDC.dc = saveDC + (new Roll35e(rollData.featSpellDCBonus || "0", rollData).roll().total || 0);
        if (saveDesc.toLowerCase().indexOf("will") !== -1) {
          spellDC.type = "will";
        } else if (saveDesc.toLowerCase().indexOf("reflex") !== -1) {
          spellDC.type = "reflex";
        } else if (saveDesc.toLowerCase().indexOf("fortitude") !== -1) {
          spellDC.type = "fortitude";
        } else if (saveDesc.toLowerCase().indexOf("will") !== -1) {
          spellDC.type = "will";
        } else if (saveDesc.toLowerCase().indexOf("ref") !== -1) {
          spellDC.type = "reflex";
        } else if (saveDesc.toLowerCase().indexOf("fort") !== -1) {
          spellDC.type = "fortitude";
        }
        if (saveDesc.toLowerCase().indexOf("negates") !== -1) {
          spellDC.type += "negates";
        }
        if (saveDesc.toLowerCase().indexOf("partial") !== -1) {
          spellDC.type += "partial";
          spellDC.isPartial = true;
        } else if (saveDesc.toLowerCase().indexOf("half") !== -1) {
          spellDC.type += "half";
          spellDC.isHalf = true;
        }

        if (saveDesc.toLowerCase().indexOf("cha") !== -1) {
          spellDC.ability += "cha";
        } else if (saveDesc.toLowerCase().indexOf("con") !== -1) {
          spellDC.ability += "con";
        } else if (saveDesc.toLowerCase().indexOf("dex") !== -1) {
          spellDC.ability += "dex";
        } else if (saveDesc.toLowerCase().indexOf("str") !== -1) {
          spellDC.ability += "str";
        } else if (saveDesc.toLowerCase().indexOf("int") !== -1) {
          spellDC.ability += "int";
        } else if (saveDesc.toLowerCase().indexOf("wis") !== -1) {
          spellDC.ability += "wis";
        }
        spellDC.description = saveDesc;
      }
    }
    // //game.D35E.logger.log('Calculated spell DC', spellDC)
    return spellDC;
  }
}
