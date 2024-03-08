import { Roll35e } from "../../roll.js";

export class ItemSpellHelper {
  /**
   * Adjust spell CL based on item and actor
   * @private
   */
  static adjustSpellCL(item, itemData, rollData) {
    let cl = 0;
    if (itemData.spellbook) {
      const spellbookIndex = itemData.spellbook;
      const spellbook = item.actor.system.attributes.spells.spellbooks[spellbookIndex];
      cl =
        spellbook.cl.total +
        (itemData.clOffset || 0) +
        (rollData.featClBonus || 0) -
        (item.actor.system.attributes.energyDrain || 0);
    }
    if (itemData.deck) {
      const deckIndex = itemData.deck;
      const deck = item.actor.system.attributes.cards.decks[deckIndex];
      cl =
        deck.cl.total +
        (itemData.clOffset || 0) +
        (rollData.featClBonus || 0) -
        (item.actor.system.attributes.energyDrain || 0);
    }
    rollData.cl = Math.max(new Roll35e(`${itemData.baseCl}`, rollData).roll().total, cl);
    rollData.spellPenetration = rollData.cl + (new Roll35e(rollData?.featSpellPenetrationBonus || "0", rollData).roll().total || 0);
  }

  static async generateSpellDescription(sourceItem, renderTextDescription = false) {
    const reSplit = CONFIG.D35E.re.traitSeparator;

    const label = {
      school: (CONFIG.D35E.spellSchools[getProperty(sourceItem, "system.school")] || "").toLowerCase(),
      subschool: getProperty(sourceItem, "system.subschool") || "",
      types: "",
    };
    const renderData = {
      data: mergeObject(sourceItem?.system || {}, { inplace: false }),
      label: label,
    };

    renderData.renderedShortDescription = await TextEditor.enrichHTML(getProperty(renderData.data, "shortDescription"), {async: true})
    renderData.renderTextDescription = renderTextDescription;
    // Set subschool and types label
    const types = getProperty(sourceItem, "system.types");
    if (typeof types === "string" && types.length > 0) {
      label.types = types.split(reSplit).join(", ");
    }
    // Set information about when the spell is learned
    renderData.learnedAt = {};
    renderData.learnedAt.class = (getProperty(sourceItem, "system.learnedAt.class") || [])
      .map((o) => {
        return `${o[0]} ${o[1]}`;
      })
      .sort()
      .join(", ");
    renderData.learnedAt.domain = (getProperty(sourceItem, "system.learnedAt.domain") || [])
      .map((o) => {
        return `${o[0]} ${o[1]}`;
      })
      .sort()
      .join(", ");
    renderData.learnedAt.subDomain = (getProperty(sourceItem, "system.learnedAt.subDomain") || [])
      .map((o) => {
        return `${o[0]} ${o[1]}`;
      })
      .sort()
      .join(", ");
    renderData.learnedAt.elementalSchool = (getProperty(sourceItem, "system.learnedAt.elementalSchool") || [])
      .map((o) => {
        return `${o[0]} ${o[1]}`;
      })
      .sort()
      .join(", ");
    renderData.learnedAt.bloodline = (getProperty(sourceItem, "system.learnedAt.bloodline") || [])
      .map((o) => {
        return `${o[0]} ${o[1]}`;
      })
      .sort()
      .join(", ");

    // Set casting time label
    if (getProperty(sourceItem, "system.activation")) {
      const activationCost = getProperty(sourceItem, "system.activation.cost");
      const activationType = getProperty(sourceItem, "system.activation.type");

      if (activationType) {
        if (CONFIG.D35E.abilityActivationTypesPlurals[activationType] != null) {
          if (activationCost === 1) label.castingTime = `${CONFIG.D35E.abilityActivationTypes[activationType]}`;
          else label.castingTime = `${CONFIG.D35E.abilityActivationTypesPlurals[activationType]}`;
        } else label.castingTime = `${CONFIG.D35E.abilityActivationTypes[activationType]}`;
      }
      if (!Number.isNaN(activationCost) && label.castingTime != null)
        label.castingTime = `${activationCost} ${label.castingTime}`;
      if (label.castingTime) label.castingTime = label.castingTime.toLowerCase();
    }

    renderData.psionicPower = getProperty(sourceItem, "system.isPower");

    // Set components label
    let components = [];
    for (let [key, value] of Object.entries(getProperty(sourceItem, "system.components") || {})) {
      if (key === "value" && value.length > 0) components.push(...value.split(reSplit));
      else if (key === "verbal" && value) components.push("V");
      else if (key === "somatic" && value) components.push("S");
      else if (key === "material" && value) components.push("M");
      else if (key === "focus" && value) components.push("F");
    }
    if (getProperty(sourceItem, "system.components.divineFocus") === 1) components.push("DF");
    const df = getProperty(sourceItem, "system.components.divineFocus");
    // Sort components
    const componentsOrder = ["V", "S", "M", "F", "DF"];
    components.sort((a, b) => {
      let index = [componentsOrder.indexOf(a), components.indexOf(b)];
      if (index[0] === -1 && index[1] === -1) return 0;
      if (index[0] === -1 && index[1] >= 0) return 1;
      if (index[0] >= 0 && index[1] === -1) return -1;
      return index[0] - index[1];
    });
    components = components.map((o) => {
      if (o === "M") {
        if (df === 2) o = "M/DF";
        if (getProperty(sourceItem, "system.materials.value"))
          o = `${o} (${getProperty(sourceItem, "system.materials.value")})`;
      }
      if (o === "F") {
        if (df === 3) o = "F/DF";
        if (getProperty(sourceItem, "system.materials.focus"))
          o = `${o} (${getProperty(sourceItem, "system.materials.focus")})`;
      }
      return o;
    });
    if (components.length > 0) label.components = components.join(", ");

    // Set duration label
    {
      const durationData = getProperty(sourceItem, "system.spellDurationData");
      const duration = getProperty(sourceItem, "system.spellDuration");
      if (durationData) {
        label.duration = ItemSpellHelper.getSpellDuration(durationData);
      } else if (duration) {
        label.duration = duration;
      }
    }
    // Set effect label
    {
      const effect = getProperty(sourceItem, "system.spellEffect");
      if (effect) label.effect = effect;
    }
    // Set targets label
    {
      const targets = getProperty(sourceItem, "system.target.value");
      if (targets) label.targets = targets;
    }
    // Set range label
    {
      const rangeUnit = getProperty(sourceItem, "system.range.units");
      const rangeValue = getProperty(sourceItem, "system.range.value");

      if (rangeUnit != null && rangeUnit !== "none") {
        label.range = (CONFIG.D35E.distanceUnits[rangeUnit] || "").toLowerCase();
        if (rangeUnit === "close") label.range = `${label.range} (25 ft. + 5 ft./2 levels)`;
        else if (rangeUnit === "medium") label.range = `${label.range} (100 ft. + 10 ft./level)`;
        else if (rangeUnit === "long") label.range = `${label.range} (400 ft. + 40 ft./level)`;
        else if (["ft", "mi"].includes(rangeUnit)) {
          if (!rangeValue) label.range = "";
          else label.range = `${rangeValue} ${label.range}`;
        }
      }
    }
    // Set area label
    {
      const area = getProperty(sourceItem, "system.spellArea");

      if (area) label.area = area;
    }

    // Set DC and SR
    {
      const savingThrowDescription = getProperty(sourceItem, "system.save.type")
        ? CONFIG.D35E.savingThrowTypes[getProperty(sourceItem, "system.save.type")]
        : getProperty(sourceItem, "system.save.description") || "";
      if (savingThrowDescription) label.savingThrow = savingThrowDescription;
      else label.savingThrow = "none";

      const sr = getProperty(sourceItem, "system.sr");
      label.sr = sr === true ? "yes" : "no";
      const pr = getProperty(sourceItem, "system.pr");
      label.pr = pr === true ? "yes" : "no";

      if (getProperty(sourceItem, "system.range.units") !== "personal") renderData.useDCandSR = true;
    }

    if (getProperty(sourceItem, "system.powerPointsCost") > 0)
      label.powerPointsCost = getProperty(sourceItem, "system.powerPointsCost");
    label.display = getProperty(sourceItem, "system.display");
    return renderData;
  }

  static getSpellDuration(durationData, level = 1) {
    let durationLabel = "";
    game.D35E.logger.log(durationData)
    let needRounds = !["", "inst", "perm", "seeText","spec"].includes(durationData.units);
    if (!needRounds || !durationData.value) {
      durationLabel = CONFIG.D35E.timePeriodsSpells[durationData.units];
    } else {
      let isPerLevel = (durationData.value?.toString() ?? "").indexOf("@cl") !== -1;
      if (isPerLevel) {
        durationLabel =
          Roll35e.safeRoll(durationData.value, { cl: level }).total +
          " " +
          CONFIG.D35E.timePeriodsSpells[durationData.units];
      } else {
        let isSpecial = ["spec"].includes(durationData.units);
        if (isSpecial) durationLabel = durationData.value;
        else durationLabel = durationData.value + " " + CONFIG.D35E.timePeriodsSpells[durationData.units];
      }
    }
    if (durationData.dismissable) durationLabel = durationLabel + " (D)";
    return durationLabel;
  }

  static getMinimumCasterLevelBySpellData(itemData) {
    const learnedAt = getProperty(itemData, "learnedAt.class").reduce((cur, o) => {
      const classes = o[0].split("/");
      for (let cls of classes) cur.push([cls, o[1]]);
      return cur;
    }, []);
    let result = [9, 20];
    for (let o of learnedAt) {
      result[0] = Math.min(result[0], o[1]);

      // Hardcoding classes... this seems stupid. This probably is for spell DC.
      // We assume High
      result[1] = Math.min(result[1], 1 + Math.max(0, o[1] - 1) * 2);
      // const tc = CONFIG.PF1.classCasterType[o[0]] || "high";
      // if (tc === "high") {
      //   result[1] = Math.min(result[1], 1 + Math.max(0, (o[1] - 1)) * 2);
      // }
      // else if (tc === "med") {
      //   result[1] = Math.min(result[1], 1 + Math.max(0, (o[1] - 1)) * 3);
      // }
      // else if (tc === "low") {
      //   result[1] = Math.min(result[1], 4 + Math.max(0, (o[1] - 1)) * 3);
      // }
    }

    return result;
  }

  static calculateSpellCasterLevelLabels(slcl) {
    let clLabel;
    switch (slcl[1]) {
      case 1:
        clLabel = "1st";
        break;
      case 2:
        clLabel = "2nd";
        break;
      case 3:
        clLabel = "3rd";
        break;
      default:
        clLabel = `${slcl[1]}th`;
        break;
    }
    // Determine spell level label
    let slLabel;
    switch (slcl[0]) {
      case 1:
        slLabel = "1st";
        break;
      case 2:
        slLabel = "2nd";
        break;
      case 3:
        slLabel = "3rd";
        break;
      default:
        slLabel = `${slcl[1]}th`;
        break;
    }
    return { slLabel: slLabel, clLabel: clLabel };
  }
}
