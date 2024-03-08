import {Item35E} from "./entity.js";
import {ItemEnhancements} from "./extensions/enhancement.js";
import { ItemSpellHelper } from './helpers/itemSpellHelper.js'

export class Spell35E extends Item35E {
    constructor(...args) {
        super(...args);
    }


    get subType() {
    }

    async getDescription(unidentified = false) {
        return TextEditor.enrichHTML(getProperty(this.system, "shortDescription"), {async: true, rollData: this.getActorItemRollData()})
    }

    async getChatDescription() {
        const data = await ItemSpellHelper.generateSpellDescription(this, true);
        return renderTemplate("systems/D35E/templates/internal/spell-description.html", data);
    }
}
