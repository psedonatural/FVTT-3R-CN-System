import {Item35E} from "./entity.js";
import {ItemEnhancements} from "./extensions/enhancement.js";

export class Feat35E extends Item35E {
  constructor(...args) {
    super(...args);
  }
  get subType() {
    return this.system.featType;
  }

  updateGetSubtype(updated) {
    return updated['system.featType'] || this.system.featType;
  }

}
