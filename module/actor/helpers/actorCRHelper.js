import {ItemDescriptionsHelper} from "../../item/helpers/itemDescriptionsHelper.js";

export class ActorCRHelper {
    /**
     * @param {ActorPF} actor
     */
    constructor(actor) {
        this.actor = actor
    }

    getDefensiveCR() {
        let totalHP = this.actor.system.attributes.hp.max;
        let totalHD = this.actor.system.attributes.hd.total;
        let effectiveHP = totalHP;
        let DR = []
        let ER = []
        if (this.actor.system.combinedDR?.any)
            DR.push(this.actor.system.combinedDR?.any || 0);
        for (let dr of this.actor.system.combinedDR?.types || []) {
            if (dr.value)
                DR.push(dr.value)
        }
        for (let dr of this.actor.system.combinedER || []) {
            if (dr.value)
                ER.push(dr.value)
        }
        let avgDR = DR.length ? DR.reduce((a, b) => a + b, 0) / DR.length : 0;
        let avgER = ER.length ? ER.reduce((a, b) => a + b, 0) / ER.length : 0;
        let hdCR = Math.ceil(totalHD*1.5)
        let adjustedHP = totalHP +  Math.log(totalHD*2)*avgDR + Math.log(totalHD*2)*avgER;
        let hpCR = adjustedHP/15.0;
        let acCR = this.actor.system.attributes.ac.normal.total * 0.75 - 10;
        let srAdjustment = this.actor.system.attributes.sr.total ? 2 : 0;
        //game.D35E.logger.log(this.actor.name,"Defensive CR:", Math.floor((hpCR + acCR + hdCR) /3)+srAdjustment,hpCR, acCR, srAdjustment)
        return Math.floor((hpCR + acCR + hdCR) /3)+srAdjustment;
    }

    getOffensiveCR() {
        let highestAttackBonus = -999;
        let damages = 0;
        let rollData = this.actor.getRollData();
        let spellCount = 0;
        let specialAttackCount = 0;
        for (let item of this.actor.items) {
            if (item.type === "spell") {
                spellCount++;
            }
            if (item.type === "attack" && item.system.attackType === "special") {
                specialAttackCount++;
            }
            if (item.type === "attack" && item.system.attackType === "racial") {
                specialAttackCount++;
            }
            if (item.type === "attack" && item.system.attackType === "misc") {
                specialAttackCount++;
            }
            if (item.type === "feat" && item.system.featType === "trait") {
                specialAttackCount++;
            }
            if (item.type === "full-attack") {
               for (let attackId of Object.keys(item.system.attacks)) {
                   let attack = item.system.attacks[attackId];
                   let attackItem = this.actor.items.get(attack.id);
                   if (attackItem) {
                       let attackBonus = ItemDescriptionsHelper.attackBonus(attackItem, rollData)
                       if (attackBonus > highestAttackBonus)
                           highestAttackBonus = attackBonus;
                       let avgDamage = 0;
                       for (let j = 0; j < attack.count; j++)
                       {
                           for (let i = 0; i < 10; i++) {
                               avgDamage += ItemDescriptionsHelper.damageRoll(attackItem, rollData);
                           }
                           avgDamage = Math.floor(avgDamage / 10);
                           damages += avgDamage
                       }
                   }
               }
            }
        }
        let attackCR = highestAttackBonus / 2;
        let damageCR = damages / 7.5;
        let spellCR = Math.min(spellCount, 5);
        let miscAttackCR = Math.min(specialAttackCount, 5);
        let offensiveCR = Math.floor((attackCR + damageCR)/2)+Math.ceil((spellCR+miscAttackCR)/2);
        //game.D35E.logger.log(this.actor.name,"Offensive CR:", offensiveCR, attackCR, damageCR, spellCR, miscAttackCR)
        return offensiveCR;
    }
}
