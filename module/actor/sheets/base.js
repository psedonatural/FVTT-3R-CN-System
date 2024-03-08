import { ActorTraitSelector } from "../../apps/trait-selector.js";
import { LevelUpDialog } from "../../apps/level-up-box.js";
import { DamageReductionSetting } from "../../apps/damage-reduction-setting.js";
import { LevelUpDataDialog } from "../../apps/level-up-data.js";
import { ActorSheetFlags } from "../../apps/actor-flags.js";
import { DicePF } from "../../dice.js";
import { createTabs, createTag, isMinimumCoreVersion, uuidv4 } from "../../lib.js";
import { NoteEditor } from "../../apps/note-editor.js";
import { SpellbookEditor } from "../../apps/spellbook-editor.js";
import { DeckEditor } from "../../apps/deck-editor.js";
import { D35E } from "../../config.js";
import { PointBuyCalculator } from "../../apps/point-buy-calculator.js";
import { Item35E } from "../../item/entity.js";
import { ActorDamageHelper } from "../helpers/actorDamageHelper.js";
import { Roll35e } from "../../roll.js";
import ActorSensesConfig from "../../apps/senses-config.js";
import AbilityConfig from "../../apps/ability-config.js";
import { EntrySelector } from "../../apps/entry-selector.js";
import { ItemDescriptionsHelper } from "../../item/helpers/itemDescriptionsHelper.js";
import { ActorWealthHelper } from "../helpers/actorWealthHelper.js";
import { ItemEnhancementHelper } from "../../item/helpers/itemEnhancementHelper.js";
import { StatblockGenerator } from "../../utils/statblock-generator.js";
import { LootSheetActions } from "../../lootsheet/actions.js";
import { ItemDrawerHelper } from "./helpers/itemDrawerHelper.js";
import {CompendiumBrowser} from '../../apps/compendium-browser.js';

/**
 * Extend the basic ActorSheet class to do all the PF things!
 * This sheet is an Abstract layer which is not used.
 *
 * @type {ActorSheet}
 */
export class ActorSheetPF extends ActorSheet {
  constructor(...args) {
    super(...args);

    this.itemDrawerHelper = new ItemDrawerHelper(this);

    this.options.submitOnClose = false;
    this.randomUuid = uuidv4();
    this.alreadyOpening = false;

    /**
     * The scroll position on the active tab
     * @type {number}
     */
    this._scrollTab = {};
    this._initialTab = {};
    this._firstLoad = true;
    this._settingItemActive = false;
    /**
     * Track the set of item filters which are applied
     * @type {Set}
     */
    this._filters = {
      inventory: new Set(),
      spellbook: new Set(),
      features: new Set(),
      buffs: new Set(),
    };

    /**
     * Track item updates from the actor sheet.
     * @type {Object[]}
     */
    this._itemUpdates = [];
  }

  get entity() {
    return this.document;
  }
  get currentSpellbookKey() {
    const elems = this.element.find("nav.spellbooks .item.active");
    if (elems.length !== 1)
      return Object.keys(getProperty(this.system, "attributes.spells.spellbook") || { primary: null })[0];
    return elems.attr("data-tab");
  }

  /* -------------------------------------------- */

  /**
   * Add some extra data when rendering the sheet to reduce the amount of logic required within the template.
   */
  async getData() {
    // Basic data
    let isOwner = this.document.isOwner;
    let actorRollData = this.actor.getRollData();
    const sheetData = {
      owner: isOwner,
      uuid: this.entity.uuid,
      name: this.document.name,
      limited: this.document.limited,
      options: this.options,
      editable: this.isEditable,
      rendered: {
        biography: await TextEditor.enrichHTML(this.actor.system.details.biography.value, {rollData: this.actor.getRollData(), secrets: isOwner}),
        notes: await TextEditor.enrichHTML(this.actor.system.details.notes.value, {rollData: this.actor.getRollData(), secrets: isOwner}),
      },
      cssClass: isOwner ? "editable" : "locked",
      actorId: this.actor.id || this.actor._id,
      isCharacter: this.entity.data.type === "character",
      isPlayerEditLocked: (this.entity.system.lockEditingByPlayers || false) && !game.user.isGM,
      hasRace: false,
      config: CONFIG.D35E,
      useBGSkills: this.entity.data.type === "character" && game.settings.get("D35E", "allowBackgroundSkills"),
      hideShortDescriptions: game.settings.get("D35E", "hideSpells"),
      spellFailure: this.entity.spellFailure,
      isGM: game.user.isGM,
      race: this.entity.race != null ? duplicate(this.entity.race.data) : null,
    };
    // The Actor and its Items
    sheetData.actor = this.actor.data.toObject(false);
    sheetData.items = sheetData.actor.items.map((i) => {
      const item = this.actor.items.get(i._id);
      i.system = item.toObject(false).system;
      i.labels = item.labels;
      i.id = item.id;
      i.hasAttack = item.hasAttack;
      i.possibleUpdate = item.system.possibleUpdate;
      i.hasMultipleAttacks = item.hasMultipleAttacks;
      i.containerId = getProperty(item.system, "containerId");
      i.hasDamage = item.hasDamage;
      i.hasEffect = item.hasEffect;
      i.charges = item.charges;
      i.maxCharges = item.maxCharges;
      i.isRecharging = item.isRecharging;
      i.hasTimedRecharge = item.hasTimedRecharge;
      i.container = getProperty(i.system, "container");
      i.hasAction = item.hasAction || item.isCharged;
      i.attackDescription = item.type === "attack" ? ItemDescriptionsHelper.attackDescription(item, actorRollData) : "";
      i.damageDescription = item.type === "attack" ? ItemDescriptionsHelper.damageDescription(item, actorRollData) : "";
      i.range = item.type === "attack" ? ItemDescriptionsHelper.rangeDescription(item) : "";
      i.isCurseKnown = getProperty(item.system, "curseActive") || getProperty(item.system, "identifiedCurse");
      i.timelineLeftText = item.getTimelineTimeLeftDescriptive();
      i.showUnidentifiedData = item.showUnidentifiedData;
      i.unmetRequirements =
        item.type === "feat" || item.type === "class" ? item.hasUnmetRequirements(actorRollData) : false;
      i.name = item.displayName;
      return i;
    });
    sheetData.items.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    sheetData.system = sheetData.actor.system;
    sheetData.labels = this.actor.labels || {};
    sheetData.filters = this._filters;

    // Hit point sources
    if (this.actor.sourceDetails != null) sheetData.sourceDetails = expandObject(this.actor.sourceDetails);
    else sheetData.sourceDetails = null;

    // Ability Scores

    sheetData.abilitiesChanged = false;

    for (let [a, abl] of Object.entries(sheetData.actor.data.abilities)) {
      abl.label = CONFIG.D35E.abilitiesShort[a];
      abl.tempvalue = sheetData.actor.data.abilities[a].total;
      if (sheetData.actor.data.abilities[a].value !== 10) sheetData.abilitiesChanged = true;
      if (sheetData.actor.data.abilities[a].value !== sheetData.actor.data.abilities[a].total) {
        sheetData.actor.data.abilities[a].modified = true;
      }
      abl.sourceDetails = sheetData.sourceDetails != null ? sheetData.sourceDetails.system.abilities[a].total : {};
      for (let [_s, _sobj] of Object.entries(abl.sourceDetails)) {
        if (_sobj.isItemBonus) abl.hasItemBonus = true;
      }
    }

    sheetData.sizeModified = sheetData.actor.data.traits.size !== sheetData.actor.data.traits.actualSize;

    // Armor Class
    for (let [a, ac] of Object.entries(sheetData.actor.data.attributes.ac)) {
      ac.label = CONFIG.D35E.ac[a];
      ac.labelShort = CONFIG.D35E.acShort[a];
      ac.valueLabel = CONFIG.D35E.acValueLabels[a];
      ac.sourceDetails = sheetData.sourceDetails != null ? sheetData.sourceDetails.system.attributes.ac[a].total : [];
    }

    // Saving Throws
    for (let [a, savingThrow] of Object.entries(sheetData.actor.data.attributes.savingThrows)) {
      savingThrow.label = CONFIG.D35E.savingThrows[a];
      savingThrow.sourceDetails =
        sheetData.sourceDetails != null ? sheetData.sourceDetails.system.attributes.savingThrows[a].total : [];
    }

    // Update skill labels
    for (let [s, skl] of Object.entries(sheetData.actor.data.skills)) {
      if (skl === null) {
        continue;
      }
      skl.label = CONFIG.D35E.skills[s];
      skl.arbitrary = CONFIG.D35E.arbitrarySkills.includes(s);
      skl.sourceDetails =
        sheetData.sourceDetails != null && sheetData.sourceDetails.system.skills[s] != null
          ? duplicate(sheetData.sourceDetails.system.skills[s].changeBonus)
          : [];
      if (!sheetData.actor.data.details.levelUpProgression && !skl.cls && skl.points)
        // We do not display this as this is already calculated
        skl.sourceDetails.push({
          name: game.i18n.localize("D35E.NonClassSkill"),
          value: game.i18n.localize("D35E.HalfRanks"),
        });
      if (s === "jmp") {
        if (sheetData.actor.data.attributes.speed.land.total < sheetData.actor.data.attributes.speed.land.base) {
          let value =
            6 *
            Math.floor(
              (sheetData.actor.data.attributes.speed.land.total - sheetData.actor.data.attributes.speed.land.base) / 10
            );
          skl.sourceDetails.push({
            name: `${game.i18n.localize("D35E.Speed")} ${game.i18n.localize("D35E.Penalty")}`,
            value: value,
          });
        } else {
          let value =
            4 *
            Math.floor(
              (sheetData.actor.data.attributes.speed.land.total - sheetData.actor.data.attributes.speed.land.base) / 10
            );
          skl.sourceDetails.push({
            name: `${game.i18n.localize("D35E.Speed")} ${game.i18n.localize("D35E.Bonus")}`,
            value: value,
          });
        }
      }
      if (skl.subSkills != null) {
        for (let [s2, skl2] of Object.entries(skl.subSkills)) {
          if (sheetData.sourceDetails == null) continue;
          if (sheetData.sourceDetails.system.skills[s] == null) continue;
          if (sheetData.sourceDetails.system.skills[s].subSkills == null) continue;
          skl2.sourceDetails =
            sheetData.sourceDetails.system.skills[s].subSkills[s2] != null
              ? duplicate(sheetData.sourceDetails.system.skills[s].subSkills[s2].changeBonus)
              : [];
          if (sheetData.actor.data.attributes.acp.total && skl2.acp)
            skl2.sourceDetails.push({
              name: game.i18n.localize("D35E.ACP"),
              value: `-${sheetData.actor.data.attributes.acp.total}`,
            });
          if (skl2.ability)
            skl2.sourceDetails.push({
              name: game.i18n.localize("D35E.Ability"),
              value: getProperty(sheetData.actor, `data.abilities.${skl2.ability}.mod`),
            });
          if (!skl2.cls && skl2.points)
            skl.sourceDetails.push({
              name: game.i18n.localize("D35E.NonClassSkill"),
              value: game.i18n.localize("D35E.HalfRanks"),
            });
        }
      }
    }

    // Update spellbook info
    for (let spellbook of Object.values(sheetData.actor.data.attributes.spells.spellbooks)) {
      const cl = spellbook?.cl?.total || 0;
      spellbook.range = {
        close: 25 + 5 * Math.floor(cl / 2),
        medium: 100 + 10 * cl,
        long: 400 + 40 * cl,
      };
    }

    // Control items
    sheetData.items
      .filter((obj) => {
        return obj.type === "spell";
      })
      .forEach((obj) => {
        obj.isPrepared = obj.system.preparation.mode === "prepared";
      });

    sheetData.senses = this._getSenses(this.actor);

    sheetData.isShapechanged = false;
    sheetData.items
      .filter((obj) => {
        return obj.type === "buff" && obj.system.buffType === "shapechange";
      })
      .forEach((obj) => {
        if (obj.system.active) {
          sheetData.isShapechanged = true;
          sheetData.shapechangeName = obj.name;
        }
      });
    sheetData.items
      .filter((obj) => {
        return obj.type === "buff" && obj.system.buffType === "shapechange";
      })
      .forEach((obj) => {
        obj.canToggleShapechange = !sheetData.isShapechanged || (sheetData.isShapechanged && obj.system.active);
      });
    // Update traits
    this._prepareTraits(sheetData.actor.data.traits);

    // Prepare owned items
    this._prepareItems(sheetData);

    let classNamesAndLevels = [];

    sheetData.items
      .filter((i) => i.type === "class")
      .forEach((c) => classNamesAndLevels.push(c.name + " " + c.system.levels));

    sheetData.classList = classNamesAndLevels.join(", ");
    sheetData.randomUuid = this.randomUuid;

    // Compute encumbrance
    sheetData.encumbrance = this._computeEncumbrance(sheetData);

    // Prepare skillsets
    sheetData.skillsets = this._prepareSkillsets(sheetData.actor.data.skills);

    sheetData.energyResistance = ActorDamageHelper.computeERTags(ActorDamageHelper.getERForActor(this.actor));
    sheetData.damageReduction = ActorDamageHelper.computeDRTags(ActorDamageHelper.getDRForActor(this.actor));

    // Skill rank counting
    const skillRanks = { allowed: 0, used: 0, bgAllowed: 0, bgUsed: 0, sentToBG: 0 };
    // Count used skill ranks
    for (let skl of Object.values(this.actor.system.skills)) {
      if (skl === null) continue;
      if (skl.subSkills != null) {
        for (let subSkl of Object.values(skl.subSkills)) {
          if (sheetData.useBGSkills && skl.background) {
            skillRanks.bgUsed += subSkl.points;
          } else {
            skillRanks.used += subSkl.points;
          }
        }
      } else if (sheetData.useBGSkills && skl.background) {
        skillRanks.bgUsed += skl.points;
      } else {
        skillRanks.used += skl.points;
      }
    }
    // Count allowed skill ranks
    let firstOnList = true;
    let itemBonusSkillPointRanks = this.actor.data?.data?.counters?.bonusSkillPoints?.value || 0;
    let classCount = 0;
    this.actor.data.items
      .filter((obj) => {
        return obj.type === "class";
      })
      .forEach((cls) => {
        const clsLevel = cls.system.levels;
        const clsSkillsPerLevel = cls.system.skillsPerLevel;
        if (clsSkillsPerLevel > 0) classCount++;
        const fcSkills = cls.system.fc.skill.value;
        if (clsLevel > 0) {
          if (firstOnList) {
            skillRanks.allowed += Math.max(
              clsLevel - 1 + 4,
              (this.actor.system.abilities.int.mod + clsSkillsPerLevel + itemBonusSkillPointRanks) * 3 +
                (this.actor.system.abilities.int.mod + clsSkillsPerLevel + itemBonusSkillPointRanks) * clsLevel +
                fcSkills
            );
            firstOnList = false;
          } else {
            skillRanks.allowed +=
              (this.actor.system.abilities.int.mod + clsSkillsPerLevel + itemBonusSkillPointRanks) * clsLevel;
          }
        }
        if (sheetData.useBGSkills) skillRanks.bgAllowed = this.actor.system.details.level.value * 2;
      });
    if (this.actor.system.details.bonusSkillRankFormula !== "") {
      let roll = new Roll35e(this.actor.system.details.bonusSkillRankFormula, duplicate(this.actor.system)).roll();
      skillRanks.allowed += roll.total;
    }
    if (classCount > 1) sheetData.multipleSkillClasses = true;
    // Calculate used background skills
    if (sheetData.useBGSkills) {
      if (skillRanks.bgUsed > skillRanks.bgAllowed) {
        skillRanks.sentToBG = skillRanks.bgUsed - skillRanks.bgAllowed;
        skillRanks.allowed -= skillRanks.sentToBG;
        skillRanks.bgAllowed += skillRanks.sentToBG;
      }
    }
    sheetData.skillRanks = skillRanks;
    let sizeMod = CONFIG.D35E.sizeMods[this.actor.system.traits.actualSize] || 0;
    sheetData.attackBonuses = {
      sizeMod: sizeMod,
      melee:
        this.actor.system.attributes.bab.total +
        this.actor.system.abilities.str.mod +
        sizeMod -
        (this.actor.system.attributes.energyDrain || 0) +
        this.actor.system.attributes.attack.general +
        this.actor.system.attributes.attack.melee,
      ranged:
        this.actor.system.attributes.bab.total +
        this.actor.system.abilities.dex.mod +
        sizeMod -
        (this.actor.system.attributes.energyDrain || 0) +
        this.actor.system.attributes.attack.general +
        this.actor.system.attributes.attack.ranged,
    };

    sheetData.coinWeight =
      game.settings.get("D35E", "units") === "metric"
        ? game.i18n.localize("D35E.GenericCarryLabelKg").format(ActorWealthHelper.calculateCoinWeight(this.actor.data))
        : game.i18n.localize("D35E.GenericCarryLabel").format(ActorWealthHelper.calculateCoinWeight(this.actor.data));

    sheetData.maxDexBonus = { sourceDetails: [] };
    switch (this.actor.system.attributes.encumbrance.level) {
      case 0:
        sheetData.maxDexBonus.sourceDetails.push({
          name: game.i18n.localize("D35E.Encumbrance"),
          value: game.i18n.localize("D35E.NotLimited"),
        });
        break;
      case 1:
        sheetData.maxDexBonus.sourceDetails.push({ name: game.i18n.localize("D35E.Encumbrance"), value: "3" });
        break;
      case 2:
        sheetData.maxDexBonus.sourceDetails.push({ name: game.i18n.localize("D35E.Encumbrance"), value: "1" });
        break;
    }

    sheetData.maxDexBonus.sourceDetails.push({
      name: game.i18n.localize("D35E.Gear"),
      value:
        this.actor.system.attributes?.maxDex?.gear !== null
          ? this.actor.system.attributes?.maxDex?.gear
          : game.i18n.localize("D35E.NotLimited"),
    });
    sheetData.maxDexUnlimited = this.actor.system.attributes?.maxDex?.total === 999;

    // Fetch the game settings relevant to sheet rendering.
    sheetData.healthConfig = game.settings.get("D35E", "healthConfig");
    sheetData.currencyConfig = game.settings.get("D35E", "currencyConfig");
    sheetData.currencyGroups = {};
    sheetData.currencyConfig.currency.forEach((c) => {
      if (!sheetData.currencyGroups[c[4]]) {
        sheetData.currencyGroups[c[4]] = [];
      }
      sheetData.currencyGroups[c[4]].push(c);
    });

    sheetData.psionicsAreDifferent = game.settings.get("D35E", "psionicsAreDifferent");

    // Return data to the sheet
    return sheetData;
  }

  /* -------------------------------------------- */

  _prepareTraits(traits) {
    const map = {
      // "dr": CONFIG.D35E.damageTypes,
      di: CONFIG.D35E.damageTypes,
      dv: CONFIG.D35E.damageTypes,
      ci: CONFIG.D35E.conditionTypes,
      languages: CONFIG.D35E.languages,
      armorProf: CONFIG.D35E.armorProficiencies,
      weaponProf: CONFIG.D35E.weaponProficiencies,
    };
    for (let [t, choices] of Object.entries(map)) {
      const trait = traits[t];
      if (!trait) continue;
      let values = [];
      if (trait.value) {
        values = trait.value instanceof Array ? trait.value : [trait.value];
      }
      trait.selected = values.reduce((obj, t) => {
        obj[t] = choices[t];
        return obj;
      }, {});

      // Add custom entry
      if (trait.custom) {
        trait.custom
          .split(CONFIG.D35E.re.traitSeparator)
          .forEach((c, i) => (trait.selected[`custom${i + 1}`] = c.trim()));
      }
      trait.cssClass = !isEmpty(trait.selected) ? "" : "inactive";
    }
  }

  /* -------------------------------------------- */

  /**
   * Insert a spell into the spellbook object when rendering the character sheet
   * @param {Object} data     The Actor data being prepared
   * @param {Array} spells    The spell data being prepared
   * @param {String} bookKey  The key of the spellbook being prepared
   * @private
   */
  _prepareSpellbook(data, spells, bookKey, availableSpellSpecialization, bannedSpellSpecialization, domainSpellNames) {
    const owner = this.actor.isOwner;
    const book = this.actor.system.attributes.spells.spellbooks[bookKey];

    // Reduce spells to the nested spellbook structure
    let spellbook = {};
    for (let a = 0; a < 11; a++) {
      spellbook[a] = {
        level: a,
        usesSlots: true,
        spontaneous: book.spontaneous && a !== 10,
        usePowerPoints: book.usePowerPoints,
        powerPoints: book.powerPoints,
        canCreate: owner === true,
        canPrepare: data.actor.type === "character",
        label: a === 10 ? game.i18n.localize("D35E.SpellLevel10") : CONFIG.D35E.spellLevels[a],
        isEpic: a === 10,
        slotsLeft: false,
        spells: [],
        maxPrestigeClSources:
          data.sourceDetails !== null &&
          data.sourceDetails.system.attributes.prestigeCl !== undefined &&
          data.sourceDetails.system.attributes.prestigeCl[book.spellcastingType] !== undefined &&
          data.sourceDetails.system.attributes.prestigeCl[book.spellcastingType].max != null
            ? data.sourceDetails.system.attributes.prestigeCl[book.spellcastingType].max
            : [],
        uses: book.spells === undefined ? 0 : book?.spells["spell" + a]?.value || 0,
        baseSlots: book.spells === undefined ? 0 : book?.spells["spell" + a]?.base || 0,
        maxKnown: book.spells === undefined ? 0 : book?.spells["spell" + a]?.maxKnown || 0,
        slots: book.spells === undefined ? 0 : book?.spells["spell" + a]?.max || 0,
        dataset: { type: "spell", level: a, spellbook: bookKey },
        specialSlotPrepared: false,
        hasNonDomainSpells: false,
      };
    }
    spells.forEach((spell) => {
      const lvl = (spell.system.level || 0) > 9 ? 10 : spell.system.level || 0;
      spell.epicLevel = spell.system.level || 0;
      spell.epic = spell.epicLevel > 9;
      if (bannedSpellSpecialization.has(spell.system.school)) spell.isBanned = true;
      else spell.isBanned = false;
      if (availableSpellSpecialization.has(spell.system.school) || domainSpellNames.has(createTag(spell.name))) {
        spell.isSpecialized = true;
      } else {
        spell.isSpecialized = false;
        spellbook[lvl].hasNonDomainSpells = true;
      }
      if (spell.system.isSpellSpontaneousReplacement) {
        spellbook[lvl].hasSpontaneousSpellReplacement = true;
        spellbook[lvl].spellReplacementId = spell.id;
        spellbook[lvl].spellReplacementName = spell.name;
      }
      if (spell.system.specialPrepared) spellbook[lvl].specialSlotPrepared = true;
      if (
        !book.usePowerPoints &&
        !book.spontaneous &&
        spell.system.preparation.maxAmount === 0 &&
        book.showOnlyPrepared
      )
        return;
      spellbook[lvl].spells.push(spell);
    });

    for (let a = 0; a < 11; a++) {
      spellbook[a].slotsLeft =
        spellbook[a].spells
          .map((item) => (item.system.specialPrepared ? 0 : item.system.preparation.maxAmount) || 0)
          .reduce((prev, next) => prev + next, 0) < spellbook[a].slots;
      spellbook[a].known = spellbook[a].spells.length;
      spellbook[a].knownOverLimit = spellbook[a].maxKnown > 0 && spellbook[a].known > spellbook[a].maxKnown;
    }

    // Sort the spellbook by section order
    spellbook = Object.values(spellbook);
    spellbook.sort((a, b) => a.level - b.level);
    return spellbook;
  }

  _prepareSkillsets(skillset) {
    let settings = game.settings.get("D35E", "worldDefaults");

    let result = {
      all: { skills: {} },
      adventure: { skills: {} },
      background: { skills: {} },
      known: { skills: {} },
    };
    for (let skill of Object.keys(skillset)) {
      let s = skillset[skill];
      if (s.worldCustom) s.label = s.name;
    }
    // sort skills by label
    let keys = Object.keys(skillset).sort(function (a, b) {
      if (skillset[a] === null) return -1;
      if (skillset[b] === null) return -1;
      if (skillset[a].custom && !skillset[a].worldCustom && !skillset[b].custom) return 1;
      if (!skillset[a].custom && skillset[b].custom && !skillset[b].worldCustom) return -1;
      return ("" + skillset[a].label).localeCompare(skillset[b].label);
    });

    keys.forEach((a) => {
      let skl = skillset[a];
      if (skl === null) return;
      if (settings.worldDefaults?.skills[a] === "hide") return;
      skl.points = skl.points || 0;
      skl.mod = skl.mod || 0;
      result.all.skills[a] = skl;
      if (
        (skl.points > 0 || (!skl.rt && this.actor.system.displayNonRTSkills) || skl.visibility === "always") &&
        skl.visibility !== "never"
      )
        result.known.skills[a] = skl;
      else if (skl.subSkills !== undefined && skl.visibility !== "never") {
        result.known.skills[a] = skl;
      }
      if (skl.background) result.background.skills[a] = skl;
      else result.adventure.skills[a] = skl;
    });

    return result;
  }

  /* -------------------------------------------- */

  /**
   * Determine whether an Owned Item will be shown based on the current set of filters
   * @return {boolean}
   * @private
   */
  _filterItems(items, filters) {
    return items.filter((item) => {
      const itemSystemData = item.system;

      // Action usage
      for (let f of ["action", "bonus", "reaction"]) {
        if (filters.has(f)) {
          if (itemSystemData.activation && itemSystemData.activation.type !== f) return false;
        }
      }

      if (filters.has("prepared")) {
        if (itemSystemData.level === 0 || ["pact", "innate"].includes(itemSystemData.preparation.mode)) return true;
        if (this.actor.data.type === "npc") return true;
        return itemSystemData.preparation.prepared;
      }

      // Equipment-specific filters
      if (filters.has("equipped")) {
        if (itemSystemData.equipped && itemSystemData.equipped !== true) return false;
      }

      // Whether active
      if (filters.has("active")) {
        if (!itemSystemData.active) return false;
      }

      return true;
    });
  }

  /* -------------------------------------------- */

  /**
   * Get the font-awesome icon used to display a certain level of skill proficiency
   * @private
   */
  _getProficiencyIcon(level) {
    const icons = {
      0: '<i class="far fa-circle"></i>',
      0.5: '<i class="fas fa-adjust"></i>',
      1: '<i class="fas fa-check"></i>',
      2: '<i class="fas fa-check-double"></i>',
    };
    return icons[level];
  }

  /* -------------------------------------------- */

  /**
   * Compute the level and percentage of encumbrance for an Actor.
   *
   * @param {Object} actorData      The data object for the Actor being rendered
   * @return {Object}               An object describing the character's encumbrance level
   * @private
   */
  _computeEncumbrance(actorData) {
    const conversion = game.settings.get("D35E", "units") === "metric" ? 0.5 : 1;
    const carriedWeight = actorData.system.attributes.encumbrance.carriedWeight * conversion;
    const load = {
      light: actorData.system.attributes.encumbrance.levels.light * conversion,
      medium: actorData.system.attributes.encumbrance.levels.medium * conversion,
      heavy: actorData.system.attributes.encumbrance.levels.heavy * conversion,
    };
    const carryLabel =
      game.settings.get("D35E", "units") === "metric"
        ? game.i18n.localize("D35E.CarryLabelKg").format(carriedWeight)
        : game.i18n.localize("D35E.CarryLabel").format(carriedWeight);
    const enc = {
      pct: {
        light: Math.max(0, Math.min((carriedWeight * 100) / load.light, 99.5)),
        medium: Math.max(0, Math.min(((carriedWeight - load.light) * 100) / (load.medium - load.light), 99.5)),
        heavy: Math.max(0, Math.min(((carriedWeight - load.medium) * 100) / (load.heavy - load.medium), 99.5)),
      },
      encumbered: {
        light: actorData.system.attributes.encumbrance.level >= 1,
        medium: actorData.system.attributes.encumbrance.level >= 2,
        heavy:
          actorData.system.attributes.encumbrance.carriedWeight >= actorData.system.attributes.encumbrance.levels.heavy,
      },
      light: actorData.system.attributes.encumbrance.levels.light * conversion,
      medium: actorData.system.attributes.encumbrance.levels.medium * conversion,
      heavy: actorData.system.attributes.encumbrance.levels.heavy * conversion,
      value: actorData.system.attributes.encumbrance.carriedWeight,
      carryLabel: carryLabel,
    };

    return enc;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers
  /* -------------------------------------------- */

  /**
   * Activate event listeners using the prepared sheet HTML
   * @param html {HTML}   The prepared HTML object ready to be rendered into the DOM
   */
  async activateListeners(html) {
    super.activateListeners(html);

    this.createTabs(html);

    // Tooltips
    html.mousemove((ev) => this._moveTooltips(ev));

    // Activate Item Filters
    const filterLists = html.find(".filter-list");
    filterLists.each(this._initializeFilterItemList.bind(this));
    filterLists.on("click", ".filter-item", this._onToggleFilter.bind(this));

    // Item summaries
    html.find(".item .item-name h4").click((event) => this._onItemSummary(event));

    // Item Dragging
    let handler = (ev) => this._onDragStart(ev);
    html.find("li.item").each((i, li) => {
      if (li.classList.contains("inventory-header")) return;
      li.setAttribute("draggable", true);
      li.addEventListener("dragstart", handler, false);
    });
    html.find("li.skill").each((i, li) => {
      li.setAttribute("draggable", true);
      li.addEventListener("dragstart", handler, false);
    });

    // Limited Sheet Actions
    html.find('[data-action=show-image]').on('click', (ev) => {
        const actor = this.actor;
        new ImagePopout(ev.currentTarget.src, {
            title: actor.name,
            uuid: actor.uuid
        }).render(true);
    });

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Trigger form submission from textarea elements.
    html.find("textarea").change(this._onSubmit.bind(this));

    /* -------------------------------------------- */
    /*  Abilities, Skills, Defenses and Traits
    /* -------------------------------------------- */

    // Ability Checks
    html.find(".ability-name").click(this._onRollAbilityTest.bind(this));

    // BAB Check
    html.find(".attribute.bab .attribute-name").click(this._onRollBAB.bind(this));

    html.find(".attribute.melee-bab .attribute-name").click(this._onRollSimpleMelee.bind(this));
    html.find(".attribute.ranged-bab .attribute-name").click(this._onRollSimpleRanged.bind(this));
    html.find(".roll-psionic-focus").click(this._onRollPsionicFocus.bind(this));

    // CMB Check
    html.find(".attribute.cmb .attribute-name").click(this._onRollCMB.bind(this));

    // Initiative Check
    html.find(".attribute.initiative .attribute-name").click(this._onRollInitiative.bind(this));

    // Saving Throw
    html.find(".saving-throw .attribute-name").click(this._onRollSavingThrow.bind(this));

    // Add arbitrary skill
    html.find(".skill.arbitrary .skill-create").click((ev) => this._onArbitrarySkillCreate(ev));

    // Delete arbitrary skill
    html.find(".sub-skill > .skill-controls > .skill-delete").click((ev) => this._onArbitrarySkillDelete(ev));

    // Add custom skill
    html.find(".skill-controls.skills .skill-create").click((ev) => this._onSkillCreate(ev));

    // Delete custom skill
    html.find(".skill > .skill-controls > .skill-delete").click((ev) => this._onSkillDelete(ev));

    // Quick Item Action control
    html.find(".item-actions a").mouseup((ev) => this._quickItemActionControl(ev));

    // Roll Skill Checks
    html.find(".skill .skill-roll").click(this._onRollSkillCheck.bind(this));
    html.find(".sub-skill .skill-roll").click(this._onRollSubSkillCheck.bind(this));

    // Trait Selector
    html.find(".trait-selector").click(this._onTraitSelector.bind(this));

    // Sense Selector
    html.find(".sense-selector").click(this._onSenseSelector.bind(this));

    // Trait Selector
    html.find(".drer-selector").click(this._onDREREditor.bind(this));

    // Configure Special Flags
    html.find(".configure-flags").click(this._onConfigureFlags.bind(this));

    // Roll defenses
    html.find(".defense-rolls .generic-defenses .rollable").click((ev) => {
      this.actor.displayDefenses();
    });

    html.find(".turnUndeadHdTotal .rollable").click((ev) => {
      this.actor.rollTurnUndead();
    });

    // Rest
    html.find(".rest").click(this._onRest.bind(this));

    // Level up
    html.find(".level-up").click(this._onLevelUp.bind(this));
    html.find(".point-buy").click(this._onPointBuy.bind(this));

    html.find(".note-editor").click(this._onNoteEditor.bind(this));
    html.find(".configure-ability").click(this._onAbilityConfig.bind(this));
    html.find(".configure-spellbook").click(this._onSpellbookEditor.bind(this));
    html.find(".configure-deck").click(this._onDeckEditor.bind(this));
    html.find(".draw-cards").click(this._onDeckDrawCards.bind(this));
    html.find(".configure-level-up-data").click(this._onLevelDataUp.bind(this));

    html.find(".group-inventory").click(this._onGroupInventory.bind(this));

    html.find(".spellcasting-concentration .rollable").click(this._onRollConcentration.bind(this));

    html.find(".spellcasting-cl .rollable").click(this._onRollCL.bind(this));
    /* -------------------------------------------- */
    /*  Inventory
    /* -------------------------------------------- */

    // Owned Item management
    html.find(".item-create").click((ev) => this._onItemCreate(ev));
    html.find(".item-edit").click(this._onItemEdit.bind(this));
    html.find(".item-delete").click(this._onItemDelete.bind(this));
    html.find(".item-recharge").click(this._onItemRestoreUses.bind(this));

    html.find(".item .container-selector").change((ev) => {
      this._onItemChangeContainer(ev);
    });
    html.find(".fix-containers").click((ev) => this._onCharacterClearContainers(ev));
    html.find(".check-updates").click((ev) => this._onCharacterCheckUpdates(ev));
    html.find(".generate-statblock").click((ev) => this._onCharacterGenerateStatblock(ev));

    html.find(".spell-add-uses").click((ev) => this._onSpellAddUses(ev));
    html.find(".spell-remove-uses").click(this._onSpellRemoveUses.bind(this));
    html.find(".spell-prepare-special").click(this._onSpellPrepareSpecialUses.bind(this));
    html.find(".spell-add-metamagic").click(this._onSpellAddMetamagic.bind(this));
    html.find(".card-draw").click(this._onCardDraw.bind(this));
    html.find(".card-discard").click(this._onCardDiscard.bind(this));
    html.find(".card-side").click(this._onCardSide.bind(this));
    html.find(".card-return").click(this._onCardReturn.bind(this));

    // Item Rolling
    html.find(".item .item-image").click((event) => this._onItemRoll(event));
    html.find(".item .item-enh-image").click((event) => this._onEnhRoll(event));

    html.find(".item .feat-group-selector").change((ev) => {
      this._onFeatChangeGroup(ev);
    });

    // Quick add item quantity
    html.find("a.item-control.item-quantity-add").click((ev) => {
      this._quickChangeItemQuantity(ev, 1);
    });
    // Quick subtract item quantity
    html.find("a.item-control.item-quantity-subtract").click((ev) => {
      this._quickChangeItemQuantity(ev, -1);
    });

    // Quick (un)equip item
    html.find("a.item-control.item-equip").click((ev) => {
      this._quickEquipItem(ev);
    });

    // Quick carry item
    html.find("a.item-control.item-carry").click((ev) => {
      this._quickCarryItem(ev);
    });

    // Quick (un)identify item
    html.find("a.item-control.item-identify").click((ev) => {
      this._quickIdentifyItem(ev);
    });

    html.find("a.random-hp-roll").click((ev) => {
      this._rollRandomHitDie(ev);
    });

    /* -------------------------------------------- */
    /*  Master/Minion
    /* -------------------------------------------- */

    html.find("a.unbind-minion").click((event) => this._onMasterUnbind(event));

    /* -------------------------------------------- */
    /*  Feats
    /* -------------------------------------------- */

    html
      .find(".item-detail.item-uses input[type='text']:not(:disabled)")
      .off("change")
      .change(this._setFeatUses.bind(this));
    html
      .find("input[type='text'].monsterblock-item-uses:not(:disabled)")
      .off("change")
      .change(this._setFeatUses.bind(this));

    /* -------------------------------------------- */
    /*  Spells
    /* -------------------------------------------- */

    html
      .find(".item-list .spell-uses input[type='text'][data-type='amount']")
      .off("change")
      .change(this._setSpellUses.bind(this));
    html
      .find(".item-list .spell-uses input[type='text'][data-type='max']")
      .off("change")
      .change(this._setMaxSpellUses.bind(this));

    /* -------------------------------------------- */
    /*  Buffs
    /* -------------------------------------------- */

    html.find(".item-detail.item-active input[type='checkbox']").off("change").change(this._setItemActive.bind(this));

    html.find(".item-detail.item-level input[type='text']").off("change").change(this._setBuffLevel.bind(this));

    /*
        Race
     */

    // Race controls
    html.find(".race-container .item-control").click(this._onRaceControl.bind(this));
    html.find(".material-container .item-control").click(this._onRaceControl.bind(this));

    // Open Compendium packs
    html.find(".open-compendium-pack").click((ev) => this._openCompendiumPack(ev));

    html.find(".add-all-known-spells").click((ev) => this._addAllKnownSpells(ev));

    html.find(".warning").click((ev) => this._openClassTab());

    // Quick add item quantity
    html.find("a.remove-prestige-cl").click((ev) => {
      this._changeSpellbokPrestigeCl(ev, -1);
    });
    html.find("a.add-prestige-cl").click((ev) => {
      this._changeSpellbokPrestigeCl(ev, 1);
    });
    html.find("a.remove-prestige-cl-deck").click((ev) => {
      this._changeDeckPrestigeCl(ev, -1);
    });
    html.find("a.add-prestige-cl-deck").click((ev) => {
      this._changeDeckPrestigeCl(ev, 1);
    });

    html.find("a.toggle-psionic-focus").click((ev) => {
      this._togglePsionicFocus(ev);
    });

    // Progression
    html.find("input[type='checkbox'].level-up-progression").click((ev) => this._onChangeUseProgression(ev));

    html.find(".item-search-input").off("keyup").keyup(this._filterData.bind(this));
    html.find(".item-search-input").on("change", (event) => event.stopPropagation());
    html.find(".item-add-close-box").click((ev) => {
      this._closeInlineData(ev);
    });

    html.find(".entry-selector").click(this._onEntrySelector.bind(this));
    html.find(".advance-monster").click(this._onMonsterAdvance.bind(this));

    html.on("click", ".inventory-toggleable-header", (event) => {
      event.preventDefault();
      const header = event.currentTarget;
      const card = header.closest(".inventory-sublist");
      if (card == null) return;
      const content = card.querySelector(".item-list");
      let sublistId = card.dataset.sublistId;
      let actor = this.actor;
      $(content).slideToggle(400, function () {
        let isHidden = $(this).is(":hidden");
        let parsedDrawerState = JSON.parse(sessionStorage.getItem(`D35E-drawer-state-${actor.id}`) || "null");
        let drawerState = !jQuery.isEmptyObject(parsedDrawerState) ? new Set(parsedDrawerState) : new Set();
        if (isHidden) {
          drawerState.add(sublistId);
          $(card.querySelector(".toggle-open")).hide();
          $(card.querySelector(".toggle-close")).show();
        } else {
          drawerState.delete(sublistId);
          $(card.querySelector(".toggle-open")).show();
          $(card.querySelector(".toggle-close")).hide();
        }
        sessionStorage.setItem(`D35E-drawer-state-${actor.id}`, JSON.stringify(Array.from(drawerState)));
      });
    });
    {
      $(`.sync-to-companion`).unbind("mouseup");
      $(`.sync-to-companion`).mouseup((ev) => {
        this.actor.syncToCompendium(true);
      });
      $(`.backup-to-companion`).unbind("mouseup");
      $(`.backup-to-companion`).mouseup(async (ev) => {
        $.ajax({
          url: "http://localhost:5000/api/backup/da26937f-7ede-4c91-8087-e2c39c18e475",
          type: "PUT",
          crossDomain: true,
          dataType: "json",
          contentType: "application/json; charset=utf-8",
          data: JSON.stringify(await this.actor.exportToJSON()),
          success: function (data) {
            //play with data
          },
        });
      });
    }
    {
      let parsedDrawerState = JSON.parse(sessionStorage.getItem(`D35E-drawer-state-${this.actor.id}`) || "null");
      let drawerState = !jQuery.isEmptyObject(parsedDrawerState) ? new Set(parsedDrawerState) : new Set();
      let x = 2;
      drawerState.forEach((id) => {
        $(`[data-sublist-id='${id}'] .item-list`).hide();
        $(`[data-sublist-id='${id}'] .toggle-open`).hide();
        $(`[data-sublist-id='${id}'] .toggle-close`).show();
      });
    }
    {
      //game.D35E.logger.log("Item Browser | Loading pack inline browser on load")
      let entityType = sessionStorage.getItem(`D35E-last-ent-type-${this.id}`);
      let type = sessionStorage.getItem(`D35E-last-type-${this.id}`);
      let subType = sessionStorage.getItem(`D35E-last-subtype-${this.id}`);
      let filter = sessionStorage.getItem(`D35E-filter-${this.id}`);
      let label = sessionStorage.getItem(`D35E-label-${this.id}`);
      let opened = sessionStorage.getItem(`D35E-opened-${this.id}`) === "true";
      let scrollPosition = parseInt(sessionStorage.getItem(`D35E-position-${this.id}`) || "0");
      if (opened) {
        await this.loadData(entityType, type, subType, filter, label);
        $(`#${this.randomUuid}-itemList`).scrollTop(scrollPosition);
      }
    }

    if (this.actor.system.companionPublicId) {
      const toggleString =
        "<a style='color: white; text-decoration: none' href='https://companion.legaciesofthedragon.com/character/public/" +
        this.actor.system.companionPublicId +
        "' class='header-button companion-view-button' title='" +
        game.i18n.localize("D35E.DisplayInCompanion") +
        "'><i class='fa fa-user'></i>" +
        game.i18n.localize("D35E.DisplayInCompanion") +
        "</a>";
      const toggleButton = $(toggleString);
      html.closest(".app").find(".companion-view-button").remove();
      const titleElement = html.closest(".app").find(".window-title");
      toggleButton.insertAfter(titleElement);
    } else if (this.actor.system.companionUuid) {
      const toggleString =
        "<a style='color: white; text-decoration: none' href='https://companion.legaciesofthedragon.com/character/" +
        this.actor.system.companionUuid +
        "' class='header-button companion-view-button' title='" +
        game.i18n.localize("D35E.DisplayInCompanion") +
        "'><i class='fa fa-user'></i>" +
        game.i18n.localize("D35E.DisplayInCompanion") +
        "</a>";
      const toggleButton = $(toggleString);
      html.closest(".app").find(".companion-view-button").remove();
      const titleElement = html.closest(".app").find(".window-title");
      toggleButton.insertAfter(titleElement);
    } else {
      html.closest(".app").find(".companion-view-button").remove();
    }
  }

  createTabs(html) {
    const tabGroups = {
      primary: {
        inventory: {},
        feats: {},
        skillset: {},
        buffs: {},
        attacks: {},
        spellbooks: {},
        decks: {},
      },
    };
    // Add spellbooks to tabGroups
    for (let a of Object.keys(this.actor.system.attributes.spells.spellbooks)) {
      tabGroups["primary"]["spellbooks"][`spells_${a}`] = {};
    }
    for (let a of Object.keys(this.actor.system.attributes?.cards?.decks || {})) {
      tabGroups["primary"]["decks"][`spells_${a}`] = {};
    }
    createTabs.call(this, html, tabGroups);
  }

  _rollRandomHitDie(event) {
    let itemUpdates = [];
    this.actor.data.items
      .filter((obj) => {
        return obj.type === "class";
      })
      .forEach((item) => {
        if (item.system.classType === "template") return;
        if (item.system.classType === "minion") return;
        let hd = item.system.hd;
        let hp = 0;
        let levels = item.system.levels;
        for (let i = 0; i < levels; i++) {
          hp += this.getRandomInt(1, hd);
        }
        itemUpdates.push({ _id: item._id, "system.hp": hp });
      });
    this.actor.updateEmbeddedEntity("Item", itemUpdates, { stopUpdates: false, ignoreSpellbookAndLevel: true });
  }

  getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /* -------------------------------------------- */

  _moveTooltips(event) {
    $(event.currentTarget)
      .find(".tooltip:hover .tooltipcontent")
      .css("left", `${event.clientX}px`)
      .css("top", `${event.clientY + 24}px`);
  }

  /**
   * Initialize Item list filters by activating the set of filters which are currently applied
   * @private
   */
  _initializeFilterItemList(i, ul) {
    const set = this._filters[ul.dataset.filter];
    const filters = ul.querySelectorAll(".filter-item");
    for (let li of filters) {
      if (set.has(li.dataset.filter)) li.classList.add("active");
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle click events for the Traits tab button to configure special Character Flags
   */
  _onConfigureFlags(event) {
    event.preventDefault();
    new ActorSheetFlags(this.actor).render(true);
  }

  _onRest(event) {
    event.preventDefault();
    this.actor.promptRest();
  }

  _onPointBuy(event) {
    event.preventDefault();
    new PointBuyCalculator(this).render(true);
  }

  _onLevelUp(event) {
    event.preventDefault();
    new LevelUpDialog(this.actor).render(true);
  }

  _onGroupInventory(event) {
    event.preventDefault();
    this.actor.groupItems();
  }

  /* -------------------------------------------- */

  /**
   * Handle rolling of an item from the Actor sheet, obtaining the Item instance and dispatching to it's roll method
   * @private
   */
  _onItemRoll(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.getOwnedItem(itemId);
    if (item) return item.roll();
  }

  _setFeatUses(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.getOwnedItem(itemId);

    const value = Number(event.currentTarget.value);
    const updateData = {};
    this.setItemUpdate(item._id, "system.uses.value", value);
  }

  _setSpellUses(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.getOwnedItem(itemId);

    const value = Number(event.currentTarget.value);
    this.setItemUpdate(item._id, "system.preparation.preparedAmount", value);
  }
  _setMaxSpellUses(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.getOwnedItem(itemId);

    const value = Number(event.currentTarget.value);
    this.setItemUpdate(item._id, "system.preparation.maxAmount", value);
  }

  _setBuffLevel(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.getOwnedItem(itemId);

    const value = Number(event.currentTarget.value);
    this.setItemUpdate(item._id, "system.level", value);
  }

  _onRollConcentration(event) {
    event.preventDefault();

    const spellbookKey = $(event.currentTarget).closest(".spellbook-group").data("tab");
    const spellbook = this.actor.system.attributes.spells.spellbooks[spellbookKey];
    const rollData = duplicate(this.actor.system);
    rollData.cl = spellbook.cl.total;

    // Add contextual concentration string
    let notes = [];
    if (spellbook.concentrationNotes.length > 0) {
      if (!isMinimumCoreVersion("0.5.2")) {
        let noteStr = DicePF.messageRoll({
          data: rollData,
          msgStr: spellbook.concentrationNotes,
        });
        notes.push(...noteStr.split(/[\n\r]+/));
      } else notes.push(...spellbook.concentrationNotes.split(/[\n\r]+/));
    }

    let props = [];
    if (notes.length > 0) props.push({ header: game.i18n.localize("D35E.Notes"), value: notes });
    let formulaRoll = {};
    try {
      formulaRoll = new Roll35e(spellbook.concentrationFormula, rollData).roll();
    } catch (e) {
      formulaRoll = { total: 0 };
    }
    return DicePF.d20Roll({
      event: event,
      parts: ["@concentrationBonus + @formulaBonus"],
      data: {
        concentrationBonus: this.actor.system.skills["coc"].mod, // This is standard concentration skill
        formulaBonus: formulaRoll.total,
      },
      title: game.i18n.localize("D35E.ConcentrationCheck"),
      speaker: ChatMessage.getSpeaker({ actor: this }),
      takeTwenty: false,
      chatTemplate: "systems/D35E/templates/chat/roll-ext.html",
      chatTemplateData: { hasProperties: props.length > 0, properties: props },
    });
  }

  _onChangeUseProgression(event) {
    event.preventDefault();
    new Dialog({
      title: game.i18n.localize("D35E.ToggleUseProgression"),
      content: game.i18n.localize("D35E.ToggleUseProgressionD"),
      buttons: {
        do: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize("D35E.Change"),
          callback: () =>
            this.actor.update({
              data: { details: { levelUpProgression: !this.actor.system.details.levelUpProgression } },
            }),
        },
        dont: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("D35E.DoNotChange"),
          callback: () => {},
        },
      },
      default: "dont",
    }).render(true);
  }

  _onRollCL(event) {
    event.preventDefault();

    const spellbookKey = $(event.currentTarget).closest(".spellbook-group").data("tab");
    const spellbook = this.actor.system.attributes.spells.spellbooks[spellbookKey];
    const rollData = duplicate(this.actor.system);

    // Add contextual caster level string
    let notes = [];
    if (spellbook.clNotes.length > 0) {
      if (!isMinimumCoreVersion("0.5.2")) {
        let noteStr = DicePF.messageRoll({
          data: rollData,
          msgStr: spellbook.clNotes,
        });
        notes.push(...noteStr.split(/[\n\r]+/));
      } else notes.push(...spellbook.clNotes.split(/[\n\r]+/));
    }

    let props = [];
    if (notes.length > 0) props.push({ header: game.i18n.localize("D35E.Notes"), value: notes });
    return DicePF.d20Roll({
      event: event,
      parts: [`@cl`],
      data: { cl: spellbook.cl.total },
      title: game.i18n.localize("D35E.CasterLevelCheck"),
      speaker: ChatMessage.getSpeaker({ actor: this }),
      takeTwenty: false,
      chatTemplate: "systems/D35E/templates/chat/roll-ext.html",
      chatTemplateData: { hasProperties: props.length > 0, properties: props },
    });
  }

  async _setItemActive(event) {
    if (this._settingItemActive) return;
    this._settingItemActive = true;
    event.preventDefault();
    event.stopPropagation();
    this.showWorkingOverlay();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.getOwnedItem(itemId);

    const value = $(event.currentTarget).prop("checked");
    const updateData = {};
    updateData["system.active"] = value;
    if (item.testUserPermission(game.user, "OWNER")) {
      await item.update(updateData);
    }

    this.hideWorkingOverlay();
    this._settingItemActive = false;
  }

  hideWorkingOverlay() {
    if (this.actor.isToken) {
      $(`#actor-${this.actor._id}-${this.actor.token.id}`).removeClass("isWorking");
    } else {
      $(`#actor-${this.actor._id}`).removeClass("isWorking");
    }
  }

  showWorkingOverlay() {
    if (this.actor.isToken) {
      $(`#actor-${this.actor._id}-${this.actor.token.id}`).addClass("isWorking");
    } else {
      $(`#actor-${this.actor._id}`).addClass("isWorking");
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle attempting to recharge an item usage by rolling a recharge check
   * @param {Event} event   The originating click event
   * @private
   */
  _onItemRecharge(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.getOwnedItem(itemId);
    return item.rollRecharge();
  }

  /* -------------------------------------------- */

  /**
   * Handle rolling of an item from the Actor sheet, obtaining the Item instance and dispatching to it's roll method
   * @private
   */
  async _onItemSummary(event) {
    event.preventDefault();
    let li = $(event.currentTarget).closest(".item"),
      item = this.actor.getOwnedItem(li.attr("data-item-id"));

    // Toggle summary
    if (li.hasClass("expanded")) {
      let summary = li.children(".item-summary");
      if (li.attr("data-item-id") === "passive-feature") {
        summary.slideUp(200);
      } else {
        summary.slideUp(200, () => summary.remove());
      }
    } else {
      let summary = li.children(".item-summary");
      if (!summary.length && item) {
        let chatData = await item.getChatData({ secrets: this.actor.isOwner });
        let div = $(`<div class="item-summary">${chatData.description.value}</div>`);
        let subElements = $(`<ul class="item-enh-list"></ul>`);
        let props = $(`<div class="item-properties"></div>`);
        chatData.properties.forEach((p) => props.append(`<span class="tag">${p}</span>`));
        if (!item.showUnidentifiedData) {
          //game.D35E.logger.log('Enchancement item data', getProperty(item.system, `enhancements.items`) || []);
          (getProperty(item.system, `enhancements.items`) || []).forEach((__enh) => {
            const _enh = duplicate(__enh);
            delete _enh._id;
            let enh = new Item35E(_enh, { owner: this.isOwner });
            if (enh.hasAction || enh.isCharged) {
              let enhString =
                `<li class="item enh-item item-box flexrow" data-item-id="${item._id}" data-enh-id="${enh.tag}">
                    <div class="item-name  flexrow">
                        <div class="item-image item-enh-image" style="background-image: url('${enh.img}')"></div>
                        <h4 class="rollable{{#if item.incorrect}} strikethrough-text{{/if}}">
                            ${enh.name} <em style="opacity: 0.7">${enh.system.uses.per} ${
                  item.system.enhancements.uses.commonPool ? "common pool" : ""
                }</em>
                        </h4>
                    </div>
                    <div class="item-detail item-actions">
                        <div class="item-attack">
                            <a class="item-control item-enh-attack"><img class="icon"
                                                                     src="systems/D35E/icons/actions/gladius.svg"></a>
                        </div>
                    </div>` +
                (item.system.enhancements.uses.commonPool
                  ? `
                    <div class="item-detail item-uses flexrow {{#if item.isCharged}}tooltip{{/if}}">
                        <input type="text" class="uses" disabled value="${item.system.enhancements.uses.value}" data-dtype="Number"/>
                        <span class="sep"> of </span>
                        <input type="text" class="maxuses" disabled value="${item.system.enhancements.uses.max}" data-dtype="Number"/>
                    </div>
                    <div class="item-detail item-per-use flexrow {{#if item.isCharged}}tooltip{{/if}}"  style="flex: 0 48px">
                        <input type="text" disabled value="${enh.system.uses.chargesPerUse}" data-dtype="Number"/>
                    </div>

                </li>`
                  : enh.isCharged
                  ? `
                    <div class="item-detail item-uses flexrow {{#if item.isCharged}}tooltip{{/if}}">
                        <input type="text" class="uses" disabled value="${enh.system.uses.value}" data-dtype="Number"/>
                        <span class="sep"> of </span>
                        <input type="text" class="maxuses" disabled value="${enh.system.uses.max}" data-dtype="Number"/>
                    </div>
                    <div class="item-detail item-per-use flexrow {{#if item.isCharged}}tooltip{{/if}}"  style="flex: 0 48px">
                        <input type="text" disabled value="${enh.system.uses.chargesPerUse}" data-dtype="Number"/>
                    </div>

                </li>`
                  : `</li>`);
              subElements.append(enhString);
            }
          });
          div.append(subElements);
        }
        div.append(props);

        div.find(".item-enh-attack").mouseup((ev) => this._quickItemEnhActionControl(ev));
        div.find(".item-enh-image").mouseup((ev) => this._onEnhRoll(ev));
        li.append(div.hide());
        div.slideDown(200);
      } else {
        summary.slideDown(200);
      }
    }
    li.toggleClass("expanded");
  }

  async _quickItemEnhActionControl(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const itemId = $(event.currentTarget).parents(".enh-item").attr("data-item-id");
    const enhId = $(event.currentTarget).parents(".enh-item").attr("data-enh-id");
    const item = this.actor.getOwnedItem(itemId);

    // Quick Attack
    if (a.classList.contains("item-enh-attack")) {
      await item.enhancements.useEnhancementItem(await item.enhancements.getEnhancementItem(enhId));
    }
  }

  async _onEnhRoll(event) {
    event.preventDefault();
    const itemId = $(event.currentTarget).parents(".enh-item").attr("data-item-id");
    const enhId = $(event.currentTarget).parents(".enh-item").attr("data-enh-id");
    const item = this.actor.getOwnedItem(itemId);
    let enh = await item.enhancements.getEnhancementItem(enhId);
    return enh.roll({}, this.actor);
  }

  /* -------------------------------------------- */

  _onMasterUnbind(event) {
    event.preventDefault();
    this.actor._setMaster(null);
  }

  /* -------------------------------------------- */

  _onArbitrarySkillCreate(event) {
    event.preventDefault();
    const skillId = $(event.currentTarget).parents(".skill").attr("data-skill");
    const mainSkillData = this.actor.system.skills[skillId];
    const skillData = {
      name: "",
      ability: mainSkillData.ability,
      rank: 0,
      notes: "",
      mod: 0,
      rt: mainSkillData.rt,
      cs: mainSkillData.cs,
      acp: mainSkillData.acp,
    };

    // Get tag
    let count = 1;
    let tag = `${skillId}${count}`;
    while (mainSkillData.subSkills[tag] != null) {
      count++;
      tag = `${skillId}${count}`;
    }

    const updateData = {};
    updateData[`data.skills.${skillId}.subSkills.${tag}`] = skillData;
    if (this.actor.testUserPermission(game.user, "OWNER")) this.actor.update(updateData);
  }

  _onSkillCreate(event) {
    event.preventDefault();
    const isBackground = $(event.currentTarget).parents(".skills-list").attr("data-background") === "true";
    const skillData = {
      name: "",
      ability: "int",
      rank: 0,
      notes: "",
      mod: 0,
      rt: false,
      cs: false,
      acp: false,
      background: isBackground,
      custom: true,
    };

    let tag = createTag(skillData.name || "skill");
    let count = 1;
    while (this.actor.system.skills[tag] != null) {
      count++;
      tag = createTag(skillData.name || "skill") + count.toString();
    }

    const updateData = {};
    updateData[`system.skills.${tag}`] = skillData;
    if (this.actor.testUserPermission(game.user, "OWNER")) this.actor.update(updateData);
  }

  _onArbitrarySkillDelete(event) {
    event.preventDefault();
    const mainSkillId = $(event.currentTarget).parents(".sub-skill").attr("data-main-skill");
    const subSkillId = $(event.currentTarget).parents(".sub-skill").attr("data-skill");

    const updateData = {};
    updateData[`system.skills.${mainSkillId}.subSkills.-=${subSkillId}`] = null;
    if (this.actor.testUserPermission(game.user, "OWNER")) this.actor.update(updateData);
  }

  _onSkillDelete(event) {
    event.preventDefault();
    const skillId = $(event.currentTarget).parents(".skill").attr("data-skill");

    const updateData = {};
    updateData[`system.skills.-=${skillId}`] = null;
    if (this.actor.testUserPermission(game.user, "OWNER")) this.actor.update(updateData);
  }

  async _quickItemActionControl(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    const replacementId = $(event.currentTarget).parents(".item").attr("data-replacement-id");
    const item = this.actor.getOwnedItem(itemId);

    // Quick Attack
    if (a.classList.contains("item-attack")) {
      await item.use({ ev: event, skipDialog: event.shiftKey });
    }
    if (a.classList.contains("item-attack-convert")) {
      await item.use({ ev: event, skipDialog: event.shiftKey, replacementId: replacementId });
    }
  }

  async _changeSpellbokPrestigeCl(event, add = 1) {
    event.preventDefault();
    const spellbookKey = $(event.currentTarget).closest(".spellbook-group").data("tab");

    const currentCl =
      getProperty(this.actor.system, `attributes.spells.spellbooks.${spellbookKey}.bonusPrestigeCl`) || 0;
    const newCl = Math.max(0, currentCl + add);
    const k = `system.attributes.spells.spellbooks.${spellbookKey}.bonusPrestigeCl`;
    let updateData = {};
    updateData[k] = newCl;
    this.actor.update(updateData);
  }

  async _changeDeckPrestigeCl(event, add = 1) {
    event.preventDefault();
    const spellbookKey = $(event.currentTarget).closest(".deck-group").data("tab");

    const currentCl = getProperty(this.actor.system, `attributes.cards.decks.${spellbookKey}.bonusPrestigeCl`) || 0;
    const newCl = Math.max(0, currentCl + add);
    const k = `system.attributes.cards.decks.${spellbookKey}.bonusPrestigeCl`;
    let updateData = {};
    updateData[k] = newCl;
    this.actor.update(updateData);
  }

  async _togglePsionicFocus(event) {
    event.preventDefault();
    const spellbookKey = $(event.currentTarget).closest(".spellbook-group").data("tab");

    const currentPF = getProperty(this.actor.system, `attributes.psionicFocus`) || false;
    const newPF = !currentPF;
    const k = `system.attributes.psionicFocus`;
    let updateData = {};
    updateData[k] = newPF;
    this.actor.update(updateData);
  }

  async _onFeatChangeGroup(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.getOwnedItem(itemId);
    const newSource = $(event.currentTarget).val();
    item.update({ "system.classSource": newSource });
  }

  async _onItemChangeContainer(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.getOwnedItem(itemId);
    const newSource = $(event.currentTarget).val();
    item.update({ "system.containerId": newSource });
  }

  async _onCharacterClearContainers(event) {
    event.preventDefault();
    let itemUpdates = [];
    this.actor.items
      .filter((i) => getProperty(i.system, "subType") === "container")
      .forEach((item) => {
        itemUpdates.push({ _id: item._id, "system.containerId": "none" });
      });
    await this.actor.updateOwnedItem(itemUpdates, { stopUpdates: true });
  }

  async _onCharacterCheckUpdates(event) {
    event.preventDefault();
    let itemUpdates = [];
    for (let item of this.actor.items) {
      if (item.system.originVersion && item.system.originPack && item.system.originId) {
        let compendiumItem = await game.packs.get(item.system.originPack).getDocument(item.system.originId);
        if (!compendiumItem) {
          game.D35E.logger.log("Item missing from compendium...");
        } else {
          if (compendiumItem.system.originVersion > item.system.originVersion)
            itemUpdates.push({ _id: item.id, "system.possibleUpdate": true });
          else itemUpdates.push({ _id: item.id, "system.possibleUpdate": false });
        }
      }
    }
    await this.actor.updateOwnedItem(itemUpdates, { stopUpdates: true });
  }

  async _quickChangeItemQuantity(event, add = 1) {
    event.preventDefault();
    const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    const item = this.actor.getOwnedItem(itemId);

    const curQuantity = getProperty(item.system, "quantity") || 0;
    const newQuantity = Math.max(0, curQuantity + add);
    item.update({ "system.quantity": newQuantity });
  }

  async _quickEquipItem(event) {
    event.preventDefault();
    const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    const item = this.actor.getOwnedItem(itemId);

    if (hasProperty(item.system, "equipped")) {
      item.update({ "system.equipped": !item.system.equipped });
    }
  }

  async _quickCarryItem(event) {
    event.preventDefault();
    const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    const item = this.actor.getOwnedItem(itemId);

    if (hasProperty(item.system, "carried")) {
      item.update({ "system.carried": !item.system.carried });
    }
  }

  async _quickIdentifyItem(event) {
    event.preventDefault();
    if (!game.user.isGM) {
      ui.notifications.error("You are not allowed to identify items");
      return;
    }
    const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    const item = this.actor.getOwnedItem(itemId);

    if (hasProperty(item.system, "identified")) {
      item.update({ "system.identified": !item.system.identified });
    }
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @private
   */
  _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const itemData = {
      name: `New ${type.capitalize()}`,
      type: type,
      system: duplicate(header.dataset),
    };
    delete itemData.system["type"];
    return this.actor.createOwnedItem(itemData);
  }

  /* -------------------------------------------- */

  /**
   * Handle editing an existing Owned Item for the Actor
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemEdit(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    await this.actor.refresh({});
    const item = this.actor.getOwnedItem(li.dataset.itemId);
    item.sheet.render(true);
  }

  /**
   * Handle deleting an existing Owned Item for the Actor
   * @param {Event} event   The originating click event
   * @private
   */
  _onItemDelete(event) {
    event.preventDefault();

    const button = event.currentTarget;
    if (button.disabled) return;

    const li = event.currentTarget.closest(".item");
    if (game.keyboard.isModifierActive("Shift")) {
      this.actor.deleteOwnedItem(li.dataset.itemId);
    } else {
      button.disabled = true;

      const msg = `<p>${game.i18n.localize("D35E.DeleteItemConfirmation")}</p>`;
      Dialog.confirm({
        title: game.i18n.localize("D35E.DeleteItem"),
        content: msg,
        yes: () => {
          this.actor.deleteOwnedItem(li.dataset.itemId);
          button.disabled = false;
        },
        no: () => (button.disabled = false),
      });
    }
  }

  _onItemRestoreUses(event) {
    event.preventDefault();

    const button = event.currentTarget;
    if (button.disabled) return;

    const li = event.currentTarget.closest(".item");

    button.disabled = true;
    const msg = `<p>${game.i18n.localize("D35E.RechargeItemConfirmation")}</p>`;
    Dialog.confirm({
      title: game.i18n.localize("D35E.RechargeItem"),
      content: msg,
      yes: () => {
        let itemId = li.dataset.itemId;
        const item = this.actor.getOwnedItem(li.dataset.itemId);
        let itemUpdate = {};
        const itemData = item.system;
        itemUpdate["_id"] = itemId;
        if (itemData.uses && itemData.uses.value !== itemData.uses.max) {
          if (itemData.uses.rechargeFormula) {
            itemUpdate["system.uses.value"] = Math.min(
              itemData.uses.value + new Roll35e(itemData.uses.rechargeFormula, itemData).roll().total,
              itemData.uses.max
            );
          } else {
            itemUpdate["system.uses.value"] = itemData.uses.max;
          }
        }

        if (
          itemData.enhancements &&
          itemData.enhancements.uses &&
          itemData.enhancements.uses.value !== itemData.enhancements.uses.max
        ) {
          if (itemData.enhancements.uses.rechargeFormula) {
            itemUpdate["system.enhancements.uses.value"] = Math.min(
              itemData.enhancements.uses.value +
                new Roll35e(itemData.enhancements.uses.rechargeFormula, itemData).roll().total,
              itemData.enhancements.uses.max
            );
          } else {
            itemUpdate["system.enhancements.uses.value"] = itemData.enhancements.uses.max;
          }
        } else if (item.type === "spell") {
          const spellbook = getProperty(actorData, `attributes.spells.spellbooks.${itemData.spellbook}`),
            isSpontaneous = spellbook.spontaneous,
            usePowerPoints = spellbook.usePowerPoints;
          if (
            !isSpontaneous &&
            !usePowerPoints &&
            itemData.preparation.preparedAmount < itemData.preparation.maxAmount
          ) {
            itemUpdate["system.preparation.preparedAmount"] = itemData.preparation.maxAmount;
          }
        }

        if (itemData.enhancements && itemData.enhancements && itemData.enhancements.items) {
          let enhItems = duplicate(itemData.enhancements.items);
          for (let _item of enhItems) {
            let enhancementData = ItemEnhancementHelper.getEnhancementData(_item);
            ItemEnhancementHelper.restoreEnhancementUses(enhancementData, false);
          }
          itemUpdate[`system.enhancements.items`] = enhItems;
        }
        this.actor.updateOwnedItem(itemUpdate);
        button.disabled = false;
      },
      no: () => (button.disabled = false),
    });
  }

  _onSpellAddUses(event) {
    event.preventDefault();
    let add = 1;
    const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    const item = this.actor.getOwnedItem(itemId);

    const curQuantity = getProperty(item.system, "preparation.maxAmount") || 0;
    const newQuantity = Math.max(0, curQuantity + add);
    item.update({ "system.preparation.maxAmount": newQuantity });
  }

  _onSpellRemoveUses(event) {
    event.preventDefault();
    let add = -1;
    const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    const item = this.actor.getOwnedItem(itemId);

    const curQuantity = getProperty(item.system, "preparation.maxAmount") || 0;
    const newQuantity = Math.max(0, curQuantity + add);
    item.update({ "system.preparation.maxAmount": newQuantity });
  }

  async _onSpellPrepareSpecialUses(event) {
    event.preventDefault();
    // Remove old special prepared spell
    const spellbookKey = $(event.currentTarget).closest(".spellbook-group").data("tab");
    const level = $(event.currentTarget).parents(".spellbook-list").attr("data-level");
    const k = `data.attributes.spells.spellbooks.${spellbookKey}.specialSlots.level${level}`;
    let previousItemId = getProperty(
      this.actor.system,
      `attributes.spells.spellbooks.${spellbookKey}.specialSlots.level${level}`
    );
    if (previousItemId) await this.actor.deleteOwnedItem(previousItemId);

    const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    const item = duplicate(this.actor.getOwnedItem(itemId).data);
    delete item._id;
    item.system.specialPrepared = true;
    let x = await this.actor.createEmbeddedEntity("Item", item, { ignoreSpellbookAndLevel: true });

    // Update saved special prepared special id
    let updateData = {};
    updateData[k] = x._id;
    await this.actor.update(updateData);
  }

  async _onCardDraw(event) {
    event.preventDefault();
    let add = -1;
    const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    const item = this.actor.getOwnedItem(itemId);
    item.update({ "system.state": "hand" });
  }

  async _onCardDiscard(event) {
    event.preventDefault();
    let add = -1;
    const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    const item = this.actor.getOwnedItem(itemId);
    item.update({ "system.state": "discarded" });
  }

  async _onCardSide(event) {
    event.preventDefault();
    let add = -1;
    const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    const item = this.actor.getOwnedItem(itemId);
    item.update({ "system.state": "side" });
  }

  async _onCardReturn(event) {
    event.preventDefault();
    let add = -1;
    const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    const item = this.actor.getOwnedItem(itemId);
    item.update({ "system.state": "deck" });
  }

  async _addAllKnownSpells(event) {
    event.preventDefault();
    // Remove old special prepared spell
    const spellbookKey = $(event.currentTarget).closest(".spellbook-group").data("tab");
    const level = $(event.currentTarget).parents(".spellbook-list").attr("data-level");
    this.showWorkingOverlay();
    await this.actor.addSpellsToSpellbookForClass(spellbookKey, level);
    this.hideWorkingOverlay();
  }

  async _onSpellAddMetamagic(event) {
    event.preventDefault();
    const itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    const newSpell = duplicate(this.actor.getOwnedItem(itemId).data.toObject(false));
    delete newSpell._id;

    let metamagicFeats = this.actor.items.filter((o) => o.type === "feat" && o.system?.metamagic.enabled);

    const _roll = async function (newSpell, form) {
      let optionalFeatIds = [];
      if (form) {
        $(form)
          .find('[data-type="optional"]')
          .each(function () {
            if ($(this).prop("checked")) {
              let featId = $(this).attr("data-feat-optional");
              optionalFeatIds.push(featId);
            }
          });
      }

      for (const i of metamagicFeats) {
        if (optionalFeatIds.indexOf(i._id) !== -1) {
          await eval("(async () => {" + i.system.metamagic.code.replaceAll(".data", ".system") + "})()");
        }
      }
      let x = await this.actor.createEmbeddedEntity("Item", newSpell, { ignoreSpellbookAndLevel: true });
    };

    let template = "systems/D35E/templates/apps/apply-metamagic.html";
    let dialogData = {
      metamagicFeats: metamagicFeats,
    };
    const html = await renderTemplate(template, dialogData);
    let roll;
    const buttons = {};
    let wasRolled = false;
    buttons.normal = {
      label: game.i18n.localize("D35E.CreateMetamagicSpell"),
      callback: (html) => {
        wasRolled = true;
        roll = _roll.call(this, newSpell, html);
      },
    };
    await new Promise((resolve) => {
      new Dialog({
        title: `${game.i18n.localize("D35E.CreateMetamagicSpell")}`,
        content: html,
        buttons: buttons,
        classes: ["custom-dialog", "wide"],
        default: "normal",
        close: (html) => {
          return resolve(roll);
        },
      }).render(true);
    });
  }

  /**
   * Handle rolling an Ability check, either a test or a saving throw
   * @param {Event} event   The originating click event
   * @private
   */
  _onRollAbilityTest(event) {
    event.preventDefault();
    let ability = event.currentTarget.parentElement.dataset.ability;
    this.actor.rollAbility(ability, { event: event });
  }

  _onRollBAB(event) {
    event.preventDefault();
    this.actor.rollBAB({ event: event });
  }

  _onRollSimpleMelee(event) {
    event.preventDefault();
    this.actor.rollMelee({ event: event });
  }

  _onRollPsionicFocus(event) {
    event.preventDefault();
    this.actor.rollPsionicFocus({ event: event });
  }

  _onRollSimpleRanged(event) {
    event.preventDefault();
    this.actor.rollRanged({ event: event });
  }

  _onRollCMB(event) {
    event.preventDefault();
    this.actor.rollGrapple(null, { event: event });
  }

  _onRollInitiative(event) {
    event.preventDefault();
    this.actor.rollInitiative({ createCombatants: true, rerollInitiative: game.user.isGM });
  }

  _onRollSavingThrow(event) {
    event.preventDefault();
    let savingThrow = event.currentTarget.parentElement.dataset.savingthrow;
    this.actor.rollSavingThrow(savingThrow, null, null, { event: event });
  }

  async _onRaceControl(event) {
    event.preventDefault();
    const a = event.currentTarget;

    // Add race
    if (a.classList.contains("add")) {
      const itemData = {
        name: "New Race",
        type: "race",
      };
      this.actor.createOwnedItem(itemData);
    }
    // Edit race
    else if (a.classList.contains("edit")) {
      this._onItemEdit(event);
    }
    // Delete race
    else if (a.classList.contains("delete")) {
      this._onItemDelete(event);
    }
  }

  async _onMaterialControl(event) {
    event.preventDefault();
    const a = event.currentTarget;

    // Add race
    if (a.classList.contains("add")) {
      const itemData = {
        name: "New Material",
        type: "material",
      };
      this.actor.createOwnedItem(itemData);
    }
    // Edit race
    else if (a.classList.contains("edit")) {
      this._onItemEdit(event);
    }
    // Delete race
    else if (a.classList.contains("delete")) {
      this._onItemDelete(event);
    }
  }

  /* -------------------------------------------- */

  /**
   * Organize and classify Owned Items
   * @private
   */
  _prepareItems(sheetData) {
    // Set item tags
    for (let [key, res] of Object.entries(getProperty(this.actor.system, "resources"))) {
      if (!res) continue;
      const id = res._id;
      if (!id) continue;
      const item = this.actor.items.get(id);
      if (!item) continue;
      item.system.tag = key;
    }

    // Categorize items as inventory, spellbook, features, and classes
    const inventory = {
      weapon: {
        label: game.i18n.localize("D35E.InventoryWeapons"),
        hasPack: true,
        pack: `inline:items:weapon:-:${game.i18n.localize("D35E.InventoryWeapons")}`,
        emptyLabel: "D35E.ListDragAndDropFeat",
        canCreate: true,
        hasActions: false,
        items: [],
        canEquip: true,
        dataset: { type: "weapon" },
      },
      equipment: {
        label: game.i18n.localize("D35E.InventoryArmorEquipment"),
        hasPack: true,
        pack: `inline:items:equipment:-:${game.i18n.localize("D35E.InventoryArmorEquipment")}`,
        emptyLabel: "D35E.ListDragAndDropFeat",
        canCreate: true,
        hasActions: true,
        items: [],
        canEquip: true,
        dataset: { type: "equipment" },
        hasSlots: true,
      },
      consumable: {
        label: game.i18n.localize("D35E.InventoryConsumables"),
        hasPack: true,
        pack: `inline:items:consumable:-:${game.i18n.localize("D35E.InventoryConsumables")}`,
        emptyLabel: "D35E.ListDragAndDropFeat",
        canCreate: true,
        hasActions: true,
        items: [],
        canEquip: false,
        dataset: { type: "consumable" },
      },
      gear: {
        label: CONFIG.D35E.lootTypes["gear"],
        hasPack: true,
        pack: `inline:items:loot:gear:${CONFIG.D35E.lootTypes["gear"]}`,
        emptyLabel: "D35E.ListDragAndDropFeat",
        canCreate: true,
        hasActions: false,
        items: [],
        canEquip: false,
        dataset: { type: "loot", "sub-type": "gear" },
      },
      ammo: {
        label: CONFIG.D35E.lootTypes["ammo"],
        hasPack: true,
        pack: `inline:items:loot:ammo:${CONFIG.D35E.lootTypes["ammo"]}`,
        emptyLabel: "D35E.ListDragAndDropFeat",
        canCreate: true,
        hasActions: false,
        items: [],
        canEquip: false,
        dataset: { type: "loot", "sub-type": "ammo" },
      },
      misc: {
        label: CONFIG.D35E.lootTypes["misc"],
        hasPack: true,
        pack: `inline:items:loot:misc:${CONFIG.D35E.lootTypes["misc"]}`,
        emptyLabel: "D35E.ListDragAndDropFeat",
        canCreate: true,
        hasActions: false,
        items: [],
        canEquip: false,
        dataset: { type: "loot", "sub-type": "misc" },
      },
      valuable: {
        label: game.i18n.localize("D35E.InventoryValuables"),
        hasPack: true,
        pack: `inline:items:valuable:-:${game.i18n.localize("D35E.InventoryValuables")}`,
        canCreate: true,
        hasActions: false,
        items: [],
        canEquip: false,
        dataset: { type: "valuable" },
      },
      container: {
        label: CONFIG.D35E.lootTypes["container"],
        canCreate: true,
        hasActions: false,
        items: [],
        canEquip: false,
        dataset: { type: "loot", "sub-type": "container" },
        isContainer: true,
      },
      tradeGoods: {
        label: CONFIG.D35E.lootTypes["tradeGoods"],
        hasPack: true,
        pack: `inline:items:loot:tradeGoods:-:${CONFIG.D35E.lootTypes["tradeGoods"]}`,
        emptyLabel: "D35E.ListDragAndDropFeat",
        canCreate: true,
        hasActions: false,
        items: [],
        canEquip: false,
        dataset: { type: "loot", "sub-type": "tradeGoods" },
      },
      junk: {
        label: game.i18n.localize("D35E.Junk"),
        hasPack: false,
        canCreate: false,
        hasActions: false,
        items: [],
        canEquip: false,
      },
    };

    let containerItems = new Map();
    let containerItemsWeight = new Map();
    let containerList = [];

    sheetData.useableAttacks = [];
    sheetData.totalInventoryValue = 0;
    // Partition items by category
    let [items, spells, feats, classes, attacks, cards] = sheetData.items.reduce(
      (arr, item) => {
        item.img = item.img || DEFAULT_TOKEN;
        item.isStack = item.system.quantity ? item.system.quantity > 1 : false;
        item.hasUses = item.system.uses && item.system.uses.max > 0;
        item.isCharged = ["day", "week", "charges", "encounter"].includes(getProperty(item, "system.uses.per"));
        item.isFullAttack = item.type === "full-attack";

        item.canRecharge = !!(
          (item.isCharged && item.system?.uses?.max && item.system?.uses?.per !== "charges") ||
          item.system?.enhancements?.uses?.max ||
          Object.values(item.system?.enhancements?.items || {}).some(
            (o) => ItemEnhancementHelper.getEnhancementData(o).uses.max
          )
        );
        const itemQuantity = getProperty(item, "system.quantity") != null ? getProperty(item, "system.quantity") : 1;
        const itemCharges = getProperty(item, "system.uses.value") != null ? getProperty(item, "system.uses.value") : 1;
        item.empty = itemQuantity <= 0 || (item.isCharged && itemCharges <= 0);
        item.broken = item.system?.hp?.value === 0 && item.system?.hp?.max > 0;
        item.emptyOrBroken = item.empty || item.broken;
        if (item.type === "spell") arr[1].push(item);
        else if (item.type === "feat") {
          arr[2].push(item);
        } else if (item.type === "class") arr[3].push(item);
        else if (item.type === "card") arr[5].push(item);
        else if (item.type === "attack") {
          arr[4].push(item);
        } else if (item.type === "enhancement" || item.type === "material") {
          inventory.junk.items.push(item);
        } else if (item.type === "full-attack") arr[4].push(item);
        else if (
          Object.keys(inventory).includes(item.type) ||
          (item.system.subType != null && Object.keys(inventory).includes(item.system.subType))
        ) {
          if (item.type === "consumable") {
            if (item.system.consumableType === "scroll") {
              item.isArcaneScroll = false;
              item.isDivineScroll = false;
              if (item.system.scrollType === "arcane") {
                item.isArcaneScroll = true;
              } else if (item.system.scrollType === "divine") {
                item.isDivineScroll = true;
              }
            }
          }

          //game.D35E.logger.log(`Item container | ${item.name}, ${item.system.containerId} |`, item)
          if (item.system.containerId && item.system.containerId !== "none") {
            if (!containerItems.has(item.system.containerId)) {
              containerItems.set(item.system.containerId, []);
              containerItemsWeight.set(item.system.containerId, 0);
            }
            containerItems.get(item.system.containerId).push(item);
          } else {
            arr[0].push(item);
          }

          sheetData.totalInventoryValue +=
            (item.system.identified || game.user.isGM ? item.system.price : item.system.unidentified.price) *
            item.system.quantity;
          //inventory.all.items.push(item);
        }

        return arr;
      },
      [[], [], [], [], [], []]
    );
    sheetData.totalInventoryValue += this.actor.mergeCurrency();
    sheetData.totalInventoryValue = sheetData.totalInventoryValue.toFixed(2);

    items.forEach((c) => {
      c["containerItems"] = containerItems.get(c.id) || [];
    });

    // Apply active item filters
    items = this._filterItems(items, this._filters.inventory);
    spells = this._filterItems(spells, this._filters.spellbook);
    feats = this._filterItems(feats, this._filters.features);

    let availableSpellSpecialization = new Set();
    let domainSpellNames = new Set();
    let bannedSpellSpecialization = new Set();
    feats.forEach((feat) => {
      (feat.system.spellSpecializationName || "").split(",").forEach((name) => {
        if (name === "") return;
        availableSpellSpecialization.add(name);
      });

      (feat.system.spellSpecializationForbiddenNames || "").split(",").forEach((name) => {
        if (name === "") return;
        bannedSpellSpecialization.add(name);
      });
      if (feat.system?.spellSpecialization?.isDomain) {
        Object.values(feat.system?.spellSpecialization?.spells).forEach((s) => {
          domainSpellNames.add(createTag(s.name));
        });
      }
    });

    // Organize Spellbook
    let spellbookData = {};
    const spellbooks = sheetData.actor.system.attributes.spells.spellbooks;

    for (let [a, spellbook] of Object.entries(spellbooks)) {
      const spellbookSpells = spells.filter((obj) => {
        return obj.system.spellbook === a;
      });
      spellbookData[a] = {
        data: this._prepareSpellbook(
          sheetData,
          spellbookSpells,
          a,
          availableSpellSpecialization,
          bannedSpellSpecialization,
          domainSpellNames
        ),
        prepared: spellbookSpells.filter((obj) => {
          return obj.system.preparation.mode === "prepared" && obj.system.preparation.prepared;
        }).length,
        isSpellLike: a === "spelllike",
        orig: spellbook,

        psionicFocus: this.actor.system.attributes.psionicFocus,
        canCreate: this.actor.isOwner === true,
        concentration: this.actor.system.skills["coc"].mod,
        spellcastingTypeName:
          spellbook.spellcastingType !== undefined && spellbook.spellcastingType !== null
            ? game.i18n.localize(CONFIG.D35E.spellcastingType[spellbook.spellcastingType])
            : "None",
      };
    }

    // Organize Spellbook
    let deckData = {};
    const decks = sheetData.actor.system.attributes?.cards?.decks || {};

    for (let [a, deck] of Object.entries(decks)) {
      const deckCards = cards.filter((obj) => {
        return obj.system.deck === a;
      });
      let deckSpells = {
        hand: {
          name: "Hand",
          max: deck.handSize.total,
          isPrepared: true,
          canCreate: true,
          cards: deckCards.filter((obj) => {
            return obj.system.state === "hand";
          }),
        },
        discarded: {
          name: "Discard Pile",
          isDiscarded: true,
          canCreate: true,
          cards: deckCards.filter((obj) => {
            return obj.system.state === "discarded";
          }),
        },
        deck: {
          name: "Deck",
          isInDeck: true,
          canCreate: true,
          cards: deckCards.filter((obj) => {
            return obj.system.state === "deck";
          }),
        },
        sideDeck: {
          name: "Side Deck",
          isSideDeck: true,
          canCreate: true,
          cards: deckCards.filter((obj) => {
            return obj.system.state === "side";
          }),
        },
      };
      deckData[a] = {
        data: deckSpells,
        hand: deckSpells.hand.cards.length,
        discarded: deckSpells.discarded.cards.length,
        deck: deckSpells.deck.cards.length,
        overMaxInHand: deckSpells.hand.cards.length > deck.handSize.total,
        overMaxInDeck: deckCards.length > deck.deckSize.total,
        deckCapacity: deck.deckSize.total,
        deckTotal: deckCards.length,
        orig: deck,
        canCreate: this.actor.isOwner === true,
        spellcastingTypeName:
          deck.spellcastingType !== undefined && deck.spellcastingType !== null
            ? game.i18n.localize(CONFIG.D35E.spellcastingType[spellbook.spellcastingType])
            : "None",
      };
    }
    // Organize Inventory
    let equippedWeapons = new Set();
    let containersMap = new Map();
    const weightConversion = game.settings.get("D35E", "units") === "metric" ? 0.5 : 1;
    for (let i of items) {
      const subType = i.type === "loot" ? i.system.subType || "gear" : i.system.subType;
      i.system.quantity = i.system.quantity || 0;
      i.system.displayWeight = i.system.weight * weightConversion || 0;
      let weightMult = i.system.containerWeightless ? 0 : 1;
      i.totalWeight = (weightMult * Math.round(i.system.quantity * i.system.weight * weightConversion * 10)) / 10;
      i.units =
        game.settings.get("D35E", "units") === "metric"
          ? game.i18n.localize("D35E.Kgs")
          : game.i18n.localize("D35E.Lbs");
      if (i.type === "weapon" && i.system.carried === true && i.system.equipped === true && !i.system.melded)
        equippedWeapons.add(i.id);
      if (inventory[i.type] != null) inventory[i.type].items.push(i);
      else if (subType != null && inventory[subType] != null) inventory[subType].items.push(i);
      if (i?.system?.subType === "container") {
        i.convertedCapacity = Math.round(i.system.capacity * weightConversion * 10) / 10;
        containerList.push({ id: i.id, name: i.name });
        containersMap.set(i.id, i);
      }
    }

    for (let containerItem of containerList) {
      for (let i of containerItems.get(containerItem.id) || []) {
        i.system.quantity = i.system.quantity || 0;
        if (i.system.containerId)
          containerItemsWeight.set(
            i.system.containerId,
            (containerItemsWeight.get(i.system.containerId) || 0) +
              Math.round(i.system.quantity * i.system.weight * weightConversion * 10) / 10
          );
      }
      containersMap.get(containerItem.id).itemsWeight =
        Math.round((containerItemsWeight.get(containerItem.id) || 0) * 10) / 10;
      containersMap.get(containerItem.id).itemsWeightPercentage = Math.min(
        98,
        Math.floor(
          (containerItemsWeight.get(containerItem.id) / containersMap.get(containerItem.id).system.capacity) * 100.0
        )
      );
    }

    sheetData.containerList = containerList;

    // Organize Features
    const features = {
      classes: {
        label: game.i18n.localize("D35E.ClassPlural"),
        hasPack: true,
        pack: "D35E.classes",
        emptyLabel: "D35E.ListDragAndDropClass",
        items: [],
        canCreate: true,
        hasActions: false,
        dataset: { type: "class" },
        isClass: true,
      },
      feat: {
        label: game.i18n.localize("D35E.FeatPlural"),
        hasPack: true,
        pack: `inline:feats:feat:feat:${game.i18n.localize("D35E.FeatPlural")}`,
        emptyLabel: "D35E.ListDragAndDropFeat",
        items: [],
        canCreate: true,
        hasActions: true,
        dataset: { type: "feat", "feat-type": "feat" },
        isFeat: true,
      },
      classFeat: {
        label: game.i18n.localize("D35E.ClassFeaturePlural"),
        hasPack: true,
        pack: "actor-first-class",
        emptyLabel: "D35E.ListDragAndDropClassFeature",
        items: [],
        canCreate: true,
        hasActions: true,
        dataset: { type: "feat", "feat-type": "classFeat" },
        isClassFeat: true,
      },
      trait: {
        label: game.i18n.localize("D35E.TraitPlural"),
        hasPack: false,
        pack: "",
        emptyLabel: "D35E.ListDragAndDropNone",
        items: [],
        canCreate: true,
        hasActions: true,
        dataset: { type: "feat", "feat-type": "trait" },
      },
      racial: {
        label: game.i18n.localize("D35E.RacialTraitPlural"),
        hasPack: true,
        pack: "actor-race",
        emptyLabel: "D35E.ListDragAndDropRacialTrait",
        items: [],
        canCreate: true,
        hasActions: true,
        dataset: { type: "feat", "feat-type": "racial" },
      },
      misc: {
        label: game.i18n.localize("D35E.Misc"),
        hasPack: false,
        pack: "",
        emptyLabel: "D35E.ListDragAndDropNone",
        items: [],
        canCreate: true,
        hasActions: true,
        dataset: { type: "feat", "feat-type": "misc" },
      },
      spellSpecialization: {
        label: game.i18n.localize("D35E.FeatTypeSpellSpecialization"),
        hasPack: true,
        pack: "D35E.spell-schools-domains",
        emptyLabel: "D35E.ListDragAndDropCompendium",
        canCreate: true,
        hasActions: false,
        dataset: { type: "feat", "feat-type": "spellSpecialization" },
        items: [],
      },
      all: {
        label: game.i18n.localize("D35E.All"),
        hasPack: false,
        pack: "",
        emptyLabel: "D35E.ListDragAndDropNone",
        items: [],
        canCreate: false,
        hasActions: true,
        dataset: { type: "feat" },
        isAll: true,
      },
    };

    let classFeaturesMap = new Map();

    for (let f of feats) {
      let k = f.system.featType;

      if (f.system.source && f.system.source !== "") {
        let className = f.system.source.split(" ");
        className.pop();
        let sourceClassName = className.join(" ");
        if (!classFeaturesMap.has(sourceClassName)) classFeaturesMap.set(sourceClassName, []);
        classFeaturesMap.get(sourceClassName).push(f);
        if (sourceClassName === "" || !!game.settings.get("D35E", "classFeaturesInTabs") || k === "racial") {
          features[k].items.push(f);
        }
      } else {
        features[k].items.push(f);
      }
      features.all.items.push(f);
    }
    classes.sort((a, b) => b.system.levels - a.system.levels);
    features.classes.items = classes;
    classes.forEach((c) => {
      c["classFeatures"] = classFeaturesMap.get(c.name) || [];
      c["passiveClassFeatures"] = c.system.nonActiveClassAbilities
        .filter((a) => parseInt(a[0]) <= parseInt(c.system.levels || "0"))
        .map((a) => {
          return { level: a[0], name: a[1], description: a[2] };
        });
    });
    // Buffs
    let buffs = sheetData.items.filter((obj) => {
      return obj.type === "buff";
    });
    let auras = sheetData.items.filter((obj) => {
      return obj.type === "aura";
    });
    buffs = this._filterItems(buffs, this._filters.buffs);
    const buffSections = {
      temp: {
        label: game.i18n.localize("D35E.Temporary"),
        pack: "browser:buffs:Item",
        hasPack: true,
        items: [],
        hasActions: false,
        dataset: { type: "buff", "buff-type": "temp" },
      },
      perm: {
        label: game.i18n.localize("D35E.Permanent"),
        pack: "browser:buffs:Item",
        hasPack: true,
        items: [],
        hasActions: false,
        dataset: { type: "buff", "buff-type": "perm" },
      },
      item: {
        label: game.i18n.localize("D35E.Item"),
        pack: "browser:buffs:Item",
        hasPack: true,
        items: [],
        hasActions: false,
        dataset: { type: "buff", "buff-type": "item" },
      },
      misc: {
        label: game.i18n.localize("D35E.Misc"),
        pack: "browser:buffs:Item",
        hasPack: true,
        items: [],
        hasActions: false,
        dataset: { type: "buff", "buff-type": "misc" },
      },
      auras: {
        label: game.i18n.localize("D35E.Auras"),
        pack: "",
        isAuras: true,
        hasPack: false,
        items: [],
        hasActions: false,
        dataset: { type: "aura", "buff-type": "misc" },
      },
      //all: { label: game.i18n.localize("D35E.All"), items: [], hasActions: false, dataset: { type: "buff" } },
    };
    sheetData.allbuffs = [];
    sheetData.shapechanges = [];
    for (let b of buffs) {
      let s = b.system.buffType;
      if (s === "shapechange") sheetData.shapechanges.push(b);
      if (!buffSections[s]) continue;
      buffSections[s].items.push(b);
      sheetData.allbuffs.push(b);
    }

    for (let b of auras) {
      buffSections["auras"].items.push(b);
      sheetData.allbuffs.push(b);
    }

    sheetData.otherItems = {};
    sheetData.items
      .filter((obj) => {
        return obj.type === "other";
      })
      .forEach((d) => {
        if (!sheetData.otherItems[d.system.group]) {
          sheetData.otherItems[d.system.group] = [];
        }
        sheetData.otherItems[d.system.group].push(d);
      });

    // Attacks

    const attackSections = {
      all: {
        label: game.i18n.localize("D35E.All"),
        items: [],
        canCreate: false,
        initial: true,
        showTypes: true,
        dataset: { type: "attack" },
      },
      weapon: {
        label: game.i18n.localize("D35E.AttackTypeWeaponPlural"),
        items: [],
        canCreate: true,
        initial: false,
        showTypes: false,
        dataset: { type: "attack", "attack-type": "weapon" },
      },
      natural: {
        label: game.i18n.localize("D35E.AttackTypeNaturalPlural"),
        items: [],
        canCreate: true,
        initial: false,
        showTypes: false,
        dataset: { type: "attack", "attack-type": "natural" },
      },
      ability: {
        label: game.i18n.localize("D35E.AttackTypeAbilityPlural"),
        items: [],
        canCreate: true,
        initial: false,
        showTypes: false,
        dataset: { type: "attack", "attack-type": "ability" },
      },
      racialAbility: {
        label: game.i18n.localize("D35E.AttackTypeSpecialPlural"),
        items: [],
        canCreate: true,
        initial: false,
        showTypes: false,
        dataset: { type: "attack", "attack-type": "racialAbility" },
      },
      misc: {
        label: game.i18n.localize("D35E.Misc"),
        items: [],
        canCreate: true,
        initial: false,
        showTypes: false,
        dataset: { type: "attack", "attack-type": "misc" },
      },
      full: {
        label: game.i18n.localize("D35E.FullAttack"),
        items: [],
        canCreate: true,
        initial: false,
        showTypes: false,
        dataset: { type: "full-attack", "attack-type": "full" },
      },
    };

    for (let a of attacks) {
      let s = a.system.attackType;
      a.disabled = !this._isAttackUseable(a, equippedWeapons);
      if (s == "extraordinary") s = "racialAbility";
      if (s == "supernatural") s = "racialAbility";
      if (!attackSections[s]) continue;
      attackSections[s].items.push(a);
      attackSections.all.items.push(a);
    }

    for (let item of sheetData.items) {
      if (item.type === "attack") {
        if (this._isAttackUseable(item, equippedWeapons)) sheetData.useableAttacks.push(item);
      } else {
        if (!this._isMelded(item) && item.system.favorite) sheetData.useableAttacks.push(item);
      }
    }

    attackSections.full.items.forEach((fullAttackItem) => {
      Object.values(fullAttackItem.system.attacks).forEach((attack) => {
        if (!attack.id) return;
        let i = attackSections.all.items.find((i) => i.id === attack.id);
        if (i) {
          attack.hasAction = i.hasAction;
          attack.itemExists = !!attack.item;
        }
      });
    });

    // Assign and return
    sheetData.inventory = Object.values(inventory);
    sheetData.spellbookData = spellbookData;
    sheetData.deckData = deckData;
    sheetData.features = Object.values(features);
    sheetData.buffs = buffSections;
    sheetData.attacks = attackSections;
    sheetData.counters = this.actor.system.counters;
    sheetData.featCounters = [];
    sheetData.dying = this.actor.system.attributes.conditions.dying;
    sheetData.dead = this.actor.system.attributes.conditions.dead;
    for (let [a, s] of Object.entries(sheetData.actor.system?.counters?.feat || [])) {
      if (a === "base") continue;
      sheetData.featCounters.push({ name: a.charAt(0).toUpperCase() + a.substr(1).toLowerCase(), val: a });
    }

    // Handlebars.registerPartial('myPartial', 'This is a tab generated from something!{{prefix}}');
    // data.myVariable = "myPartial";
  }

  _isAttackUseable(a, equippedWeapons) {
    if (a.system.melded) return false;
    if (a.system.originalWeaponId && !equippedWeapons.has(a.system.originalWeaponId)) return false;
    if (a.system.originalWeaponId && this.actor.items.get(a.system.originalWeaponId).system.quantity < 1) return false;
    if (a.system.originalWeaponId && this.actor.items.get(a.system.originalWeaponId).broken) return false;
    return true;
  }

  _isMelded(a) {
    if (a.system.melded) return true;
  }

  /**
   * Handle rolling a Skill check
   * @param {Event} event   The originating click event
   * @private
   */
  _onRollSkillCheck(event) {
    event.preventDefault();
    const li = event.currentTarget.closest("li.skill");
    const skill = li.dataset.skill;
    this.actor.rollSkill(skill, { event: event });
  }

  _onRollSubSkillCheck(event) {
    event.preventDefault();
    const li = event.currentTarget.closest("li.sub-skill");
    const skill = li.dataset.skill;
    const mainSkill = li.dataset.mainSkill;
    this.actor.rollSkill(`${mainSkill}.subSkills.${skill}`, { event: event });
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling of filters to display a different set of owned items
   * @param {Event} event     The click event which triggered the toggle
   * @private
   */
  _onToggleFilter(event) {
    event.preventDefault();
    const li = event.currentTarget;
    const set = this._filters[li.parentElement.dataset.filter];
    const filter = li.dataset.filter;
    if (set.has(filter)) set.delete(filter);
    else set.add(filter);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle spawning the ActorTraitSelector application which allows a checkbox of multiple trait options
   * @param {Event} event   The click event which originated the selection
   * @private
   */
  _onTraitSelector(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const label = a.parentElement.querySelector("label");
    const options = {
      name: label.getAttribute("for"),
      title: label.innerText,
      choices: CONFIG.D35E[a.dataset.options],
    };
    new ActorTraitSelector(this.actor, options).render(true);
  }

  _onSenseSelector(event) {
    new ActorSensesConfig(this.actor).render(true);
    event.preventDefault();
  }

  _onDREREditor(event) {
    event.preventDefault();
    new DamageReductionSetting(this.actor, {}).render(true);
  }

  async saveMCEContent(updateData = null) {
    let manualUpdate = false;
    if (updateData == null) {
      manualUpdate = true;
      updateData = {};
    }

    for (const [key, editor] of Object.entries(this.editors)) {
      if (editor.mce == null) continue;

      updateData[key] = editor.mce.getContent();
    }

    if (manualUpdate && Object.keys(updateData).length > 0) await this.actor.update(updateData);
  }

  setItemUpdate(id, key, value) {
    let obj = this._itemUpdates.filter((o) => {
      return o._id === id;
    })[0];
    if (obj == null) {
      obj = { id: id };
      this._itemUpdates.push(obj);
    }

    obj[key] = value;
    this._updateItems();
  }

  async _render(...args) {
    if (this._firstLoad) {
      await this.actor._updateChanges({ sourceOnly: true }, { skipToken: true });
      this._firstLoad = false;
    }
    // Trick to avoid error on elements with changing name
    let focus = this.element.find(":focus");
    focus = focus.length ? focus[0] : null;
    if (focus && focus.name.match(/^data\.skills\.(?:[a-zA-Z0-9]*)\.name$/)) focus.blur();

    return super._render(...args);
  }

  async _onSubmit(event, { updateData = null, preventClose = false } = {}) {
    event.preventDefault();
    //todo: wait for foundry fix
    this._updateItems();

    return super._onSubmit(event, { updateData, preventClose });
  }

  async _updateItems() {
    let promises = [];

    const updates = duplicate(this._itemUpdates);
    this._itemUpdates = [];

    for (const data of updates) {
      const item = this.actor.items.filter((o) => {
        return o._id === data.id;
      })[0];
      if (item == null) continue;

      delete data._id;
      if (item.testUserPermission(game.user, "OWNER")) promises.push(item.update(data));
    }
    if (promises) await Promise.all(promises);
  }

  /**
   * @override
   */
  async _onDropActor(event) {
    event.preventDefault();
    if (this.actor.system.lockEditingByPlayers && !game.user.isGM) {
      ui.notifications.error(game.i18n.localize("D35E.GMLockedCharacterSheet"));
      return;
    }
    // Try to extract the data
    let dropData;
    try {
      dropData = JSON.parse(event.dataTransfer.getData("text/plain"));
      if (dropData.type !== "Item" && dropData.type !== "Actor") return;
    } catch (err) {
      return false;
    }
    const actor = this.actor;
    let actorData = fromUuidSync(dropData.uuid);
    if (actorData.pack) {
      ui.notifications.error(game.i18n.localize("D35E.CannotLinkMasterFromCompendium"));
      return;
    }
    let dataType = "world";

    this.enrichDropData(actorData);
    return this.importActor(actorData, dataType);
  }

  /**
   * @override
   */
  async _onDropItem(event, data) {
    event.preventDefault();
    if (this.actor.system.lockEditingByPlayers && !game.user.isGM) {
      ui.notifications.error(game.i18n.localize("D35E.GMLockedCharacterSheet"));
      return;
    }
    let dropData = data;
    if (!dropData) {
      try {
        dropData = JSON.parse(event.dataTransfer.getData("text/plain"));
        if (dropData.type !== "Item" && dropData.type !== "Actor") return;
      } catch (err) {
        return false;
      }
    }
    //if ()
    return await this.addItemFromDropData(dropData);
  }

  async addItemFromDropData(dropData) {
    let dataType = "";
    const actor = this.actor;

    let itemData = {};
    // Case 1 - Import from a Compendium pack
    if (game?.release?.generation >= 10 && dropData.uuid) {
      dropData = fromUuidSync(dropData.uuid);
    }
    if (dropData.pack) {
      dataType = "compendium";
      const pack = game.packs.find((p) => p.metadata.id === dropData.pack);
      const packItem = await pack.getDocument(dropData.id || dropData._id);
      if (packItem != null) {
        itemData = packItem.toObject(false);
        itemData.system.originPack = dropData.pack;
        itemData.system.originId = packItem.id;
        ItemDescriptionsHelper.linkItemDescription(itemData, packItem.uuid);
      }
    }

    // Case 2 - Data explicitly provided
    else if (dropData.data) {
      let sameActor = dropData?.parent?.uuid === actor.uuid;
      //if (sameActor && actor.isToken) sameActor = dropData.tokenId === actor.token.id;
      if (sameActor) return this._onSortItem(event, dropData.data); // Sort existing items
      if (dropData?.parent?.sheet?.id) {
        if (dropData?.parent?.sheet.id.indexOf("ActorSheetPFNPCLoot") !== -1) {
          if (dropData.parent.getFlag("D35E", "lootsheettype") === "loot")
            return LootSheetActions.lootItem(this.actor, dropData.parent, this.actor, dropData.id, null);
        }
      }

      dataType = "data";
      itemData = dropData.data.toObject(false);
    }

    // Case 3 - Import from World entity
    else {
      dataType = "world";
      itemData = game.items.get(dropData.id).data.toObject(false);
    }
    if (itemData.data.uniqueId) {
      return new Dialog(
        {
          title: `${game.i18n.localize("D35E.DropItemWithUIDTitle")}`,
          content: `<div class="flexrow form-group">
          <span style="flex: 1">${game.i18n.localize("D35E.DropItemWithUID")}</span>
        </div>`,
          buttons: {
            confirm: {
              label: game.i18n.localize("D35E.ImportStripUid"),
              callback: (html) => {
                delete itemData.data.uniqueId;
                this.enrichDropData(itemData);
                return this.importItem(itemData, dataType);
              },
            },
            cancel: {
              label: game.i18n.localize("Cancel"),
            },
          },
          default: "confirm",
        },
        {
          classes: ["dialog", "D35E", "duplicate-initiative"],
        }
      ).render(true);
    } else {
      this.enrichDropData(itemData);
      return this.importItem(itemData, dataType);
    }
  }

  get currentPrimaryTab() {
    const primaryElem = this.element.find('nav[data-group="primary"] .item.active');
    if (primaryElem.length !== 1) return null;
    return primaryElem.attr("data-tab");
  }

  async importItem(itemData, dataType) {
    if (itemData.type === "spell" && this.actor.data.type === "trap") {
      return this.actor.createAttackSpell(itemData);
    }
    if (itemData.type === "spell" && !itemData.data.isPower && this.currentPrimaryTab === "inventory") {
      return this.actor._createConsumableSpellDialog(itemData);
    }
    if (itemData.type === "spell" && itemData.data.isPower && this.currentPrimaryTab === "inventory") {
      return this.actor._createConsumablePowerDialog(itemData);
    }

    if (itemData.type === "spell" && this.currentPrimaryTab === "feats") {
      return this.actor.createTrait(itemData);
    }

    if (itemData.type === "actor") {
      return this.actor._createConsumablePowerDialog(itemData);
    }

    if (itemData._id) delete itemData._id;
    return this.actor.createEmbeddedEntity("Item", itemData, { dataType: dataType });
  }
  async importActor(itemData, dataType) {
    if (itemData.type === "npc") {
      return this.actor._createPolymorphBuffDialog(itemData);
    }
    if (this.actor.type === "npc" && itemData.type === "character") {
      if (dataType === "world") return this.actor._setMaster(itemData);
    }
  }

  enrichDropData(origData) {
    if (getProperty(origData, "type") === "spell") {
      if (origData?.document)
        origData?.document.data.update({
          "system.spellbook": this.currentPrimaryTab === "spellbook" ? this.currentSpellbookKey : null,
        });
      else origData.data.spellbook = this.currentPrimaryTab === "spellbook" ? this.currentSpellbookKey : null;
    }
  }

  async _openCompendiumPack(event) {
    event.preventDefault();
    let div = $(event.currentTarget),
      pack = div.attr("data-pack");
    if (pack.startsWith("browser")) {
      CompendiumBrowser.browseCompendium(pack.split(":")[1], pack.split(":")[2]);
    } else if (pack.startsWith("inline")) {
      await this.loadData(
        pack.split(":")[1],
        pack.split(":")[2],
        pack.split(":")[3],
        "",
        pack.split(":")[4]
      );
    } else if (pack !== "actor-race" && pack !== "actor-first-class") {
      game.packs.get(pack).render(true);
    } else if (pack === "actor-race") {
      if (this.entity.race !== null) {
        this.entity.race.sheet.render(true);
      }
    } else if (pack === "actor-first-class") {
      this.entity.items.find((o) => o.type === "class").sheet.render(true);
    }
  }

  _onNoteEditor(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const options = {
      name: a.getAttribute("for"),
      title: a.innerText,
      fields: a.dataset.fields,
      dtypes: a.dataset.dtypes,
    };
    new NoteEditor(this.actor, options).render(true);
  }

  _onAbilityConfig(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const options = {
      name: a.getAttribute("for"),
      title: a.innerText,
      fields: a.dataset.fields,
      dtypes: a.dataset.dtypes,
    };
    new AbilityConfig(this.actor, options).render(true);
  }

  _onSpellbookEditor(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const options = {
      name: a.getAttribute("for"),
      title: a.innerText,
      fields: a.dataset.fields,
      dtypes: a.dataset.dtypes,
    };
    new SpellbookEditor(this.actor, options).render(true);
  }

  _onDeckEditor(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const options = {
      name: a.getAttribute("for"),
      title: a.innerText,
      fields: a.dataset.fields,
      dtypes: a.dataset.dtypes,
    };
    new DeckEditor(this.actor, options).render(true);
  }

  async _onDeckDrawCards(event) {
    event.preventDefault();
    const a = event.currentTarget;
    await this.actor.drawCardsForDeck(a.getAttribute("for"));
  }

  _onLevelDataUp(event) {
    event.preventDefault();
    const a = event.currentTarget;
    this.getData().then( (data) => {
      const options = {
        id: a.getAttribute("for"),
        skillset: this._prepareSkillsets(data.actor.system.skills),
      };
      new LevelUpDataDialog(this.actor, options).render(true);
    });
  }

  async loadData(entityType, type, subtype, filter, label) {
    await this.itemDrawerHelper.loadDrawerData(label, entityType, type, subtype, filter);
  }

  _closeInlineData(ev) {
    ev.preventDefault();
    sessionStorage.setItem(`D35E-opened-${this.id}`, false);
    $(`.item-add-${this.randomUuid}-overlay`).hide();
  }

  async _addItemFromBrowser(packId, itemId, ev) {
    $(ev.target).prop("disabled", true);
    let dataType = "compendium";
    let itemData = {};
    // Case 1 - Import from a Compendium pack
    let quantity = parseInt($(`input[name='amount-add-${itemId}']`).val() || 1);
    const pack = game.packs.find((p) => p.metadata.id === packId);
    const packItem = await pack.getDocument(itemId);
    if (packItem != null) {
      itemData = packItem.toObject(false);
      itemData.system.originPack = packId;
      itemData.system.originId = packItem.id;
      ItemDescriptionsHelper.linkItemDescription(itemData, packItem.uuid);
    }
    itemData.data.quantity = quantity;
    this.enrichDropData(itemData);
    game.D35E.logger.log("Adding Quantity", quantity, itemData);
    await this.importItem(itemData, dataType);
    $(ev.target).prop("disabled", false);
  }

  _filterData() {
    var value = $(`#${this.randomUuid}-itemList-filter`).val().toLowerCase();
    $(`#${this.randomUuid}-itemList li`).filter(function () {
      $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
    });
  }

  _getSenses(actorData) {
    const senses = actorData.system.senses || {};
    const tags = {};
    for (let [k, label] of Object.entries(CONFIG.D35E.senses)) {
      const v = senses[k] ?? 0;
      if (v === 0) continue;
      tags[k] = {
        name: `${game.i18n.localize(label)} ${v} ${
          game.settings.get("D35E", "units") === "metric"
            ? game.i18n.localize("D35E.DistMeterShort")
            : game.i18n.localize("D35E.DistFtShort")
        }`,
        modified: senses.modified[k],
      };
    }
    if (!!senses.special) tags["special"] = { name: senses.special, modified: false };
    if (senses?.lowLightMultiplier > 2) {
      if (!!senses.lowLight)
        tags["lowLight"] = {
          name: game.i18n.localize("D35E.VisionLowLight") + " (" + senses.lowLightMultiplier + " times multiplier)",
          modified: senses.modified["lowLight"],
        };
    } else {
      if (!!senses.lowLight)
        tags["lowLight"] = { name: game.i18n.localize("D35E.VisionLowLight"), modified: senses.modified["lowLight"] };
    }
    return tags;
  }

  _onEntrySelector(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const options = {
      name: a.getAttribute("for"),
      isObjectProperty: true,
      title: a.innerText,
      fields: a.dataset.fields,
      objectFields: a.dataset.objectfields,
      dtypes: a.dataset.dtypes,
    };
    new EntrySelector(this.actor, options).render(true);
  }

  async _onMonsterAdvance(event) {
    event.preventDefault();

    let advancement = this.actor.system.details.advancement.hd;
    let advancementHdMinimum = 0;
    let advancementHdMaximum = 0;
    advancement.forEach((hd) => {
      if (hd.upper > advancementHdMaximum) advancementHdMaximum = hd.upper;
      if (hd.lower < advancementHdMinimum || advancementHdMinimum === 0) advancementHdMinimum = hd.lower;
    });

    const _roll = async function (form) {
      let actorUpdate = {};
      if (form) {
        let newHd = form.find('[name="advancement-hd"]').val();
        await this.actor.advanceHd(newHd);
      }
    };
    let template = "systems/D35E/templates/apps/advance-monster.html";
    game.D35E.logger.log(JSON.stringify(advancement));
    if (!this.actor.racialHD?.system) {
      ui.notifications.error("No Racial HD found for this creature. Please add a Racial HD to this creature before advancing")
      return;
    }
    let dialogData = {
      advancement: JSON.stringify(advancement),
      hdData: this.actor.racialHD.system,
      naturalAC: this.actor.system.attributes.naturalAC,
      size: this.actor.system.traits.size,
      actorSizes: CONFIG.D35E.actorSizes,
      actorSizesJSON: JSON.stringify(CONFIG.D35E.actorSizes),
      sizeAdvancementChangesJSON: JSON.stringify(CONFIG.D35E.sizeAdvancementChanges),
      cr: parseInt(this.actor.system.details.cr),
      maximum: advancementHdMaximum,
      minimum: Math.max(advancementHdMinimum, this.actor.racialHD.system.levels + 1),
    };
    const html = await renderTemplate(template, dialogData);
    let roll;
    const buttons = {};
    let wasRolled = false;
    buttons.normal = {
      label: game.i18n.localize("D35E.AdvanceMonster"),
      callback: (html) => {
        wasRolled = true;
        roll = _roll.call(this, html);
      },
    };
    await new Promise((resolve) => {
      new Dialog({
        title: `${game.i18n.localize("D35E.AdvanceMonsterWindow")}`,
        content: html,
        buttons: buttons,
        classes: ["custom-dialog", "wide"],
        default: "normal",
        close: (html) => {
          return resolve(roll);
        },
      }).render(true);
    });
  }

  _onCharacterGenerateStatblock(event) {
    event.preventDefault();
    StatblockGenerator.generateStatblock(this.actor);
  }


  _onDragStart(event) {
    const li = event.currentTarget;
    if (li.dataset.type === "skill") {
      event.dataTransfer.setData("text/plain", JSON.stringify(li.dataset));
    } else {
      super._onDragStart(event);
    }
  }
}
