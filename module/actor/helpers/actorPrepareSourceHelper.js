import { ActorChangesHelper } from "./actorChangesHelper.js";

export class ActorPrepareSourceHelper {
  static setSourceDetails(actorData, extraData, flags) {
    if (flags == null) flags = {};
    let sourceDetails = {};
    // Get empty source arrays
    for (let obj of Object.values(CONFIG.D35E.buffTargets)) {
      for (let b of Object.keys(obj)) {
        if (!b.startsWith("_")) {
          let buffTargets = ActorChangesHelper.getChangeFlat(b, null, actorData.system);
          if (!(buffTargets instanceof Array)) buffTargets = [buffTargets];
          for (let bt of buffTargets) {
            if (!sourceDetails[bt]) sourceDetails[bt] = [];
          }
        }
      }
    }
    // Add additional source arrays not covered by changes
    sourceDetails["system.attributes.bab.total"] = [];

    // Add base values to certain bonuses
    sourceDetails["system.attributes.ac.normal.total"].push({ name: "Base", value: 10 });
    sourceDetails["system.attributes.ac.touch.total"].push({ name: "Base", value: 10 });
    sourceDetails["system.attributes.ac.flatFooted.total"].push({ name: "Base", value: 10 });
    sourceDetails["system.attributes.cmd.total"].push({ name: "Base", value: 10 });
    sourceDetails["system.attributes.cmd.flatFootedTotal"].push({ name: "Base", value: 10 });
    for (let [a, abl] of Object.entries(actorData.system.abilities)) {
      sourceDetails[`system.abilities.${a}.total`].push({ name: "Base", value: abl.value });
      // Add ability penalty, damage and drain
      if (abl.damage != null && abl.damage !== 0) {
        sourceDetails[`system.abilities.${a}.total`].push({
          name: "Ability Damage",
          value: `-${Math.floor(Math.abs(abl.damage) / 2)}`,
        });
      }
      if (abl.drain != null && abl.drain !== 0) {
        sourceDetails[`system.abilities.${a}.total`].push({ name: "Ability Drain", value: -Math.abs(abl.drain) });
      }
    }

    // Add CMB, CMD and initiative
    if (actorData.system.attributes.bab.total !== 0) {
      sourceDetails["system.attributes.cmb.total"].push({ name: "BAB", value: actorData.system.attributes.bab.total });
      sourceDetails["system.attributes.cmd.total"].push({ name: "BAB", value: actorData.system.attributes.bab.total });
      sourceDetails["system.attributes.cmd.flatFootedTotal"].push({
        name: "BAB",
        value: actorData.system.attributes.bab.total,
      });
    }
    if (actorData.system.abilities.str.mod !== 0) {
      sourceDetails["system.attributes.cmb.total"].push({
        name: "Strength",
        value: actorData.system.abilities.str.mod,
      });
      sourceDetails["system.attributes.cmd.total"].push({
        name: "Strength",
        value: actorData.system.abilities.str.mod,
      });
      sourceDetails["system.attributes.cmd.flatFootedTotal"].push({
        name: "Strength",
        value: actorData.system.abilities.str.mod,
      });
    }
    if (actorData.system.abilities.dex.mod !== 0) {
      sourceDetails["system.attributes.cmd.total"].push({
        name: "Dexterity",
        value: actorData.system.abilities.dex.mod,
      });
      if (actorData.system.abilities.dex.mod < 0) {
        sourceDetails["system.attributes.cmd.flatFootedTotal"].push({
          name: "Dexterity",
          value: actorData.system.abilities.dex.mod,
        });
      }
      sourceDetails["system.attributes.init.total"].push({
        name: "Dexterity",
        value: actorData.system.abilities.dex.mod,
      });
    }
    if (flags.uncannyDodge && !flags.loseDexToAC) {
      sourceDetails["system.attributes.ac.flatFooted.total"].push({
        name: "Dexterity (Uncanny Dodge)",
        value: actorData.system.abilities.dex.mod,
      });
    }
    if (actorData.system.attributes.energyDrain != null && actorData.system.attributes.energyDrain !== 0) {
      sourceDetails["system.attributes.cmb.total"].push({
        name: "Negative Levels",
        value: -actorData.system.attributes.energyDrain,
      });
      sourceDetails["system.attributes.cmd.total"].push({
        name: "Negative Levels",
        value: -actorData.system.attributes.energyDrain,
      });
      sourceDetails["system.attributes.cmd.flatFootedTotal"].push({
        name: "Negative Levels",
        value: -actorData.system.attributes.energyDrain,
      });
    }

    // Add ability mods (and energy drain) to saving throws
    for (let [s, a] of Object.entries(CONFIG.D35E.savingThrowMods)) {
      if (actorData.system.abilities[a].mod !== 0) {
        sourceDetails[`system.attributes.savingThrows.${s}.total`].push({
          name: CONFIG.D35E.abilities[a],
          value: actorData.system.abilities[a].mod,
        });
      }
      if (actorData.system.attributes.energyDrain != null && actorData.system.attributes.energyDrain !== 0) {
        sourceDetails[`system.attributes.savingThrows.${s}.total`].push({
          name: "Negative Levels",
          value: -actorData.system.attributes.energyDrain,
        });
      }
    }

    for (let [sklKey, skl] of Object.entries(actorData.system.skills)) {
      if (sourceDetails[`system.skills.${sklKey}.changeBonus`] == null) continue;
      sourceDetails[`system.skills.${sklKey}.changeBonus`].push({
        name: "Ranks",
        value: skl.rank,
      });
      sourceDetails[`system.skills.${sklKey}.changeBonus`].push({
        name: "Ability Modifier",
        value: skl.abilityModifier,
      });
      if (skl.acpPenalty) {
        sourceDetails[`system.skills.${sklKey}.changeBonus`].push({
          name: "Armor Class Penalty",
          value: -skl.acpPenalty,
        });
      }
      if (actorData.system.attributes.energyDrain != null && actorData.system.attributes.energyDrain !== 0) {
        if (sourceDetails[`system.skills.${sklKey}.changeBonus`] == null) continue;
        sourceDetails[`system.skills.${sklKey}.changeBonus`].push({
          name: "Negative Levels",
          value: -actorData.system.attributes.energyDrain,
        });
      }

      if (skl.subSkills != null) {
        for (let [subSklKey, subSkl] of Object.entries(skl.subSkills)) {
          sourceDetails[`system.skills.${sklKey}.subSkills.${subSklKey}.changeBonus`].push({
            name: "Ranks",
            value: subSkl.rank,
          });
          sourceDetails[`system.skills.${sklKey}.subSkills.${subSklKey}.changeBonus`].push({
            name: "Ability Modifiers",
            value: subSkl.abilityModifier,
          });
          if (subSkl.acpPenalty) {
            sourceDetails[`system.skills.${sklKey}.subSkills.${subSklKey}.changeBonus`].push({
              name: "Armor Class Penalty",
              value: subSkl.acpPenalty,
            });
          }
          if (actorData.system.attributes.energyDrain != null && actorData.system.attributes.energyDrain !== 0) {
            sourceDetails[`system.skills.${sklKey}.subSkills.${subSklKey}.changeBonus`].push({
              name: "Negative Levels",
              value: -actorData.system.attributes.energyDrain,
            });
          }
        }
      }
    }

    // AC from Dex mod
    const maxDexBonus = actorData.system.attributes.maxDexBonus;
    const dexBonus =
      maxDexBonus != null
        ? Math.min(maxDexBonus, actorData.system.abilities.dex.mod)
        : actorData.system.abilities.dex.mod;
    if (dexBonus < 0 || (!flags.loseDexToAC && dexBonus > 0)) {
      sourceDetails["system.attributes.ac.normal.total"].push({ name: "Dexterity", value: dexBonus });
      sourceDetails["system.attributes.ac.touch.total"].push({ name: "Dexterity", value: dexBonus });
      if (dexBonus < 0) {
        sourceDetails["system.attributes.ac.flatFooted.total"].push({ name: "Dexterity", value: dexBonus });
      }
    }

    // Add extra data
    for (let [changeTarget, changeGrp] of Object.entries(extraData)) {
      for (let grp of Object.values(changeGrp)) {
        if (grp.length > 0) {
          sourceDetails[changeTarget] = sourceDetails[changeTarget] || [];
          for (let src of grp) {
            let srcInfo = this.#translateSourceInfo(src.type, src.subtype, src.name, src.bonusType);
            sourceDetails[changeTarget].push({
              name: srcInfo,
              bonusType: src.bonusType,
              value: src.value,
              isItemBonus: this.#isItemBonus(src.type, src.subtype, src.name),
            });
          }
        }
      }
    }

    return sourceDetails;
  }

  static #translateSourceInfo(type, subtype, name, bonusType) {
    let result = "";
    if (type === "size") result = "Size";
    if (type === "buff") {
      result = "Buffs";
      if (subtype === "temp") result = "Temporary Buffs";
      if (subtype === "perm") result = "Permanent Buffs";
      if (subtype === "item") result = "Item Buffs";
      if (subtype === "misc") result = "Misc Buffs";
    }
    if (type === "race") {
      result = "Race";
    }
    if (type === "equipment") result = "Equipment";
    if (type === "weapon") result = "Weapons";
    if (type === "feat") {
      result = "Feats";
      if (subtype === "classFeat") result = "Class Features";
      if (subtype === "trait") result = "Traits";
      if (subtype === "racial") result = "Racial Traits";
      if (subtype === "misc") result = "Misc Features";
    }
    let finalName = "";
    if (!name || name.length === 0) finalName = result;
    else if (result === "") finalName = name;
    else finalName = `${result} → ${name}`;

    if (bonusType) {
      finalName = `${CONFIG.D35E.bonusModifiers[bonusType]} [${finalName}]`;
    }
    return finalName;
  }

  static #isItemBonus(type, subtype, name) {
    let result = "";
    if (type === "buff") {
      return true;
    }
    if (type === "aura") {
      return true;
    }
    if (type === "equipment") return true;
    if (type === "weapon") return true;
    if (type === "feat") {
      return true;
    }
    return false;
  }
}
