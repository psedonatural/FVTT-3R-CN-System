import {LogHelper} from "../../helpers/LogHelper.js";

export class ActorConditions {
    /**
     *
     * @param actor
     */
    constructor(actor) {
        this.actor = actor;
    }
    
    async toggleConditionStatusIcons() {
        if (this.actor._runningFunctions["toggleConditionStatusIcons"]) return;
        this.actor._runningFunctions["toggleConditionStatusIcons"] = {};


        const tokens = this.actor.token ? [this.actor.token] : this.actor.getActiveTokens().filter((o) => o != null);
        const buffTextures = this.actor.buffs.calcBuffTextures();

        for (let t of tokens) {
            LogHelper.log("toggleConditionStatusIcons")
            // const isLinkedToken = getProperty(this.actor.data, "token.actorLink");
            const actor = t.actor ? t.actor : this;
            if (!actor.testUserPermission(game.user, "OWNER")) continue;
            const fx = [...actor.effects];

            let brokenEffects = new Set();
            for (let effect of fx) {
                brokenEffects.add(effect.id)
            }

            // Create and delete buff ActiveEffects
            let toCreate = [];
            let toDelete = [];
            for (let [id, obj] of Object.entries(buffTextures)) {
                const existing = fx.find((f) => f.data.origin === id);
                if (obj.active && !existing) toCreate.push(obj.item.getRawEffectData());
                else if (!obj.active && existing) toDelete.push(existing.id);
                if (existing) {
                    brokenEffects.delete(existing.id)
                }
            }



            // Create and delete condition ActiveEffects
            for (let k of Object.keys(CONFIG.D35E.conditions)) {
                const idx = fx.findIndex((e) => e.getFlag("core", "statusId") === k);
                const hasCondition = actor.data.data.attributes.conditions[k] === true;
                const hasEffectIcon = idx >= 0;
                const obj = t.object ?? t;

                if (hasCondition && !hasEffectIcon) {
                    toCreate.push({
                        "flags.core.statusId": k,
                        name: CONFIG.D35E.conditions[k],
                        label: CONFIG.D35E.conditions[k],
                        icon: CONFIG.D35E.conditionTextures[k],
                    });
                } else if (!hasCondition && hasEffectIcon) {
                    const removeEffects = fx.filter((e) => e.getFlag("core", "statusId") === k);
                    toDelete.push(...removeEffects.map((e) => e.id));
                }
                if (hasEffectIcon) {
                    const removeEffects = fx.filter((e) => e.getFlag("core", "statusId") === k);
                    brokenEffects.delete(...removeEffects.map((e) => e.id))
                }
            }

            toDelete.push(...brokenEffects)

            if (toDelete.length) await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete, {stopUpdates: true});
            if (toCreate.length) await actor.createEmbeddedDocuments("ActiveEffect", toCreate, {stopUpdates: true});
        }


        delete this.actor._runningFunctions["toggleConditionStatusIcons"];

    }


}
