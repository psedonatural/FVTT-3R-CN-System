import { Item35E } from "./entity.js";
import { ItemEnhancements } from "./extensions/enhancement.js";

export class Weapon35E extends Item35E {
  constructor(...args) {
    super(...args);
    this.extensionMap.set("enhancement", new ItemEnhancements(this));
  }

  get subType() {
    return this.system.weaponType;
  }

  updateGetSubtype(updated) {
    return updated["system.weaponType"] || this.system.weaponType;
  }
}
