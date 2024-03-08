import {DicePF} from '../dice.js';
import {Item35E} from '../item/entity.js';
import {
  createTag,
  getOriginalNameIfExists,
  isMinimumCoreVersion,
  linkData,
  shuffle,
  uuidv4,
} from '../lib.js';
import {createCustomChatMessage} from '../chat.js';
import {ActorDamageHelper} from './helpers/actorDamageHelper.js';
import {D35E} from '../config.js';
import {Roll35e} from '../roll.js';
import {ActorRestDialog} from '../apps/actor-rest.js';
import {VisionPermissionSheet} from '../apps/vision-permission.js';
import {ItemConsumableConverter} from '../item/converters/consumable.js';
import {
  ItemCombatChangesHelper,
} from '../item/helpers/itemCombatChangesHelper.js';
import {ItemPrepareDataHelper} from './helpers/itemPrepareDataHelper.js';
import {ActorBuffs} from './actions/buffs.js';
import {ActorConditions} from './actions/conditions.js';
import {ActorUpdater} from './update/actorUpdater.js';
import {LogHelper} from '../helpers/LogHelper.js';
import {ActorMinionsHelper} from './helpers/actorMinionsHelper.js';
import {ItemEnhancementHelper} from '../item/helpers/itemEnhancementHelper.js';
import {ActorCRHelper} from './helpers/actorCRHelper.js';
import {CombatChange} from '../item/extensions/combatChange.js';
import {ItemActiveHelper} from '../item/helpers/itemActiveHelper.js';
import {CACHE} from '../cache.js';
import {ActorPrepareSourceHelper} from './helpers/actorPrepareSourceHelper.js';

/**
 * Extend the base Actor class to implement additional logic specialized for D&D5e.
 */
export class ActorPF extends Actor {
  /* -------------------------------------------- */
  static LOG_V10_COMPATIBILITY_WARNINGS = false;
  API_URI = "https://companion.legaciesofthedragon.com/";
  //API_URI = 'http://localhost:5000';
  static SPELL_AUTO_HIT = -1337;
  socketRoomConnected = false;
  socket = null;

  constructor(...args) {
    super(...args);

    /**
     * @property {object.<string>} _runningFunctions
     * Keeps track of currently running async functions that shouldn't run multiple times simultaneously.
     */
    if (this._runningFunctions === undefined) this._runningFunctions = {};
    if (this._cachedRollData ===
        undefined) this._cachedRollData = this.getRollData();
    if (this._cachedAuras === undefined)
      this._cachedAuras = this.items.filter(
          (o) => o.type === 'aura' && o.system.active);
    this.conditions = new ActorConditions(this);
    this.buffs = new ActorBuffs(this);
    this.crHelper = new ActorCRHelper(this);
    this.combatChangeItems = this.items.filter(
        (o) => ItemCombatChangesHelper.isCombatChangeItemType(o));
  }

  /* -------------------------------------------- */

  get isCharacterType() {
    return this.data.type !== 'trap' && this.data.type !== 'object';
  }

  isInvisible() {
    return getProperty(this.system, `attributes.conditions.invisible`) || false;
  }

  isBanished() {
    return getProperty(this.system, `attributes.conditions.banished`) || false;
  }

  get spellFailure() {
    if (this.items == null) return getProperty(this.system,
        'attributes.arcaneSpellFailure') || 0;
    return this.items.filter((o) => {
      return o.type === 'equipment' && o.system.equipped === true &&
          !o.system.melded && !o.broken;
    }).reduce((cur, o) => {
      if (typeof o.system.spellFailure === 'number') return cur +
          o.system.spellFailure;
      return cur;
    }, getProperty(this.system, 'attributes.arcaneSpellFailure') || 0);
  }

  get auras() {
    if (!this._cachedAuras) this._cachedAuras = this.items.filter(
        (o) => o.type === 'aura' && o.system.active);
    return this._cachedAuras;
  }

  getAura(auraId) {
    return this.auras.find(
        (o) => o.id === auraId || o.system.sourceAuraId === auraId);
  }

  get trackedBuffs() {
    if (this.items == null) return null;
    return this.items.filter(
        (o) =>
            (o.type === 'buff' && getProperty(o.system, 'active') &&
                getProperty(o.system, 'timeline.enabled')) ||
            (o.type === 'aura' && getProperty(o.system, 'active') &&
                !getProperty(o.system, 'sourceTokenId')),
    );
  }

  get race() {
    if (this.items == null) return null;
    return this.items.filter((o) => o.type === 'race')[0];
  }

  get material() {
    if (this.items == null) return null;
    return this.items.filter((o) => o.type === 'material')[0];
  }

  get racialHD() {
    if (this.items == null) return null;
    return this.items.find(
        (o) => o.type === 'class' &&
            (getProperty(o.system, 'classType') === 'racial' ||
                o.name.endsWith('*')),
    );
  }

  get displayName() {
    return this.name;
  }

  async updateTokenLight(
      dimLight, o, brightLight, color, animationIntensity, type, animationSpeed,
      lightAngle, alpha) {
    if (
        dimLight !== o.light.dim ||
        brightLight !== o.light.bright ||
        color !== o.light.color ||
        animationIntensity !== o.light.animation.intensity ||
        type !== o.light.animation.type ||
        animationSpeed !== o.light.animation.speed ||
        lightAngle !== o.light.angle
    )
      if (o.document) {
        await o.document.update(
            {
              light: {
                dim: dimLight,
                bright: brightLight,
                color: color || '#000',
                alpha: alpha,
                angle: lightAngle,
                animation: {
                  type: type,
                  intensity: animationIntensity,
                  speed: animationSpeed,
                },
              },
            },
            {stopUpdates: true, tokenOnly: true},
        );
      } else {
        await o.update(
            {
              light: {
                dim: dimLight,
                bright: brightLight,
                color: color || '#000',
                alpha: alpha,
                angle: lightAngle,
                animation: {
                  type: type,
                  intensity: animationIntensity,
                  speed: animationSpeed,
                },
              },
            },
            {stopUpdates: true, tokenOnly: true},
        );
      }
  }

  async _updateChanges({updated = null} = {}, options = {}) {
    await new ActorUpdater(this).updateChanges({updated: updated}, options);
  }

  get originalName() {
    this.getFlag('babele', 'translated') ? this.getFlag('babele',
        'originalName') : this.name;
  }

  /**
   * Augment the basic actor data with additional dynamic data.
   */
  prepareData() {
    super.prepareData();

    const actorData = this;
    const preparedData = actorData.system;

    // Prepare Character data
    if (actorData.type === 'character') this._prepareCharacterData(actorData);
    else if (actorData.type === 'npc') this._prepareNPCData(preparedData);

    // Create arbitrary skill slots
    for (let skillId of CONFIG.D35E.arbitrarySkills) {
      if (preparedData.skills[skillId] == null) continue;
      let skill = preparedData.skills[skillId];
      skill.subSkills = skill.subSkills || {};
      skill.namedSubSkills = {};
      for (let subSkillId of Object.keys(skill.subSkills)) {
        if (skill.subSkills[subSkillId] == null ||
            skill.subSkills[subSkillId].name === undefined) {
          delete skill.subSkills[subSkillId];
        } else {
          skill.namedSubSkills[createTag(
              skill.subSkills[subSkillId].name)] = skill.subSkills[subSkillId];
        }
      }
    }

    // Delete removed skills
    for (let skillId of Object.keys(preparedData.skills)) {
      let skl = preparedData.skills[skillId];
      if (skl == null) {
        delete preparedData.skills[skillId];
      }
    }

    //
    preparedData.counters = {};

    // Set class tags
    let totalNonRacialLevels = 0;
    preparedData.classes = {};
    preparedData.totalNonEclLevels = 0;
    preparedData.damage = {
      nonlethal: {
        value: preparedData.attributes.hp.nonlethal || 0,
        max: preparedData.attributes.hp.max || 0,
      },
    };
    actorData.items.filter((obj) => {
      return obj.type === 'class';
    }).forEach((cls) => {
      let tag = createTag(cls.system.customTag || cls.name);
      let nameTag = createTag(cls.name);
      let originalNameTag = createTag(cls.originalName);

      cls.system.baseTag = tag;
      cls.system.nameTag = nameTag;

      let count = 1;
      while (
          actorData.items.filter((obj) => {
            return obj.type === 'class' && obj.system.tag === tag && obj !==
                cls;
          }).length > 0
          ) {
        count++;
        tag = createTag(cls.system.customTag || cls.name) + count.toString();
        nameTag = createTag(cls.name);
      }
      cls.system.tag = tag;
      preparedData.totalNonEclLevels += cls.system.classType !== 'template'
          ? cls.system.levels
          : 0;
      let healthConfig = game.settings.get('D35E', 'healthConfig');
      healthConfig =
          cls.system.classType === 'racial'
              ? healthConfig.hitdice.Racial
              : this.hasPlayerOwner
                  ? healthConfig.hitdice.PC
                  : healthConfig.hitdice.NPC;
      const classType = cls.system.classType || 'base';
      preparedData.classes[tag] = {
        level: cls.system.levels,
        _id: cls._id,
        name: cls.name,
        hd: cls.system.hd,
        bab: cls.system.bab,
        hp: healthConfig.auto,
        maxLevel: cls.system.maxLevel,
        skillsPerLevel: cls.system.skillsPerLevel,
        isSpellcaster: cls.system.spellcastingType !== null &&
            cls.system.spellcastingType !== 'none',
        isPsionSpellcaster: cls.system.spellcastingType !== null &&
            cls.system.spellcastingType === 'psionic',
        hasSpecialSlot: cls.system.hasSpecialSlot,
        isSpellcastingSpontaneus: cls.system.spellcastingSpontaneus === true,
        isArcane: cls.system.spellcastingType !== null &&
            cls.system.spellcastingType === 'arcane',
        spellcastingType: cls.system.spellcastingType,
        spellcastingAbility: cls.system.spellcastingAbility,
        spellslotAbility: cls.system.spellslotAbility,
        allSpellsKnown: cls.system.allSpellsKnown,
        halfCasterLevel: cls.system.halfCasterLevel,
        deckHandSizeFormula: cls.system.deckHandSizeFormula,
        knownCardsSizeFormula: cls.system.knownCardsSizeFormula,
        deckPrestigeClass: cls.system.deckPrestigeClass,
        hasSpellbook: cls.system.hasSpellbook,

        savingThrows: {
          fort: 0,
          ref: 0,
          will: 0,
        },
        fc: {
          hp: classType === 'base' ? cls.system.fc.hp.value : 0,
          skill: classType === 'base' ? cls.system.fc.skill.value : 0,
          alt: classType === 'base' ? cls.system.fc.alt.value : 0,
        },
      };
      preparedData.classes[tag].spellsKnownPerLevel = [];
      preparedData.classes[tag].powersKnown = [];
      preparedData.classes[tag].powersMaxLevel = [];
      for (let _level = 1; _level < cls.system.maxLevel + 1; _level++) {
        preparedData.classes[tag][`spellPerLevel${_level}`] =
            cls.system.spellcastingType !== null &&
            cls.system.spellcastingType !== 'none'
                ? cls.system.spellsPerLevel[_level - 1]
                : undefined;
        if (cls.system.spellcastingType !== null &&
            cls.system.spellcastingType !== 'none')
          preparedData.classes[tag].spellsKnownPerLevel.push(
              cls.system.spellsKnownPerLevel[_level - 1]);
        if (cls.system.spellcastingType !== null &&
            cls.system.spellcastingType !== 'none')
          preparedData.classes[tag].powersKnown.push(
              cls.system.powersKnown[_level - 1]);
        if (cls.system.spellcastingType !== null &&
            cls.system.spellcastingType !== 'none')
          preparedData.classes[tag].powersMaxLevel.push(
              cls.system.powersMaxLevel[_level - 1]);
      }
      for (let k of Object.keys(preparedData.classes[tag].savingThrows)) {
        let formula = CONFIG.D35E.classSavingThrowFormulas[classType][cls.system.savingThrows[k].value];
        if (formula == null) formula = '0';
        preparedData.classes[tag].savingThrows[k] = new Roll35e(formula,
            {level: cls.system.levels}).roll().total;
      }
      if (cls.system.classType !== 'racial')
        totalNonRacialLevels = Math.min(
            totalNonRacialLevels + cls.system.levels, 20);

      if (nameTag !==
          tag) preparedData.classes[nameTag] = preparedData.classes[tag];
      if (originalNameTag !==
          tag) preparedData.classes[originalNameTag] = preparedData.classes[tag];

      preparedData.classes[tag].spelllist = new Map();
      for (let a = 0; a < 10; a++) {
        (cls.system?.spellbook[a]?.spells || []).forEach((spell) => {
          spell.level = a;
          preparedData.classes[tag].spelllist.set(`${spell.pack}.${spell.id}`,
              spell);
        });
      }
    });

    let naturalAttackCount = (actorData.items || []).filter(
        (o) => o.type === 'attack' && o.system.attackType === 'natural',
    )?.length;
    preparedData.naturalAttackCount = naturalAttackCount;

    preparedData.classLevels = totalNonRacialLevels;
    {
      let group = 'feat';
      let name = 'base';
      if (preparedData.counters[group] === undefined) {
        preparedData.counters[group] = {};
      }
      if (preparedData.counters[group][name] === undefined) {
        preparedData.counters[group][name] = {value: 0, counted: 0};
      }
      preparedData.counters[group][name].value = Math.floor(
          preparedData.totalNonEclLevels / 3.0) + 1;
    }

    preparedData.combinedResistances = preparedData.energyResistance
        ? duplicate(preparedData.energyResistance)
        : [];
    preparedData.combinedDR = preparedData.damageReduction ? duplicate(
        preparedData.damageReduction) : [];
    let erDrRollData = this.getRollData();

    for (let [a, abl] of Object.entries(preparedData.abilities)) {
      preparedData.abilities[a].isZero = abl.total === 0 && abl.mod === 0;
    }

    preparedData.shieldType = 'none';
    this.items.filter((obj) => {
      return ItemActiveHelper.isActive(obj);
    }).forEach((_obj) => {
      ItemPrepareDataHelper.prepareResistancesForItem(_obj, erDrRollData,
          preparedData);
      ItemPrepareDataHelper.prepareCountersForItem(_obj, preparedData);
    });
    actorData.items.filter((obj) => {
      return (
          obj.type === 'feat' &&
          obj.system.featType === 'feat' &&
          (obj.system.source === undefined || obj.system.source === '')
      );
    }).forEach((obj) => {
      let group = 'feat';
      let name =
          obj.system.classSource !== undefined && obj.system.classSource !== ''
              ? obj.system.classSource
              : 'base';
      if (preparedData.counters[group][name] === undefined) {
        preparedData.counters[group][name] = {value: 0, counted: 0};
      }
      preparedData.counters[group][name].counted++;
    });

    // Prepare modifier containers
    preparedData.attributes.mods = preparedData.attributes.mods || {};
    preparedData.attributes.mods.skills = preparedData.attributes.mods.skills ||
        {};

    let spellcastingBonusTotalUsed = {
      psionic: 0,
      arcane: 0,
      divine: 0,
      cards: 0,
    };

    for (let spellbook of Object.values(
        preparedData.attributes.spells.spellbooks)) {
      if (spellbook.class !== '' && preparedData.classes[spellbook.class] !=
          null) {
        let spellcastingType = preparedData.classes[spellbook.class].spellcastingType;
        spellcastingBonusTotalUsed[spellcastingType] += spellbook.bonusPrestigeCl;
      }
    }

    for (let deck of Object.values(
        preparedData.attributes?.cards?.decks || {})) {
      if (deck.class !== '' && preparedData.classes[deck.class] != null) {
        spellcastingBonusTotalUsed['cards'] += deck.bonusPrestigeCl;
      }
    }

    preparedData.senses = duplicate(
        getProperty(this.system, 'attributes.senses')) || {};
    if (!preparedData.senses.modified) preparedData.senses.modified = {};
    for (let i of this.items.values()) {
      if (!i.system.hasOwnProperty('senses')) continue;
      if (
          (i.system.equipped && !i.system.melded && !i.broken) ||
          i.type === 'race' ||
          i.type === 'class' ||
          (i.type === 'buff' && i.system.active) ||
          (i.type === 'aura' && i.system.active)
      ) {
        for (let [k, label] of Object.entries(CONFIG.D35E.senses)) {
          if (preparedData.senses[k] !==
              Math.max(preparedData.senses[k], i.system.senses[k] || 0)) {
            preparedData.senses[k] = Math.max(preparedData.senses[k],
                i.system.senses[k] || 0);
            preparedData.senses.modified[k] = true;
          }
        }
        preparedData.senses.darkvision = Math.max(
            preparedData.senses.darkvision, i.system.senses?.darkvision || 0);
        if (preparedData.senses.lowLight !== i.system.senses?.lowLight) {
          preparedData.senses.lowLight = preparedData.senses.lowLight ||
              i.system.senses?.lowLight || false;
          preparedData.senses.modified['lowLight'] = true;
        }
        if (preparedData.senses.lowLightMultiplier !==
            i.system.senses?.lowLightMultiplier) {
          preparedData.senses.lowLightMultiplier =
              preparedData.senses.lowLightMultiplier <
              (i.system.senses?.lowLightMultiplier || 2)
                  ? i.system.senses?.lowLightMultiplier || 2
                  : preparedData.senses.lowLightMultiplier;
          preparedData.senses.modified['lowLight'] = true;
        }
      }
    }

    for (let spellbook of Object.values(
        preparedData.attributes.spells.spellbooks)) {
      if (!spellbook.cl) continue;
      // Set CL
      spellbook.maxPrestigeCl = 0;
      spellbook.allSpellsKnown = false;
      try {
        let roll = new Roll35e(spellbook.cl.formula, preparedData).roll();
        spellbook.cl.total = roll.total || 0;
      } catch (e) {
        spellbook.cl.total = 0;
      }
      if (actorData.type === 'npc') spellbook.cl.total += spellbook.cl.base;
      if (spellbook.class === '_hd') {
        spellbook.cl.total += preparedData.attributes.hd.total;
      } else if (spellbook.class !== '' &&
          preparedData.classes[spellbook.class] != null) {
        if (preparedData.classes[spellbook.class]?.halfCasterLevel)
          spellbook.cl.total += Math.floor(
              preparedData.classes[spellbook.class].level / 2);
        else spellbook.cl.total += preparedData.classes[spellbook.class].level;
        let spellcastingType = spellbook.spellcastingType;
        if (
            spellcastingType !== undefined &&
            spellcastingType !== null &&
            spellcastingType !== 'none' &&
            spellcastingType !== 'other'
        ) {
          if (preparedData.attributes.prestigeCl[spellcastingType]?.max !==
              undefined) {
            spellbook.maxPrestigeCl = preparedData.attributes.prestigeCl[spellcastingType].max;
            spellbook.availablePrestigeCl =
                preparedData.attributes.prestigeCl[spellcastingType].max -
                spellcastingBonusTotalUsed[spellcastingType];
          }
        }

        spellbook.allSpellsKnown = preparedData.classes[spellbook.class]?.allSpellsKnown;
      }
      spellbook.hasPrestigeCl = spellbook.maxPrestigeCl > 0;
      spellbook.canAddPrestigeCl = spellbook.availablePrestigeCl > 0;
      spellbook.canRemovePrestigeCl = spellbook.bonusPrestigeCl > 0;
      spellbook.powersKnown = preparedData.classes[spellbook.class]?.powersKnown
          ? preparedData.classes[spellbook.class]?.powersKnown[`${preparedData.classes[spellbook.class].level}`] ||
          0
          : 0;
      spellbook.powersMaxLevel = preparedData.classes[spellbook.class]?.powersMaxLevel
          ? preparedData.classes[spellbook.class]?.powersMaxLevel[`${preparedData.classes[spellbook.class].level}`] ||
          0
          : 0;
      spellbook.cl.total += spellbook.bonusPrestigeCl === undefined
          ? 0
          : spellbook.bonusPrestigeCl;
      spellbook.powerPointsValue = {
        max: spellbook.powerPointsTotal || 0,
        value: spellbook.powerPoints || 0,
      };
      // Add spell slots
      spellbook.spells = spellbook.spells || {};
      for (let a = 0; a < 10; a++) {
        spellbook.spells[`spell${a}`] = spellbook.spells[`spell${a}`] || {
          value: 0,
          max: 0,
          base: null,
          known: 0,
        };
        let spellbookClassLevel = (preparedData.classes[spellbook.class]?.level ||
            0) + spellbook.bonusPrestigeCl;
        spellbook.spells[`spell${a}`].maxKnown = preparedData.classes[spellbook.class]?.spellsKnownPerLevel
            ? Math.max(
                0,
                preparedData.classes[spellbook.class]?.spellsKnownPerLevel[spellbookClassLevel -
                1]
                    ? preparedData.classes[spellbook.class]?.spellsKnownPerLevel[spellbookClassLevel -
                1][a + 1] || 0
                    : 0,
            )
            : 0;
      }
    }
    for (let deck of Object.values(
        preparedData.attributes?.cards?.decks || {})) {
      // Set CL
      deck.maxPrestigeCl = 0;

      if (deck.class !== '' && preparedData.classes[deck.class] != null) {
        let spellcastingType = 'cards';
        if (
            spellcastingType !== undefined &&
            spellcastingType !== null &&
            spellcastingType !== 'none' &&
            spellcastingType !== 'other'
        ) {
          if (preparedData.attributes.prestigeCl[spellcastingType]?.max !==
              undefined) {
            deck.maxPrestigeCl = preparedData.attributes.prestigeCl[spellcastingType].max;
            deck.availablePrestigeCl =
                preparedData.attributes.prestigeCl[spellcastingType].max -
                spellcastingBonusTotalUsed[spellcastingType];
          }
        }
      }
      deck.hasPrestigeCl = deck.maxPrestigeCl > 0;
      deck.canAddPrestigeCl = deck.availablePrestigeCl > 0;
      deck.canRemovePrestigeCl = deck.bonusPrestigeCl > 0;
    }

    preparedData.canLevelUp = preparedData.details.xp.value >=
        preparedData.details.xp.max;
    this.combatChangeItems = this.items.filter(
        (o) => ItemCombatChangesHelper.isCombatChangeItemType(o));
    if (this.isCompanionSetUp) {
      this.connectToCompanionSocket();
      if (this.canAskForRequest) {
        this.connectToCompanionCharacterRoom();
      } else {
        this.disconnectFromCompanionCharacterRoom();
      }
    }
  }

  async refresh(options = {}) {
    if (this.testUserPermission(game.user, 'OWNER') && options.stopUpdates !==
        true) {
      if (options.reloadAuras) {
        this._cachedAuras = null;
      }
      return this.update({});
    }
  }

  async refreshWithData(data, options = {}) {
    if (this.testUserPermission(game.user, 'OWNER') && options.stopUpdates !==
        true) {
      return this.update(data);
    }
  }

  /**
   * Prepare Character type specific
   * data
   */
  _prepareCharacterData(actorData) {
    if (!hasProperty(actorData.system, 'details.level.value')) return;

    const data = actorData.system;

    // Experience bar
    let prior = this.getLevelExp(data.details.level.available - 1 || 0),
        req = data.details.xp.max - prior;
    data.details.xp.pct = Math.min(
        Math.round(((data.details.xp.value - prior) * 100) / (req || 1)), 99.5);
  }

  /* -------------------------------------------- */

  /**
   * Prepare NPC type specific data
   */
  _prepareNPCData(npcData) {
    if (!hasProperty(npcData.system, 'details.cr')) return;

    // Kill Experience
    npcData.system.details.xp.value = this.getCRExp(
        npcData.system.details.totalCr);
  }

  /**
   * Return the amount of experience required to gain a certain character level.
   * @param level {Number}  The desired level
   * @return {Number}       The XP required
   */
  getLevelExp(level) {
    const expRate = game.settings.get('D35E', 'experienceRate');
    const levels = CONFIG.D35E.CHARACTER_EXP_LEVELS[expRate];
    return levels[Math.min(level, levels.length - 1)];
  }

  /* -------------------------------------------- */

  /**
   * Return the amount of experience granted by killing a creature of a certain CR.
   * @param cr {Number}     The creature's challenge rating
   * @return {Number}       The amount of experience granted per kill
   */
  getCRExp(cr) {
    if (cr < 1.0) return Math.max(400 * cr, 10);
    return CONFIG.D35E.CR_EXP_LEVELS[cr];
  }

  /* -------------------------------------------- */

  /*  Socket Listeners and Handlers
  /* -------------------------------------------- */

  /**
   * Extend the default update method to enhance data before submission.
   * See the parent Entity.update method for full details.
   *
   * @param {Object} updated     The data with which to update the Actor
   * @param {Object} options  Additional options which customize the update workflow
   * @return {Promise}        A Promise which resolves to the updated Entity
   */
  async update(updated, options = {}) {
    let origData = duplicate(updated);
    if (options['recursive'] !== undefined && options['recursive'] === false) {
      return super.update(updated, options);
    }
    LogHelper.log('ACTOR UPDATE | Running update');
    let diff = await new ActorUpdater(this).update(updated, options);

    let returnActor = null;
    if (Object.keys(diff).length) {
      let updateOptions = mergeObject(options, {diff: true});
      returnActor = await super.update(diff, updateOptions);
    }

    await this.conditions.toggleConditionStatusIcons();

    ActorMinionsHelper.updateMinions(this, options);

    this._cachedRollData = null;
    this._cachedAuras = null;
    LogHelper.log('ACTOR UPDATE | Finished update');
    return Promise.resolve(returnActor ? returnActor : this);
  }

  _onUpdate(updated, options, userId, context) {
    if (
        hasProperty(updated, 'system.attributes.senses.lowLight') ||
        hasProperty(updated, 'system.attributes.senses.darkvision')
    ) {
      try {
        canvas.sight.initializeTokens();
      } catch (e) {}
    }

    let actorRollData = mergeObject(this.getRollData(), updated,
        {inplace: false});
    for (let i of this.items.values()) {
      let itemUpdateData = {};

      i._updateMaxUses(itemUpdateData, {actorRollData: actorRollData});
      if (Object.keys(itemUpdateData).length > 0) {
        const itemDiff = diffObject(flattenObject(i.toObject()),
            itemUpdateData);
        if (Object.keys(itemDiff).length > 0) i.update(itemDiff);
      }
    }
    return super._onUpdate(updated, options, userId, context);
  }

  async deleteOwnedItem(itemId) {
    // const item = this.items.get(itemId);
    // return item.delete();
    this.deleteEmbeddedDocuments('Item', itemId);
  }

  getOwnedItem(itemId) {
    return this.items.get(itemId);
  }

  async updateClassProgressionLevel(
      data, globalUpdateData, data1, levelUpData) {
    //LogHelper.log('ActorPF | updateClassProgressionLevel | Starting update')
    const classes = this.items.filter(
        (o) => o.type === 'class' && getProperty(o.system, 'classType') !==
            'racial').sort((a, b) => {
      return a.sort - b.sort;
    });
    let updateData = {};
    let classLevels = new Map();
    let classHP = new Map();
    // Iterate over all levl ups
    if (data1.details.levelUpData && data1.details.levelUpProgression) {
      levelUpData.forEach((lud) => {
        if (lud.classId === null || lud.classId === '') return;
        let _class = this.items.get(lud.classId);
        if (_class == null) {
          lud.classId = null;
          lud.classImage = null;
          lud.skills = {};
          lud.class = null;
          return;
        }
        if (!classLevels.has(_class._id)) classLevels.set(_class._id, 0);
        classLevels.set(_class._id, classLevels.get(_class._id) + 1);
        if (!classHP.has(_class._id)) classHP.set(_class._id, 0);
        classHP.set(_class._id, classHP.get(_class._id) + (lud.hp || 0));
        Object.keys(lud.skills).forEach((s) => {
          updateData[`system.skills.${s}.points`] =
              (lud.skills[s].points || 0) * (lud.skills[s].cls ? 1 : 0.5) +
              (updateData[`system.skills.${s}.points`] || 0);
          if (lud.skills[s].subskills) {
            Object.keys(lud.skills[s].subskills).forEach((sb) => {
              updateData[`system.skills.${s}.subSkills.${sb}.points`] =
                  lud.skills[s].subskills[sb].points *
                  (lud.skills[s].subskills[sb].cls ? 1 : 0.5) +
                  (updateData[`system.skills.${s}.subSkills.${sb}.points`] ||
                      0);
            });
          }
        });
      });
      Object.keys(levelUpData[0]?.skills || {}).forEach((s) => {
        updateData[`system.skills.${s}.points`] = Math.floor(
            updateData[`system.skills.${s}.points`] || 0);
        if (levelUpData[0].skills[s].subskills) {
          Object.keys(levelUpData[0].skills[s].subskills).forEach((sb) => {
            updateData[`system.skills.${s}.subSkills.${sb}.points`] = Math.floor(
                updateData[`system.skills.${s}.subSkills.${sb}.points`] || 0,
            );
          });
        }
      });

      for (var _class of classes) {
        let itemUpdateData = {};
        itemUpdateData['_id'] = _class._id;
        itemUpdateData['system.levels'] = classLevels.get(_class._id) || 0;
        itemUpdateData['system.hp'] = classHP.get(_class._id) || 0;
        await this.updateOwnedItem(itemUpdateData, {stopUpdates: true});

        //LogHelper.log(`ActorPF | updateClassProgressionLevel | Updated class item ${_class.name}`)
      }

      for (let [k, s] of Object.entries(getProperty(data, 'system.skills'))) {
        linkData(data, globalUpdateData, `system.skills.${k}.points`,
            updateData[`system.skills.${k}.points`] || 0);
        for (let k2 of Object.keys(getProperty(s, 'subSkills') || {})) {
          linkData(
              data,
              globalUpdateData,
              `system.skills.${k}.subSkills.${k2}.points`,
              updateData[`system.skills.${k}.subSkills.${k2}.points`] || 0,
          );
        }
      }

      //LogHelper.log('ActorPF | updateClassProgressionLevel | Update done')
    } else {
      //LogHelper.log('ActorPF | updateClassProgressionLevel | Update skipped, no levelUpData')
    }
  }

  async _onCreate(data, options, userId, context) {
    if (userId === game.user.id) {
      await this._updateChanges();
    }

    super._onCreate(data, options, userId, context);
  }

  updateItemResources(item) {
    if (!(item instanceof Item)) return;
    if (!this.testUserPermission(game.user, 'OWNER')) return;

    if (item.system.uses != null && item.system.activation != null &&
        item.system.activation.type !== '') {
      const itemTag = createTag(item.data.name);
      const itemCustomTag = createTag(item.system.customTag);
      let curUses = item.system.uses;

      if (getProperty(this.system, 'resources') == null) setProperty(
          this.system, 'resources', {});
      if (this.system.resources[itemTag] == null)
        this.system.resources[itemTag] = {
          value: 0,
          max: 1,
          _id: '',
        };

      const updateData = {};
      if (this.system.resources[itemTag].value !== curUses.value) {
        updateData[`system.resources.${itemTag}.value`] = curUses.value;
      }
      if (this.system.resources[itemTag].max !== curUses.max) {
        updateData[`system.resources.${itemTag}.max`] = curUses.max;
      }
      if (this.system.resources[itemTag]._id !== item._id) {
        updateData[`system.resources.${itemTag}._id`] = item._id;
      }
      if (itemCustomTag) {
        if (this.system.resources[itemCustomTag] == null)
          this.system.resources[itemCustomTag] = {
            value: 0,
            max: 1,
            _id: '',
          };
        const updateData = {};
        if (this.system.resources[itemCustomTag].value !== curUses.value) {
          updateData[`system.resources.${itemCustomTag}.value`] = curUses.value;
        }
        if (this.system.resources[itemCustomTag].max !== curUses.max) {
          updateData[`system.resources.${itemCustomTag}.max`] = curUses.max;
        }
        if (this.system.resources[itemCustomTag]._id !== item._id) {
          updateData[`system.resources.${itemCustomTag}._id`] = item._id;
        }
      }

      if (Object.keys(updateData).length > 0) this.update(updateData);
    }
  }

  getItemResourcesUpdate(item, updateData) {
    if (!(item instanceof Item)) return;
    if (!this.testUserPermission(game.user, 'OWNER')) return;

    if (
        item.system.uses != null &&
        item.system.uses.isResource &&
        item.system.activation != null &&
        item.system.activation.type !== ''
    ) {
      const itemTag = createTag(item.data.name);
      let curUses = item.system.uses;

      if (getProperty(this.system, 'resources') == null) setProperty(
          this.system, 'resources', {});
      if (this.system.resources[itemTag] == null)
        this.system.resources[itemTag] = {
          value: 0,
          max: 1,
          _id: '',
        };
      if (this.system.resources[itemTag].value !== curUses.value) {
        updateData[`system.resources.${itemTag}.value`] = curUses.value;
      }
      if (this.system.resources[itemTag].max !== curUses.max) {
        updateData[`system.resources.${itemTag}.max`] = curUses.max;
      }
      if (this.system.resources[itemTag]._id !== item._id) {
        updateData[`system.resources.${itemTag}._id`] = item._id;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * See the base Actor class for API documentation of this method
   */
  async createOwnedItem(itemData, options) {
    let t = itemData.type;
    let initial = {};
    // Assume NPCs are always proficient with weapons and always have spells prepared
    if (!this.hasPlayerOwner) {
      if (t === 'weapon') initial['system.proficient'] = true;
      if (['weapon', 'equipment'].includes(
          t)) initial['system.equipped'] = true;
    }
    if (t === 'spell') {
      if (this.sheet != null && this.sheet._spellbookTab != null) {
        initial['system.spellbook'] = this.sheet._spellbookTab;
      }
    }
    mergeObject(itemData, initial);

    return this.createEmbeddedEntity('Item', itemData, options);
  }

  /* -------------------------------------------- */
  /*  Rolls                                       */

  /* -------------------------------------------- */

  async addSpellFromSpellListToSpellbook(level, itemId, itemPack) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));
    let spellsToAdd = [];
    let itemData = null;
    const pack = game.packs.find((p) => p.metadata.id === itemPack);
    const packItem = await pack.getDocument(itemId);
    if (packItem != null) itemData = packItem.data;
    if (itemData) {
      if (itemData._id) delete itemData._id;
      if (itemData.document)
        itemData.document.data.update({
          'system.level': parseInt(level),
          'system.-=spellbook': null,
        });
      else {
        itemData.data.level = parseInt(level);
        if (itemData.data.spellbook) delete itemData.data.spellbook;
      }
      spellsToAdd.push(itemData);
    }
    await this.createEmbeddedEntity('Item', spellsToAdd, {nameUnique: true});
  }

  async modifyTokenAttribute(attribute, value, isDelta) {
    if (attribute === 'attributes.hp') {
      let strValue = String(value);
      if (isDelta && value > 0) strValue = '+' + strValue;
      return this.update({'system.attributes.hp.value': strValue});
    } else {
      return super.modifyTokenAttribute(attribute, value);
    }
  }

  async addSpellsToSpellbook(item) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));

    if (item.data.type !== 'feat') throw new Error('Wrong Item type');
    let spellsToAdd = [];
    for (let spell of Object.values(item.system.spellSpecialization.spells)) {
      let itemData = null;
      if (!spell.id) continue;
      const pack = game.packs.find((p) => p.metadata.id === spell.pack);
      const packItem = await pack.getDocument(spell.id);
      if (packItem != null) itemData = packItem.toObject(false);
      if (itemData) {
        //if (itemData._id) delete itemData._id;
        itemData.system.level = spell.level;
        spellsToAdd.push(itemData);
      }
    }
    await this.createEmbeddedEntity('Item', spellsToAdd,
        {nameUnique: true, domainSpells: true});
  }

  async addSpellsToSpellbookForClass(_spellbookKey, level) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));

    let spellsToAdd = [];
    let spellbook = this.system.attributes.spells.spellbooks[_spellbookKey];
    let spellbookClass = this.system.classes[spellbook.class];
    if (spellbookClass?.hasSpellbook) {
      LogHelper.log(spellbookClass.spelllist);
      for (let spellData of spellbookClass.spelllist.values()) {
        if (spellData.level !== parseInt(level)) continue;
        const pack = game.packs.find((p) => p.metadata.id === spellData.pack);
        const packItem = await pack.getDocument(spellData.id);
        if (itemData) {
          let itemData = packItem.toObject(true);
          if (itemData._id) delete itemData._id;
          itemData.system.level = spellData.level;
          if (itemData.system.spellbook) delete itemData.system.spellbook;
          spellsToAdd.push(itemData);
        }
      }
    } else {
      for (let p of game.packs.values()) {
        if (p.private && !game.user.isGM) continue;
        if ((p.entity || p.documentName) !== 'Item') continue;

        const items = await p.getDocuments();
        for (let _obj of items) {
          let obj = _obj.toObject(true);
          if (obj.type !== 'spell') continue;
          let foundLevel = false;
          if (obj.system.learnedAt !== undefined) {
            obj.system.learnedAt.class.forEach((learnedAtObj) => {
              if (learnedAtObj[0].toLowerCase() ===
                  spellbookClass.name.toLowerCase()) {
                obj.system.level = learnedAtObj[1];
                foundLevel = true;
              }
            });
          }
          if (parseInt(level) !== obj.system.level) continue;
          if (!foundLevel) continue;

          if (obj._id) delete obj._id;
          obj.system.spellbook = _spellbookKey;
          spellsToAdd.push(obj);
        }
      }
    }

    await this.createEmbeddedEntity('Item', spellsToAdd, {
      stopUpdates: true,
      nameUnique: true,
      ignoreSpellbookAndLevel: true,
    });
  }

  async createAttackFromWeapon(item) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));
    if (item.type !== 'weapon') throw new Error('Wrong Item type');
    //LogHelper.log('Creating attack for', item)

    let isKeen = false;
    let isSpeed = false;
    let isDistance = false;
    let _enhancements = duplicate(
        getProperty(item.system, `enhancements.items`) || []);
    let identified = getProperty(item.system, `identified`);
    // Get attack template
    let attackData = {data: {}};
    for (const template of game.system.template.Item.attack.templates) {
      mergeObject(attackData.data,
          game.system.template.Item.templates[template]);
    }
    mergeObject(attackData.data, duplicate(game.system.template.Item.attack));
    attackData = flattenObject(attackData);
    let isIncorporeal = false;

    // Add things from Enhancements
    if (identified) {
      _enhancements.forEach((i) => {
        let enhancementData = ItemEnhancementHelper.getEnhancementData(i);
        if (enhancementData.properties !== null &&
            enhancementData.properties.kee) {
          isKeen = true;
        }
        if (enhancementData.properties !== null &&
            enhancementData.properties.inc) {
          isIncorporeal = true;
        }
        if (enhancementData.properties !== null &&
            enhancementData.properties.spd) {
          isSpeed = true;
        }
        if (enhancementData.properties !== null &&
            enhancementData.properties.dis) {
          isDistance = true;
        }
      });

      if (item.system.properties !== null && item.system.properties.kee) {
        isKeen = true;
      }
      if (item.system.properties !== null && item.system.properties.inc) {
        isIncorporeal = true;
      }
      if (item.system.properties !== null && item.system.properties.spd) {
        isSpeed = true;
      }
      if (item.system.properties !== null && item.system.properties.dis) {
        isDistance = true;
      }
    }
    let baseCrit = item.system.weaponData.critRange || 20;
    if (isKeen) {
      baseCrit = 21 - 2 * (21 - baseCrit);
    }
    attackData['type'] = 'attack';
    attackData['name'] = identified
        ? item.data.name
        : item.system.unidentified.name;
    attackData['system.masterwork'] = item.system.masterwork;
    attackData['system.attackType'] = 'weapon';
    attackData['system.description.value'] = identified
        ? item.system.description.value
        : item.system.description.unidentified;
    attackData['system.enh'] = identified ? item.system.enh : 0;
    attackData['system.ability.critRange'] = baseCrit;
    attackData['system.ability.critMult'] = item.system.weaponData.critMult ||
        2;
    attackData['system.actionType'] =
        item.system.weaponSubtype === 'ranged' || item.system.properties.thr
            ? 'rwak'
            : 'mwak';
    attackData['system.activation.type'] = 'attack';
    attackData['system.duration.units'] = 'inst';
    attackData['system.finesseable'] = item.system.properties.fin || false;
    attackData['system.incorporeal'] = isIncorporeal || false;
    attackData['system.threatRangeExtended'] = isKeen;
    attackData['system.baseWeaponType'] =
        item.system.baseWeaponType || (item.system.unidentified?.name
            ? item.system.unidentified.name
            : item.name);
    attackData['system.originalWeaponCreated'] = true;
    attackData['system.originalWeaponId'] = item._id;
    attackData['system.originalWeaponName'] = identified
        ? item.data.name
        : item.system.unidentified.name;
    attackData['system.originalWeaponImg'] = item.img;
    attackData['system.originalWeaponProperties'] = item.system.properties;
    attackData['system.material'] = item.system.material;
    attackData['system.alignment.good'] = item.system.weaponData.alignment?.good ||
        false;
    attackData['system.alignment.evil'] = item.system.weaponData.alignment?.evil ||
        false;
    attackData['system.alignment.chaotic'] = item.system.weaponData.alignment?.chaotic ||
        false;
    attackData['system.alignment.lawful'] = item.system.weaponData.alignment?.lawful ||
        false;
    attackData['img'] = item.data.img;

    attackData['system.nonLethal'] = item.system.properties.nnl;
    attackData['system.thrown'] = item.system.properties.thr;
    attackData['system.returning'] = item.system.properties.ret;

    // Add additional attacks
    let extraAttacks = [];
    for (let a = 5; a <
    (getProperty(this.system, "attributes.bab.nonepic") || 0); a += 5) {
      extraAttacks = extraAttacks.concat([
        [
          `-${a}`,
          `${game.i18n.localize('D35E.Attack')} ${Math.floor((a + 5) / 5)}`],
      ]);
    }
    if (isSpeed) {
      extraAttacks = extraAttacks.concat(
          [[`0`, `${game.i18n.localize('D35E.Attack')} - Speed Enhancement`]]);
    }
    if (extraAttacks.length >
        0) attackData['system.attackParts'] = extraAttacks;

    // Add ability modifiers
    const isMelee = getProperty(item.system, 'weaponSubtype') !== 'ranged';
    if (isMelee) attackData['system.ability.attack'] = 'str';
    else attackData['system.ability.attack'] = 'dex';
    if (isMelee || item.system.properties['thr'] === true) {
      attackData['system.ability.damage'] = 'str';
      if (item.system.weaponSubtype === '2h' &&
          isMelee) attackData['system.ability.damageMult'] = 1.5;
    }
    if (item.system.properties['thr'] === true) {
      attackData['system.ability.attack'] = 'dex';
    }
    attackData['system.weaponSubtype'] = item.system.weaponSubtype;
    // Add damage formula
    if (item.system.weaponData.damageRoll) {
      const die = item.system.weaponData.damageRoll || '1d4';
      let part = die;
      let dieCount = 1,
          dieSides = 4;
      if (die.match(/^([0-9]+)d([0-9]+)$/)) {
        dieCount = parseInt(RegExp.$1);
        dieSides = parseInt(RegExp.$2);
        let weaponSize = '@size';
        if (!game.settings.get('D35E', 'autosizeWeapons'))
          weaponSize = Object.keys(CONFIG.D35E.sizeChart).
              indexOf(item.system.weaponData.size) - 4;
        part = `sizeRoll(${dieCount}, ${dieSides}, ${weaponSize}, @critMult)`;
      }
      const bonusFormula = getProperty(item.system, 'weaponData.damageFormula');
      if (bonusFormula != null &&
          bonusFormula.length) part = `${part} + ${bonusFormula}`;
      attackData['system.damage.parts'] = [
        [
          part,
          item.system.weaponData.damageType || '',
          item.system.weaponData.damageTypeId || ''],
      ];
    }

    // Add attack bonus formula
    {
      const bonusFormula = getProperty(item.system, 'weaponData.attackFormula');
      if (bonusFormula !== undefined && bonusFormula !== null &&
          bonusFormula.length)
        attackData['system.attackBonus'] = bonusFormula;
    }
    attackData['system.attackNotes'] = '';
    attackData['system.effectNotes'] = '';
    // Add things from Enhancements
    let conditionals = [];
    if (identified) {
      _enhancements.forEach((i) => {
        let enhancementData = ItemEnhancementHelper.getEnhancementData(i);
        if (enhancementData.enhancementType !== 'weapon') return;
        let conditional = Item35E.defaultConditional;
        conditional.name = i.name;
        conditional.default = false;
        if (enhancementData.weaponData.damageRoll !== '') {
          if (enhancementData.weaponData.optionalDamage) {
            let damageModifier = Item35E.defaultConditionalModifier;
            damageModifier.formula = enhancementData.weaponData.damageRoll;
            damageModifier.type = enhancementData.weaponData.damageTypeId;
            damageModifier.target = 'damage';
            damageModifier.subTarget = 'allDamage';
            conditional.modifiers.push(damageModifier);
          } else {
            if (enhancementData.weaponData.damageRoll !== undefined &&
                enhancementData.weaponData.damageRoll !== null)
              attackData['system.damage.parts'].push([
                enhancementData.weaponData.damageRoll,
                enhancementData.weaponData.damageType,
                enhancementData.weaponData.damageTypeId || '',
              ]);
          }
        }
        if (enhancementData.weaponData.attackRoll !== '') {
          if (enhancementData.weaponData.optionalDamage) {
            let attackModifier = Item35E.defaultConditionalModifier;
            attackModifier.formula = enhancementData.weaponData.attackRoll;
            attackModifier.target = 'attack';
            attackModifier.subTarget = 'allAttack';
            conditional.modifiers.push(attackModifier);
          } else {
            if (enhancementData.weaponData.attackRoll !== undefined &&
                enhancementData.weaponData.attackRoll !== null)
              attackData['system.attackBonus'] =
                  attackData['system.attackBonus'] + ' + ' +
                  enhancementData.weaponData.attackRoll;
          }
        }
        if (conditional.modifiers.length > 0) {
          conditionals.push(conditional);
        }
        if (enhancementData.effectNotes && enhancementData.attackNotes !== '') {
          attackData['system.attackNotes'] += '\n' +
              enhancementData.attackNotes;
          attackData['system.attackNotes'] = attackData['system.attackNotes'].trim();
        }
        if (enhancementData.effectNotes && enhancementData.effectNotes !== '') {
          attackData['system.effectNotes'] += '\n' +
              enhancementData.effectNotes;
          attackData['system.effectNotes'] = attackData['system.effectNotes'].trim();
        }
      });
      if (conditionals.length) {
        attackData['system.conditionals'] = conditionals;
      }
    }

    if (identified) {
      if (item.system.attackNotes && item.system.attackNotes !== '') {
        attackData['system.attackNotes'] += '\n' + item.system.attackNotes;
        attackData['system.attackNotes'] = attackData['system.attackNotes'].trim();
      }
      if (item.system.attackNotes && item.system.effectNotes !== '') {
        attackData['system.effectNotes'] += '\n' + item.system.effectNotes;
        attackData['system.effectNotes'] = attackData['system.effectNotes'].trim();
      }
    }

    // Add range
    if (!isMelee && getProperty(item.system, 'weaponData.range') != null) {
      attackData['system.range.units'] = 'ft';
      let range = getProperty(item.system, 'weaponData.range');
      if (isDistance) range = range * 2;
      attackData['system.range.value'] = range.toString();
    }

    if (hasProperty(attackData,
        'system.templates')) delete attackData['system.templates'];

    let attacks = [];
    attacks.push(expandObject(attackData));
    if (item.system.properties.thr) {
      let meleeAttack = duplicate(attacks[0]);
      meleeAttack['system']['actionType'] = 'mwak';
      meleeAttack['system']['thrown'] = false;
      meleeAttack['system']['ability']['attack'] = 'str';
      attacks[0]['name'] = `${attacks[0]['name']} (Thrown)`;
      attacks.push(meleeAttack);
    }
    let createdAttack = await this.createEmbeddedEntity('Item', attacks, {});
    //let createdAttack = await this.createOwnedItem(attacks);

    //LogHelper.log('Created attack for', item)

    ui.notifications.info(game.i18n.localize('D35E.NotificationCreatedAttack').
        format(item.data.name));
    return createdAttack;
  }

  /* -------------------------------------------- */

  /* -------------------------------------------- */

  /**
   * Roll a generic ability test or saving throw.
   * Prompt the user for input on which variety of roll they want to do.
   * @param {String} abilityId     The ability id (e.g. "str")
   * @param {Object} options      Options which configure how ability tests or saving throws are rolled
   */
  rollAbility(abilityId, options = {}) {
    return this.rollAbilityTest(abilityId, options);
  }

  rollBAB(options = {}) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));
    // Get dynamic bonuses from BAB source details
    let dynamicBonuses = [];
    if (this.sourceDetails['system.attributes.bab.total']) {
      dynamicBonuses.push(...this.sourceDetails['system.attributes.bab.total']);
    }
    return DicePF.d20Roll({
      event: options.event,
      parts: [],
      dynamicBonuses: dynamicBonuses,
      data: {
        base: getProperty(this.system, 'attributes.bab.base'),
      },
      title: game.i18n.localize('D35E.BAB'),
      speaker: ChatMessage.getSpeaker({actor: this}),
      takeTwenty: false,
      chatTemplate: 'systems/D35E/templates/chat/roll-ext.html',
    });
  }

  async rollMelee(options = {}) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));

    // Make a fake melee attack item that doesn't get saved and deals the damage of the melee attack
    // Actor size index
    let sizeIndex = Object.keys(CONFIG.D35E.sizeChart).indexOf(this.system.traits.actualSize);
    // offset by the medium size which is treated as 0
    sizeIndex -= 4;
    let rollFormula = game.D35E.rollPreProcess.sizeRoll(1, 3, this.system.traits.actualSize, 1);
    // add str value
    // if str mod > 0, add it to the roll
    if (this.system.abilities.str.mod > 0)
      rollFormula += `+${this.system.abilities.str.mod}`;
    else
      rollFormula += `${this.system.abilities.str.mod}`;
    let meleeAttack = {
      name: game.i18n.localize('D35E.Melee'),
      img: `/icons/skills/melee/hand-grip-sword-red.webp`,
      type: 'attack',
      system: {
        actionType: 'mwak',
        ability: {
          attack: 'str',
        },
        // Non lethal
        nonLethal: true,
        effectNotes: `Usually non-lethal damage is @DamageRoll[bludgeoning,${rollFormula}]. See Equipment for more details.`,
      },
    };
    let meleeAttackItem = await Item35E.create(meleeAttack, {temporary: true});
    meleeAttackItem.use({temporaryItem: true}, this);
  }

  async rollRanged(options = {}) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));

    let meleeAttack = {
      name: game.i18n.localize('D35E.Ranged'),
      img: `icons/skills/ranged/arrow-flying-broadhead-metal.webp`,
      type: 'attack',
      system: {
        actionType: 'rsak',
        ability: {
          attack: 'dex',
        },
        damage: {
          parts: [
          ],
        },
        // Add attack note
        effectNotes: `The ranged attack for most creatures is an improvised rock throw (@DamageRoll[bludgeoning,1]). See Equipment for more details.`,
      },
    };
    let meleeAttackItem = await Item35E.create(meleeAttack, {temporary: true});
    meleeAttackItem.use({temporaryItem: true}, this);
  }

  rollCMB(options = {}) {
    this.rollGrapple(null, options);
  }

  async rollPsionicFocus(event) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));

    let rollData = this.getRollData();

    let roll = new Roll35e('1d20 + @skills.coc.mod', rollData).roll();
    // Set chat data
    let chatData = {
      speaker: ChatMessage.getSpeaker({actor: this.data}),
      rollMode: 'public',
      sound: CONFIG.sounds.dice,
      'flags.D35E.noRollRender': true,
    };
    let chatTemplateData = {
      name: this.name,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      rollMode: 'public',
    };
    const templateData = mergeObject(
        chatTemplateData,
        {
          img: this.img,
          roll: roll,
          total: roll.total,
          result: roll.result,
          tooltip: $(await roll.getTooltip()).
              prepend(
                  `<div class="dice-formula">${roll.formula}</div>`)[0].outerHTML,
          success: roll.total >= 20,
        },
        {inplace: false},
    );
    // Create mess age

    if (roll.total >= 20) {
      const spellbookKey = $(event.currentTarget).
          closest('.spellbook-group').
          data('tab');
      const k = `system.attributes.psionicFocus`;
      let updateData = {};
      updateData[k] = true;
      this.update(updateData);
    }

    await createCustomChatMessage(
        'systems/D35E/templates/chat/psionic-focus.html', templateData,
        chatData, {
          rolls: [roll],
        });
  }

  getDefenseHeaders() {
    const data = this.system;
    const headers = [];

    const reSplit = CONFIG.D35E.re.traitSeparator;
    let misc = [];

    // Damage reduction
    if (data.traits.dr.length) {
      headers.push({
        header: game.i18n.localize('D35E.DamRed'),
        value: data.traits.dr.split(reSplit),
      });
    }
    // Energy resistance
    if (data.traits.eres.length) {
      headers.push({
        header: game.i18n.localize('D35E.EnRes'),
        value: data.traits.eres.split(reSplit),
      });
    }
    // Damage vulnerabilities
    if (data.traits.dv.value.length || data.traits.dv.custom.length) {
      const value = [].concat(
          data.traits.dv.value.map((obj) => {
            return CONFIG.D35E.damageTypes[obj];
          }),
          data.traits.dv.custom.length > 0
              ? data.traits.dv.custom.split(';')
              : [],
      );
      headers.push({header: game.i18n.localize('D35E.DamVuln'), value: value});
    }
    // Condition resistance
    if (data.traits.cres.length) {
      headers.push({
        header: game.i18n.localize('D35E.ConRes'),
        value: data.traits.cres.split(reSplit),
      });
    }
    // Immunities
    if (
        data.traits.di.value.length ||
        data.traits.di.custom.length ||
        data.traits.ci.value.length ||
        data.traits.ci.custom.length
    ) {
      const value = [].concat(
          data.traits.di.value.map((obj) => {
            return CONFIG.D35E.damageTypes[obj];
          }),
          data.traits.di.custom.length > 0
              ? data.traits.di.custom.split(';')
              : [],
          data.traits.ci.value.map((obj) => {
            return CONFIG.D35E.conditionTypes[obj];
          }),
          data.traits.ci.custom.length > 0
              ? data.traits.ci.custom.split(';')
              : [],
      );
      headers.push(
          {header: game.i18n.localize('D35E.ImmunityPlural'), value: value});
    }
    // Spell Resistance
    if (data.attributes.sr.total > 0) {
      misc.push(game.i18n.localize('D35E.SpellResistanceNote').
          format(data.attributes.sr.total));
    }

    if (misc.length > 0) {
      headers.push({header: game.i18n.localize('D35E.MiscShort'), value: misc});
    }

    return headers;
  }

  getInitiativeContextNotes() {
    const notes = this.getContextNotes('misc.init').reduce((arr, o) => {
      for (const n of o.notes) arr.push(...n.split(/[\n\r]+/));
      return arr;
    }, []);

    let notesHTML;
    if (notes.length > 0) {
      // Format notes if they're present
      const notesHTMLParts = [];
      notes.forEach(
          (note) => notesHTMLParts.push(`<span class="tag">${note}</span>`));
      notesHTML =
          '<div class="flexcol property-group gm-sensitive"><label>' +
          game.i18n.localize('PF1.Notes') +
          '</label> <div class="flexrow">' +
          notesHTMLParts.join('') +
          '</div></div>';
    }

    return [notes, notesHTML];
  }

  async rollInitiative({
    createCombatants = false,
    rerollInitiative = false,
    initiativeOptions = {},
  } = {}) {
    // Obtain (or create) a combat encounter
    let combat = game.combat;
    if (!combat) {
      if (game.user.isGM && canvas.scene) {
        combat = await game.combats.documentClass.create(
            {scene: canvas.scene._id, active: true});
      } else {
        ui.notifications.warn(game.i18n.localize('COMBAT.NoneActive'));
        return null;
      }
    }

    // Create new combatants
    if (createCombatants) {
      const tokens = this.isToken ? [this.token] : this.getActiveTokens();
      const createData = tokens.reduce((arr, t) => {
        if (t.inCombat) return arr;
        arr.push({tokenId: t.id, hidden: t.data.hidden});
        return arr;
      }, []);
      await combat.createEmbeddedDocuments('Combatant', createData);
    }

    // Iterate over combatants to roll for
    const combatantIds = combat.combatants.reduce((arr, c) => {
      if (c.actor?.id !== this.id ||
          (this.isToken && c.data?.tokenId !== this.token.id)) return arr;
      if (c.initiative && !rerollInitiative) return arr;
      arr.push(c.id);
      return arr;
    }, []);

    return combatantIds.length ? combat.rollInitiative(combatantIds,
        initiativeOptions) : combat;
  }

  async rollPowerResistance(spellPenetration, options = {}) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));
    if (game.settings.get('D35E', 'psionicsAreDifferent'))
      await this.rollSpellPowerResistance(spellPenetration, 'pr', options);
    else await this.rollSpellPowerResistance(spellPenetration, 'sr', options);
  }

  async rollSpellResistance(spellPenetration, options = {}) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));
    await this.rollSpellPowerResistance(spellPenetration, 'sr', options);
  }

  async rollSpellPowerResistance(spellPenetration, type, options = {}) {
    const _roll = async function(type, form, props) {
      let spellPenetrationTotal = spellPenetration,
          optionalFeatIds = [],
          optionalFeatRanges = new Map(),
          rollMode = null;
      let resistanceManualBonus = 0;
      // Get data from roll form
      if (form) {
        resistanceManualBonus = form.find('[name="res-bonus"]').val() || 0;

        rollMode = form.find('[name="rollMode"]').val();

        $(form).find('[data-type="optional"]').each(function() {
          if ($(this).prop('checked')) {
            let featId = $(this).attr('data-feat-optional');
            optionalFeatIds.push(featId);
            if ($(form).find(`[name="optional-range-${featId}"]`).val() !==
                undefined)
              optionalFeatRanges.set(featId, {
                base: $(form).
                    find(`[name="optional-range-${featId}"]`)?.
                    val() || 0,
                slider1: $(form).
                    find(`[name="optional-range-1-${featId}"]`)?.
                    val() || 0,
                slider2: $(form).
                    find(`[name="optional-range-2-${featId}"]`)?.
                    val() || 0,
                slider3: $(form).
                    find(`[name="optional-range-3-${featId}"]`)?.
                    val() || 0,
              });
          }
        });
      }

      // Parse combat changes
      let allCombatChanges = [];
      let rollModifiers = [];
      let attackType = 'resistance';
      allCombatChanges = ItemCombatChangesHelper.getAllSelectedCombatChangesForRoll(
          this.items,
          attackType,
          rollData,
          allCombatChanges,
          rollModifiers,
          optionalFeatIds,
          optionalFeatRanges,
      );

      if (rollModifiers.length > 0)
        props.push({
          header: game.i18n.localize('D35E.RollModifiers'),
          value: rollModifiers,
        });

      this._addCombatChangesToRollData(allCombatChanges, rollData);
      rollData.featResistanceBonus = rollData.featResistanceBonus || 0;
      rollData.spellPenetrationTotal = spellPenetrationTotal;
      rollData.resistanceManualBonus = resistanceManualBonus || 0;
      rollData.resistanceTotal =
          this.system.attributes[`${type}`].total + resistanceManualBonus +
          rollData.featResistanceBonus;

      let roll = new Roll35e('1d20 + @spellPenetrationTotal', rollData).roll();

      rollData.rollTotal = roll.total;
      rollData.success = rollData.resistanceTotal > rollData.rollTotal;
      let actions = await this.getAndApplyCombatChangesSpecialActions(
          allCombatChanges,
          this,
          rollData,
          optionalFeatIds,
          optionalFeatRanges,
      );

      const token = this ? this.token : null;

      // Set chat data
      let chatData = {
        speaker: ChatMessage.getSpeaker({actor: this.data}),
        rollMode: rollMode || 'gmroll',
        sound: CONFIG.sounds.dice,
        'flags.D35E.noRollRender': true,
      };
      let chatTemplateData = {
        name: this.name,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        rollMode: rollMode || 'gmroll',
        tokenId: token ? `${token.parent.id}.${token.id}` : null,
        actorId: this.id,
      };
      const templateData = mergeObject(
          chatTemplateData,
          {
            actor: this,
            img: this.img,
            label:
                type === 'sr'
                    ? game.i18n.localize('D35E.SpellResistance')
                    : game.i18n.localize('D35E.PowerResistance'),
            roll: roll,
            total: roll.total,
            result: roll.result,
            target: rollData.resistanceTotal,
            tooltip: $(await roll.getTooltip()).
                prepend(
                    `<div class="dice-formula">${roll.formula}</div>`)[0].outerHTML,
            success: rollData.resistanceTotal > roll.total,
            properties: props,
            hasProperties: props.length > 0,
            actions: actions,
          },
          {inplace: true},
      );
      // Create message

      await createCustomChatMessage(
          'systems/D35E/templates/chat/resistance.html', templateData, chatData,
          {
            rolls: [roll],
          });

      return roll;
    };

    // Add contextual notes
    let notes = [];
    const rollData = duplicate(this.getRollData());
    const noteObjects = this.getContextNotes(`misc.${type}`);
    for (let noteObj of noteObjects) {
      rollData.item = {};
      if (noteObj.item != null) rollData.item = new Item35E(
          noteObj.item.toObject(), {owner: this.isOwner}).toObject();
      await this.enrichAndAddNotes(noteObj, rollData, notes);
    }
    let props = this.getDefenseHeaders();
    if (notes.length > 0) props.push(
        {header: game.i18n.localize('D35E.Notes'), value: notes});
    const label =
        type === 'sr'
            ? game.i18n.localize('D35E.SpellResistance')
            : game.i18n.localize('D35E.PowerResistance');
    rollData.resistanceType = type;

    let template = 'systems/D35E/templates/apps/resistance-roll-dialog.html';
    let dialogData = {
      data: rollData,
      rollMode: options.rollMode
          ? options.rollMode
          : game.settings.get('D35E',
              `rollConfig`).rollConfig[this.type].grapple ||
          game.settings.get('core', 'rollMode'),
      rollModes: CONFIG.Dice.rollModes,
      resFeats: this.combatChangeItems.filter((o) =>
          ItemCombatChangesHelper.canHaveCombatChanges(o, rollData,
              'spellPowerResistance'),
      ),
      resFeatsOptional: this.combatChangeItems.filter((o) =>
          ItemCombatChangesHelper.canHaveCombatChanges(o, rollData,
              `spellPowerResistanceOptional`),
      ),
      label: label,
    };
    const html = await renderTemplate(template, dialogData);
    let roll;
    const buttons = {};
    if (this.system.attributes[`${type}`].total) {
      let wasRolled = false;
      buttons.normal = {
        label: game.i18n.localize('D35E.Roll'),
        callback: (html) => {
          wasRolled = true;
          roll = _roll.call(this, type, html, props);
        },
      };
      return new Promise((resolve) => {
        new Dialog(
            {
              title: `${game.i18n.localize('D35E.ResRollResistance')}`,
              content: html,
              buttons: buttons,
              classes: ['custom-dialog', 'wide'],
              default: 'normal',
              close: (html) => {
                return resolve(roll);
              },
            },
            {
              width: 400,
            },
        ).render(true);
      });
    } else {
      return _roll.call(this, type, null, props);
    }
  }

  async enrichAndAddNotes(noteObj, rollData, notes) {
    for (let note of noteObj.notes) {
      if (!isMinimumCoreVersion('0.5.2')) {
        let noteStr = '';
        if (note.length > 0) {
          noteStr = DicePF.messageRoll({
            data: rollData,
            msgStr: note,
          });
        }
        if (noteStr.length > 0) notes.push(...noteStr.split(/[\n\r]+/));
      } else {
        for (let _note of note.split(/[\n\r]+/)) {
          let enrichedNote = await TextEditor.enrichHTML(
              Item35E._fillTemplate(_note, rollData), {
                rollData: rollData,
              }, {parent: this});
          notes.push(enrichedNote);
        }
      }
    }
  }

  /**
   * Make a saving throw, with optional versus check
   * @param _savingThrow Saving throw data
   * @param ability Saving throw ability
   * @param target target saving throw dc
   * @param options options
   * @returns {Promise<unknown>|void}
   */
  async rollSavingThrow(_savingThrow, ability, target, options = {}) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));
    // This refreshes the source details if actor has not been touched before
    if(!this.sourceDetails) { await this.refresh({stopUpdates: false}); }

    if (_savingThrow === 'fort') _savingThrow = 'fortitudenegates';
    if (_savingThrow === 'ref') _savingThrow = 'reflexnegates';
    if (_savingThrow === 'will') _savingThrow = 'willnegates';

    const _roll = async function(
        saveType, ability, baseAbility, target, form, props, rollMode) {
      let savingThrowBonus = getProperty(this.system,
              `attributes.savingThrows.${saveType}.total`) || 0,
          optionalFeatIds = [],
          optionalFeatRanges = new Map(),
          saveFieldName = `system.attributes.savingThrows.${saveType}.total`;
      savingThrowBonus -= getProperty(this.system,
          `abilities.${baseAbility}.mod`) || 0;
      let savingThrowAbilityBonus = getProperty(this.system,
          `abilities.${ability}.mod`) || 0;
      let savingThrowManualBonus = 0;
      // Get data from roll form
      if (form) {
        rollData.savingThrowBonus = form.find('[name="st-bonus"]').val();
        if (rollData.savingThrowBonus) savingThrowManualBonus += new Roll35e(
            rollData.savingThrowBonus).roll().total;
        rollMode = form.find('[name="rollMode"]').val();

        $(form).find('[data-type="optional"]').each(function() {
          if ($(this).prop('checked')) {
            let featId = $(this).attr('data-feat-optional');
            optionalFeatIds.push(featId);
            if ($(form).find(`[name="optional-range-${featId}"]`).val() !==
                undefined)
              optionalFeatRanges.set(featId, {
                base: $(form).
                    find(`[name="optional-range-${featId}"]`)?.
                    val() || 0,
                slider1: $(form).
                    find(`[name="optional-range-1-${featId}"]`)?.
                    val() || 0,
                slider2: $(form).
                    find(`[name="optional-range-2-${featId}"]`)?.
                    val() || 0,
                slider3: $(form).
                    find(`[name="optional-range-3-${featId}"]`)?.
                    val() || 0,
              });
          }
        });
      }

      // Parse combat changes
      let allCombatChanges = [];
      let rollModifiers = [];
      let attackType = 'savingThrow';
      allCombatChanges = ItemCombatChangesHelper.getAllSelectedCombatChangesForRoll(
          this.items,
          attackType,
          rollData,
          allCombatChanges,
          rollModifiers,
          optionalFeatIds,
          optionalFeatRanges,
      );

      if (rollModifiers.length > 0)
        props.push({
          header: game.i18n.localize('D35E.RollModifiers'),
          value: rollModifiers,
        });

      let savingThrowSourceDetails = this.sourceDetails[saveFieldName] || [];

      this._addCombatChangesToRollData(allCombatChanges, rollData);
      let saveRollFormula = '1d20';
      for (let detail of savingThrowSourceDetails) {
        saveRollFormula += `+ ${detail.value}`;
      }
      if (rollData.featSavingThrowList) {
        for (let [i, bonus] of rollData.featSavingThrowList.entries()) {
          if (typeof bonus['value'] === 'string' || bonus['value'] instanceof
              String)
            bonus['value'] = new Roll35e(bonus['value'], rollData).roll().total;
          saveRollFormula += `+ ${bonus['value']}`;
          bonus['name'] = bonus['sourceName'];
        }
      }
      rollData.savingThrowBonus = savingThrowBonus;
      rollData.savingThrowManualBonus = savingThrowManualBonus;
      rollData.savingThrowAbilityBonus = savingThrowAbilityBonus;

      let roll = new Roll35e(saveRollFormula, rollData).roll();

      let modifiersList = duplicate(savingThrowSourceDetails);
      modifiersList.unshift(
          {value: roll.terms[0].results[0].result, name: 'Skill Roll'});
      if (savingThrowManualBonus) modifiersList.push(
          {value: savingThrowManualBonus, name: 'Situational Modifier'});
      modifiersList.push(...(rollData.featSavingThrowList || []));

      rollData.rollTotal = roll.total;
      rollData.success = target ? roll.total >= target : true;
      let actions = await this.getAndApplyCombatChangesSpecialActions(
          allCombatChanges,
          this,
          rollData,
          optionalFeatIds,
          optionalFeatRanges,
      );
      let tooltip = '';
      for (let descriptionPart of modifiersList) {
        tooltip += `<tr>
                <td><b>${descriptionPart.name}</b></td>
                <td><b>${descriptionPart.value}</b></td>
                </tr>
                `;
      }
      var tooltips = `<div class="dice-formula" style="margin-bottom: 8px">${roll.formula}</div><div class="table-container"><table>${tooltip}</table></div>`;
      let renderedTooltip = $(await roll.getTooltip()).
          prepend(tooltips)[0].outerHTML;
      // Set chat data
      let chatData = {
        speaker: options.speaker ? options.speaker : ChatMessage.getSpeaker(
            {actor: this.data}),
        rollMode: rollMode || 'gmroll',
        sound: CONFIG.sounds.dice,
        'flags.D35E.noRollRender': true,
      };
      let chatTemplateData = {
        name: this.name,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        rollMode: rollMode || 'gmroll',
      };
      const templateData = mergeObject(
          chatTemplateData,
          {
            actor: this,
            img: this.img,
            saveTypeName: game.i18n.localize(
                CONFIG.D35E.savingThrows[saveType]),
            roll: roll,
            total: roll.total,
            result: roll.result,
            target: target,
            tooltip: renderedTooltip,
            success: target && roll.total >= target,
            properties: props,
            hasProperties: props.length > 0,
            actions: actions,
          },
          {inplace: false},
      );
      // Create message

      await createCustomChatMessage(
          'systems/D35E/templates/chat/saving-throw.html', templateData,
          chatData, {
            rolls: [roll],
          });

      return roll;
    };

    let savingThrowId = '';
    let savingThrowAbility = ability;
    let savingThrowBaseAbility = savingThrowAbility;
    if (_savingThrow === 'willnegates' || _savingThrow === 'willhalf' ||
        _savingThrow === 'willpartial') {
      savingThrowId = 'will';
      savingThrowBaseAbility = 'wis';
      if (!savingThrowAbility ||
          savingThrowAbility?.event) savingThrowAbility = 'wis';
      if (savingThrowAbility === '') savingThrowAbility = 'wis';
    } else if (_savingThrow === 'reflexnegates' || _savingThrow ===
        'reflexhalf' || _savingThrow === 'reflexpartial') {
      savingThrowId = 'ref';
      savingThrowBaseAbility = 'dex';
      if (!savingThrowAbility ||
          savingThrowAbility?.event) savingThrowAbility = 'dex';
      if (savingThrowAbility === '') savingThrowAbility = 'dex';
    } else if (
        _savingThrow === 'fortitudenegates' ||
        _savingThrow === 'fortitudehalf' ||
        _savingThrow === 'fortitudepartial'
    ) {
      savingThrowId = 'fort';
      savingThrowBaseAbility = 'con';
      if (!savingThrowAbility ||
          savingThrowAbility?.event) savingThrowAbility = 'con';
      if (savingThrowAbility === '') savingThrowAbility = 'con';
    }
    // Add contextual notes
    let notes = [];
    const rollData = duplicate(this.getRollData());
    const noteObjects = this.getContextNotes(`savingThrow.${savingThrowId}`);
    for (let noteObj of noteObjects) {
      rollData.item = {};
      if (noteObj.item != null) rollData.item = noteObj.item.toObject();

      await this.enrichAndAddNotes(noteObj, rollData, notes);
    }
    let props = this.getDefenseHeaders();
    if (notes.length > 0) props.push(
        {header: game.i18n.localize('D35E.Notes'), value: notes});
    const label = CONFIG.D35E.savingThrows[savingThrowId];
    const savingThrow = this.system.attributes.savingThrows[savingThrowId];
    rollData.savingThrow = savingThrowId;

    let template = 'systems/D35E/templates/apps/saving-throw-roll-dialog.html';
    let dialogData = {
      data: rollData,
      savingThrow: savingThrow,
      id: `${this.id}-${_savingThrow}`,
      rollMode: options.rollMode
          ? options.rollMode
          : game.settings.get('D35E',
              `rollConfig`).rollConfig[this.type].savingThrow ||
          game.settings.get('core', 'rollMode'),
      rollModes: CONFIG.Dice.rollModes,
      stFeats: this.combatChangeItems.filter((o) =>
          ItemCombatChangesHelper.canHaveCombatChanges(o, rollData,
              'savingThrow'),
      ),
      stFeatsOptional: this.combatChangeItems.filter((o) =>
          ItemCombatChangesHelper.canHaveCombatChanges(o, rollData,
              'savingThrowOptional'),
      ),
      label: label,
    };
    const html = await renderTemplate(template, dialogData);
    let roll;
    const buttons = {};
    let wasRolled = false;
    buttons.normal = {
      label: game.i18n.localize('D35E.Roll'),
      callback: (html) => {
        wasRolled = true;
        roll = _roll.call(this, savingThrowId, savingThrowAbility,
            savingThrowBaseAbility, target, html, props);
      },
    };
    return new Promise((resolve) => {
      new Dialog({
        title: `${game.i18n.localize('D35E.STRollSavingThrow')} - ${this.name}`,
        content: html,
        buttons: buttons,
        classes: ['custom-dialog', 'wide'],
        default: 'normal',
        close: (html) => {
          return resolve(roll);
        },
      }).render(true);
    });
  }

  isCombatChangeItemType(o) {
    return (
        o.type === 'feat' ||
        (o.type === 'aura' && o.system.active) ||
        (o.type === 'buff' && o.system.active) ||
        (o.type === 'equipment' && o.system.equipped === true &&
            !o.system.melded && !o.broken)
    );
  }

  /**
   *
   * @param {CombatChange[]} combatChanges
   * @param actor
   * @param rollData
   * @param optionalFeatIds
   * @param optionalFeatRanges
   * @returns {Promise<*[]>}
   */
  async getAndApplyCombatChangesSpecialActions(
      combatChanges, actor, rollData, optionalFeatIds, optionalFeatRanges) {
    let actions = [];
    for (const c of combatChanges) {
      if (c.specialAction && c.specialAction !== '') {
        if (c.specialActionCondition && c.specialActionCondition !== '') {
          if (!new Roll35e(c.specialActionCondition,
              rollData).roll().total) continue;
        }
        await this.addCommandAsSpecial(
            actions,
            c.itemName,
            c.itemImg,
            c.specialAction,
            rollData.rollTotal,
            optionalFeatRanges.get(c.itemId)?.base || 0,
        );
      }
    }
    return actions;
  }

  async addCommandAsSpecial(
      actions, name, img, actionData, roll = 0, range = 0) {
    let _actionData = actionData.replace(/\(@range\)/g, `${range}`).
        replace(/\(@roll\)/g, `${roll}`);

    // If this is self action, run it on the actor on the time of render
    await this.autoApplyActionsOnSelf(_actionData);
    actions.push({
      label: name,
      value: _actionData,
      isTargeted: _actionData.endsWith('target') ||
          _actionData.endsWith('target;'),
      action: 'customAction',
      img: img,
      hasImg: img !== undefined && img !== null && img !== '',
    });
  }

  /**
   * Roll a Skill Check
   * Prompt the user for input regarding Advantage/Disadvantage and any Situational Bonus
   * @param {string} skillId      The skill id (e.g. "ins")
   * @param {Object} options      Options which configure how the skill check is rolled
   */
  async rollSkill(skillId, options = {}) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));

    // This refreshes the source details if actor has not been touched before
    if(!this.sourceDetails) { await this.refresh({stopUpdates: false}); }

    const _roll = async function(
        target, form, props, sklName, skillRollFormula, sourceSkillId,
        rollMode) {
      let optionalFeatIds = [],
          skillModTotal = skl.mod,
          optionalFeatRanges = new Map(),
          rollAbility = skl.ability;
      let skillManualBonus = 0;
      let take20 = false;
      let take10 = false;
      if (skillRollFormula == '20') take20 = true;
      if (skillRollFormula == '10') take10 = true;

      // Get data from roll form
      if (form) {
        skillManualBonus = form.find('[name="sk-bonus"]').val() || 0;

        rollMode = form.find('[name="rollMode"]').val();
        rollAbility = form.find('[name="ability"]').val();

        props.push({
          header: game.i18n.localize('D35E.Ability'),
          value: [CONFIG.D35E.abilities[rollAbility]],
        });

        $(form).find('[data-type="optional"]').each(function() {
          if ($(this).prop('checked')) {
            let featId = $(this).attr('data-feat-optional');
            optionalFeatIds.push(featId);
            if ($(form).find(`[name="optional-range-${featId}"]`).val() !==
                undefined)
              optionalFeatRanges.set(featId, {
                base: $(form).
                    find(`[name="optional-range-${featId}"]`)?.
                    val() || 0,
                slider1: $(form).
                    find(`[name="optional-range-1-${featId}"]`)?.
                    val() || 0,
                slider2: $(form).
                    find(`[name="optional-range-2-${featId}"]`)?.
                    val() || 0,
                slider3: $(form).
                    find(`[name="optional-range-3-${featId}"]`)?.
                    val() || 0,
              });
          }
        });
      }

      // Parse combat changes
      let allCombatChanges = [];
      let rollModifiers = [];
      let attackType = 'skill';
      allCombatChanges = ItemCombatChangesHelper.getAllSelectedCombatChangesForRoll(
          this.items,
          attackType,
          rollData,
          allCombatChanges,
          rollModifiers,
          optionalFeatIds,
          optionalFeatRanges,
      );

      if (rollModifiers.length > 0)
        props.push({
          header: game.i18n.localize('D35E.RollModifiers'),
          value: rollModifiers,
        });
      this._addCombatChangesToRollData(allCombatChanges, rollData);

      rollData.skillModTotal = 0;
      skillRollFormula = skillRollFormula;
      let skillSourceDetails = this.sourceDetails[sourceSkillId] || [];
      if (rollAbility !== skl.ability) {
        // Replace "Abilitiy Modifier" with the correct ability modifier in skillSourceDetails
        // find the ability modifier in skillSourceDetails and replace and change name
        let abilityModIndex = skillSourceDetails.findIndex(
            (o) => o.name === 'Ability Modifier');
        if (abilityModIndex !== -1) {
          skillSourceDetails[abilityModIndex].name = `Ability Modifier (${CONFIG.D35E.abilities[rollAbility]})`;
          skillSourceDetails[abilityModIndex].value = this.system.abilities[rollAbility].mod;
        }
      }
      if (skillManualBonus) {
        skillSourceDetails.push(
            {value: skillManualBonus, name: 'Situational Modifier'});
      }
      for (let skillDetail of skillSourceDetails) {
        skillRollFormula += `+ ${skillDetail.value}`;
      }
      if (rollData.featSkillBonusList) {
        for (let [i, bonus] of rollData.featSkillBonusList.entries()) {
          if (typeof bonus['value'] === 'string' || bonus['value'] instanceof
              String)
            bonus['value'] = new Roll35e(bonus['value'], rollData).roll().total;
          skillRollFormula += `+ ${bonus['value']}`;
          bonus['name'] = bonus['sourceName'];
        }
      }
      rollData.skillManualBonus = skillManualBonus;

      let roll = new Roll35e(skillRollFormula, rollData).roll();

      rollData.rollTotal = roll.total;
      rollData.success = target ? roll.total >= target : true;
      let actions = await this.getAndApplyCombatChangesSpecialActions(
          allCombatChanges,
          this,
          rollData,
          optionalFeatIds,
          optionalFeatRanges,
      );

      let modifiersList = duplicate(skillSourceDetails);
      if (!take20 && !take10) {
        modifiersList.unshift(
            {value: roll.terms[0].results[0].result, name: 'Skill Roll'});
      }
      modifiersList.push(...(rollData.featSkillBonusList || []));

      const token = this ? this.token : null;
      let tooltip = '';
      for (let descriptionPart of modifiersList) {
        tooltip += `<tr>
                <td><b>${descriptionPart.name}</b></td>
                <td><b>${descriptionPart.value}</b></td>
                </tr>
                `;
      }
      var tooltips = `<div class="dice-formula" style="margin-bottom: 8px">${roll.formula}</div><div class="table-container"><table>${tooltip}</table></div>`;
      let rollTooltip = await roll.getTooltip();
      let renderedTooltip = rollTooltip ? $(rollTooltip).
          prepend(tooltips)[0].outerHTML : tooltips;
      // Set chat data
      let chatData = {
        speaker: options.speaker ? options.speaker : ChatMessage.getSpeaker(
            {actor: this.data}),
        rollMode: rollMode || 'gmroll',
        sound: CONFIG.sounds.dice,
        'flags.D35E.noRollRender': true,
      };
      let chatTemplateData = {
        name: this.name,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        rollMode: rollMode || 'gmroll',
        tokenId: token ? `${token.parent.id}.${token.id}` : null,
        actor: this,
      };
      const templateData = mergeObject(
          chatTemplateData,
          {
            revealed: false,
            actions: actions,
            img: this.img,
            roll: roll,
            sklName: sklName,
            total: roll.total,
            result: roll.result,
            skl: skl,
            take20: take20,
            take10: take10,
            tooltip: renderedTooltip,
            success: target && roll.total >= target,
            target: target,
            properties: props,
            hasProperties: props.length > 0,
          },
          {inplace: false},
      );
      // Create message

      await createCustomChatMessage('systems/D35E/templates/chat/skill.html',
          templateData, chatData, {
            rolls: [roll],
          });

      return roll;
    };

    // Generating Skill Name
    let skl, sklName, skillTag, subSkillId;
    const skillParts = skillId.split('.'),
        isSubSkill = (skillParts[1] === 'subSkills' || skillParts[1] ===
            'namedSubSkills') && skillParts.length === 3;
    if (isSubSkill) {
      skillId = skillParts[0];
      if (skillParts[1] === 'namedSubSkills') {

      }
      skl = this.system.skills[skillId][skillParts[1]][skillParts[2]];
      sklName = `${CONFIG.D35E.skills[skillId]} (${skl.name})`;
      skillTag = createTag(skl.name);
      subSkillId = Object.entries(this.system.skills[skillId].subSkills).
          find(([id, skill]) => skill === skl)[0];
    } else {
      skl = this.system.skills[skillId];
      if (skl.name != null) sklName = skl.name;
      else sklName = CONFIG.D35E.skills[skillId];
      skillTag = createTag(sklName);
    }

    // Add contextual notes
    let props = [];
    let notes = [];
    const rollData = duplicate(this.getRollData());
    rollData.skillId = skillId;
    rollData.skillTag = skillTag;
    rollData.subSkillId = subSkillId;
    let contextNoteSkillId = isSubSkill
        ? `skill.${skillId}.subSkills.${subSkillId}`
        : `skill.${skillId}`;
    let sourceChangesSkillId = isSubSkill
        ? `system.skills.${skillId}.subSkills.${subSkillId}.changeBonus`
        : `system.skills.${skillId}.changeBonus`;
    const noteObjects = this.getContextNotes(contextNoteSkillId);
    for (let noteObj of noteObjects) {
      rollData.item = {};
      if (noteObj.item != null) rollData.item = new Item35E(
          noteObj.item.toObject(), {owner: this.isOwner}).getRollData();

      for (let note of noteObj.notes) {
        for (let _note of note.split(/[\n\r]+/)) {
          let enrichedNote = await TextEditor.enrichHTML(
              Item35E._fillTemplate(_note, rollData), {
                rollData: rollData,
              });
          notes.push(enrichedNote);
        }
      }
    }
    if (skl.rt && (skl.points === null || skl.points === 0)) {
      notes.push(game.i18n.localize('D35E.Untrained'));
    }

    if (notes.length > 0) props.push({header: 'Notes', value: notes});

    const label = sklName;
    let template = 'systems/D35E/templates/apps/skill-roll-dialog.html';
    let dialogData = {
      data: rollData,
      config: CONFIG.D35E,
      ability: skl.ability,
      rollMode: options.rollMode
          ? options.rollMode
          : game.settings.get('D35E',
              `rollConfig`).rollConfig[this.type].skill ||
          game.settings.get('core', 'rollMode'),
      rollModes: CONFIG.Dice.rollModes,
      skFeats: this.combatChangeItems.filter(
          (o) => ItemCombatChangesHelper.canHaveCombatChanges(o, rollData,
              'skill')),
      skFeatsOptional: this.combatChangeItems.filter((o) =>
          ItemCombatChangesHelper.canHaveCombatChanges(o, rollData,
              'skillOptional'),
      ),
      label: label,
    };
    const html = await renderTemplate(template, dialogData);
    let roll;
    const buttons = {};
    let wasRolled = false;
    buttons.takeTen = {
      label: game.i18n.localize('D35E.Take10'),
      callback: (html) => {
        wasRolled = true;
        roll = _roll.call(this, options.target, html, props, sklName, '10',
            sourceChangesSkillId, options.rollMode);
      },
    };
    buttons.takeTwenty = {
      label: game.i18n.localize('D35E.Take20'),
      callback: (html) => {
        wasRolled = true;
        roll = _roll.call(this, options.target, html, props, sklName, '20',
            sourceChangesSkillId, options.rollMode);
      },
    };
    buttons.normal = {
      label: game.i18n.localize('D35E.Roll'),
      callback: (html) => {
        wasRolled = true;
        roll = _roll.call(this, options.target, html, props, sklName, '1d20',
            sourceChangesSkillId, options.rollMode);
      },
    };
    return new Promise((resolve) => {
      new Dialog(
          {
            title: sklName + ' - ' + this.name,
            content: html,
            buttons: buttons,
            classes: ['custom-dialog', 'wide'],
            default: 'normal',
            close: (html) => {
              return resolve(roll);
            },
          },
          {
            width: 400,
          },
      ).render(true);
    });
  }

  /**
   * Make a grapple roll, with optional versus check
   * @param target target saving throw dc
   * @param options options
   * @returns {Promise<unknown>|void}
   */
  async rollGrapple(target, options = {}) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));

    const _roll = async function(target, form, props) {
      let grappleModTotal =
              getProperty(this.system, 'attributes.cmb.total') -
              (getProperty(this.system, 'attributes.energyDrain') || 0),
          optionalFeatIds = [],
          optionalFeatRanges = new Map(),
          rollMode = null;
      let grappleManualBonus = 0;
      // Get data from roll form
      if (form) {
        grappleManualBonus = form.find('[name="gr-bonus"]').val() || 0;

        rollMode = form.find('[name="rollMode"]').val();

        $(form).find('[data-type="optional"]').each(function() {
          if ($(this).prop('checked')) {
            let featId = $(this).attr('data-feat-optional');
            optionalFeatIds.push(featId);
            if ($(form).find(`[name="optional-range-${featId}"]`).val() !==
                undefined)
              optionalFeatRanges.set(featId, {
                base: $(form).
                    find(`[name="optional-range-${featId}"]`)?.
                    val() || 0,
                slider1: $(form).
                    find(`[name="optional-range-1-${featId}"]`)?.
                    val() || 0,
                slider2: $(form).
                    find(`[name="optional-range-2-${featId}"]`)?.
                    val() || 0,
                slider3: $(form).
                    find(`[name="optional-range-3-${featId}"]`)?.
                    val() || 0,
              });
          }
        });
      }

      // Parse combat changes
      let allCombatChanges = [];
      let rollModifiers = [];
      let attackType = 'grapple';
      allCombatChanges = ItemCombatChangesHelper.getAllSelectedCombatChangesForRoll(
          this.items,
          attackType,
          rollData,
          allCombatChanges,
          rollModifiers,
          optionalFeatIds,
          optionalFeatRanges,
      );

      if (rollModifiers.length > 0)
        props.push({
          header: game.i18n.localize('D35E.RollModifiers'),
          value: rollModifiers,
        });

      this._addCombatChangesToRollData(allCombatChanges, rollData);
      rollData.featGrappleBonus = rollData.featGrapple || 0;
      rollData.grappleModTotal = grappleModTotal;
      rollData.grappleManualBonus = grappleManualBonus;

      let roll = new Roll35e(
          '1d20 + @grappleModTotal + @grappleManualBonus + @featGrappleBonus',
          rollData).roll();

      let actions = [];
      if (!target) {
        actions.push({
          label: `${game.i18n.localize('D35E.CMB')} ${game.i18n.localize(
              'D35E.Check')}`,
          value: `Grapple ${roll.total} on target;`,
          isTargeted: false,
          action: 'customAction',
          img: '',
          hasImg: false,
        });
      } else if (target && roll.total < target) {
        actions.push({
          label: `${game.i18n.localize('D35E.Begin')} ${game.i18n.localize(
              'D35E.CMB')}`,
          value: `Condition set grappled to true on target;`,
          isTargeted: false,
          action: 'customAction',
          img: '',
          hasImg: false,
        });
      }

      const token = this ? this.token : null;

      // Set chat data
      let chatData = {
        speaker: ChatMessage.getSpeaker({actor: this.data}),
        rollMode: rollMode || 'gmroll',
        sound: CONFIG.sounds.dice,
        'flags.D35E.noRollRender': true,
      };
      let chatTemplateData = {
        name: this.name,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        rollMode: rollMode || 'gmroll',
        tokenId: token ? `${token.parent.id}.${token.id}` : null,
        actorId: this.id,
      };
      const templateData = mergeObject(
          chatTemplateData,
          {
            actor: this,
            img: this.img,
            roll: roll,
            total: roll.total,
            result: roll.result,
            target: target,
            tooltip: $(await roll.getTooltip()).
                prepend(
                    `<div class="dice-formula">${roll.formula}</div>`)[0].outerHTML,
            success: target && roll.total >= target,
            properties: props,
            hasProperties: props.length > 0,
            actions: actions,
          },
          {inplace: true},
      );
      // Create message

      await createCustomChatMessage('systems/D35E/templates/chat/grapple.html',
          templateData, chatData, {
            rolls: [roll],
          });

      return roll;
    };

    // Add contextual notes
    let notes = [];
    const rollData = duplicate(this.getRollData());
    const noteObjects = this.getContextNotes(`misc.cmb`);
    for (let noteObj of noteObjects) {
      rollData.item = {};
      if (noteObj.item != null) rollData.item = noteObj.item.toObject();
      await this.enrichAndAddNotes(noteObj, rollData, notes);
    }
    let props = this.getDefenseHeaders();
    if (notes.length > 0) props.push(
        {header: game.i18n.localize('D35E.Notes'), value: notes});
    const label = game.i18n.localize('D35E.CMB');

    let template = 'systems/D35E/templates/apps/grapple-roll-dialog.html';
    let dialogData = {
      data: rollData,
      rollMode: options.rollMode
          ? options.rollMode
          : game.settings.get('D35E',
              `rollConfig`).rollConfig[this.type].grapple ||
          game.settings.get('core', 'rollMode'),
      rollModes: CONFIG.Dice.rollModes,
      grFeats: this.combatChangeItems.filter((o) =>
          ItemCombatChangesHelper.canHaveCombatChanges(o, rollData, 'grapple'),
      ),
      grFeatsOptional: this.combatChangeItems.filter((o) =>
          ItemCombatChangesHelper.canHaveCombatChanges(o, rollData,
              'grappleOptional'),
      ),
      label: label,
    };
    const html = await renderTemplate(template, dialogData);
    let roll;
    const buttons = {};
    let wasRolled = false;
    buttons.normal = {
      label: game.i18n.localize('D35E.Roll'),
      callback: (html) => {
        wasRolled = true;
        roll = _roll.call(this, target, html, props);
      },
    };
    return new Promise((resolve) => {
      new Dialog(
          {
            title: `${game.i18n.localize('D35E.GRRollGrapple')}`,
            content: html,
            buttons: buttons,
            classes: ['custom-dialog', 'wide'],
            default: 'normal',
            close: (html) => {
              return resolve(roll);
            },
          },
          {
            width: 400,
          },
      ).render(true);
    });
  }

  /**
   *
   * @param {CombatChange[]} allCombatChanges
   * @param rollData
   * @private
   */
  _addCombatChangesToRollData(allCombatChanges, rollData) {
    let changeId = null;
    let changeVal = null;
    allCombatChanges.forEach((change) => {
      if (change.field.indexOf('$') !== -1) {
        changeId = change.field.substr(1);
        changeVal = Item35E._fillTemplate(change.formula, rollData);
        setProperty(rollData, changeId, changeVal);
      } else if (change.field.indexOf('&') !== -1) {
        changeId = change.field.substr(1);
        changeVal = Item35E._fillTemplate(change.formula, rollData);
        setProperty(
            rollData,
            change.field.substr(1),
            (getProperty(rollData, change.field.substr(1)) || '0') + ' + ' +
            changeVal,
        );
      } else {
        changeId = change.field;
        changeVal = parseInt(change.formula || 0);
        setProperty(rollData, change.field,
            (getProperty(rollData, change.field) || 0) + changeVal);
      }
      var listId = changeId.indexOf('.') !== -1 ? `${changeId.replace('.',
          'List.')}` : `${changeId}List`;
      setProperty(
          rollData,
          listId,
          (getProperty(rollData, listId) || []).concat(
              [{value: changeVal, sourceName: change['sourceName']}]),
      );
    });
  }

  /* -------------------------------------------- */

  /**
   * Roll an Ability Test
   * Prompt the user for input regarding Advantage/Disadvantage and any Situational Bonus
   * @param {String} abilityId    The ability ID (e.g. "str")
   * @param {Object} options      Options which configure how ability tests are rolled
   */
  async rollAbilityTest(abilityId, options = {}) {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));

    // Add contextual notes
    let notes = [];
    const rollData = duplicate(this.system);
    const noteObjects = this.getContextNotes(`abilityChecks.${abilityId}`);
    for (let noteObj of noteObjects) {
      rollData.item = {};
      if (noteObj.item != null) rollData.item = noteObj.item.toObject();
      await this.enrichAndAddNotes(noteObj, rollData, notes);
    }

    let props = this.getDefenseHeaders();
    if (notes.length > 0) props.push({header: 'Notes', value: notes});
    const label = CONFIG.D35E.abilities[abilityId];
    const abl = this.system.abilities[abilityId];
    return DicePF.d20Roll({
      event: options.event,
      parts: ['@mod + @checkMod - @drain'],
      data: {
        mod: abl.mod,
        checkMod: abl.checkMod,
        drain: getProperty(this.system, 'attributes.energyDrain') || 0,
      },
      title: game.i18n.localize('D35E.AbilityTest').format(label),
      speaker: ChatMessage.getSpeaker({actor: this}),
      chatTemplate: 'systems/D35E/templates/chat/roll-ext.html',
      chatTemplateData: {hasProperties: props.length > 0, properties: props},
    });
  }

  async rollTurnUndead(name = 'Undead') {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));
    const rollData = duplicate(this.system);
    let turnUndeadHdTotal = this.system.attributes.turnUndeadHdTotal;
    let turnUndeadUses = this.system.attributes.turnUndeadUses;
    if (turnUndeadHdTotal < 1) {
      return ui.notifications.warn(
          game.i18n.localize('D35E.CannotTurnUndead').format(this.name));
    }
    // if (turnUndeadUses < 1) {
    //     return ui.notifications.warn(game.i18n.localize("D35E.CannotTurnUndead").format(this.name));
    // }
    let rolls = [];
    let knowledgeMod = getProperty(this.system, 'skills.kre.rank') > 5 ? 2 : 0;
    let chaMod = this.system.abilities.cha.mod;
    let maxHdResult = new Roll35e('1d20 + @chaMod + @kMod',
        {kMod: knowledgeMod, chaMod: chaMod}).roll();
    rolls.push(maxHdResult);
    let data = {};
    data.actor = this;
    data.name = this.name;
    data.kMod = knowledgeMod;
    data.chaMod = chaMod;
    data.maxHDResult = maxHdResult;
    if (maxHdResult.total > 21) {
      data.maxHD = turnUndeadHdTotal + 4;
      data.diffHD = '+ 4';
    } else if (maxHdResult.total > 18) {
      data.maxHD = turnUndeadHdTotal + 3;
      data.diffHD = '+ 3';
    } else if (maxHdResult.total > 15) {
      data.maxHD = turnUndeadHdTotal + 2;
      data.diffHD = '+ 2';
    } else if (maxHdResult.total > 12) {
      data.maxHD = turnUndeadHdTotal + 1;
      data.diffHD = '+ 1';
    } else if (maxHdResult.total > 9) {
      data.maxHD = turnUndeadHdTotal;
    } else if (maxHdResult.total > 6) {
      data.maxHD = turnUndeadHdTotal - 1;
      data.diffHD = '- 1';
    } else if (maxHdResult.total > 3) {
      data.maxHD = turnUndeadHdTotal - 2;
      data.diffHD = '- 2';
    } else if (maxHdResult.total > 0) {
      data.maxHD = turnUndeadHdTotal - 3;
      data.diffHD = '- 3';
    } else {
      data.maxHD = turnUndeadHdTotal - 4;
      data.diffHD = '- 4';
    }

    {
      let tooltip = $(await maxHdResult.getTooltip()).prepend(
          `<div class="dice-formula">${maxHdResult.formula}</div>`,
      )[0].outerHTML;
      // Alter tooltip
      let tooltipHtml = $(tooltip);
      let totalText = maxHdResult.total.toString();
      tooltipHtml.find('.part-total').text(totalText);
      data.maxHDResult.tooltip = tooltipHtml[0].outerHTML;
    }

    let damageHD = new Roll35e('2d6 + @chaMod + @level',
        {level: turnUndeadHdTotal, chaMod: chaMod}).roll();
    rolls.push(damageHD);
    data.damageHD = damageHD;
    data.undeadName = name;
    {
      let tooltip = $(await damageHD.getTooltip()).
          prepend(
              `<div class="dice-formula">${damageHD.formula}</div>`)[0].outerHTML;
      // Alter tooltip
      let tooltipHtml = $(tooltip);
      let totalText = damageHD.total.toString();
      tooltipHtml.find('.part-total').text(totalText);
      data.damageHD.tooltip = tooltipHtml[0].outerHTML;
    }

    let chatData = {
      speaker: ChatMessage.getSpeaker({actor: this.actor}),
      sound: CONFIG.sounds.dice,
      'flags.D35E.noRollRender': true,
    };

    data.level = turnUndeadHdTotal;

    createCustomChatMessage('systems/D35E/templates/chat/turn-undead.html',
        data, chatData, {rolls: rolls});
    let updateData = {};
    updateData[`system.attributes.turnUndeadUses`] = getProperty(this.system,
        'attributes.turnUndeadUses') - 1;
    this.update(updateData);
  }

  /**
   * Display defenses in chat.
   */
  async displayDefenses() {
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));
    const rollData = duplicate(this.system);

    // Add contextual AC notes
    let acNotes = [];
    if (getProperty(this.system, 'attributes.acNotes')?.length > 0)
      acNotes = this.system.attributes.acNotes.split(/[\n\r]+/);
    const acNoteObjects = this.getContextNotes('misc.ac');
    for (let noteObj of acNoteObjects) {
      rollData.item = {};
      if (noteObj.item != null) rollData.item = noteObj.item.toObject();

      await this.enrichAndAddNotes(noteObj, rollData, acNotes);
    }

    // Add contextual CMD notes
    let cmdNotes = [];
    if (getProperty(this.system, 'attributes.cmdNotes')?.length > 0)
      cmdNotes = this.system.attributes.cmdNotes.split(/[\n\r]+/);
    const cmdNoteObjects = this.getContextNotes('misc.cmd');
    for (let noteObj of cmdNoteObjects) {
      rollData.item = {};
      if (noteObj.item != null) rollData.item = noteObj.item.toObject();

      await this.enrichAndAddNotes(noteObj, rollData, cmdNotes);
    }

    // Add contextual SR notes
    let srNotes = [];
    if (getProperty(this.system, 'attributes.srNotes')?.length > 0)
      srNotes = this.system.attributes.srNotes.split(/[\n\r]+/);
    const srNoteObjects = this.getContextNotes('misc.sr');
    for (let noteObj of srNoteObjects) {
      rollData.item = {};
      if (noteObj.item != null) rollData.item = noteObj.item.toObject();
      await this.enrichAndAddNotes(noteObj, rollData, srNotes);
    }

    // Add misc data
    const reSplit = CONFIG.D35E.re.traitSeparator;
    // Damage Reduction
    let drNotes = [];
    if (getProperty(this.system, 'traits.dr')?.length) {
      drNotes = this.system.traits.dr.split(reSplit);
    }
    // Energy Resistance
    let energyResistance = [];
    if (getProperty(this.system, 'traits.eres')?.length) {
      energyResistance.push(...this.system.traits.eres.split(reSplit));
    }
    // Damage Immunity
    if (getProperty(this.system, 'traits.di.value')?.length ||
        getProperty(this.system, 'traits.di.custom')?.length) {
      const values = [
        ...this.system.traits.di.value.map((obj) => {
          return CONFIG.D35E.damageTypes[obj];
        }),
        ...(getProperty(this.system, 'traits.di.custom')?.length > 0
            ? this.system.traits.di.custom.split(reSplit)
            : []),
      ];
      energyResistance.push(
          ...values.map((o) => game.i18n.localize('D35E.ImmuneTo').format(o)));
    }
    // Damage Vulnerability
    if (getProperty(this.system, 'traits.dv.value')?.length ||
        getProperty(this.system, 'traits.dv.custom')?.length) {
      const values = [
        ...this.system.traits.dv.value.map((obj) => {
          return CONFIG.D35E.damageTypes[obj];
        }),
        ...(getProperty(this.system, 'traits.dv.custom')?.length > 0
            ? this.system.traits.dv.custom.split(reSplit)
            : []),
      ];
      energyResistance.push(...values.map(
          (o) => game.i18n.localize('D35E.VulnerableTo').format(o)));
    }

    // Create message
    const d = this.system;
    const data = {
      actor: this,
      name: this.name,
      tokenId: this.token ? `${this.token.scene._id}.${this.token.id}` : null,
      ac: {
        normal: d.attributes.ac.normal.total,
        touch: d.attributes.ac.touch.total,
        flatFooted: d.attributes.ac.flatFooted.total,
        notes: acNotes,
      },
      cmd: {
        normal: d.attributes.cmd.total,
        flatFooted: d.attributes.cmd.flatFootedTotal,
        notes: cmdNotes,
      },
      misc: {
        sr: d.attributes.sr.total,
        srNotes: srNotes,
        drNotes: drNotes,
        energyResistance: energyResistance,
      },
    };
    // Add regeneration and fast healing
    if (
        (getProperty(d, 'traits.fastHealingTotal') || '')?.length ||
        (getProperty(d, 'traits.regenTotal') || '')?.length
    ) {
      data.regen = {
        regen: d.traits.regenTotal,
        fastHealing: d.traits.fastHealingTotal,
      };
    }
    createCustomChatMessage('systems/D35E/templates/chat/defenses.html', data, {
      speaker: ChatMessage.getSpeaker({actor: this.actor}),
    });
  }

  /* -------------------------------------------- */

  /**
   * Make AC test using Combat Changes bonuses
   * @param ev event
   * @param skipDialog option to ship dialog and use default roll
   * @returns {Promise<unknown>}
   */
  async rollDefenseDialog({
    ev = null,
    skipDialog = false,
    touch = false,
    flatfooted = false,
  } = {}) {
    const _roll = async function(acType, form) {
      let rollModifiers = [];
      let ac = getProperty(this.system, `attributes.ac.${acType}.total`) || 0,
          optionalFeatIds = [],
          optionalFeatRanges = new Map(),
          applyHalf = false,
          noCritical = false,
          applyPrecision = false,
          conceal = false,
          fullConceal = false,
          rollMode = 'gmroll';
      let baseAc = ac;
      // Get form data
      if (form) {
        rollData.acBonus = form.find('[name="ac-bonus"]').val();
        if (rollData.acBonus) ac += new Roll35e(rollData.acBonus).roll().total;

        rollMode = form.find('[name="rollMode"]').val();

        $(form).find('[data-type="optional"]').each(function() {
          if ($(this).prop('checked')) {
            let featId = $(this).attr('data-feat-optional');
            optionalFeatIds.push(featId);
            if ($(form).find(`[name="optional-range-${featId}"]`).val() !==
                undefined)
              optionalFeatRanges.set(featId, {
                base: $(form).
                    find(`[name="optional-range-${featId}"]`)?.
                    val() || 0,
                slider1: $(form).
                    find(`[name="optional-range-1-${featId}"]`)?.
                    val() || 0,
                slider2: $(form).
                    find(`[name="optional-range-2-${featId}"]`)?.
                    val() || 0,
                slider3: $(form).
                    find(`[name="optional-range-3-${featId}"]`)?.
                    val() || 0,
              });
          }
        });

        if (form.find('[name="applyHalf"]').prop('checked')) {
          applyHalf = true;
        }

        if (form.find('[name="noCritical"]').prop('checked')) {
          noCritical = true;
        }
        if (form.find('[name="applyPrecision"]').prop('checked')) {
          applyPrecision = true;
        }
        if (form.find('[name="prone"]').prop('checked')) {
          ac += new Roll35e('-4').roll().total;
          rollModifiers.push(`${game.i18n.localize('D35E.Prone')}`);
        }
        if (form.find('[name="squeezing"]').prop('checked')) {
          ac += new Roll35e('-4').roll().total;
          rollModifiers.push(`${game.i18n.localize('D35E.Squeezing')}`);
        }
        if (form.find('[name="defense"]').prop('checked')) {
          if ((this.system.skills?.tmb?.rank || 0) >= 25) {
            ac += new Roll35e(`4+${Math.floor(
                (this.system.skills?.tmb?.rank - 25) / 10)}`).roll().total;
            rollModifiers.push(`${game.i18n.localize(
                'D35E.Defense')} (Epic ${game.i18n.localize(
                'D35E.SkillTmb')})`);
          } else if ((this.system.skills?.tmb?.rank || 0) >= 5) {
            ac += new Roll35e('+3').roll().total;
            rollModifiers.push(
                `${game.i18n.localize('D35E.Defense')} (${game.i18n.localize(
                    'D35E.SkillTmb')})`);
          } else {
            ac += new Roll35e('+2').roll().total;
            rollModifiers.push(`${game.i18n.localize('D35E.Defense')}`);
          }
        }
        if (form.find('[name="totaldefense"]').prop('checked')) {
          if ((this.system.skills?.tmb?.rank || 0) >= 25) {
            ac += new Roll35e(`8+${2 * Math.floor(
                (this.system.skills?.tmb?.rank - 25) / 10)}`).roll().total;
            rollModifiers.push(
                `${game.i18n.localize(
                    'D35E.TotalDefense')} (Epic ${game.i18n.localize(
                    'D35E.SkillTmb')})`,
            );
          } else if ((this.system.skills?.tmb?.rank || 0) >= 5) {
            ac += new Roll35e('+6').roll().total;
            rollModifiers.push(`${game.i18n.localize(
                'D35E.TotalDefense')} (${game.i18n.localize(
                'D35E.SkillTmb')})`);
          } else {
            ac += new Roll35e('+4').roll().total;
            rollModifiers.push(`${game.i18n.localize('D35E.TotalDefense')}`);
          }
        }
        if (form.find('[name="covered"]').prop('checked')) {
          ac += new Roll35e('+4').roll().total;
          rollModifiers.push(`${game.i18n.localize('D35E.Covered')}`);
        }
        if (form.find('[name="improvcovered"]').prop('checked')) {
          ac += new Roll35e('+8').roll().total;
          rollModifiers.push(`${game.i18n.localize('D35E.ImprovedCover')}`);
        }
        if (form.find('[name="charged"]').prop('checked')) {
          ac += new Roll35e('-2').roll().total;
          rollModifiers.push(`${game.i18n.localize('D35E.Charged')}`);
        }

        if (form.find('[name="conceal"]').prop('checked')) {
          conceal = true;
        }

        if (form.find('[name="fullconceal"]').prop('checked')) {
          fullConceal = true;
        }

        rollData.concealOverride = parseInt(
            form.find('[name="conceal-bonus"]').val());
      }

      let allCombatChanges = [];
      let attackType = 'defense';

      allCombatChanges = ItemCombatChangesHelper.getAllSelectedCombatChangesForRoll(
          this.items,
          attackType,
          rollData,
          allCombatChanges,
          rollModifiers,
          optionalFeatIds,
          optionalFeatRanges,
      );

      this._addCombatChangesToRollData(allCombatChanges, rollData);

      ac += parseInt(rollData.featAC) || 0;
      rollData.featACList = rollData.featACList || [];
      rollData.featACList.unshift(
          {value: baseAc, sourceName: game.i18n.localize('D35E.AC')});
      //LogHelper.log('Final roll AC', ac)
      return {
        ac: ac,
        applyHalf: applyHalf,
        noCritical: noCritical,
        noCheck: acType === 'noCheck',
        rollMode: rollMode,
        applyPrecision: applyPrecision,
        rollModifiers: rollModifiers,
        conceal: conceal,
        fullConceal: fullConceal,
        concealOverride: rollData.concealOverride,
        allCombatChanges: allCombatChanges,
        rollData: rollData,
        optionalFeatIds: optionalFeatIds,
        optionalFeatRanges: optionalFeatRanges,
        acModifiers: rollData.featACList || [],
      };
    };
    let rollData = this.getRollData(null, true);
    // Render modal dialog
    let template = 'systems/D35E/templates/apps/defense-roll-dialog.html';
    let totalBonus = '+4';
    let defenseBonus = '+2';
    if ((this.system.skills?.tmb?.rank || 0) >= 25) {
      totalBonus = `+${8 + 2 *
      Math.floor((this.system.skills?.tmb?.rank - 25) / 10)}`;
      defenseBonus = `+${4 +
      Math.floor((this.system.skills?.tmb?.rank - 25) / 10)}`;
    } else if ((this.system.skills?.tmb?.rank || 0) >= 5) {
      totalBonus = `+6`;
      defenseBonus = `+3`;
    }
    let dialogData = {
      data: rollData,
      item: this.system,
      id: `${this.id}-defensedialog`,
      rollMode:
          game.settings.get('D35E',
              `rollConfig`).rollConfig[this.type].applyDamage ||
          game.settings.get('core', 'rollMode'),
      totalBonus: totalBonus,
      defenseBonus: defenseBonus,
      rollModes: CONFIG.Dice.rollModes,
      applyHalf: ev.applyHalf,
      touch: touch,
      baseConcealment: getProperty(this.system, 'attributes.concealment.total'),
      isAlreadyProne: getProperty(this.system, 'attributes.conditions.prone'),
      baseConcealmentAtLeast20: getProperty(this.system,
          'attributes.concealment.total') > 20,
      baseConcealmentAtLeast50: getProperty(this.system,
          'attributes.concealment.total') > 50,
      defenseFeats: this.combatChangeItems.filter((o) =>
          ItemCombatChangesHelper.canHaveCombatChanges(o, rollData, 'defense'),
      ),
      defenseFeatsOptional: this.combatChangeItems.filter((o) =>
          ItemCombatChangesHelper.canHaveCombatChanges(o, rollData,
              'defenseOptional'),
      ),
      conditionals: getProperty(this.system, 'conditionals'),
    };
    dialogData.hasFeats = dialogData.defenseFeats.length ||
        dialogData.defenseFeatsOptional.length;
    const html = await renderTemplate(template, dialogData);
    let roll;
    const buttons = {};
    let wasRolled = false;
    let defaultButton = 'vsNormal';
    if (touch) {
      buttons.vsTouch = {};
      defaultButton = 'vsTouch';
    }
    buttons.vsNormal = {
      label: game.i18n.localize('D35E.ACVsNormal'),
      callback: (html) => {
        wasRolled = true;
        roll = _roll.call(this, 'normal', html);
      },
    };
    buttons.vsTouch = {
      label: game.i18n.localize('D35E.ACvsTouch'),
      callback: (html) => {
        wasRolled = true;
        roll = _roll.call(this, 'touch', html);
      },
    };
    buttons.vsFlat = {
      label: game.i18n.localize('D35E.ACvsFlat'),
      callback: (html) => {
        wasRolled = true;
        roll = _roll.call(this, 'flatFooted', html);
      },
    };

    buttons.vsNo = {
      label: game.i18n.localize('D35E.ACvsNoCheck'),
      callback: (html) => {
        wasRolled = true;
        roll = _roll.call(this, 'noCheck', html);
      },
    };
    let finalAc = await new Promise((resolve) => {
      new Dialog(
          {
            title: `${game.i18n.localize('D35E.ACRollDefense')}`,
            content: html,
            buttons: buttons,
            classes: ['custom-dialog', 'wide'],
            default: defaultButton,
            close: (html) => {
              return resolve(roll);
            },
          },
          {
            classes: [
              'roll-defense',
              'dialog',
              dialogData.hasFeats ? 'twocolumn' : 'single'],
            width: dialogData.hasFeats ? 800 : 400,
          },
      ).render(true);
    });
    // flex: 400px;
    // margin: 0;
    // margin-bottom: 4px;
    //LogHelper.log('Final dialog AC', finalAc)
    return finalAc || {ac: -1, applyHalf: false, noCritical: false};
  }

  static async applyAbilityDamage(damage, ability, actor = null) {
    let tokensList = [];
    const promises = [];
    if (actor === null) {
      if (game.user.targets.size > 0) tokensList = Array.from(
          game.user.targets);
      else tokensList = canvas.tokens.controlled;
      if (!tokensList.length) {
        ui.notifications.warn(game.i18n.localize('D35E.NoTokensSelected'));
        return;
      }
    } else {
      tokensList.push({actor: actor});
    }

    for (let t of tokensList) {
      let a = t.actor,
          abilityField = `system.abilities.${ability}.damage`,
          abilityDamage = a.system.abilities[ability].damage || 0,
          updateData = {};
      updateData[abilityField] = abilityDamage + damage;
      promises.push(t.actor.update(updateData));
    }
    return Promise.all(promises);
  }

  static async applyAbilityDrain(damage, ability, actor = null) {
    let tokensList = [];
    const promises = [];
    if (actor === null) {
      if (game.user.targets.size > 0) tokensList = Array.from(
          game.user.targets);
      else tokensList = canvas.tokens.controlled;
      if (!tokensList.length) {
        ui.notifications.warn(game.i18n.localize('D35E.NoTokensSelected'));
        return;
      }
    } else {
      tokensList.push({actor: actor});
    }

    for (let t of tokensList) {
      let a = t.actor,
          abilityField = `system.abilities.${ability}.drain`,
          abilityDrain = a.system.abilities[ability].drain || 0,
          updateData = {};
      updateData[abilityField] = abilityDrain + damage;
      promises.push(t.actor.update(updateData));
    }
    return Promise.all(promises);
  }

  async updateDamageReductionPoolItems(itemsToUpdate) {
    //await this.refresh();
    let itemUpdateData = [];
    let itemsEnding = [];
    let itemsOnRound = [];
    let itemsToDelete = [];
    let itemResourcesData = {};
    let deletedOrChanged = false;

    for (let possibleUpdate of itemsToUpdate) {
      let item = this.items.get(possibleUpdate.id);
      let current = item.system.damagePool.current - possibleUpdate.value;
      if (current <= 0 && item.system.damagePool.deleteOnDamagePoolEmpty) {
        itemUpdateData.push({
          item: item,
          data: {'system.damagePool.current': 0, 'system.active': false},
        });
        itemsToDelete.push(possibleUpdate.id);
        deletedOrChanged = true;
      } else {
        if (current <= 0) {
          itemUpdateData.push({
            item: item,
            data: {'system.damagePool.current': 0, 'system.active': false},
          });
          deletedOrChanged = true;
        } else {
          itemUpdateData.push(
              {item: item, data: {'system.damagePool.current': current}});
          deletedOrChanged = true;
        }
      }
    }

    if (itemUpdateData.length > 0) {
      let updatePromises = [];
      for (let updateData of itemUpdateData) {
        updatePromises.push(
            updateData.item.update(updateData.data, {stopUpdates: true}));
      }
      await Promise.all(updatePromises);
    }
    if (itemsToDelete.length > 0) {
      await this.deleteEmbeddedDocuments('Item', itemsToDelete, {});
    }
  }

  static async applyDamage(...args) {
    LogHelper.warn('Deprecated: This method will be removed in D35E 2.5.0');
    return ActorDamageHelper.applyDamage(...args);
  }

  static async applyRegeneration(...args) {
    LogHelper.warn('Deprecated: This method will be removed in D35E 2.5.0');
    return ActorDamageHelper.applyRegeneration(...args);
  }

  async rollSave(type, ability, target, options = {}) {
    this.rollSavingThrow(type, ability, target, options);
  }

  static async _rollSave(type, ability, target, options = {}) {
    let tokensList;
    if (game.user.targets.size > 0) tokensList = Array.from(game.user.targets);
    else tokensList = canvas.tokens.controlled;
    const promises = [];
    if (!tokensList.length) {
      ui.notifications.warn(game.i18n.localize('D35E.NoTokensSelected'));
      return;
    }
    for (let t of tokensList) {
      if (t.actor == null) continue;
      let a = t.actor;
      if (!a.testUserPermission(game.user, 'OWNER')) {
        ui.notifications.warn(
            game.i18n.localize('D35E.ErrorNoActorPermission'));
        continue;
      }
      promises.push(t.actor.rollSavingThrow(type, ability, target, options));
    }
    return Promise.all(promises);
  }

  static async _rollSkill(type, options = {}) {
    let tokensList;
    if (game.user.targets.size > 0) tokensList = Array.from(game.user.targets);
    else tokensList = canvas.tokens.controlled;
    const promises = [];
    if (!tokensList.length) {
      ui.notifications.warn(game.i18n.localize('D35E.NoTokensSelected'));
      return;
    }
    for (let t of tokensList) {
      if (t.actor == null) continue;
      let a = t.actor;
      if (!a.testUserPermission(game.user, 'OWNER')) {
        ui.notifications.warn(
            game.i18n.localize('D35E.ErrorNoActorPermission'));
        continue;
      }
      promises.push(t.actor.rollSkill(type, options));
    }
    return Promise.all(promises);
  }

  static async _rollAbilityCheck(type, options = {}) {
    let tokensList;
    if (game.user.targets.size > 0) tokensList = Array.from(game.user.targets);
    else tokensList = canvas.tokens.controlled;
    const promises = [];
    if (!tokensList.length) {
      ui.notifications.warn(game.i18n.localize('D35E.NoTokensSelected'));
      return;
    }
    for (let t of tokensList) {
      if (t.actor == null) continue;
      let a = t.actor;
      if (!a.testUserPermission(game.user, 'OWNER')) {
        ui.notifications.warn(
            game.i18n.localize('D35E.ErrorNoActorPermission'));
        continue;
      }
      promises.push(t.actor.rollAbility(type, options));
    }
    return Promise.all(promises);
  }
  static async _rollPowerResistance(spellPenetration) {
    let tokensList;
    if (game.user.targets.size > 0) tokensList = Array.from(game.user.targets);
    else tokensList = canvas.tokens.controlled;
    const promises = [];
    if (!tokensList.length) {
      ui.notifications.warn(game.i18n.localize('D35E.NoTokensSelected'));
      return;
    }
    for (let t of tokensList) {
      if (t.actor == null) continue;
      let a = t.actor;
      if (!a.testUserPermission(game.user, 'OWNER')) {
        ui.notifications.warn(
            game.i18n.localize('D35E.ErrorNoActorPermission'));
        continue;
      }
      promises.push(t.actor.rollPowerResistance(spellPenetration, {}));
    }
    return Promise.all(promises);
  }

  static async _rollSpellResistance(spellPenetration) {
    let tokensList;
    if (game.user.targets.size > 0) tokensList = Array.from(game.user.targets);
    else tokensList = canvas.tokens.controlled;
    const promises = [];
    if (!tokensList.length) {
      ui.notifications.warn(game.i18n.localize('D35E.NoTokensSelected'));
      return;
    }
    for (let t of tokensList) {
      if (t.actor == null) continue;
      let a = t.actor;
      if (!a.testUserPermission(game.user, 'OWNER')) {
        ui.notifications.warn(
            game.i18n.localize('D35E.ErrorNoActorPermission'));
        continue;
      }
      promises.push(t.actor.rollSpellResistance(spellPenetration, {}));
    }
    return Promise.all(promises);
  }

  getSkill(key) {
    for (let [k, s] of Object.entries(getProperty(this.system, 'skills'))) {
      if (k === key) return s;
      if (s.subSkills != null) {
        for (let [k2, s2] of Object.entries(s.subSkills)) {
          if (k2 === key) return s2;
        }
      }
    }
    return null;
  }

  get allNotes() {
    let result = [];

    const noteItems = this.items.filter((o) => {
      return o.system.contextNotes != null;
    });

    for (let o of noteItems) {
      if (o.type === 'buff' && !o.system.active) continue;
      if (o.type === 'aura' && !o.system.active) continue;
      if ((o.type === 'equipment' || o.type === 'weapon') &&
          !o.system.equipped) continue;
      if (!o.system.contextNotes || o.system.contextNotes.length ===
          0) continue;
      result.push({notes: o.system.contextNotes, item: o});
    }

    return result;
  }

  /**
   * Generates an array with all the active context-sensitive notes for the given context on this actor.
   * @param {String} context - The context to draw from.
   */
  getContextNotes(context) {
    let result = this.allNotes;

    // Attacks
    if (context.match(/^attacks\.(.+)/)) {
      const key = RegExp.$1;
      for (let note of result) {
        note.notes = note.notes.filter((o) => {
          return o[1] === 'attacks' && o[2] === key;
        }).map((o) => {
          return o[0];
        });
      }

      return result;
    }

    // Skill
    if (context.match(/^skill\.(.+)/)) {
      let skillKey = RegExp.$1;
      if (skillKey.indexOf('.') !== -1) skillKey = skillKey.split('.')[2];
      const skill = this.getSkill(skillKey);
      const ability = skill.ability;
      for (let note of result) {
        note.notes = note.notes.filter((o) => {
          return (
              (o[1] === 'skill' && o[2] === context) ||
              (o[1] === 'skills' &&
                  (o[2] === `${ability}Skills` || o[2] === 'skills'))
          );
        }).map((o) => {
          return o[0];
        });
      }

      if (skill.notes != null && skill.notes !== '') {
        result.push({notes: [skill.notes], item: null});
      }

      return result;
    }

    // Saving throws
    if (context.match(/^savingThrow\.(.+)/)) {
      const saveKey = RegExp.$1;
      for (let note of result) {
        note.notes = note.notes.filter((o) => {
          return o[1] === 'savingThrows' &&
              (o[2] === saveKey || o[2] === 'allSavingThrows');
        }).map((o) => {
          return o[0];
        });
      }

      if (
          getProperty(this.system, 'attributes.saveNotes') != null &&
          getProperty(this.system, 'attributes.saveNotes') !== ''
      ) {
        result.push({notes: [this.system.attributes.saveNotes], item: null});
      }

      return result;
    }

    // Ability checks
    if (context.match(/^abilityChecks\.(.+)/)) {
      const ablKey = RegExp.$1;
      for (let note of result) {
        note.notes = note.notes.filter((o) => {
          return o[1] === 'abilityChecks' &&
              (o[2] === `${ablKey}Checks` || o[2] === 'allChecks');
        }).map((o) => {
          return o[0];
        });
      }

      return result;
    }

    // Misc
    if (context.match(/^misc\.(.+)/)) {
      const miscKey = RegExp.$1;
      for (let note of result) {
        note.notes = note.notes.filter((o) => {
          return o[1] === 'misc' && o[2] === miscKey;
        }).map((o) => {
          return o[0];
        });
      }

      if (
          miscKey === 'cmb' &&
          getProperty(this.system, 'attributes.cmbNotes') != null &&
          getProperty(this.system, 'attributes.cmbNotes') !== ''
      ) {
        result.push({notes: [this.system.attributes.cmbNotes], item: null});
      }

      return result;
    }

    return [];
  }

  async deleteEmbeddedEntity(documentName, data, options = {}) {
    game.D35E.logger.warn(
        'The Document#updateEmbeddedEntity method has been renamed to Document#updateEmbeddedDocuments. Support for the old method name was removed in 0.9.0',
    );
    data = data instanceof Array ? data : [data];
    options.massUpdate = true;
    return this.deleteEmbeddedDocuments(documentName, data, options);
  }

  async createEmbeddedEntity(embeddedName, createData, options = {}) {
    let noArray = false;
    if (!(createData instanceof Array)) {
      createData = [createData];
      noArray = true;
    }
    //LogHelper.log('D35E Create Data', createData)

    let linkedItems = [];
    for (let obj of createData) {
      if (obj?.system?.linkedItems && obj.system.linkedItems.length > 0) {
        const linkUUID = uuidv4();

        for (let data of obj.system.linkedItems) {
          let itemData = null;
          const pack = game.packs.find((p) => p.metadata.id === data.packId);
          const packItem = await pack.getDocument(data.itemId);
          if (packItem != null) {
            itemData = packItem.toObject(false);
            itemData.system.originPack = data.pack;
            itemData.system.originId = packItem.id;
          } else {
            return ui.notifications.warn(
                game.i18n.localize('D35E.LinkedItemMissing'));
          }
          if (itemData) {
            itemData.system.linkSourceId = linkUUID;
            itemData.system.linkSourceName = obj.name;
            itemData.system.linkImported = true;
            linkedItems.push(itemData);
          }
        }

        obj.system.linkId = linkUUID;
      }
    }

    createData.push(...linkedItems);

    for (let obj of createData) {
      try {
        delete obj.effects;
      } catch (e) {
        game.D35E.logger.warn(e);
      }
      // Don't auto-equip transferred items
      if (obj._id != null && ['weapon', 'equipment'].includes(obj.type)) {
        if (obj.document) obj.document.data.update({'system.equipped': false});
        else obj.system.equipped = false;
      }
      // Adjust weight on drop from compendium
      if (
          ['weapon', 'equipment', 'loot'].includes(obj.type) &&
          options.dataType !== 'data' &&
          !obj.system.constantWeight &&
          !options.keepWeight
      ) {
        let newSize = Object.keys(CONFIG.D35E.sizeChart).
            indexOf(getProperty(this.system, 'traits.actualSize'));
        let oldSize = Object.keys(CONFIG.D35E.sizeChart).indexOf('med');
        LogHelper.log('Resize Object', newSize, oldSize);
        let weightChange = Math.pow(2, newSize - oldSize);
        obj.system.weight = obj.system.weight * weightChange;
      }
      if (['weapon', 'equipment', 'loot'].includes(obj.type)) {
        LogHelper.log('Create Object', obj);
        if (obj.system.identifiedName !== obj.name) {
          obj.system.identifiedName = obj.name;
        }
      }
      if (['spell'].includes(obj.type)) {
        if (options.ignoreSpellbookAndLevel) {
        } else if (options.domainSpells) {
          let spellbook = undefined;
          // We try to set spellbook to correct one
          for (let _spellbookKey of Object.keys(
              getProperty(this.system, 'attributes.spells.spellbooks'))) {
            let _spellbook = this.system.attributes.spells.spellbooks[_spellbookKey];
            if (_spellbook.hasSpecialSlot && _spellbook.spellcastingType ===
                'divine') {
              spellbook = _spellbook;
              obj.system.spellbook = _spellbookKey;
            }
          }
          if (spellbook === undefined) {
            obj.system.spellbook = 'primary';
            spellbook = this.system.attributes.spells.spellbooks['primary'];
            ui.notifications.warn(
                `No Spellbook found for spell. Adding to Primary spellbook.`);
          }
        } else {
          let spellbook = this.system.attributes.spells.spellbooks[obj.system.spellbook];
          let foundLevel = false;
          if (!obj.system.spellbook) {
            // We try to set spellbook to correct one
            for (let _spellbookKey of Object.keys(
                getProperty(this.system, 'attributes.spells.spellbooks'))) {
              let _spellbook = this.system.attributes.spells.spellbooks[_spellbookKey];

              let _spellbookClass = this.system.classes[_spellbook.class] || {};
              let spellbookClass = this.system.classes[_spellbook.class]?.name ||
                  'Missing';
              let foundByClass = false;
              if (_spellbookClass.hasSpellbook) {
                let spellId = obj.document
                    ? `${obj.document.pack}.${obj.document._id}`
                    : obj.name;
                if (_spellbookClass.spelllist.has(spellId)) {
                  spellbook = _spellbook;
                  foundByClass = true;
                  foundLevel = true;
                  obj.system.spellbook = _spellbookKey;
                  obj.system.level = _spellbookClass.spelllist.get(
                      spellId).level;
                }
              }
              if (!foundByClass && obj.system.learnedAt !== undefined) {
                for (const learnedAtObj of obj.system.learnedAt.class) {
                  if (learnedAtObj[0].toLowerCase() ===
                      spellbookClass.toLowerCase()) {
                    spellbook = _spellbook;
                    obj.system.spellbook = _spellbookKey;
                  }
                }
              }
            }
            if (spellbook === undefined) {
              obj.system.spellbook = 'primary';
              spellbook = this.system.attributes.spells.spellbooks['primary'];
              ui.notifications.warn(
                  `No Spellbook found for spell. Adding to Primary spellbook.`);
            } else {
            }
          }
          let spellbookClass = this.system.classes[spellbook.class]?.name ||
              'Missing';
          if (this.system.classes[spellbook.class]?.hasSpellbook) {
            let spellId = obj.system
                ? `${obj.system.originPack}.${obj.system.originId}`
                : obj.name;
            if (this.system.classes[spellbook.class].spelllist.has(spellId)) {
              foundLevel = true;
              obj.system.level = this.system.classes[spellbook.class].spelllist.get(
                  spellId).level;
            }
          }
          LogHelper.log(
              'Spellpoints',
              game.settings.get('D35E', 'spellpointCostCustomFormula'),
              game.settings.get('D35E', 'spellpointCostCustomFormula') &&
              game.settings.get('D35E', 'spellpointCostCustomFormula') !== '',
          );
          if (obj.system.learnedAt !== undefined && !foundLevel) {
            obj.system.learnedAt.class.forEach((learnedAtObj) => {
              if (learnedAtObj[0].toLowerCase() ===
                  spellbookClass.toLowerCase()) {
                {
                  obj.system.level = learnedAtObj[1];

                  if (!game.settings.get('D35E', 'noAutoSpellpointsCost')) {
                    if (
                        game.settings.get('D35E',
                            'spellpointCostCustomFormula') &&
                        game.settings.get('D35E',
                            'spellpointCostCustomFormula') !== ''
                    )
                      obj.system.powerPointsCost = new Roll35e(
                          game.settings.get('D35E',
                              'spellpointCostCustomFormula'),
                          {
                            level: parseInt(learnedAtObj[1]),
                          },
                      ).roll().total;
                    else obj.system.powerPointsCost = Math.max(
                        parseInt(learnedAtObj[1]) * 2 - 1, 0);
                  }
                }
                foundLevel = true;
              }
            });
          }
          if (!foundLevel) {
            if (!game.settings.get('D35E', 'noAutoSpellpointsCost')) {
              if (
                  game.settings.get('D35E', 'spellpointCostCustomFormula') &&
                  game.settings.get('D35E', 'spellpointCostCustomFormula') !==
                  ''
              )
                obj.system.powerPointsCost = new Roll35e(
                    game.settings.get('D35E', 'spellpointCostCustomFormula'), {
                      level: parseInt(obj.system.level),
                    }).roll().total;
              else obj.system.powerPointsCost = Math.max(
                  parseInt(obj.system.level) * 2 - 1, 0);
            }
            ui.notifications.warn(
                `Spell added despite not being in a spell list for class.`);
          }
        }
      }
      if (['feat'].includes(obj.type)) {
        if (!obj.system.addedLevel || obj.system.addedLevel === 0) {
          obj.system.addedLevel = this.system.details.level.value;
        }
      }
      if (obj.system?.creationChanges && obj.system.creationChanges.length) {
        for (let creationChange of obj.system.creationChanges) {
          if (creationChange) {
            setProperty(obj.system, creationChange[0],
                new Roll35e(creationChange[1], {}).roll().total);
          }
        }
        setProperty(obj.system, 'creationChanges', []);
      }
    }
    return this.createEmbeddedDocuments(embeddedName, createData, options);
  }

  /**
   * @returns {number} The total amount of currency this actor has, in gold pieces
   */
  mergeCurrency() {
    const carried = getProperty(this.system, 'currency');
    const alt = getProperty(this.system, 'altCurrency');
    const customCurrency = getProperty(this.system, 'customCurrency');
    let baseTotal =
        (carried ? carried.pp * 10 + carried.gp + carried.sp / 10 + carried.cp /
            100 : 0) +
        (alt ? alt.pp * 10 + alt.gp + alt.sp / 10 + alt.cp / 100 : 0);
    let currencyConfig = game.settings.get('D35E', 'currencyConfig');
    for (let currency of currencyConfig.currency) {
      if (customCurrency) baseTotal += (customCurrency[currency[0]] || 0) *
          (currency[3] || 0);
    }
    return baseTotal;
  }

  /**
   * Import a new owned Item from a compendium collection
   * The imported Item is then added to the Actor as an owned item.
   *
   * @param collection {String}     The name of the pack from which to import
   * @param entryId {String}        The ID of the compendium entry to import
   */
  importItemFromCollection(collection, entryId) {
    const pack = game.packs.find((p) => p.metadata.id === collection);
    if (pack.metadata.entity !== 'Item') return;

    return pack.getDocument(entryId).then((ent) => {
      //LogHelper.log(`${vtt} | Importing Item ${ent.name} from ${collection}`);

      let data = ent.data.toObject();
      if (this.sheet != null && this.sheet.rendered) {
        data = mergeObject(data, this.sheet.getDropData(data));
      }
      delete data._id;
      return this.createOwnedItem(data);
    });
  }

  /**
   * Import a new owned Item from a compendium collection
   * The imported Item is then added to the Actor as an owned item.
   *
   * @param collection {String}     The name of the pack from which to import
   * @param name {String}        The name of the compendium entry to import
   */
  async importItemFromCollectionByName(collection, name, unique = false) {
    const pack = game.packs.find((p) => p.metadata.id === collection);
    if (!pack) {
      ui.notifications.error(
          game.i18n.localize('D35E.NoPackFound') + ' ' + collection);
      return;
    }
    if (pack.metadata.type !== 'Item') return;
    await pack.getIndex();
    const entry = pack.index.find((e) => getOriginalNameIfExists(e) === name);
    if (!entry) {
      ui.notifications.error(
          game.i18n.localize('D35E.NoItemFound') + ' ' + collection);
      return;
    }
    return pack.getDocument(entry._id).then((ent) => {
      if (unique) {
        if (this.items.filter(
            (o) => getOriginalNameIfExists(o) === name && o.type ===
                ent.type).length > 0)
          return undefined;
      }
      //LogHelper.log(`${vtt} | Importing Item ${ent.name} from ${collection}`);

      let data = ent.toObject();
      delete data._id;
      return data;
    });
  }

  getRollData(data = null, force = false) {
    if (data != null) {
      const result = mergeObject(
          data,
          {
            size: Object.keys(CONFIG.D35E.sizeChart).
                indexOf(getProperty(data, 'traits.actualSize')) - 4,
            uuid: this.uuid,
          },
          {inplace: false},
      );
      return result;
    } else {
      if (!this._cachedRollData || force) {
        data = this.system;
        const result = mergeObject(
            data,
            {
              size: Object.keys(CONFIG.D35E.sizeChart).
                  indexOf(getProperty(data, 'traits.actualSize')) - 4,
              uuid: this.uuid,
            },
            {inplace: false},
        );
        this._cachedRollData = result;
      }
      return this._cachedRollData;
    }
  }

  async autoApplyActionsOnSelf(actions, originatingAttackId = null) {
    LogHelper.log('AUTO APPLY ACTION ON SELF', this.name);
    await this.applyActionOnSelf(actions, this, null, 'self', originatingAttackId);
  }

  static applyAction(actions, actor) {
    LogHelper.log('APPLY ACTION ON ACTOR');
    const promises = [];
    let tokensList;
    if (game.user.targets.size > 0) tokensList = game.user.targets;
    else tokensList = canvas.tokens.controlled;
    for (let t of tokensList) {
      promises.push(t.actor.applyActionOnSelf(actions, actor, null, 'target'));
    }
    return Promise.all(promises);
  }

  async applySingleAction(
      action,
      itemUpdates,
      itemsToCreate,
      actorUpdates,
      actionRollData,
      sourceActor,
      itemsToDelete,
  ) {
    function cleanParam(parameter) {
      return parameter.replace(/"/gi, '');
    }

    function isActionRollable(_action) {
      if (_action.indexOf('://') !== -1) return false;
      return (
          /^(.*?[0-9]d[0-9]+.*?)$/.test(_action) ||
          _action.indexOf('max(') !== -1 ||
          _action.indexOf('min(') !== -1 ||
          _action.indexOf('+') !== -1 ||
          _action.indexOf(',') !== -1 ||
          _action.indexOf('@') !== -1
      );
    }

    LogHelper.log('ACTION', action);
    switch (action.action) {
      case 'TurnUndead':
        await this.rollTurnUndead(cleanParam(action.parameters[0]));
        break;
      case 'Create':
      case 'Give':
        if (action.parameters.length === 1) {
          // Create from default compendiums
        } else if (action.parameters.length === 3) {
          if (action.parameters[1] === 'from') {
            itemsToCreate.push(
                await this.importItemFromCollectionByName(
                    cleanParam(action.parameters[2]),
                    cleanParam(action.parameters[0]),
                ),
            );
          } else {
            ui.notifications.error(
                game.i18n.format('D35E.ErrorActionFormula', {
                  action: action.originalAction,
                  error: game.i18n.localize(
                      'D35E.ErrorActionNotTargetDoesNotExist'),
                }),
            );
          }
        } else if (action.parameters.length === 4) {
          if (action.parameters[2] === 'from' &&
              (action.parameters[0] === 'unique' || action.parameters[0] ===
                  'u')) {
            let itemToCreate = await this.importItemFromCollectionByName(
                cleanParam(action.parameters[3]),
                cleanParam(action.parameters[1]),
                true,
            );
            if (itemToCreate) itemsToCreate.push(itemToCreate);
          } else {
            ui.notifications.error(
                game.i18n.format('D35E.ErrorActionFormula', {
                  action: action.originalAction,
                  error: game.i18n.localize('D35E.ErrorActionWrongSyntax'),
                }),
            );
          }
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'Activate':
        if (action.parameters.length === 1) {
          let name = cleanParam(action.parameters[0]);
          let items = this.items.filter(
              (o) => getOriginalNameIfExists(o) === name);
          if (items.length > 0) {
            const item = items[0];
            if (item.type === 'buff' || item.type === 'aura') {
              await item.update({'system.active': true});
            } else {
              await item.use({skipDialog: true});
            }
          }
        } else if (action.parameters.length === 2) {
          let name = cleanParam(action.parameters[1]);
          let type = cleanParam(action.parameters[0]);
          let items = this.items.filter(
              (o) => o.name === name && o.type === type);
          if (items.length > 0) {
            const item = items[0];
            if (item.type === 'buff' || item.type === 'aura') {
              await item.update({'system.active': true});
            } else {
              await item.use({skipDialog: true});
            }
          }
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'Deactivate':
        if (action.parameters.length === 1) {
          let name = cleanParam(action.parameters[0]);
          let items = this.items.filter(
              (o) => getOriginalNameIfExists(o) === name);
          if (items.length > 0) {
            const item = items[0];
            if (item.type === 'buff' || item.type === 'aura') {
              await item.update({'system.active': false});
            }
          }
        } else if (action.parameters.length === 2) {
          let name = cleanParam(action.parameters[1]);
          let type = cleanParam(action.parameters[0]);
          let items = this.items.filter(
              (o) => getOriginalNameIfExists(o) === name && o.type === type);
          if (items.length > 0) {
            const item = items[0];
            if (item.type === 'buff' || item.type === 'aura') {
              await item.update({'system.active': false});
            }
          }
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'Set':
        // Set "Sneak Attack" field data.level to (@class.rogue.level) on self
        if (action.parameters.length === 5 && action.parameters[1] ===
            'field' && action.parameters[3] === 'to') {
          let name = cleanParam(action.parameters[0]);

          let items = this.items.filter(
              (o) => getOriginalNameIfExists(o) === name);
          if (items.length > 0) {
            const item = items[0];
            let updateObject = {};

            updateObject['_id'] = item.id;
            if (action.parameters[4] === 'true' || action.parameters[4] ===
                'false') {
              updateObject[action.parameters[2]] = action.parameters[4] ===
                  'true';
            } else {
              if (isActionRollable(action.parameters[4])) {
                updateObject[action.parameters[2]] = new Roll35e(
                    action.parameters[4], actionRollData).roll().total;
              } else {
                // Remove starting and ending " from the param
                if (action.parameters[4].startsWith('"') &&
                    action.parameters[4].endsWith('"')) {
                  action.parameters[4] = action.parameters[4].substring(1,
                      action.parameters[4].length - 1);
                }
                updateObject[action.parameters[2]] = action.parameters[4];
              }
            }

            itemUpdates.push(updateObject);
          }
        }
        // Set attack * field data.melded to true on self
        else if (action.parameters.length === 6 && action.parameters[2] ===
            'field' &&
            (action.parameters[4] === 'to' || action.parameters[4] ===
                'exact')) {
          let type = cleanParam(action.parameters[0]);
          let subtype = null;
          if (type.indexOf(':') !== -1) {
            subtype = type.split(':')[1];
            type = type.split(':')[0];
          }
          let name = cleanParam(action.parameters[1]);

          let items = this.items.filter(
              (o) => (getOriginalNameIfExists(o) === name || name === '*') &&
                  o.type === type,
          );
          if (items.length > 0) {
            if (name === '*') {
              for (let item of items) {
                if (type === 'attack' && subtype !== null) {
                  if (item.system.attackType !== subtype) continue;
                }
                let updateObject = {};
                updateObject['_id'] = item.id;
                if (action.parameters[5] === 'true' || action.parameters[5] ===
                    'false') {
                  updateObject[action.parameters[3]] = action.parameters[5] ===
                      'true';
                } else {
                  if (isActionRollable(action.parameters[5]) &&
                      action.parameters[4] !== 'exact') {
                    updateObject[action.parameters[3]] = new Roll35e(
                        action.parameters[5], actionRollData).roll().total;
                  } else {
                    // Remove starting and ending " from the param
                    if (action.parameters[5].startsWith('"') &&
                        action.parameters[5].endsWith('"')) {
                      action.parameters[5] = action.parameters[5].substring(1,
                          action.parameters[5].length - 1);
                    }
                    updateObject[action.parameters[3]] = action.parameters[5];
                  }
                }
                itemUpdates.push(updateObject);
              }
            } else {
              const item = items[0];
              let updateObject = {};
              updateObject['_id'] = item.id;
              if (action.parameters[5] === 'true' || action.parameters[5] ===
                  'false') {
                updateObject[action.parameters[3]] = action.parameters[5] ===
                    'true';
              } else {
                if (isActionRollable(action.parameters[5]) &&
                    action.parameters[4] !== 'exact') {
                  updateObject[action.parameters[3]] = new Roll35e(
                      action.parameters[5], actionRollData).roll().total;
                } else {
                  // Remove starting and ending " from the param
                  if (action.parameters[5].startsWith('"') &&
                      action.parameters[5].endsWith('"')) {
                    action.parameters[5] = action.parameters[5].substring(1,
                        action.parameters[5].length - 1);
                  }
                  updateObject[action.parameters[3]] = action.parameters[5];
                }
              }
              itemUpdates.push(updateObject);
            }
          }
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'Condition':
        // Condition set *name* to *value*
        if (action.parameters.length === 4 && action.parameters[0] === 'set' &&
            action.parameters[2] === 'to') {
          let name = cleanParam(action.parameters[1]);
          let value = cleanParam(action.parameters[3]);
          actorUpdates[`system.attributes.conditions.${name}`] = value ===
              'true';
        }
        // Condition toggle *name*
        else if (action.parameters.length === 2 && action.parameters[0] ===
            'toggle') {
          let name = cleanParam(action.parameters[1]);
          actorUpdates[`system.attributes.conditions.${name}`] = !getProperty(
              this.system,
              `attributes.conditions.${name}`,
          );
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'Trait':
        // Condition set *name* to *value*
        if (action.parameters.length === 5 && action.parameters[0] === 'set' &&
            action.parameters[3] === 'to') {
          let traitGroup = cleanParam(action.parameters[1]);
          let name = cleanParam(action.parameters[2]);
          let value = cleanParam(action.parameters[4]);
          let currentTraits = duplicate(
              actionRollData.self.traits[traitGroup].value);
          if (value === 'true') {
            if (currentTraits.indexOf(name) === -1) {
              currentTraits.push(name);
            }
          } else {
            var index = currentTraits.indexOf(name);
            if (index !== -1) {
              currentTraits.splice(index, 1);
            }
          }
          actorUpdates[`system.traits.${traitGroup}.value`] = currentTraits;
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;

      case 'Update':
        // Update set *field* to *value*
        if (action.parameters.length === 4 && action.parameters[0] === 'set' &&
            action.parameters[2] === 'to') {
          let field = cleanParam(action.parameters[1]);
          let value = cleanParam(action.parameters[3]);

          if (isActionRollable(value)) {
            actorUpdates[`${field}`] = new Roll35e(cleanParam(value),
                actionRollData).roll().total;
          } else {
            actorUpdates[`${field}`] = value;
          }
        } else if (action.parameters.length === 4 && action.parameters[0] ===
            'add' && action.parameters[2] === 'to') {
          let field = cleanParam(action.parameters[1]);
          let value = cleanParam(action.parameters[3]);

          if (isActionRollable(value)) {
            actorUpdates[`${field}`] =
                parseInt(getProperty(actionRollData,
                    field.replace('data', 'self')) || 0) +
                new Roll35e(cleanParam(value), actionRollData).roll().total;
          } else {
            actorUpdates[`${field}`] =
                parseInt(getProperty(actionRollData,
                    field.replace('data', 'self')) || 0) + parseInt(value);
          }
        } else if (
            action.parameters.length === 4 &&
            action.parameters[0] === 'subtract' &&
            action.parameters[2] === 'to'
        ) {
          let field = cleanParam(action.parameters[1]);
          let value = cleanParam(action.parameters[3]);

          if (isActionRollable(value)) {
            actorUpdates[`${field}`] =
                (getProperty(actionRollData, field.replace('data', 'self')) ||
                    0) -
                new Roll35e(cleanParam(value), actionRollData).roll().total;
          } else {
            actorUpdates[`${field}`] = (getProperty(actionRollData,
                field.replace('data', 'self')) || 0) - value;
          }
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'Damage':
        // Rolls arbitrary attack
        //LogHelper.log(action)
        if (action.parameters.length === 2) {
          let damage = new Roll35e(cleanParam(action.parameters[1]),
              actionRollData).roll();
          damage.damageTypeUid = ActorDamageHelper.mapDamageType(
              action.parameters[0]);
          let damageType = cleanParam(action.parameters[0]);
          let damageName = ActorDamageHelper.nameByType(
              cleanParam(action.parameters[0]));
          let damageIcon = ActorDamageHelper.getDamageIcon(
              cleanParam(action.parameters[0]));
          let name = action.name;
          let chatTemplateData = {
            name: sourceActor.name,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            rollMode: 'public',
          };
          let tooltip = $(await damage.getTooltip()).
              prepend(
                  `<div class="dice-formula">${damage.formula}</div>`);
          if (tooltip.length == 0) {
            tooltip = $('<div class="dice-tooltip dmg-tooltip"></div>');
          } else {
            tooltip[0].outerHTML;
          }
          const templateData = mergeObject(
              chatTemplateData,
              {
                flavor: `<img src="systems/D35E/icons/damage-type/${damageIcon}.svg" title="${
                    damageName
                }" class="dmg-type-icon" /> ${damageName}`,
                total: damage.total,
                action: `applyDamage`,
                actor: sourceActor,
                attacker: sourceActor._id,
                json: JSON.stringify(
                    [{roll: damage, damageTypeUid: damage.damageTypeUid}]),
                tooltip: tooltip,
              },
              {inplace: false},
          );
          // Create message
          await createCustomChatMessage(
              'systems/D35E/templates/chat/simple-attack-roll.html',
              templateData,
              {},
              damage,
          );
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
        // These actions directly roll and apply damage to targets
      case 'ApplyDamage':
      case 'SelfDamage':
        if (action.parameters.length === 1) {
          // Check if there is [] in the damage formula
          if (action.parameters[0].indexOf('[') !== -1) {
            // We got the damage in format 1d6+2[fire]+2d8[acid], so we need to parse it and build damage array
            let damageArray = [];
            let damageString = action.parameters[0];
            let damageRegex = /(\d+d\d+)(\+\d+)?(\[(\w+)\])?/g;
            let match = damageRegex.exec(damageString);
            while (match != null) {
              let damage = {
                roll: match[1],
                damageTypeUid: ActorDamageHelper.mapDamageType(match[4]),
              };
              if (match[2]) {
                damage.roll += match[2];
              }
              damageArray.push(damage);
              match = damageRegex.exec(damageString);
            }
            ActorDamageHelper.applyDamage(
                null,
                ActorPF.SPELL_AUTO_HIT,
                null,
                null,
                null,
                null,
                null,
                damageArray,
                null,
                null,
                null,
                null,
                false,
                false,
                this,
                this.id,
            );
          } else {
            let damage = new Roll35e(cleanParam(action.parameters[0]),
                actionRollData).roll().total;
            ActorDamageHelper.applyDamage(
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                damage,
                null,
                null,
                null,
                null,
                false,
                true,
                this,
            );
          }
        } else if (action.parameters.length === 2) {
          let damageRoll = new Roll35e(cleanParam(action.parameters[0]),
              actionRollData).roll();
          let damage = [
            {
              damageTypeUid: ActorDamageHelper.mapDamageType(
                  action.parameters[1]), roll: damageRoll,
            }];

          ActorDamageHelper.applyDamage(
              null,
              ActorPF.SPELL_AUTO_HIT,
              null,
              null,
              null,
              null,
              null,
              damage,
              null,
              null,
              null,
              null,
              false,
              false,
              this,
              this.id,
          );
        } else ui.notifications.error(
            game.i18n.format('D35E.ErrorActionFormula'));
        break;

      case 'Grapple':
        // Rolls arbitrary attack
        if (action.parameters.length === 1) {
          this.rollGrapple(cleanParam(action.parameters[0]));
        } else this.rollGrapple();
        break;
      case 'AbilityDamage':
        // Rolls arbitrary attack
        //LogHelper.log(action)
        if (action.parameters.length === 2) {
          let damage = new Roll35e(cleanParam(action.parameters[1]),
              actionRollData).roll();
          let damageTotal = damage.total;
          let abilityField = `system.abilities.${action.parameters[0]}.damage`,
              abilityDamage = actionRollData.self.abilities[action.parameters[0]].damage ||
                  0;
          actorUpdates[abilityField] = Math.max(0, abilityDamage + damageTotal);

          let name = `Ability Damage ${CONFIG.D35E.abilities[action.parameters[0]]}`;
          let chatTemplateData = {
            name: sourceActor.name,
            img: sourceActor.img,
            targetName: this.name,
            targetImg: this.img,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            rollMode: 'public',
          };
          const templateData = mergeObject(
              chatTemplateData,
              {
                flavor: name,
                total: damage.total,
                tooltip: $(await damage.getTooltip()).
                    prepend(
                        `<div class="dice-formula">${damage.formula}</div>`)[0].outerHTML,
              },
              {inplace: false},
          );

          await createCustomChatMessage(
              'systems/D35E/templates/chat/special-actions-applied.html',
              templateData,
              {},
              damage,
          );
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'AbilityDrain':
        // Rolls arbitrary attack
        //LogHelper.log(action)
        if (action.parameters.length === 2) {
          let damage = new Roll35e(cleanParam(action.parameters[1]),
              actionRollData).roll();
          let damageTotal = damage.total;
          let abilityField = `system.abilities.${action.parameters[0]}.drain`,
              abilityDamage = actionRollData.self.abilities[action.parameters[0]].drain ||
                  0;
          actorUpdates[abilityField] = Math.max(0, abilityDamage + damageTotal);

          let name = `Ability Drain ${CONFIG.D35E.abilities[action.parameters[0]]}`;
          let chatTemplateData = {
            name: sourceActor.name,
            img: sourceActor.img,
            targetName: this.name,
            targetImg: this.img,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            rollMode: 'public',
          };
          const templateData = mergeObject(
              chatTemplateData,
              {
                flavor: name,
                total: damage.total,
                tooltip: $(await damage.getTooltip()).
                    prepend(
                        `<div class="dice-formula">${damage.formula}</div>`)[0].outerHTML,
              },
              {inplace: false},
          );

          await createCustomChatMessage(
              'systems/D35E/templates/chat/special-actions-applied.html',
              templateData,
              {},
              damage,
          );
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'Regenerate':
        // Rolls arbitrary attack
        //LogHelper.log(action)
        if (action.parameters.length === 1) {
          let damage = new Roll35e(cleanParam(action.parameters[0]),
              actionRollData).roll().total;
          ActorDamageHelper.applyRegeneration(damage, this);
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'Clear':
        if (action.parameters.length === 1) {
          // Clear all items of type
        }
        if (action.parameters.length === 2) {
          // Clear all items of type and subtype
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'Use':
        if (action.parameters.length === 1) {
          let item = this.getItemByTag(action.parameters[0]);
          if (item) item.use = {ev: {}, skipDialog: true};
        }
        if (action.parameters.length === 2) {
          // Use n items/action
        } else ui.notifications.error(
            game.i18n.format('D35E.ErrorActionFormula'));
        break;

      case 'Remove':
        if (action.parameters.length === 2) {
          if (action.parameters[1].indexOf('"') !== -1) {
            let name = cleanParam(action.parameters[1]);
            let type = cleanParam(action.parameters[0]);
            this.items.filter(
                (o) => (getOriginalNameIfExists(o) === name || name === '*') &&
                    o.type === type).forEach((i) => itemsToDelete.push(i.id));
          } else {
            let item = null;
            item = this.getItemByTagAndType(action.parameters[1],
                action.parameters[0]);
            if (item !== null) itemsToDelete.push(item.id);
            else
              ui.notifications.error(
                  game.i18n.format('D35E.ErrorActionFormula', {
                    action: action.originalAction,
                    error: game.i18n.localize('D35E.ErrorItemNotFound'),
                  }),
              );
          }
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'Roll':
        if (action.parameters.length === 2) {
          return DicePF.d20Roll({
            parts: action.parameters[1],
            data: this.getRollData(),
            title: cleanParam(action.parameters[0]),
            speaker: ChatMessage.getSpeaker({actor: this}),
            chatTemplate: 'systems/D35E/templates/chat/roll-ext.html',
            chatTemplateData: {hasProperties: false},
          });
        } else if (action.parameters.length === 1) {
          return DicePF.d20Roll({
            parts: action.parameters[0],
            data: this.getRollData(),
            title: 'Roll',
            speaker: ChatMessage.getSpeaker({actor: this}),
            chatTemplate: 'systems/D35E/templates/chat/roll-ext.html',
            chatTemplateData: {hasProperties: false},
          });
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'RunMacro':
        // Executes a macro defined on MacroDirectory
        //LogHelper.log(action)
        if (action.parameters.length === 1) {
          let macroToRun = MacroDirectory.collection.find(
              (x) => x.data.name === cleanParam(action.parameters[0]));
          if (!macroToRun) {
            ui.notifications.error(
                game.i18n.format('D35E.ErrorActionFormula', {
                  action: action.originalAction,
                  error: game.i18n.localize(
                      'D35E.ErrorActionNotTargetDoesNotExist'),
                }),
            );
            return;
          }
          await macroToRun.execute({ actionRollData });
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'RollTable':
        // Executes a macro defined on MacroDirectory
        //LogHelper.log(action)
        if (action.parameters.length === 1) {
          let rollTable = RollTableDirectory.collection.find(
              (x) => x.data.name === cleanParam(action.parameters[0]));
          if (!rollTable) {
            ui.notifications.error(
                game.i18n.format('D35E.ErrorActionFormula', {
                  action: action.originalAction,
                  error: game.i18n.localize(
                      'D35E.ErrorActionNotTargetDoesNotExist'),
                }),
            );
            return;
          }
          await rollTable.draw();
        }
        if (action.parameters.length === 2) {
          let rollTableId = await game.packs.get(action.parameters[0]).
              index.
              find((x) => x.name === cleanParam(action.parameters[1]));
          if (!rollTableId) {
            ui.notifications.error(
                game.i18n.format('D35E.ErrorActionFormula', {
                  action: action.originalAction,
                  error: game.i18n.localize(
                      'D35E.ErrorActionNotTargetDoesNotExist'),
                }),
            );
            return;
          }
          let rollTable = await game.packs.get(action.parameters[0]).
              getDocument(rollTableId._id);
          if (!rollTable) {
            ui.notifications.error(
                game.i18n.format('D35E.ErrorActionFormula', {
                  action: action.originalAction,
                  error: game.i18n.localize(
                      'D35E.ErrorActionNotTargetDoesNotExist'),
                }),
            );
            return;
          }
          await rollTable.draw();
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      case 'Eval':
        await this.executeEvalOnSelf(action);
        break;
      case 'Message':
        // Rolls arbitrary attack
        //LogHelper.log(action)
        if (action.parameters.length > 1) {

          let messageType = action.parameters.shift();
          //try to check if the rest of the parameters are not a JSON object
          let message = action.parameters.join(' ');
          let messageData = null;
          try {
            messageData = JSON.parse(message);
          } catch (e) {
            messageData = {
              text: message,
            };
          }
          let chatTemplateData = {
            name: this.name,
            actor: this,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            rollMode: cleanParam(messageType),
            text: messageData.text,
            secretText: messageData.secretText || null,
          };
          let chatData = {
            rollMode: cleanParam(messageType),
          };
          // Create message
          await createCustomChatMessage(
              'systems/D35E/templates/chat/gm-message.html', chatTemplateData,
              chatData, {});
        } else
          ui.notifications.error(
              game.i18n.format('D35E.ErrorActionFormula', {
                action: action.originalAction,
                error: game.i18n.localize('D35E.ErrorActionNotEnoughParams'),
              }),
          );
        break;
      default:
        break;
    }
  }

  async applyActionOnSelf(actions, actor, buff = null, target = 'self', originatingAttackId = null) {
    if (!actions) return;
    if (!this.testUserPermission(game.user, 'OWNER'))
      return ui.notifications.warn(
          game.i18n.localize('D35E.ErrorNoActorPermission'));

    let itemCreationActions = [];
    let itemRemoveActions = [];
    let itemUpdateActions = [];
    let actorUpdateActions = [];
    let otherActions = [];

    let _actions = Item35E.parseAction(actions);

    LogHelper.log('ACTION | Actions', _actions);
    for (let action of _actions) {
      if (
          action.target !== target ||
          (action.condition !== undefined &&
              action.condition !== null &&
              action.condition !== '' &&
              !new Roll35e(action.condition, actionRollData).roll().result)
      )
        continue; // We drop out since actions do not belong to us

      switch (action.action) {
        case 'TurnUndead':
          otherActions.push(action);
          break;
        case 'Create':
        case 'Give':
          itemCreationActions.push(action);
          break;
        case 'Remove':
          itemRemoveActions.push(action);
          break;
        case 'Activate':
        case 'Deactivate':
          otherActions.push(action);
          break;
        case 'Set':
          itemUpdateActions.push(action);
          break;
        case 'Condition':
        case 'Trait':
        case 'Update':
        case 'AbilityDamage':
        case 'AbilityDrain':
          actorUpdateActions.push(action);
          break;
        case 'Damage':
        case 'SelfDamage':
        case 'ApplyDamage':
        case 'Grapple':
        case 'Regenerate':
        case 'Clear':
        case 'Use':
        case 'Roll':
        case 'RollTable':
        case 'RunMacro':
        case 'Eval':
        case 'Message':
          otherActions.push(action);
          break;
        default:
          break;
      }
    }

    let actionRollData = actor.getRollData(); //This is roll data of actor that *rolled* the roll
    if (buff) {
      actionRollData.buff = buff; //This is roll data of optional buff item
      actionRollData.self = duplicate(actionRollData);
    } else {
      if (actor === this) {
        actionRollData.self = duplicate(actionRollData);
      } else {
        actionRollData.self = this.getRollData(); //This is roll data of actor that *clicked* the roll
      }
    }

    if (originatingAttackId) {
      actionRollData.baseAttack = (await fromUuid(originatingAttackId))
        ?.getRollData();
    }

    let itemUpdates = [];
    let itemsToDelete = [];
    let itemsToCreate = [];
    let actorUpdates = {};

    for (let action of itemCreationActions) {
      await this.applySingleAction(
          action,
          itemUpdates,
          itemsToCreate,
          actorUpdates,
          actionRollData,
          actor,
          itemsToDelete,
      );
    }
    if (itemCreationActions.length) {
      LogHelper.log('ACTION | itemCreationActions', itemCreationActions);
      await this.createEmbeddedDocuments('Item', itemsToCreate, {});
    }
    for (let action of itemRemoveActions) {
      await this.applySingleAction(
          action,
          itemUpdates,
          itemsToCreate,
          actorUpdates,
          actionRollData,
          actor,
          itemsToDelete,
      );
    }
    if (itemRemoveActions.length) {
      LogHelper.log('ACTION | itemRemoveActions', itemRemoveActions);
      await this.deleteEmbeddedDocuments('Item', itemsToDelete, {});
    }

    for (let action of itemUpdateActions) {
      await this.applySingleAction(
          action,
          itemUpdates,
          itemsToCreate,
          actorUpdates,
          actionRollData,
          actor,
          itemsToDelete,
      );
    }
    if (itemUpdateActions.length) {
      LogHelper.log('ACTION | itemUpdateActions', itemUpdateActions);
      await this.updateEmbeddedDocuments('Item', itemUpdates, {});
    }
    for (let action of actorUpdateActions) {
      await this.applySingleAction(
          action,
          itemUpdates,
          itemsToCreate,
          actorUpdates,
          actionRollData,
          actor,
          itemsToDelete,
      );
    }
    if (actorUpdateActions.length) {
      LogHelper.log('ACTION | actorUpdates', actorUpdateActions, this.name);
      await this.update(actorUpdates);
    } else {
      await this.update({});
    }
    for (let action of otherActions) {
      await this.applySingleAction(
          action,
          itemUpdates,
          itemsToCreate,
          actorUpdates,
          actionRollData,
          actor,
          itemsToDelete,
      );
    }
  }

  async executeEvalOnSelf(action) {
    let actor = this;
    //LogHelper.log('Running async eval')
    await eval('(async () => {' + action.body + '})()');
    //LogHelper.log('Running async eval done')
  }

  async quickChangeItemQuantity(itemId, add = 1) {
    const item = this.getOwnedItem(itemId);

    const curQuantity = getProperty(item.system, 'quantity') || 0;
    const newQuantity = Math.max(0, curQuantity + add);
    await item.update({'system.quantity': newQuantity});
  }

  //

  async _createConsumableSpellDialog(itemData) {
    let template = 'systems/D35E/templates/apps/spell-based-item-dialog.html';
    const html = await renderTemplate(template, {
      label: game.i18n.localize('D35E.CreateItemForSpellD').
          format(itemData.name),
      isSpell: true,
    });
    new Dialog({
      title: game.i18n.localize('D35E.CreateItemForSpell').
          format(itemData.name),
      content: html,
      buttons: {
        potion: {
          icon: '<i class="fas fa-prescription-bottle"></i>',
          label: 'Potion',
          callback: (html) => this.createConsumableSpell(itemData, 'potion',
              html),
        },
        scroll: {
          icon: '<i class="fas fa-scroll"></i>',
          label: 'Scroll',
          callback: (html) => this.createConsumableSpell(itemData, 'scroll',
              html),
        },
        wand: {
          icon: '<i class="fas fa-magic"></i>',
          label: 'Wand',
          callback: (html) => this.createConsumableSpell(itemData, 'wand',
              html),
        },
      },
      default: 'potion',
    }).render(true);
  }

  async _createConsumablePowerDialog(itemData) {
    let template = 'systems/D35E/templates/apps/spell-based-item-dialog.html';
    const html = await renderTemplate(template, {
      label: game.i18n.localize('D35E.CreateItemForPowerD').
          format(itemData.name),
    });
    new Dialog({
      title: game.i18n.localize('D35E.CreateItemForPower').
          format(itemData.name),
      content: html,
      buttons: {
        potion: {
          icon: '<i class="fas fa-prescription-bottle"></i>',
          label: 'Tattoo',
          callback: (html) => this.createConsumableSpell(itemData, 'tattoo',
              html),
        },
        scroll: {
          icon: '<i class="fas fa-scroll"></i>',
          label: 'Power Stone',
          callback: (html) => this.createConsumableSpell(itemData, 'powerstone',
              html),
        },
        wand: {
          icon: '<i class="fas fa-magic"></i>',
          label: 'Dorje',
          callback: (html) => this.createConsumableSpell(itemData, 'dorje',
              html),
        },
      },
      default: 'tattoo',
    }).render(true);
  }

  _createPolymorphBuffDialog(itemData) {
    new Dialog({
      title: game.i18n.localize('D35E.CreateItemForActor').
          format(itemData.name),
      content: game.i18n.localize('D35E.CreateItemForActorD').
          format(itemData.name),
      buttons: {
        potion: {
          icon: '',
          label: 'Wild Shape',
          callback: () => this.createWildShapeBuff(itemData),
        },
        scroll: {
          icon: '',
          label: 'Polymorph',
          callback: () => this.createPolymorphBuff(itemData),
        },
        wand: {
          icon: '',
          label: 'Alter Self',
          callback: () => this.createAlterSelfBuff(itemData),
        },
        // lycantrophy: {
        //   icon: '',
        //   label: "Lycantrophy",
        //   callback: () => this.createLycantrophyBuff(itemData),
        // },
      },
      default: 'Polymorph',
    }).render(true);
  }

  _setMaster(itemData) {
    if (itemData == null) {
      let updateData = {};
      updateData['system.-=master'] = null;
      this.update(updateData);
    } else {
      let masterData = {
        data: {
          master: {
            id: itemData._id,
            img: itemData.img,
            name: itemData.name,
            data: game.actors.get(itemData._id).getRollData(),
          },
        },
      };
      this.update(masterData);
    }
  }

  async createAttackSpell(itemData, type) {
    let data = await Item35E.toAttack(itemData);

    if (data._id) delete data._id;
    await this.createEmbeddedEntity('Item', data);
  }

  async createConsumableSpell(itemData, type, html) {
    let cl = parseInt(html.find('[name="caster-level"]').val());
    let scrollType = html.find('[name="scroll-type"]').val();
    let data = await ItemConsumableConverter.toConsumable(itemData, type, cl,
        scrollType);

    if (data._id) delete data._id;
    await this.createEmbeddedEntity('Item', data);
  }

  async createTrait(itemData, type) {
    let data = await Item35E.toTrait(itemData, type);

    if (data._id) delete data._id;
    await this.createEmbeddedEntity('Item', data);
  }

  async createWildShapeBuff(itemData) {
    let data = await Item35E.toPolymorphBuff(itemData, 'wildshape');

    if (data._id) delete data._id;
    await this.createEmbeddedEntity('Item', data);
  }

  async createPolymorphBuff(itemData, type) {
    let data = await Item35E.toPolymorphBuff(itemData, 'polymorph');

    if (data._id) delete data._id;
    await this.createEmbeddedEntity('Item', data);
  }

  async createAlterSelfBuff(itemData, type) {
    let data = await Item35E.toPolymorphBuff(itemData, 'alter-self');

    if (data._id) delete data._id;
    await this.createEmbeddedEntity('Item', data);
  }

  async createLycantrophyBuff(itemData, type) {
    let data = await Item35E.toPolymorphBuff(itemData, 'lycantrophy');

    if (data._id) delete data._id;
    await this.createEmbeddedEntity('Item', data);
  }

  async _updateMinions(options) {
    if (options.skipMinions) return;
    for (const actor of game.actors) {
      if (actor.system?.master?.id === this.id) {
        let masterData = {
          data: {
            master: {
              img: this.img,
              name: this.name,
              data: this.getRollData(),
            },
          },
        };

        // Updating minion "Familiar class"
        const classes = actor.data.items.filter((obj) => {
          return obj.type === 'class';
        });

        const minionClass = classes.find(
            (o) => getProperty(o.system, 'classType') === 'minion');
        if (!!minionClass) {
          let updateObject = {};
          updateObject['_id'] = minionClass.id || minionClass._id;
          updateObject['system.levels'] =
              this.getRollData().attributes.minionClassLevels[minionClass.system.minionGroup] ||
              0;
          LogHelper.log('Minion class', minionClass, updateObject,
              this.getRollData());
          await actor.updateOwnedItem(updateObject,
              {stopUpdates: true, massUpdate: true});
        }
        actor.update(masterData, {stopUpdates: true});
      }
    }
  }

  async _calculateMinionDistance() {
    if (this == null) return;
    if (!this.testUserPermission(game.user, 'OWNER')) return;
    if (this.data.type === 'npc') {
      let myToken = this.getActiveTokens()[0];
      let masterId = this.system?.master?.id;
      let master = game.actors.get(masterId);
      if (!master || !master.getActiveTokens()) return;
      let masterToken = master.getActiveTokens()[0];
      if (!!myToken && !!masterToken) {
        let distance = Math.floor(
            canvas.grid.measureDistance(myToken, masterToken) / 5.0) * 5;
        let masterData = {
          data: {
            master: {
              distance: distance,
            },
          },
        };
        let minionData = {
          data: {
            attributes: {minionDistance: {}},
          },
        };
        minionData.data.attributes.minionDistance[this.data.name.toLowerCase().
            replace(/ /g, '').
            replace(/,/g, '')] =
            distance;
        master.update(minionData,
            {stopUpdates: true, skipToken: true, skipMinions: true});
        this.update(masterData, {stopUpdates: true, skipToken: true});
      }
    } else if (this.data.type === 'character') {
      let myToken = this.getActiveTokens()[0];
      let minionData = {
        data: {
          attributes: {minionDistance: {}},
        },
      };
      let hasAnyMinion = false;
      game.actors.forEach((minion) => {
        if (minion.system?.master?.id === this.id) {
          hasAnyMinion = true;
          let minionToken = minion.getActiveTokens()[0];
          if (!!myToken && !!minionToken) {
            let distance = Math.floor(
                canvas.grid.measureDistance(myToken, minionToken) / 5.0) * 5;
            let masterData = {
              data: {
                master: {
                  distance: distance,
                },
              },
            };
            minionData.data.attributes.minionDistance[
                minion.data.name.toLowerCase().
                    replace(/ /g, '').
                    replace(/,/g, '')
                ] = distance;
            minion.update(masterData, {stopUpdates: true, skipToken: true});
          }
        }
      });
      if (hasAnyMinion) this.update(minionData,
          {stopUpdates: true, skipToken: true, skipMinions: true});
    }
  }

  promptRest() {
    new ActorRestDialog(this).render(true);
  }

  async rest(restoreHealth, restoreDailyUses, longTermCare) {
    const actorData = this.system;
    let rollData = this.getRollData();
    const updateData = {};

    if (this.items !== undefined && this.items.size > 0) {
      // Update items
      for (let i of this.items) {
        await i.addElapsedTime(8 * 60 * 10);
      }
    }

    // Restore health and ability damage
    if (restoreHealth) {
      const hd = actorData.attributes.hd.total;
      let heal = {
        hp: hd,
        abl: 1,
      };
      if (longTermCare) {
        heal.hp *= 2;
        heal.abl *= 2;
      }

      updateData['system.attributes.hp.value'] = Math.min(
          actorData.attributes.hp.value + heal.hp,
          actorData.attributes.hp.max,
      );
      updateData['system.attributes.hp.nonlethal'] = Math.max(
          actorData.attributes.hp.nonlethal - heal.hp, 0);
      for (let [key, abl] of Object.entries(actorData.abilities)) {
        let dmg = Math.abs(abl.damage);
        updateData[`system.abilities.${key}.damage`] = Math.max(0,
            dmg - heal.abl);
      }
    }

    // Restore daily uses of spells, feats, etc.
    if (restoreDailyUses) {
      let items = [],
          hasItemUpdates = false;
      for (let item of this.data.items) {
        let itemUpdate = {};
        const itemData = item.system;
        rollData.item = duplicate(itemData);

        if (itemData.uses && itemData.uses.per === 'day' &&
            itemData.uses.value !== itemData.uses.max) {
          hasItemUpdates = true;
          itemUpdate['_id'] = item.id;
          if (itemData.uses.rechargeFormula) {
            itemUpdate['system.uses.value'] = Math.min(
                itemData.uses.value + new Roll35e(itemData.uses.rechargeFormula,
                    itemData).roll().total,
                itemData.uses.max,
            );
            rollData.item.uses.value = itemUpdate['system.uses.value'];
          } else {
            itemUpdate['system.uses.value'] = itemData.uses.max;
            rollData.item.uses.value = itemUpdate['system.uses.value'];
          }
        }
        if (hasProperty(item, 'system.combatChangesRange.maxFormula')) {
          if (getProperty(item, 'system.combatChangesRange.maxFormula') !==
              '') {
            let roll = new Roll35e(
                getProperty(item, 'system.combatChangesRange.maxFormula'),
                rollData).roll();
            hasItemUpdates = true;
            itemUpdate['system.combatChangesRange.max'] = roll.total;
            itemUpdate['_id'] = item.id;
          }
        }
        for (let i = 1; i <= 3; i++)
          if (hasProperty(item,
              `system.combatChangesAdditionalRanges.slider${i}.maxFormula`)) {
            if (getProperty(item,
                    `system.combatChangesAdditionalRanges.slider${i}.maxFormula`) !==
                '') {
              hasItemUpdates = true;
              let roll = new Roll35e(
                  getProperty(item,
                      `system.combatChangesAdditionalRanges.slider${i}.maxFormula`),
                  rollData,
              ).roll();
              itemUpdate[`system.combatChangesAdditionalRanges.slider${i}.max`] = roll.total;
              itemUpdate['_id'] = item.id;
            }
          }
        if (
            itemData.enhancements &&
            itemData.enhancements.uses &&
            itemData.enhancements.uses.per === 'day' &&
            itemData.enhancements.uses.value !== itemData.enhancements.uses.max
        ) {
          hasItemUpdates = true;
          itemUpdate['_id'] = item.id;
          if (itemData.enhancements.uses.rechargeFormula) {
            itemUpdate['system.enhancements.uses.value'] = Math.min(
                itemData.enhancements.uses.value +
                new Roll35e(itemData.enhancements.uses.rechargeFormula,
                    itemData).roll().total,
                itemData.enhancements.uses.max,
            );
          } else {
            itemUpdate['system.enhancements.uses.value'] = itemData.enhancements.uses.max;
          }
        } else if (item.type === 'spell') {
          const spellbook = getProperty(actorData,
                  `attributes.spells.spellbooks.${itemData.spellbook}`),
              isSpontaneous = spellbook.spontaneous,
              usePowerPoints = spellbook.usePowerPoints;
          if (
              !isSpontaneous &&
              !usePowerPoints &&
              itemData.preparation.preparedAmount !==
              itemData.preparation.maxAmount
          ) {
            hasItemUpdates = true;
            itemUpdate['_id'] = item.id;
            itemUpdate['system.preparation.preparedAmount'] = itemData.preparation.maxAmount;
          }
        }

        if (itemData.enhancements && itemData.enhancements &&
            itemData.enhancements.items) {
          let enhItems = duplicate(itemData.enhancements.items);
          for (let _item of enhItems) {
            let enhancementData = ItemEnhancementHelper.getEnhancementData(
                _item);
            hasItemUpdates = hasItemUpdates ||
                ItemEnhancementHelper.restoreEnhancementUses(enhancementData,
                    true);
          }
          itemUpdate['_id'] = item.id;
          itemUpdate[`system.enhancements.items`] = enhItems;
        }
        if (itemUpdate['_id']) items.push(itemUpdate);
      }
      game.D35E.logger.log('Updating embedded items?', hasItemUpdates);
      if (hasItemUpdates) {
        game.D35E.logger.log('Updating embedded items', items);
        await this.updateEmbeddedDocuments('Item', items, {stopUpdates: true});
      }

      // Restore spontaneous spellbooks
      for (let [key, spellbook] of Object.entries(
          actorData.attributes.spells.spellbooks)) {
        if (spellbook.spontaneous) {
          for (let sl of Object.keys(CONFIG.D35E.spellLevels)) {
            updateData[`system.attributes.spells.spellbooks.${key}.spells.spell${sl}.value`] = getProperty(
                actorData,
                `attributes.spells.spellbooks.${key}.spells.spell${sl}.max`,
            );
          }
        }
        if (spellbook.usePowerPoints) {
          let rollData = {};
          if (actorData == null && this.actor !=
              null) rollData = this.getRollData();
          else rollData = actorData;
          try {
            updateData[`system.attributes.spells.spellbooks.${key}.powerPoints`] = new Roll35e(
                getProperty(actorData,
                    `attributes.spells.spellbooks.${key}.dailyPowerPointsFormula`),
                rollData,
            ).roll().total;
          } catch (e) {
            updateData[`system.attributes.spells.spellbooks.${key}.powerPoints`] = 0;
          }
        }
      }

      updateData[`system.attributes.turnUndeadUses`] = getProperty(actorData,
          `attributes.turnUndeadUsesTotal`);
    }

    this.update(updateData);
  }

  async _setAverageHitDie() {
    for (const item of this.items.filter((obj) => {
      return obj.type === 'class';
    })) {
      let hd = item['data']['data']['hd'];
      let hp = 0;
      let levels = item['data']['data']['levels'];
      hp = Math.floor(parseInt(levels) * (hd / 2 + 0.5));
      await this.updateOwnedItem({_id: item._id, 'system.hp': hp});
      await this.refresh();
    }
  }

  async renderFastHealingRegenerationChatCard(roundDelta = 1) {
    let d = this.system;

    const token = this ? this.token : null;
    let chatTemplateData = {
      name: this.name,
      img: this.img,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      rollMode: 'selfroll',
      tokenId: token ? `${token.parent.id}.${token.id}` : null,
      actor: this,
    };
    let chatData = {
      speaker: ChatMessage.getSpeaker({actor: this}),
      rollMode: 'selfroll',
      sound: CONFIG.sounds.dice,
      'flags.D35E.noRollRender': true,
    };
    let actions = [];
    if (d.traits.regenTotal) {
      actions.push({
        label: game.i18n.localize('D35E.Regeneration'),
        value: `Regenerate ${d.traits.regenTotal * roundDelta} on self;`,
        isTargeted: false,
        action: 'customAction',
        img: '',
        hasImg: false,
      });
    }
    if (d.traits.fastHealingTotal) {
      actions.push({
        label: game.i18n.localize('D35E.FastHealing'),
        value: `SelfDamage -${d.traits.fastHealingTotal * roundDelta} on self;`,
        isTargeted: false,
        action: 'customAction',
        img: '',
        hasImg: false,
      });
    }
    if (actions.length) {
      const templateData = mergeObject(
          chatTemplateData,
          {
            actions: actions,
          },
          {inplace: false},
      );
      // Create message
      await createCustomChatMessage(
          'systems/D35E/templates/chat/fastheal-roll.html', templateData,
          chatData, {});
    }
  }

  async syncToCompendium(manual = false) {
    if (!getProperty(this.system, 'companionUuid')) return;
    let apiKey = game.settings.get('D35E', 'apiKeyWorld');
    if (getProperty(this.system,
        'companionUsePersonalKey')) apiKey = game.settings.get('D35E',
        'apiKeyPersonal');
    if (!apiKey) return;
    let that = this;
    $.ajax({
      url: `${this.API_URI}/api/character/${this.system.companionUuid}`,
      type: 'PUT',
      headers: {'API-KEY': apiKey},
      crossDomain: true,
      dataType: 'json',
      contentType: 'application/json; charset=utf-8',
      data: JSON.stringify(this.data),
      success: function(data) {
        if (manual) {
          ui.notifications.info(
              game.i18n.localize('D35E.NotificationSyncSuccessfull').
                  format(that.data.name));
        }
      },
      error: function(jqXHR, textStatus, errorThrown) {
        //LogHelper.log(textStatus)
        if (manual) {
          ui.notifications.error(
              game.i18n.localize('D35E.NotificationSyncError').
                  format(that.data.name));
        }
      },
    });
  }

  get canAskForRequest() {
    if (!getProperty(this.system, 'companionUuid')) return false;

    let userWithCharacterIsActive = game.users.players.some(
        (u) => u.active && u.data.character === this.id);
    let isMyCharacter = game.users.current.data.character === this.id;
    // It is not ours character and user that has this character is active - so better direct commands to his/her account
    if (!isMyCharacter && userWithCharacterIsActive) return false;

    return true;
  }

  get isCompanionSetUp() {
    if (!getProperty(this.system, 'companionUuid')) return false;
    let apiKey = game.settings.get('D35E', 'apiKeyWorld');
    if (!apiKey) return false;

    if (getProperty(this.system,
        'companionUsePersonalKey')) apiKey = game.settings.get('D35E',
        'apiKeyPersonal');
    return apiKey || false;

  }

  connectToCompanionSocket() {
    if (!this.canAskForRequest) return;
    this.socket = io(`${this.API_URI}`);
    this.socket.on('foundry', (data) => {
      game.D35E.logger.log('Received foundry message', data);
      this.socket.emit('processed', {
        actionId: data['actionId'],
        room: getProperty(this.system, 'companionUuid'),
      });
      this.executeRemoteAction(data);
    });
  }

  connectToCompanionCharacterRoom() {
    if (!this.socket) return;
    if (this.socketRoomConnected) return;
    this.socket.emit('join', {
      username: 'foundry' + game.user.name,
      room: getProperty(this.system, 'companionUuid'),
    });
    this.socketRoomConnected = true;
  }

  disconnectFromCompanionCharacterRoom() {
    if (!this.socketRoomConnected) return;
    this.socket.emit('leave', {
      username: 'foundry' + game.user.name,
      room: getProperty(this.system, 'companionUuid'),
    });
    this.socketRoomConnected = false;
  }

  async getQueuedActions() {
    if (!this.canAskForRequest) return;

    let that = this;
    let apiKey = game.settings.get('D35E', 'apiKeyWorld');
    if (!apiKey) return;

    if (getProperty(this.system,
        'companionUsePersonalKey')) apiKey = game.settings.get('D35E',
        'apiKeyPersonal');
    $.ajax({
      url: `${this.API_URI}/api/character/actions/${this.system.companionUuid}`,
      type: 'GET',
      headers: {'API-KEY': apiKey},
      crossDomain: true,
      dataType: 'json',
      contentType: 'application/json; charset=utf-8',
      success: function(data) {
        //LogHelper.log('LOTDCOMPANION | ', data)
        that.executeRemoteAction(data);
      },
    });
  }

  async executeRemoteAction(remoteAction) {
    switch (remoteAction.action) {
      case 'ability':
        this.rollAbility(remoteAction.params);
        break;
      case 'save':
        this.rollSave(remoteAction.params);
        break;
      case 'rollSkill':
        this.rollSkill(remoteAction.params);
        break;
      case 'useItem':
        this.items.find((i) => i._id === remoteAction.params).use({});
        break;
      case 'rest':
        this.promptRest();
    }
  }

  getChargesFromItemById(id) {
    let _item = this.items.find(
        (item) => item._id === id || item.system.uniqueId === id);
    if (_item != null) {
      return _item.data?.data?.uses?.value || 0;
    } else {
      return 0;
    }
  }

  getMaxChargesFromItemById(id) {
    let _item = this.items.find(
        (item) => item._id === id || item.system.uniqueId === id);
    if (_item != null) {
      return _item.data?.data?.uses?.max || 0;
    } else {
      return 0;
    }
  }

  getItemByUidOrId(id) {
    let _item = this.items.find(
        (item) => item._id === id || item.system.uniqueId === id);
    if (_item != null) {
      return _item;
    } else {
      return null;
    }
  }

  getItemByTag(tag) {
    let _item = this.items.find(
        (item) => createTag(item.name) === tag || item.system.customTag ===
            tag);
    if (_item != null) {
      return _item;
    } else {
      return null;
    }
  }

  getItemByTagAndType(tag, type) {
    let _item = this.items.find(
        (item) => item.type === type &&
            (createTag(item.name) === tag || item.system.customTag === tag),
    );
    if (_item != null) {
      return _item;
    } else {
      return null;
    }
  }

  getItemByNameAndType(name, type) {
    let _item = this.items.find(
        (item) => item.type === type && item.name === name);
    if (_item != null) {
      return _item;
    } else {
      return null;
    }
  }

  async deactivateBuffs(itemIds) {
    for (let itemId of itemIds) {
      await this.items.find((item) => item._id === itemId).
          update({'system.active': false}, {forceDeactivate: true});
    }
  }

  async renderBuffEndChatCard(items) {
    const chatTemplate = 'systems/D35E/templates/chat/roll-ext.html';

    // Create chat data
    let chatData = {
      user: game.user.id,
      type: CONST.CHAT_MESSAGE_TYPES.CHAT,
      sound: CONFIG.sounds.dice,
      speaker: ChatMessage.getSpeaker({actor: this.actor}),
      rollMode: game.settings.get('core', 'rollMode'),
    };
    // Handle different roll modes
    switch (chatData.rollMode) {
      case 'gmroll':
        chatData['whisper'] = game.users.contents.filter((u) => u.isGM).
            map((u) => u._id);
        break;
      case 'selfroll':
        chatData['whisper'] = [game.user.id];
        break;
      case 'blindroll':
        chatData['whisper'] = game.users.contents.filter((u) => u.isGM).
            map((u) => u._id);
        chatData['blind'] = true;
    }

    // Send message
    await createCustomChatMessage(
        'systems/D35E/templates/chat/deactivate-buff.html',
        {items: items, actor: this},
        chatData,
        {rolls: []},
    );
  }

  async applyOnRoundBuffActions(items, roundDelta = 1) {
    const token = this ? this.token : null;
    let chatTemplateData = {
      name: this.name,
      img: this.img,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      rollMode: 'selfroll',
      tokenId: token ? `${token.parent.id}.${token.id}` : null,
      actor: this,
    };
    let chatData = {
      speaker: ChatMessage.getSpeaker({actor: this}),
      rollMode: 'selfroll',
      sound: CONFIG.sounds.dice,
      'flags.D35E.noRollRender': true,
    };
    let actions = [];
    for (let i of items) {
      for (let _action of i.system.perRoundActions)
        actions.push({
          label: i.name,
          value: _action.action.replaceAll('@roundDelta', roundDelta),
          isTargeted: false,
          action: 'customAction',
          img: i.img,
          hasImg: true,
        });
    }
    if (actions.length) {
      const templateData = mergeObject(
          chatTemplateData,
          {
            actions: actions,
          },
          {inplace: false},
      );
      // Create message
      await createCustomChatMessage('systems/D35E/templates/chat/dot-roll.html',
          templateData, chatData, {});
    }
  }

  async groupItems() {
    let itemsToDelete = new Set();
    let itemQuantities = new Map();
    for (let type of ['equipment', 'loot', 'weapon']) {
      let itemNames = new Set();
      let itemNamesToId = new Map();
      let equipment = this.items.filter((o) => {
        return o.type === type;
      });
      for (let _item of equipment) {
        let _name = `${_item.name}-${_item.system.carried}-${_item.system.equipped}-${_item.system.containerId}-${_item.system.subType}`;
        if (itemNames.has(_name)) {
          itemQuantities.set(
              itemNamesToId.get(_name),
              itemQuantities.get(itemNamesToId.get(_name)) +
              _item.system.quantity,
          );
          itemsToDelete.add(_item.id);
        } else {
          itemNames.add(_name);
          itemQuantities.set(_item.id, _item.system.quantity);
          itemNamesToId.set(_name, _item.id);
        }
      }
    }
    if (Array.from(itemsToDelete).length)
      await this.deleteEmbeddedEntity('Item', Array.from(itemsToDelete),
          {stopUpdates: true});

    let itemsToUpdate = [];
    for (const [key, value] of itemQuantities.entries()) {
      itemsToUpdate.push({_id: key, 'system.quantity': value});
    }

    if (itemsToUpdate.length)
      await this.updateEmbeddedEntity('Item', itemsToUpdate,
          {stopUpdates: true, ignoreSpellbookAndLevel: true});
  }

  async updateOwnedItem(itemData, options = {}) {
    game.D35E.logger.warn(
        'You are referencing Actor#updateOwnedItem which is deprecated in favor of Item#update or Actor#updateEmbeddedDocuments. Support will be removed in 0.9.0',
    );
    itemData = itemData instanceof Array ? itemData : [itemData];
    options.massUpdate = true;
    return this.updateEmbeddedDocuments('Item', itemData, options);
  }

  async updateEmbeddedEntity(documentName, data, options = {}) {
    game.D35E.logger.warn(
        'The Document#updateEmbeddedEntity method has been renamed to Document#updateEmbeddedDocuments. Support for the old method name will be removed in 0.9.0',
    );
    data = data instanceof Array ? data : [data];
    options.massUpdate = true;
    return this.updateEmbeddedDocuments(documentName, data, options);
  }

  async createEmbeddedDocuments(type, data, options = {}) {
    LogHelper.log('createEmbeddedDocuments');
    let createdItems = await super.createEmbeddedDocuments(type, data, options);
    if (!options.stopUpdates) await this.refresh({});
    return Promise.resolve(createdItems);
  }

  #correlateUpdateObjectsById(data) {
    const correlatedHashmap = data.reduce((result, item) => {
      result[item._id] = result[item._id]
        ? {
          ...result[item._id],
          ...item,
        }
        : item;
      return result;
    }, {});
    return Object.values(correlatedHashmap);
  }

  async updateEmbeddedDocuments(type, data, options = {}) {
    LogHelper.log('updateEmbeddedDocuments');
    const _data = this.#correlateUpdateObjectsById(data);
    let updatedItems = await super.updateEmbeddedDocuments(type, _data, options);
    if (options.massUpdate && !options.stopUpdates) await this.refresh({});
    return Promise.resolve(updatedItems);
  }

  async deleteEmbeddedDocuments(type, data, options = {}) {
    LogHelper.log('deleteEmbeddedDocuments');

    if (type === 'Item') {
      let additionalItemsToDelete = [];
      if (!(data instanceof Array)) {
        data = [data];
      }
      for (let itemId of data) {
        if (!this.items.has(itemId)) continue;
        let linkId = this.items.get(itemId).system.linkId;
        if (linkId) {
          this.items.filter((o) => {
            return o.system.linkSourceId === linkId;
          }).forEach((o) => additionalItemsToDelete.push(o._id));
        }
      }
      data.push(...additionalItemsToDelete);
    }
    let deletedDocuments = await super.deleteEmbeddedDocuments(type, data,
        options);
    if (!options.stopUpdates) await this.refresh({});
    return Promise.resolve(deletedDocuments);
  }

  async drawCardsForDeck(deckId) {
    let cards = this.items.filter((o) => {
      return o.type === 'card';
    });
    let allCards = cards.filter((obj) => {
      return obj.system.deck === deckId;
    });
    let discardedCards = shuffle(
        allCards.filter((obj) => {
          return obj.system.state === 'discarded';
        }).map((obj) => obj._id),
    );
    let deckCards = shuffle(
        allCards.filter((obj) => {
          return obj.system.state === 'deck';
        }).map((obj) => obj._id),
    );
    let deck = this.system.attributes?.cards?.decks[deckId] || {};
    let currentHandSize = allCards.filter((obj) => {
      return obj.system.state === 'hand';
    }).length;
    let cardsToDraw = Math.max(0, deck.handSize.total - currentHandSize);

    let cardUpdates = [];

    while (cardsToDraw > 0 && deckCards.length > 0) {
      let d = deckCards.pop();
      cardUpdates.push({_id: d, 'system.state': 'hand'});
      cardsToDraw--;
    }

    while (cardsToDraw > 0 && discardedCards.length > 0) {
      let d = discardedCards.pop();
      cardUpdates.push({_id: d, 'system.state': 'hand'});
      cardsToDraw--;
    }

    if (deckCards.length === 0 && discardedCards.length > 0) {
      discardedCards.forEach((d) => {
        cardUpdates.push({_id: d, 'system.state': 'deck'});
      });
    }

    return this.updateEmbeddedDocuments('Item', cardUpdates,
        {stopUpdates: true});
  }

  async advanceHd(_newHd) {
    let newHd = parseInt(_newHd);
    let updateData = {};
    let racialHd = this.racialHD;
    let currentLevel = racialHd.system.levels;
    let currentHP = racialHd.system.hp;
    let currentHidDice = racialHd.system.hd;
    if (!this.system?.advancement?.originalHD) {
      updateData['system.advancement.originalHD'] = currentLevel;
    }
    updateData['system.abilities.str.value'] = getProperty(this.system,
        'abilities.str.value');
    updateData['system.abilities.dex.value'] = getProperty(this.system,
        'abilities.dex.value');
    updateData['system.abilities.con.value'] = getProperty(this.system,
        'abilities.con.value');
    updateData['system.abilities.con.value'] = getProperty(this.system,
        'abilities.con.value');
    updateData['system.attributes.naturalAC'] = this.system.attributes.naturalAC;
    updateData['system.details.cr'] = parseInt(
        getProperty(this.system, 'details.cr'));
    const size = getProperty(this.system, 'traits.size');
    let newSize = getProperty(this.system, 'traits.size');

    let advancement = getProperty(this.system, 'details.advancement.hd');
    advancement.forEach((hd) => {
      if (newHd >= hd.lower) newSize = hd.size;
    });

    if (newSize === 'no-change' || newSize === '') newSize = size;

    const sizeIndex = Object.keys(CONFIG.D35E.actorSizes).
        indexOf(getProperty(this.system, 'traits.size') || '');
    const newSizeIndex = Object.keys(CONFIG.D35E.actorSizes).
        indexOf(newSize || '');
    let currentSize = sizeIndex;
    while (currentSize < newSizeIndex) {
      currentSize++;
      let temporarySize = Object.keys(CONFIG.D35E.actorSizes)[currentSize];
      let temporaryChanges = CONFIG.D35E.sizeAdvancementChanges[temporarySize];
      updateData['system.abilities.str.value'] += temporaryChanges.str;
      updateData['system.abilities.dex.value'] += temporaryChanges.dex;
      updateData['system.abilities.con.value'] += temporaryChanges.con;
      updateData['system.attributes.naturalAC'] += temporaryChanges.nac;
      updateData['system.details.cr'] += 1;
    }
    updateData['system.traits.size'] = newSize;
    updateData['system.details.cr'] += Math.floor(
        (newHd - currentLevel) / racialHd.system.crPerHD);
    let newHP = Math.floor(
        (newHd - currentLevel) * (currentHidDice / 2 + 0.5)) + currentHP;
    await this.racialHD.update({'system.levels': newHd, 'system.hp': newHP});
    return this.update(updateData);
  }

  async progressBuff(buffUpdates, buffId, roundDelta = 1) {
    //await this.refresh();
    if (!buffUpdates.has(this.uuid)) {
      buffUpdates.set(this.uuid, {
        itemUpdateData: [],
        itemsEnding: [],
        itemsOnRound: [],
        itemsToDelete: [],
        itemsDeactivating: [],
        itemResourcesData: {},
        buffsToDelete: [],
        deletedOrChanged: false,
      });
    }
    const bu = buffUpdates.get(this.uuid);
    if (this.items !== undefined && this.items.size > 0) {
      // Update items
      /**
       * @type {Item35E}
       */
      let i = this.items.get(buffId);
      if (!i) {
        bu.itemsToDelete.push(buffId);
        bu.deletedOrChanged = true;
      } else {
        this.getItemResourcesUpdate(i, bu.itemResourcesData);
        let elapsedTimeUpdateData = i.getElapsedTimeUpdateData(roundDelta);
        if (elapsedTimeUpdateData && elapsedTimeUpdateData['system.active'] ===
            false) {
          bu.itemsEnding.push(i);
          bu.itemsDeactivating.push(elapsedTimeUpdateData._id);
        }
        if ((i.system.perRoundActions || []).length &&
            !elapsedTimeUpdateData.delete) bu.itemsOnRound.push(i);
        if (elapsedTimeUpdateData && !elapsedTimeUpdateData.delete &&
            !elapsedTimeUpdateData.ignore) {
          bu.itemUpdateData.push(elapsedTimeUpdateData);
          bu.deletedOrChanged = true;
        } else if (elapsedTimeUpdateData && elapsedTimeUpdateData.delete ===
            true) {
          bu.itemUpdateData.push(
              {_id: elapsedTimeUpdateData._id, 'system.active': false});
          bu.itemsDeactivating.push(elapsedTimeUpdateData._id);
          bu.itemsToDelete.push(elapsedTimeUpdateData._id);
          bu.deletedOrChanged = true;
        }
      }
    }
  }

  async progressRound() {
    this.renderFastHealingRegenerationChatCard();
  }

  async progressTime(roundDelta = 1) {
    //await this.refresh();
    let itemUpdateData = [];
    let itemsEnding = [];
    let itemsOnRound = [];
    let itemsToDelete = [];
    let itemResourcesData = {};
    let deletedOrChanged = false;
    if (this.items !== undefined && this.items.size > 0) {
      // Update items
      for (let i of this.items) {
        this.getItemResourcesUpdate(i, itemResourcesData);
        let _data = i.getElapsedTimeUpdateData(roundDelta);
        if (_data && _data['system.active'] === false) itemsEnding.push(i);
        if ((i.system.perRoundActions || []).length &&
            !_data.delete) itemsOnRound.push(i);
        if (_data && !_data.delete && !_data.ignore) {
          itemUpdateData.push({item: i, data: _data});
          deletedOrChanged = true;
        } else if (_data && _data.delete === true) {
          itemUpdateData.push(
              {item: i, data: {_id: _data._id, 'system.active': false}});
          itemsToDelete.push(_data._id);
          deletedOrChanged = true;
        }
      }
    }

    if (itemUpdateData.length > 0) {
      let updatePromises = [];
      for (let updateData of itemUpdateData) {
        updatePromises.push(
            updateData.item.update(updateData.data, {stopUpdates: true}));
      }
      await Promise.all(updatePromises);
    }
    if (Object.keys(itemResourcesData).length > 0 ||
        deletedOrChanged) await this.update(itemResourcesData);
    if (itemsEnding.length) this.renderBuffEndChatCard(itemsEnding);
    if (itemsOnRound.length) this.applyOnRoundBuffActions(itemsOnRound,
        roundDelta);
    if (itemsToDelete.length > 0) {
      await this.deleteEmbeddedDocuments('Item', itemsToDelete, {});
    }
    this.renderFastHealingRegenerationChatCard(roundDelta);
  }

  static getActorFromTokenPlaceable(source) {
    if (source.document.data.actorLink) {
      return game.actors.get(source.document.data.actorId);
    } else {
      return source.actor;
    }
  }

  static async _updateToken(token, data) {
    if (token.document) {
      return token.document.update(data);
    } else {
      return token.update(data);
    }
  }

  /**
   * The VisionPermissionSheet instance for this actor
   *
   * @type {VisionPermissionSheet}
   */
  get visionPermissionSheet() {
    if (!this._visionPermissionSheet) this._visionPermissionSheet = new VisionPermissionSheet(
        this);
    return this._visionPermissionSheet;
  }

  _preCreate() {
    let createData = {};
    let worldDefaultsSettings = game.settings.get('D35E', 'worldDefaults');
    for (let skill of worldDefaultsSettings.worldDefaults.customSkills) {
      this.__addNewCustomSkill(createData, skill[0], skill[1],
          skill[2] === 'true', skill[3] === 'true');
    }
    this.data.update(createData);
  }

  /**
   * Only run on PreCreateData
   */
  __addNewCustomSkill(createData, name, ability, rt, acp) {
    const skillData = {
      name: name,
      ability: ability,
      rank: 0,
      notes: '',
      mod: 0,
      rt: rt,
      cs: false,
      acp: acp,
      background: false,
      custom: true,
      worldCustom: true,
    };

    let tag = createTag(skillData.name || 'skill');
    let count = 1;
    while (this.system.skills[tag] != null) {
      count++;
      tag = createTag(skillData.name || 'skill') + count.toString();
    }
    createData[`system.skills.${tag}`] = skillData;
  }
}
