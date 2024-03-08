import { Item35E } from "../entity.js";
import {EnhancementSheetComponent} from "./components/enhancementSheetComponent.js";
import {ItemSheetPF} from "./base.js";

export class WeaponSheet35E extends ItemSheetPF {
    constructor(...args) {
        super(...args);

        this.sheetComponents.push(new EnhancementSheetComponent(this));
    }

    async getData() {
        let sheetData = await super.getData();
        sheetData.isRanged = (this.item.system.weaponSubtype === "ranged" || this.item.system.properties["thr"] === true);

        sheetData.weaponCategories = {types: {}, subTypes: {}};
        for (let [k, v] of Object.entries(CONFIG.D35E.weaponTypes)) {
            if (typeof v === "object") sheetData.weaponCategories.types[k] = v._label;
        }
        const type = this.item.system.weaponType;
        if (hasProperty(CONFIG.D35E.weaponTypes, type)) {
            for (let [k, v] of Object.entries(CONFIG.D35E.weaponTypes[type])) {
                if (!k.startsWith("_")) sheetData.weaponCategories.subTypes[k] = v;
            }
        }   
        return sheetData;
    }
}
