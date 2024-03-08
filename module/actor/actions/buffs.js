import { LogHelper } from "../../helpers/LogHelper.js";

export class ActorBuffs {
  /**
   *
   * @param actor
   */
  constructor(actor) {
    this.actor = actor;
  }

  // @Object { id: { title: String, type: buff/string, img: imgPath, active: true/false }, ... }
  calcBuffTextures() {
    LogHelper.log("calcBuffTextures");
    const buffs = this.actor.items.filter((o) => o.type === "buff" || o.type === "aura");
    return buffs.reduce((acc, cur) => {
      const id = cur.uuid;
      if (cur.system.hideFromToken) return acc;
      if (cur.system?.buffType === "shapechange") return acc;
      if (!acc[id]) acc[id] = { id: cur.id, label: cur.name, icon: cur.data.img, item: cur };
      if (cur.system.active) acc[id].active = true;
      else acc[id].active = false;
      return acc;
    }, {});
  }
}
