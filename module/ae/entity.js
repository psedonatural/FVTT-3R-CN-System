export class ActiveEffectD35E extends ActiveEffect {
    async create(data, context) {
      const statusId = this["flags.core.statusId"],
        origin = this.origin,
        updates = {};
      if (statusId && this.parent?.system.attributes.conditions[statusId] === false) {
        updates[`data.attributes.conditions.${statusId}`] = true;
        await this.parent.update(updates);
        let created = this.parent.effects.find((e) => e.getFlag("core", "statusId") === statusId);
        if (created) return created;
      }
      if (origin) {
        let buffItem = this.parent.items.get(origin.split(".")[3]);
        if (buffItem && !buffItem.system.active) await buffItem.update({ "data.active": true });
      }
      return super.create(data, context);
    }
  
    async delete(context) {
      const statusId = this.getFlag("core", "statusId"),
        origin = this.origin?.split(".")?.[3] ?? null,
        parentActor = this.parent,
        returnVal = await super.delete(context),
        updates = {};
      if (statusId && parentActor.system.attributes.conditions[statusId]) {
        updates[`data.attributes.conditions.${statusId}`] = false;
        parentActor.update(updates);
      } else if (origin && parentActor.items.get(origin)) parentActor.items.get(origin).update({ "data.active": false });
      return returnVal;
    }
  
    get isTemporary() {
      const duration = this?.duration?.seconds ?? (this?.duration?.rounds || this?.duration?.turns) ?? 0;
      return duration > 0 || this.getFlag("core", "statusId") || this.getFlag("D35E", "show");
    }
  }
