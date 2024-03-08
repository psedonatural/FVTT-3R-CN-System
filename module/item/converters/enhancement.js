import {ItemSpellHelper} from "../helpers/itemSpellHelper.js";

export class ItemEnhancementConverter {
    static async toEnhancement(origData, type, cl) {
        let newItemData = duplicate(game.system.template.Item.enhancement);
        for (let t of newItemData.templates) {
            mergeObject(newItemData, duplicate(game.system.template.Item.templates[t]));
        }
        delete newItemData.templates;
        newItemData = {
            type: "enhancement",
            name: origData.name,
            system: newItemData,
        };
        let system = newItemData.system;
        const slcl = ItemSpellHelper.getMinimumCasterLevelBySpellData(origData.system);
        system.enhancementType = "misc";

        // Set name
        newItemData.name = `${origData.name}`;
        newItemData.img = origData.img;
        newItemData.id = origData._id
        if (type === 'command' || type === 'use') {
            system.uses.per = "day";
            system.uses.maxFormula = "1";
            system.uses.value = 1;
            system.uses.max = 1;
        } else {
            system.uses.per = "charges";
            system.uses.maxFormula = "50";
            system.uses.value = 50;
            system.uses.max = 50;
        }

        system.uses.chargesPerUse = 1


        system.baseCl = slcl[1]
        system.enhIncreaseFormula = ""
        system.priceFormula = ""
        system.price = 0

        system.isFromSpell = true;

        // Set activation method
        system.activation.type = "standard";

        system.measureTemplate = getProperty(origData, "system.measureTemplate");


        // Set damage formula
        system.actionType = origData.system.actionType;
        for (let d of getProperty(origData, "system.damage.parts")) {
            d[0] = d[0].replace(/@sl/g, slcl[0]);
            system.damage.parts.push(d);
        }

        // Set saves
        system.save.description = origData.system.save.description;
        system.save.type = origData.system.save.type;
        system.save.ability = origData.system.save.ability;
        system.save.dc = 10 + slcl[0] + Math.floor(slcl[0] / 2);
        system.sr = origData.system.sr
        system.pr = origData.system.pr

        // Copy variables
        system.attackNotes = origData.system.attackNotes;
        system.effectNotes = origData.system.effectNotes;
        system.attackBonus = origData.system.attackBonus;
        system.critConfirmBonus = origData.system.critConfirmBonus;
        system.specialActions = origData.system.specialActions;
        system.attackCountFormula = origData.system.attackCountFormula;

        // Determine aura power
        let auraPower = "faint";
        for (let a of CONFIG.D35E.magicAuraByLevel.item) {
            if (a.level <= slcl[1]) auraPower = a.power;
        }
        ItemSpellHelper.calculateSpellCasterLevelLabels(slcl);

        // Set description
        system.description.value = getProperty(origData, "data.description.value");

        return newItemData;
    }

    static async toEnhancementBuff(origData) {
        let newItemData = duplicate(game.system.template.Item.enhancement);
        for (let t of newItemData.templates) {
            mergeObject(newItemData, duplicate(game.system.template.Item.templates[t]));
        }
        delete newItemData.templates;
        newItemData = {
            type: "enhancement",
            name: origData.name,
            system: newItemData,
        };
        let system = newItemData.system;

        system.enhancementType = "misc";

        // Set name
        newItemData.name = `${origData.name}`;
        newItemData.img = origData.img;
        newItemData.id = origData._id

        system.isFromBuff = true;

        system.enh = 1
        system.enhIncreaseFormula = ""
        system.priceFormula = ""
        system.price = 0


        system.changes = origData.system.changes;
        for (const c of system.changes) {
            c[0] = c[0].replace(new RegExp('@item.level', 'g'), '@enhancement');
        }
        system.contextNotes = origData.system.contextNotes;
        for (const c of system.contextNotes) {
            c[0] = c[0].replace(new RegExp('@item.level', 'g'), '@enhancement');
        }


        system.description.value = getProperty(origData, "system.description.value");

        return newItemData;
    }
}
