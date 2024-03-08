import {ItemSpellHelper} from "../helpers/itemSpellHelper.js";

export class ItemConsumableConverter {
    static async toConsumable(origData, type, cl, scrollType) {
        let data = duplicate(game.system.template.Item.consumable);
        for (let t of data.templates) {
            mergeObject(data, duplicate(game.system.template.Item.templates[t]));
        }
        delete data.templates;
        data = {
            type: "consumable",
            name: origData.name,
            system: data,
        };
        let system = data.system;

        const slcl = ItemSpellHelper.getMinimumCasterLevelBySpellData(origData.system);
        if (cl) slcl[1] = cl;
        // Set consumable type
        system.consumableType = type;

        // Set name
        if (type === "wand") {
            data.name = `Wand of ${origData.name}`;
            data.img = "systems/D35E/icons/items/magic/generated/wand-low.png";
            system.price = Math.max(0.5, slcl[0]) * slcl[1] * 750;
            system.hardness = 5;
            system.hp.max = 5;
            system.hp.value = 5;
        } else if (type === "potion") {
            data.name = `Potion of ${origData.name}`;
            data.img = "systems/D35E/icons/items/potions/generated/med.png";
            system.price = Math.max(0.5, slcl[0]) * slcl[1] * 50;
            system.hardness = 1;
            system.hp.max = 1;
            system.hp.value = 1;
        } else if (type === "scroll") {
            data.name = `Scroll of ${origData.name}`;
            data.img = "systems/D35E/icons/items/magic/generated/scroll.png";
            system.price = Math.max(0.5, slcl[0]) * slcl[1] * 25;
            system.hardness = 0;
            system.hp.max = 1;
            system.hp.value = 1;
        } else if (type === "dorje") {
            data.name = `Dorje of ${origData.name}`;
            data.img = "systems/D35E/icons/items/magic/generated/droje.png";
            system.price = Math.max(0.5, slcl[0]) * slcl[1] * 750;
            system.hardness = 5;
            system.hp.max = 5;
            system.hp.value = 5;
        } else if (type === "tattoo") {
            data.name = `Tattoo of ${origData.name}`;
            data.img = "systems/D35E/icons/items/magic/generated/tattoo.png";
            system.price = Math.max(0.5, slcl[0]) * slcl[1] * 50;
            system.hardness = 1;
            system.hp.max = 1;
            system.hp.value = 1;
        } else if (type === "powerstone") {
            data.name = `Power Stone of ${origData.name}`;
            data.img = "systems/D35E/icons/items/magic/generated/crystal.png";
            system.price = Math.max(0.5, slcl[0]) * slcl[1] * 25;
            system.hardness = 0;
            system.hp.max = 1;
            system.hp.value = 1;
        }


        // Set charges
        if (type === "wand" || type === "dorje") {
            system.uses.maxFormula = "50";
            system.uses.value = 50;
            system.uses.max = 50;
            system.uses.per = "charges";
        } else {
            system.uses.per = "single";
        }

        // Set activation method
        system.activation.type = "standard";

        // Set measure template
        if (type !== "potion" && type !== "tattoo") {
            system.measureTemplate = getProperty(origData, "data.measureTemplate");
        }

        // Set damage formula
        system.actionType = origData.system.actionType;
        for (let d of getProperty(origData, "data.damage.parts")) {
            d[0] = d[0].replace(/@sl/g, slcl[0]);
            system.damage.parts.push(d);
        }

        // Set saves
        system.save.description = origData.system.save.description;
        system.save.type = origData.system.save.type;
        system.save.ability = origData.system.save.ability;
        system.save.dc = 10 + slcl[0] + Math.floor(slcl[0] / 2);
        system.baseCl = `${slcl[1]}`
        system.sr = origData.system.sr
        system.pr = origData.system.pr
        // Copy variables
        if (scrollType)
            system.scrollType = scrollType;
        system.attackNotes = origData.system.attackNotes;
        system.actionType = origData.system.actionType;
        system.effectNotes = origData.system.effectNotes;
        system.attackBonus = origData.system.attackBonus;
        system.critConfirmBonus = origData.system.critConfirmBonus;
        system.specialActions = origData.system.specialActions;
        system.isFromSpell = true;


        system.attackCountFormula = origData.system.attackCountFormula.replace(/@sl/g, slcl[0]);

        // Determine aura power
        let auraPower = "faint";
        for (let a of CONFIG.D35E.magicAuraByLevel.item) {
            if (a.level <= slcl[1]) auraPower = a.power;
        }
        if (type === "potion") {
            data.img = `systems/D35E/icons/items/potions/generated/${auraPower}.png`;
        }
        // Determine caster level label
        let slClLabels = ItemSpellHelper.calculateSpellCasterLevelLabels(slcl);
        let clLabel = slClLabels.clLabel;
        let slLabel = slClLabels.slLabel;


        // Set description
        system.description.value = await renderTemplate("systems/D35E/templates/internal/consumable-description.html", {
            origData: origData,
            data: data,
            isWand: type === "wand" || type === "dorje",
            isPotion: type === "potion" || type === "tattoo",
            isScroll: type === "scroll" || type === "powerstone",
            auraPower: auraPower,
            aura: (CONFIG.D35E.spellSchools[origData.system.school] || "").toLowerCase(),
            sl: slcl[0],
            cl: slcl[1],
            slLabel: slLabel,
            clLabel: clLabel,
            config: CONFIG.D35E,
        });



        return data;
    }
}
