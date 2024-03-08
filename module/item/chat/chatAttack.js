import { Item35E } from "../entity.js";
import { Roll35e } from "../../roll.js";
import { ItemRolls } from "../extensions/rolls.js";

export class ChatAttack {
  constructor(item, label = "", actor = null, rollData = null, ammoMaterial = null, ammoEnh = 0) {
    this.setItem(item, actor, rollData);
    this.label = label;
    this.ammoMaterial = ammoMaterial;
    this.ammoEnh = ammoEnh;

    this.attack = {
      flavor: "",
      tooltip: "",
      total: -1337,
      isCrit: false,
      isFumble: false,
    };
    this.critConfirm = {
      flavor: "",
      tooltip: "",
      total: 0,
      isCrit: false,
      isFumble: false,
    };

    this.hasAttack = false;
    this.hasCritConfirm = false;

    this.damage = {
      flavor: "",
      tooltip: "",
      total: 0,
    };
    this.critDamage = {
      flavor: "",
      tooltip: "",
      total: 0,
    };
    this.altDamage = {
      flavor: "",
      tooltip: "",
      total: 0,
    };

    this.subDamage = [];
    this.hasSubdamage = false;
    this.hasDamage = false;
    this.hasAltDamage = false;

    this.cards = [];
    this.altCards = [];
    this.special = [];
    this.effectNotes = "";
    this.rolls = [];
    this.normalDamage = "";
    this.natural20 = false;
    this.natural20Crit = false;
    this.fumble = false;
    this.fumbleCrit = false;
    this.spellPenetration = null;
    this.isSpell = false;
  }

  get critRange() {
    return new Roll35e(`${this.rollData.item.ability.critRange || "20"}` || "20", this.rollData).roll().total;
  }

  /**
   * Sets the attack's item reference.
   * @param {Item35E} item - The item to reference.
   * @param actor
   */
  setItem(item, actor = null, rollData = null) {
    if (item == null) {
      this.rollData = {};
      this.item = null;
      return;
    }

    this.item = item;
    if (rollData) this.rollData = duplicate(rollData);
    else {
      this.rollData = item.actor != null ? item.actor.getRollData() : actor != null ? actor.getRollData() : {};
      this.rollData.item = duplicate(this.item.system);
    }
  }

  async addAttack({
    bonus = null,
    extraParts = [],
    primaryAttack = true,
    critical = false,
    critConfirmBonus = 0,
  } = {}) {
    if (!this.item) return;

    this.hasAttack = true;
    let data = this.attack;
    if (critical === true) data = this.critConfirm;

    // Roll attack
    let roll = new ItemRolls(this.item).rollAttack({
      data: this.rollData,
      bonus: bonus || 0,
      extraParts: extraParts,
      primaryAttack: primaryAttack,
      replacedEnh: Math.max(this.ammoEnh, this.rollData.item?.enh || 0),
    });
    this.rolls.push(roll);
    var descriptionParts = roll.descriptionParts;
    let d20 = roll.terms[0];
    let critType = 0;
    if ((d20.total >= this.critRange && !critical) || (d20.total === 20 && critical)) critType = 1;
    else if (d20.total === 1) critType = 2;
    descriptionParts.unshift({ value: `${d20.total}`, roll: d20.formula, name: `Attack Roll` });
    // Add tooltip
    let tooltip = "";
    for (let descriptionPart of descriptionParts) {
      tooltip += `<tr>
                <td><b>${descriptionPart.name}</b></td>
                <td><b>${descriptionPart.value}</b></td>
                </tr>
                `;
    }

    var tooltips = `<div class="dice-formula" style="margin-bottom: 8px">${roll.formula}</div><div class="table-container"><table>${tooltip}</table></div>`;
    data.flavor = critical ? game.i18n.localize("D35E.CriticalConfirmation") : this.label;
    data.tooltip = tooltips;
    data.total = roll.total;
    data.isCrit = critType === 1;
    if (!data.isCrit) this.rollData[`attack${this.rolls.length}`] = roll.total;
    data.isNatural20 = d20.total === 20 && !critical;
    data.isFumble = critType === 2;
    if (!critical) {
      this.natural20 = data.isNatural20;
      this.fumble = data.isFumble;
    } else {
      this.natural20Crit = data.isNatural20;
      this.fumbleCrit = data.isFumble;
    }
    // Add crit confirm
    if (!critical && d20.total >= this.critRange) {
      this.hasCritConfirm = true;
      await this.addAttack({
        bonus: (parseInt(bonus) || 0) + parseInt(critConfirmBonus),
        extraParts: extraParts,
        primaryAttack: primaryAttack,
        critical: true,
      });
    }
  }

  getShortToolTip(dmgVal, dmgName) {
    let dmgIcon = this.#getDamageIcon(dmgName);
    return `<img src="systems/D35E/icons/damage-type/${dmgIcon}.svg" title="${dmgName}" class="dmg-type-icon" />${dmgVal}`;
  }

  #getDamageIcon(dmgName) {
    let dmgIconBase = dmgName?.toLowerCase() || "";
    let dmgIcon = "unknown";
    switch (dmgIconBase) {
      case "fire":
      case "火焰":
      case "f":
        dmgIcon = "fire";
        break;
      case "cold":
      case "寒冷":
      case "c":
        dmgIcon = "cold";
        break;
      case "electricity":
      case "电击":
      case "electric":
      case "el":
      case "e":
        dmgIcon = "electricity";
        break;
      case "acid":
      case "强酸":
      case "a":
        dmgIcon = "acid";
        break;
      case "sonic":
      case "音波":
        dmgIcon = "sonic";
        break;
      case "air":
      case "气系":
        dmgIcon = "air";
        break;
      case "piercing":
      case "穿刺":
      case "p":
        dmgIcon = "p";
        break;
      case "slashing":
      case "挥砍":
      case "s":
        dmgIcon = "s";
        break;
      case "bludgeoning":
      case "钝击":
      case "b":
        dmgIcon = "b";
        break;
      case "unarmed":
      case "徒手":
        dmgIcon = "unarmed";
        break;
      case "positive energy":
      case "正能量":
        dmgIcon = "positive-energy";
        break;
      case "force":
      case "力场":
        dmgIcon = "force";
        break;
      case "治疗":
      case "修复":
        dmgIcon = "heal";
        break;
      case "negative energy":
      case "负能量":
        dmgIcon = "negative-energy";
        break;
      default:
        return "unknown";
    }
    return dmgIcon;
  }

  async addDamage({ extraParts = [], primaryAttack = true, critical = false, multiattack = 0, modifiers = {} } = {}) {
    if (!this.item) return;

    let isMultiattack = multiattack > 0;
    this.hasDamage = true;
    let data = this.damage;
    if (isMultiattack)
      data = {
        flavor: "",
        tooltip: "",
        total: 0,
      };
    if (critical === true) data = this.critDamage;

    const rolls = new ItemRolls(this.item).rollDamage({
      data: this.rollData,
      extraParts: extraParts,
      primaryAttack: primaryAttack,
      critical: critical,
      modifiers: modifiers,
      replacedEnh: Math.max(this.ammoEnh, this.rollData.item?.enh || 0),
    });
    rolls.forEach((r) => {
      this.rolls.push(r.roll || r);
    });
    // Add tooltip
    let tooltips = "";
    let totalDamage = 0;
    let shortTooltips = [];
    let critShortTooltips = [];
    let damageTypeTotal = new Map();

    const tooltipsAndDamage = await this.createTooltipsForRolls(rolls, totalDamage, damageTypeTotal, tooltips);
    totalDamage = tooltipsAndDamage.totalDamage;
    tooltips = tooltipsAndDamage.tooltips;

    damageTypeTotal.forEach((value, key) => {
      if (!critical) shortTooltips.push(this.getShortToolTip(value.value, value.name));
      else critShortTooltips.push(this.getShortToolTip(value.value, value.name));
    });
    // Add normal data
    let flavor;
    if (isMultiattack)
      flavor = game.i18n.localize("D35E.Damage") + ` (${game.i18n.localize("D35E.SubAttack")} ${multiattack})`;
    else if (!critical)
      flavor = this.item.isHealing ? game.i18n.localize("D35E.Healing") : game.i18n.localize("D35E.Damage");
    else
      flavor = this.item.isHealing
        ? game.i18n.localize("D35E.HealingCritical")
        : game.i18n.localize("D35E.DamageCritical");
    const damageTypes = rolls.reduce((cur, o) => {
      if (o.damageType !== "" && cur.indexOf(o.damageType) === -1) cur.push(o.damageType);
      return cur;
    }, []);

    // Add cards
    if (critical) {
      this.cards = [];
      if (this.item.isHealing)
        this.cards.push(this.createCriticalChatCardData(game.i18n.localize("D35E.Apply"), -totalDamage, rolls));
      else this.cards.push(this.createCriticalChatCardData(game.i18n.localize("D35E.Apply"), totalDamage, rolls));
    } else {
      this.normalDamage = JSON.stringify(rolls);
      if (this.item.isHealing)
        this.cards.push(this.createChatCardData(game.i18n.localize("D35E.Apply"), -totalDamage, rolls));
      else if (isMultiattack)
        this.cards.push(
          this.createChatCardData(
            game.i18n.localize("D35E.Apply") + ` (${game.i18n.localize("D35E.SubAttack")} ${multiattack})`,
            totalDamage,
            rolls
          )
        );
      else this.cards.push(this.createChatCardData(game.i18n.localize("D35E.Apply"), totalDamage, rolls));
    }

    data.flavor = flavor;
    data.tooltip = tooltips;
    if (!critical) data.shortTooltip = "(" + shortTooltips.join("") + ")";
    else data.critShortTooltip = "(" + critShortTooltips.join("") + ")";
    data.total = rolls.reduce((cur, roll) => {
      return cur + roll.roll.total;
    }, 0);
    if (isMultiattack) {
      this.subDamage.push(data);
      this.hasSubdamage = true;
    }
    this.addAltDamage();
  }

  async addAltDamage() {
    if (!this.item) return;

    let data = this.altDamage;

    const rolls = new ItemRolls(this.item).rollAlternativeDamage({
      data: this.rollData,
    });
    if (!rolls || rolls.length === 0) {
      return;
    }
    this.hasAltDamage = true;

    rolls.forEach((r) => {
      this.rolls.push(r.roll || r);
    });
    // Add tooltip
    let tooltips = "";
    let totalDamage = 0;
    let shortTooltips = [];
    let damageTypeTotal = new Map();
    const tooltipsAndDamage = await this.createTooltipsForRolls(rolls, totalDamage, damageTypeTotal, tooltips);
    totalDamage = tooltipsAndDamage.totalDamage;
    tooltips = tooltipsAndDamage.tooltips;
    damageTypeTotal.forEach((value, key) => {
      shortTooltips.push(this.getShortToolTip(value.value, value.name));
    });
    // Add normal data
    let flavor = game.i18n.localize("D35E.AlternativeDamage");
    const damageTypes = rolls.reduce((cur, o) => {
      if (o.damageType !== "" && cur.indexOf(o.damageType) === -1) cur.push(o.damageType);
      return cur;
    }, []);

    this.altCards.push(this.createChatCardData(game.i18n.localize("D35E.ApplyAlt"), totalDamage, rolls));

    data.flavor = flavor;
    data.tooltip = tooltips;
    data.shortTooltip = "(" + shortTooltips.join("") + ")";
    data.total = rolls.reduce((cur, roll) => {
      return cur + roll.roll.total;
    }, 0);
  }

  #isNumeric(str) {
    if (typeof str != "string") return false // we only process strings!
    return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
        !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
  }

  async createTooltipsForRolls(rolls, totalDamage, damageTypeTotal, tooltips) {
    for (let roll of rolls) {
      const parts = roll.roll.dice.map((d) => d.getTooltipData());
      let formulas = [];
      for (let part of parts) {
        formulas.push(part.formula);
      }
      if (!!roll.base) {
        for (let part of roll.base.split("+")) {
          if (this.#isNumeric(part)) {
            formulas.push(part);
          }
        }
      }
      let formulaText = "";
      if (formulas.length) {
        formulaText = ` (${formulas.join(" ")})`;
      }
      let sourceText = "";
      if (roll.source) {
        sourceText = ` (${roll.source})`;
      }
      let tooltip = $(await roll.roll.getTooltip());

      let totalText = roll.roll.total.toString();
      tooltip = `<tr>
                <td><img src="systems/D35E/icons/damage-type/${this.#getDamageIcon(roll.damageType)}.svg" title="${
        roll.damageType
      }" class="dmg-type-icon" /> <b>${roll.damageType || "Unknown"} ${sourceText}</b></td>
                <td><b>${totalText}</b> ${formulaText}</td>
                </tr>
                `;
      // Alter tooltip
      let tooltipHtml = $(tooltip);
      totalDamage += roll.roll.total;
      tooltip = tooltipHtml[0].outerHTML;
      if (!damageTypeTotal.has(roll.damageTypeUid))
        damageTypeTotal.set(roll.damageTypeUid, { name: roll.damageType, value: 0 });
      let _dtt = damageTypeTotal.get(roll.damageTypeUid);
      _dtt.value += roll.roll.total;

      tooltips += tooltip;
    }
    tooltips = `<div class="table-container"><table>${tooltips}</table></div>`;
    return { totalDamage, tooltips };
  }

  createCriticalChatCardData(label, totalDamage, rolls) {
    return {
      normalDamage: this.normalDamage,
      label: label,
      value: Math.max(totalDamage, 1),
      data: JSON.stringify(rolls),
      alignment: JSON.stringify(this.item.system.alignment),
      material: this.ammoMaterial || JSON.stringify(this.item.system.material),
      enh: this.item.system.epic
        ? 10
        : this.item.system.magic
        ? 1
        : Math.max(this.ammoEnh, this.item?.system?.enh || 0),
      action: "applyDamage",
      natural20: this.natural20,
      fumble: this.fumble,
      natural20Crit: this.natural20Crit,
      fumbleCrit: this.fumbleCrit,
      incorporeal: this.item.system.incorporeal || this.item.actor.system.traits.incorporeal,
    };
  }

  createChatCardData(label, totalDamage, rolls) {
    return {
      label: label,
      value: Math.max(totalDamage, 1),
      data: JSON.stringify(rolls),
      alignment: JSON.stringify(this.item.system.alignment),
      material: this.ammoMaterial || JSON.stringify(this.item.system.material),
      enh: this.item.system.epic
        ? 10
        : this.item.system.magic
        ? 1
        : Math.max(this.ammoEnh, this.item?.system?.enh || 0),
      action: "applyDamage",
      natural20: this.natural20,
      fumble: this.fumble,
      natural20Crit: this.natural20Crit,
      fumbleCrit: this.fumbleCrit,
      incorporeal: this.item.system.incorporeal || this.item?.actor?.system?.traits?.incorporeal,
    };
  }

  async addEffect({ primaryAttack = true, actor = null, useAmount = 1, cl = null, spellPenetration = null } = {}) {
    if (!this.item) return;
    this.effectNotes = await new ItemRolls(this.item).rollEffect(
      { primaryAttack: primaryAttack },
      actor,
      this.rollData
    );
    this.spellPenetration = spellPenetration;
    this.isSpell = !!cl;
    await this.addSpecial(actor, useAmount, cl, spellPenetration);
  }

  async addSpecial(actor = null, useAmount = 1, cl = null, spellPenetration = null) {
    let _actor = this.item.actor;
    if (actor != null) _actor = actor;
    if (!this.item) return;
    if (this.item.system.specialActions === undefined || this.item.system.specialActions === null) return;

    this.isSpell = !!cl;
    this.spellPenetration = spellPenetration;
    for (let action of this.item.system.specialActions) {
      if (cl === null) {
        if (this.item.data.type === "spell") {
          const spellbookIndex = this.item.system.spellbook;
          const spellbook = _actor.system.attributes.spells.spellbooks[spellbookIndex];
          cl = spellbook.cl.total + (this.item.system.clOffset || 0);
        }
      }

      if (action.condition !== undefined && action.condition !== null && action.condition !== "") {
        // //game.D35E.logger.log('Condition', action.condition, this.rollData)
        if (!new Roll35e(action.condition, this.rollData).roll().total) {
          continue;
        }
      }
      let actionData = action.action
        .replace(/\(@dc\)/g, `${this.rollData?.dc?.dc || 0}`)
        .replace(/\(@spellDuration\)/g, `${this.rollData?.spellDuration || 0}`)
        .replace(/\(@cl\)/g, `${cl}`)
        .replace(/\(@useAmount\)/g, `${useAmount}`)
        .replace(/\(@additionalPowerPointsUsed\)/g, `${useAmount}`)
        .replace(/\(@augmentation\)/g, `${useAmount}`)
        .replace(/\(@attack\)/g, `${this.attack.total}`)
        .replace(/\(@damage\)/g, `${this.damage.total}`);

      // If this is self action, run it on the actor on the time of render
      await _actor.autoApplyActionsOnSelf(actionData);
      this.special.push({
        label: action.name,
        value: actionData,
        isTargeted: action.action.endsWith("target") || action.action.endsWith("target;"),
        action: "customAction",
        img: action.img,
        hasImg: action.img !== undefined && action.img !== null && action.img !== "",
      });
    }
  }

  async addCommandAsSpecial(
    name,
    img,
    actionData,
    actor = null,
    useAmount = 1,
    cl = null,
    range = 0,
    originatingAttackId = null
  ) {
    let _actor = actor != null
      ? actor
      : this.item.actor;

    if (cl === null && this.item.data.type === "spell") {
      const spellbookIndex = this.item.system.spellbook;
      const spellbook = _actor.system.attributes.spells.spellbooks[spellbookIndex];
      cl = spellbook.cl.total + (this.item.system.clOffset || 0);
    }

    let _actionData = actionData
      .replace(/\(@dc\)/g, `${this.rollData?.dc?.dc || 0}`)
      .replace(/\(@cl\)/g, `${cl}`)
      .replace(/\(@useAmount\)/g, `${useAmount}`)
      .replace(/\(@additionalPowerPointsUsed\)/g, `${useAmount}`)
      .replace(/\(@augmentation\)/g, `${useAmount}`)
      .replace(/\(@range\)/g, `${range}`)
      .replace(/\(@attack\)/g, `${this.attack.total}`)
      .replace(/\(@damage\)/g, `${this.damage.total}`);

    // If this is self action, run it on the actor on the time of render
    await _actor.autoApplyActionsOnSelf(_actionData, originatingAttackId);
    this.special.push({
      label: name,
      value: _actionData,
      isTargeted: _actionData.endsWith("target") || _actionData.endsWith("target;"),
      action: "customAction",
      img: img,
      hasImg: img !== undefined && img !== null && img !== "",
      originatingAttackId,
    });
  }
}
