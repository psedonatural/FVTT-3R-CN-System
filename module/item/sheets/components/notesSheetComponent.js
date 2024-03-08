import { ItemSheetComponent } from "./itemSheetComponent.js";

/***
 * Provides support for Changes Tab on an item
 */
export class NotesSheetComponent extends ItemSheetComponent {

    registerTab(sheetData) {
        sheetData.registeredTabs.push({id:'notes',name:"Notes",sheet:'systems/D35E/templates/items/parts/item-notes.html'})
    }

    activateListeners(html) {
        super.activateListeners(html);
    }

    prepareSheetData(sheetData) {
        if (this.sheet.item.system.contextNotes) {
            sheetData.contextNotes = {targets: {}};
            for (let [k, v] of Object.entries(CONFIG.D35E.contextNoteTargets)) {
                if (typeof v === "object") sheetData.contextNotes.targets[k] = v._label;
            }
            sheetData.data.system.contextNotes.forEach(item => {
                item.subNotes = {};
                // Add specific skills
                if (item[1] === "skill") {
                    if (this.sheet.item.actor != null) {
                        const actorSkills = this.sheet.item.actor.system.skills;
                        for (let [s, skl] of Object.entries(actorSkills)) {
                            if (!skl.subSkills) {
                                if (skl.custom) item.subNotes[`skill.${s}`] = skl.name;
                                else item.subNotes[`skill.${s}`] = CONFIG.D35E.skills[s];
                            } else {
                                for (let [s2, skl2] of Object.entries(skl.subSkills)) {
                                    item.subNotes[`skill.${s}.subSkills.${s2}`] = `${CONFIG.D35E.skills[s]} (${skl2.name})`;
                                }
                            }
                        }
                    } else {
                        for (let [s, skl] of Object.entries(CONFIG.D35E.skills)) {
                            if (!skl.subSkills) {
                                if (skl.custom) item.subNotes[`skill.${s}`] = skl.name;
                                else item.subNotes[`skill.${s}`] = CONFIG.D35E.skills[s];
                            } else {
                                for (let [s2, skl2] of Object.entries(skl.subSkills)) {
                                    item.subNotes[`skill.${s}.subSkills.${s2}`] = `${CONFIG.D35E.skills[s]} (${skl2.name})`;
                                }
                            }
                        }
                    }

                }
                // Add static targets
                else if (item[1] != null && CONFIG.D35E.contextNoteTargets.hasOwnProperty(item[1])) {
                    for (let [k, v] of Object.entries(CONFIG.D35E.contextNoteTargets[item[1]])) {
                        if (!k.startsWith("_")) item.subNotes[k] = v;
                    }
                }
            });
        }
    }
}
