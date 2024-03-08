import { Item35E } from "../entity.js";
import {EnhancementSheetComponent} from "./components/enhancementSheetComponent.js";
import {ItemSheetPF} from "./base.js";
import {LinkedItemsSheetComponent} from "./components/linkedItemsSheetComponent.js";

export class EquipmentSheet35E extends ItemSheetPF {
    constructor(...args) {
        super(...args);

        this.sheetComponents.push(new EnhancementSheetComponent(this));
        this.sheetComponents.push(new LinkedItemsSheetComponent(this));
    }

    async getData() {
        let sheetData = await super.getData();
        sheetData.hasCombatChanges = true;
        // Prepare categories for equipment
        sheetData.equipmentCategories = {types: {}, subTypes: {}};
        for (let [k, v] of Object.entries(CONFIG.D35E.equipmentTypes)) {
            if (typeof v === "object") sheetData.equipmentCategories.types[k] = v._label;
        }
        const type = this.item.system.equipmentType;
        if (hasProperty(CONFIG.D35E.equipmentTypes, type)) {
            for (let [k, v] of Object.entries(CONFIG.D35E.equipmentTypes[type])) {
                // Add static targets
                if (!k.startsWith("_")) sheetData.equipmentCategories.subTypes[k] = v;
            }
        }

        // Prepare slots for equipment
        sheetData.equipmentSlots = CONFIG.D35E.equipmentSlots[type];

        // Whether the equipment should show armor data
        sheetData.showArmorData = ["armor", "shield"].includes(type);

        // Whether the current equipment type has multiple slots
        sheetData.hasMultipleSlots = Object.keys(sheetData.equipmentSlots).length > 1;
        return sheetData;
    }
}
