import { Roll35e } from "../../roll.js";
import { linkData } from "../../lib.js";

export class ItemActiveHelper {
  static isActive(item) {
    if (!item) return false;
    return (
      item.type === "feat" ||
      item.type === "race" ||
      item.type === "class" ||
      ((item.type === "aura" || item.type === "buff") && getProperty(item.system, "active")) ||
      (item.type === "equipment" &&
        getProperty(item.system, "equipped") === true &&
        !getProperty(item.system, "melded"))
    );
  }
}
