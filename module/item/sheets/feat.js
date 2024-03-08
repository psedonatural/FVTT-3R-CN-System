
import {ItemSheetPF} from "./base.js";
import {LinkedItemsSheetComponent} from "./components/linkedItemsSheetComponent.js";

export class FeatSheet35E extends ItemSheetPF {
    constructor(...args) {
        super(...args);

        this.sheetComponents.push(new LinkedItemsSheetComponent(this));
    }

    async getData() {
        let sheetData = await super.getData();
        sheetData.isClassFeature = true; //Any feat can be a class feature
        if (this.item.system.featType === 'spellSpecialization')
            sheetData.isSpellSpecialization = true;
        sheetData.isFeat = this.item.system.featType === "feat"
        sheetData.hasCombatChanges = true;
        sheetData.hasRequirements = true;
        sheetData.featCounters = []
        if (this.item.actor) {
            for (let [a, s] of Object.entries(this.item.actor.system.counters.feat || [])) {
                if (a === "base") continue;
                sheetData.featCounters.push({name: a.charAt(0).toUpperCase() + a.substr(1).toLowerCase(), val: a})
            }
        }
        return sheetData;
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find("button[name='add-domain-spells']").click(this.#addSpellsToSpellbook.bind(this));
        html.find('div[data-tab="description"] .item-add').click(this._addSpellListSpellToSpellbook.bind(this));

    }

    async #addSpellsToSpellbook(event) {
        event.preventDefault();
        if (this.item.actor == null) throw new Error(game.i18n.localize("D35E.ErrorItemNoOwner"));
        await this.item.parent.addSpellsToSpellbook(this.item);
    }

}
