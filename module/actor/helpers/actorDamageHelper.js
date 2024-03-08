import {CACHE} from "../../cache.js";
import {ActorPF} from '../entity.js';
import {createCustomChatMessage} from '../../chat.js';
import {Roll35e} from '../../roll.js';

export class ActorDamageHelper {
    /**
     * Apply rolled dice damage to the token or tokens which are currently controlled.
     * This allows for damage to be scaled by a multiplier to account for healing, critical hits, or resistance
     *
     * @param {Number} value   The amount of damage to deal.
     * @return {Promise}
     */
    static async applyDamage(
        ev,
        roll,
        critroll,
        natural20,
        natural20Crit,
        fubmle,
        fumble20Crit,
        damage,
        normalDamage,
        material,
        alignment,
        enh,
        nonLethalDamage,
        simpleDamage = false,
        actor = null,
        attackerId = null,
        attackerTokenId = null,
        ammoId = null,
        incorporeal = false,
        touch = false
    ) {
        let value = 0;

        let tokensList = [];
        const promises = [];

        let _attacker = game.actors.get(attackerId);

        if (actor === null) {
            if (game.user.targets.size > 0) tokensList = Array.from(game.user.targets);
            else tokensList = canvas.tokens.controlled;
            if (!tokensList.length) {
                ui.notifications.warn(game.i18n.localize("D35E.NoTokensSelected"));
                return;
            }
        } else {
            tokensList.push({ actor: actor });
        }

        for (let t of tokensList) {
            let a = t.actor,
                hp = a.system.attributes.hp,
                _nonLethal = a.system.attributes.hp.nonlethal || 0,
                nonLethal = 0,
                tmp = parseInt(hp.temp) || 0,
                hit = false,
                crit = false;

            if (!a.testUserPermission(game.user, "OWNER")) {
                ui.notifications.warn(game.i18n.localize("D35E.ErrorNoActorPermission"));
                continue;
            }
            if (simpleDamage) {
                hit = true;
                value = damage;
            } else {
                let finalAc = {};
                if (fubmle) return;
                if (ev && ev.originalEvent instanceof MouseEvent && ev.originalEvent.shiftKey) {
                    finalAc.noCheck = true;
                    finalAc.ac = 0;
                    finalAc.noCritical = false;
                    finalAc.applyHalf = ev.applyHalf === true;
                } else {
                    if (roll > ActorPF.SPELL_AUTO_HIT) {
                        // Spell roll value
                        finalAc = await a.rollDefenseDialog({ ev: ev, touch: touch, flatfooted: false });
                        if (finalAc.ac === -1) continue;
                    } else {
                        finalAc.applyHalf = ev?.applyHalf === true;
                    }
                }
                let concealMiss = false;
                let concealRoll = 0;
                let concealTarget = 0;
                let concealRolled = false;
                if (
                    (finalAc.conceal ||
                        finalAc.fullConceal ||
                        a.system.attributes?.concealment?.total ||
                        finalAc.concealOverride) &&
                    roll !== ActorPF.SPELL_AUTO_HIT
                ) {
                    concealRolled = true;
                    concealRoll = new Roll35e("1d100").roll().total;
                    if (finalAc.fullConceal) concealTarget = 50;
                    if (finalAc.conceal) concealTarget = 20;
                    if (finalAc.concealOverride) concealTarget = finalAc.concealOverride;
                    concealTarget = Math.max(a.system.attributes?.concealment?.total || 0, concealTarget);
                    if (concealRoll <= concealTarget) {
                        concealMiss = true;
                    }
                }
                let achit = roll >= finalAc.ac || natural20;
                hit = ((roll >= finalAc.ac || roll === ActorPF.SPELL_AUTO_HIT || natural20) && !concealMiss) || finalAc.noCheck; // This is for spells and natural 20
                crit =
                    (critroll >= finalAc.ac || (critroll && finalAc.noCheck) || natural20Crit) &&
                    !finalAc.noCritical &&
                    !fumble20Crit;
                let damageData = null;
                let noPrecision = false;
                // Fortitifcation / crit resistance
                let fortifyRolled = false;
                let fortifySuccessfull = false;
                let fortifyValue = 0;
                let fortifyRoll = 0;
                if (hit && a.system.attributes.fortification?.total) {
                    fortifyRolled = true;
                    fortifyValue = a.system.attributes.fortification?.total;
                    fortifyRoll = new Roll35e("1d100").roll().total;
                    if (fortifyRoll <= fortifyValue) {
                        fortifySuccessfull = true;
                        crit = false;
                        if (!finalAc.applyPrecision) noPrecision = true;
                    }
                }
                if (crit) {
                    damageData = ActorDamageHelper.calculateDamageToActor(
                        a,
                        damage,
                        material,
                        alignment,
                        enh,
                        nonLethalDamage,
                        noPrecision,
                        incorporeal,
                        finalAc.applyHalf
                    );
                } else {
                    if (natural20 || (critroll && hit))
                        //Natural 20 or we had a crit roll, no crit but base attack hit
                        damageData = ActorDamageHelper.calculateDamageToActor(
                            a,
                            normalDamage,
                            material,
                            alignment,
                            enh,
                            nonLethalDamage,
                            noPrecision,
                            incorporeal,
                            finalAc.applyHalf
                        );
                    else
                        damageData = ActorDamageHelper.calculateDamageToActor(
                            a,
                            damage,
                            material,
                            alignment,
                            enh,
                            nonLethalDamage,
                            noPrecision,
                            incorporeal,
                            finalAc.applyHalf
                        );
                }
                value = damageData.damage;
                nonLethal += damageData.nonLethalDamage;

                damageData.nonLethalDamage = nonLethal;
                damageData.displayDamage = value;
                let props = [];
                if ((finalAc.rollModifiers || []).length > 0)
                    props.push({
                        header: game.i18n.localize("D35E.RollModifiers"),
                        value: finalAc.rollModifiers,
                    });
                let ammoRecovered = false;
                if (game.settings.get("D35E", "useAutoAmmoRecovery")) {
                    if (ammoId && attackerId && !hit) {
                        let recoveryRoll = new Roll35e("1d100").roll().total;
                        if (recoveryRoll < 50) {
                            ammoRecovered = true;
                            if (_attacker) await _attacker.quickChangeItemQuantity(ammoId, 1);
                        }
                    }
                }
                if (damageData.damagePoolPossibleReductionsUpdate) {
                    await a.updateDamageReductionPoolItems(damageData.damagePoolPossibleReductionsUpdate);
                }

                let actions = [];
                finalAc.rollData = {};
                finalAc.rollData.hit = hit;
                if (finalAc.allCombatChanges && finalAc.allCombatChanges.length > 0) {
                    actions = await a.getAndApplyCombatChangesSpecialActions(
                        finalAc.allCombatChanges,
                        this,
                        finalAc.rollData,
                        finalAc.optionalFeatIds,
                        finalAc.optionalFeatRanges
                    );
                }

                // Set chat data
                let chatData = {
                    speaker: ChatMessage.getSpeaker({ actor: a.data }),
                    rollMode: finalAc.rollMode || "gmroll",
                    sound: CONFIG.sounds.dice,
                    "flags.D35E.noRollRender": true,
                };
                let chatTemplateData = {
                    name: a.name,
                    sourceName: _attacker?.name || "Unknown",
                    sourceImg: _attacker?.img || "systems/D35E/icons/special-abilities/imported.png",
                    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
                    rollMode: finalAc.rollMode || "gmroll",
                };
                const templateData = mergeObject(
                    chatTemplateData,
                    {
                        actor: a,
                        damageData: damageData,
                        img: a.img,
                        roll: roll,
                        ac: finalAc,
                        hit: hit,
                        achit: achit,
                        crit: crit,
                        actions: actions,
                        acModifiers: finalAc.acModifiers || [],
                        concealMiss: concealMiss,
                        concealRoll: concealRoll,
                        concealTarget: concealTarget,
                        concealRolled: concealRolled,
                        isSpell: roll === ActorPF.SPELL_AUTO_HIT,
                        applyHalf: finalAc.applyHalf,
                        ammoRecovered: ammoRecovered,
                        fortifyRolled: fortifyRolled,
                        fortifyValue: Math.min(fortifyValue, 100),
                        fortifyRoll: fortifyRoll,
                        fortifySuccessfull: fortifySuccessfull,
                        hasProperties: props.length,
                        properties: props,
                    },
                    { inplace: false }
                );
                // Create message

                await createCustomChatMessage("systems/D35E/templates/chat/damage-description.html", templateData, chatData);
            }

            //LogHelper.log('Damage Value ', value, damage)
            if (hit) {
                let dt = value > 0 ? Math.min(tmp, value) : 0;
                let nonLethalHeal = 0;
                if (value < 0) nonLethalHeal = value;
                promises.push(
                    t.actor.update({
                        "system.attributes.hp.nonlethal": Math.max(_nonLethal + nonLethal + nonLethalHeal, 0),
                        "system.attributes.hp.temp": tmp - dt,
                        "system.attributes.hp.value": Math.clamped(hp.value - (value - dt), -100, hp.max),
                    })
                );
            }
        }
        return Promise.all(promises);
    }

    static async applyRegeneration(damage, actor = null) {
        let value = 0;

        let tokensList = [];
        const promises = [];
        if (actor === null) {
            if (game.user.targets.size > 0) tokensList = Array.from(game.user.targets);
            else tokensList = canvas.tokens.controlled;
            if (!tokensList.length) {
                ui.notifications.warn(game.i18n.localize("D35E.NoTokensSelected"));
                return;
            }
        } else {
            tokensList.push({ actor: actor });
        }

        for (let t of tokensList) {
            let a = t.actor,
                nonLethal = a.system.attributes.hp.nonlethal || 0;

            promises.push(
                t.actor.update({
                    "system.attributes.hp.nonlethal": Math.max(0, nonLethal - damage),
                })
            );
        }
        return Promise.all(promises);
    }

    static get defaultDR() {
        return {
            uid: null,
            value: 0
        }
    }

    static getDamageTypeForUID(damageTypes, uid) {
        return damageTypes.find(dt => dt.uid === uid);
    }

    static getBaseDRDamageTypes() {
        let damageTypes = [
            {uid: 'any', name: game.i18n.localize("D35E.DRNonPenetrable"), value: 0, immunity: false},
            {uid: 'good', name: game.i18n.localize("D35E.AlignmentGood"), value: 0, or: false, lethal: false, immunity: false},
            {uid: 'evil', name: game.i18n.localize("D35E.AlignmentEvil"), value: 0, or: false, lethal: false, immunity: false},
            {uid: 'chaotic', name: game.i18n.localize("D35E.AlignmentChaotic"), value: 0, or: false, lethal: false, immunity: false},
            {uid: 'lawful', name: game.i18n.localize("D35E.AlignmentLawful"), value: 0, or: false, lethal: false, immunity: false},
            {uid: 'slashing', name: game.i18n.localize("D35E.DRSlashing"), value: 0, or: false, lethal: false, immunity: false},
            {uid: 'bludgeoning', name: game.i18n.localize("D35E.DRBludgeoning"), value: 0, or: false, lethal: false, immunity: false},
            {uid: 'piercing', name: game.i18n.localize("D35E.DRPiercing"), value: 0, or: false, lethal: false, immunity: false},
            {uid: 'epic', name: game.i18n.localize("D35E.DREpic"), value: 0, or: false, lethal: false, immunity: false},
            {uid: 'magic', name: game.i18n.localize("D35E.DRMagic"), value: 0, or: false, lethal: false, immunity: false},
            {uid: 'silver', name: game.i18n.localize("D35E.DRSilver"), value: 0, or: false, lethal: false, immunity: false},
            {uid: 'adamantine', name: game.i18n.localize("D35E.DRAdamantine"), value: 0, or: false, lethal: false, immunity: false},
            {uid: 'coldiron', name: game.i18n.localize("D35E.DRColdIron"), value: 0, or: false, lethal: false, immunity: false},
            {uid: 'incorporeal', name: game.i18n.localize("D35E.Incorporeal"), value: 0, or: false, lethal: false, immunity: false}]
        return damageTypes.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0));
    }

    static getDRDamageTypes() {
        let damageTypes = ActorDamageHelper.getBaseDRDamageTypes();
        return damageTypes;
    }

    static getDRForActor(actor, base = false) {
        let damageTypes = duplicate(this.getDRDamageTypes());
        let actorData = actor.system;
        let actorDR = base ? actorData.damageReduction : actorData.combinedDR
        ActorDamageHelper.getDamageTypeForUID(damageTypes,'any').value = actorDR?.any || 0;
        (actorDR?.types || []).forEach(t => {
            if (t.uid === null) return ;
            let type = ActorDamageHelper.getDamageTypeForUID(damageTypes,t.uid);
            type.value = t.value;
            type.or = t.or;
            type.lethal = t.lethal;
            type.immunity = t.immunity;
            type.modified = t.modified;
            type.items = t.items;
            type.providedBy = t.providedBy;
            type.isPool = t.isPool;
        })
        return damageTypes;
    }

    /**
     * This creates map in format that is used by the actor template
     * @param dr data resistances in format provided by this class
     * @returns {{}} map in correct format to be persisted in actor
     */
    static getActorMapForDR(dr) {
        let damageReduction = {}
        damageReduction['any'] = ActorDamageHelper.getDamageTypeForUID(dr,'any').value;
        damageReduction['types'] = []
        dr.forEach(t => {
            if (t.uid === "any") return;
            damageReduction['types'].push(ActorDamageHelper.getDamageTypeForUID(dr,t.uid));
        })
        return damageReduction;
    }

    static computeDRString(dr) {
        let or = game.i18n.localize("D35E.or")
        let and = game.i18n.localize("D35E.and")
        let DR = game.i18n.localize("D35E.DR")
        let lethal = game.i18n.localize("D35E.LethalDamageFrom")
        let immune = game.i18n.localize("D35E.Immunity")
        let drParts = [];
        let drOrParts = [];
        let orValue = 0;
        if (ActorDamageHelper.getDamageTypeForUID(dr,'any').value > 0) {
            drParts.push(`${DR} ${ActorDamageHelper.getDamageTypeForUID(dr,'any').value}/-`)
        }
        dr.forEach(t => {
            if (t.uid === "any") return;
            let drType = ActorDamageHelper.getDamageTypeForUID(dr,t.uid)
            if (drType.immunity) {
                if (drType.or) {
                    drOrParts.push(`${drType.name}`)
                    orValue = immune;
                } else {
                    drParts.push(`${DR} ${immune}/${drType.name}`)
                }
            }
            else if (drType.value > 0) {
                if (drType.or) {
                    drOrParts.push(`${drType.name}`)
                    orValue = drType.value
                } else {
                    drParts.push(`${DR} ${drType.value}/${drType.name}`)
                }
            }
            if (drType.lethal) {
                drParts.push(`${lethal} ${drType.name}`)
            }
        })
        if (drOrParts.length)
            drParts.push(`${DR} ${orValue}/${drOrParts.join(` ${or} `)}`)

        return drParts.join('; ')
    }

    static computeDRTags(dr) {
        let or = game.i18n.localize("D35E.or")
        let and = game.i18n.localize("D35E.and")
        let DR = game.i18n.localize("D35E.DR")
        let lethal = game.i18n.localize("D35E.LethalDamageFrom")
        let immune = game.i18n.localize("D35E.Immunity")
        let drParts = [];
        drParts.push('<ul class="traits-list">')
        let drOrParts = [];
        let orValue = 0;
        if (ActorDamageHelper.getDamageTypeForUID(dr,'any').value > 0) {
            drParts.push(`<li class="tag">${DR} ${ActorDamageHelper.getDamageTypeForUID(dr,'any').value}/-</li>`)
        }
        let drOrModified = false;
        dr.forEach(t => {
            if (t.uid === "any") return;
            let drType = ActorDamageHelper.getDamageTypeForUID(dr,t.uid)
            if (drType.immunity) {
                if (drType.or) {
                    drOrParts.push(`${drType.name}`)
                    orValue = immune;
                    drOrModified = drOrModified || t.modified;
                } else {
                    drParts.push(`<li class="tag ${t.modified ? 'modified' : ''}">${DR} ${immune}/${drType.name}</li>`)
                }
            }
            else if (drType.value > 0) {
                if (drType.or) {
                    drOrParts.push(`${drType.name}`)
                    orValue = drType.value
                    drOrModified = drOrModified || t.modified;
                } else {
                    drParts.push(`<li class="tag ${t.modified ? 'modified' : ''}">${DR} ${drType.value}/${drType.name}</li>`)
                }
            }
            if (drType.lethal) {
                drParts.push(`<li class="tag ${t.modified ? 'modified' : ''}">${lethal} ${drType.name}</li>`)
            }
        })
        if (drOrParts.length)
            drParts.push(`<li class="tag ${drOrModified ? 'modified' : ''}">${DR} ${orValue}/${drOrParts.join(` ${or} `)}</li>`)
        drParts.push('</ul>')
        return drParts.join('')
    }

    /**
     * Energy resistance part
     */

    static get defaultER() {
        return {
            uid: null,
            value: 0,
            vulnerable: false,
            immunity: false,
            lethal: false
        }
    }

    static getERDamageTypes() {
        let energyTypes = [];
        for(let damageType of CACHE.DamageTypes.values()) {
            if (damageType.system.damageType === "energy") {
                let energyType = {
                        uid: damageType.system.uniqueId,
                        name: damageType.name,
                        value: 0,
                        vulnerable: false,
                        immunity: false,
                        lethal: false
                    }
                    energyTypes.push(energyType)
            }
        }
        return energyTypes.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0));
    }

    static getERForActor(actor, base = false) {
        let damageTypes = duplicate(this.getERDamageTypes());
        let actorData = actor.system;
        ((base ? actorData.energyResistance : actorData.combinedResistances) || []).forEach(t => {
            if (t.uid === null) return ;
            let type = ActorDamageHelper.getDamageTypeForUID(damageTypes,t.uid);
            if (!type) return;
            type.value = t.value;
            type.vulnerable = t.vulnerable;
            type.immunity = t.immunity;
            type.lethal = t.lethal;
            type.half = t.half;
            type.modified = t.modified;
            type.items = t.items;
            type.providedBy = t.providedBy;
            type.isPool = t.isPool;
        })
        return damageTypes;
    }

    static getActorMapForER(er) {
        let energyResistance = []
        er.forEach(t => {
            if (t.uid === "any") return;
            energyResistance.push(ActorDamageHelper.getDamageTypeForUID(er,t.uid));
        })
        return energyResistance;
    }

    static computeERString(er) {
        let erParts = [];
        er.forEach(e => {
            if (e?.vulnerable) {
                erParts.push(`${e.name} ${game.i18n.localize("D35E.Vulnerability")}`)
            } else if (e?.immunity) {
                erParts.push(`${e.name} ${game.i18n.localize("D35E.Immunity")}`)
            } else if (e?.half) {
                erParts.push(`${e.name} ${game.i18n.localize("D35E.Half")}`)
            } else if (e?.lethal) {
                erParts.push(`${game.i18n.localize("D35E.LethalDamageFrom")} ${e.name}`)
            } else if (e.value > 0) {
                erParts.push(`${e.name} ${e.value}`)
            }
        });
        return erParts.join('; ')
    }

    static computeERTags(er) {
        let erParts = [];
        erParts.push('<ul class="traits-list">')
        er.forEach(e => {
            if (e?.vulnerable) {
                erParts.push(`<li class="tag ${e.modified ? 'modified' : ''}">${e.name} ${game.i18n.localize("D35E.Vulnerability")}</li>`)
            } else if (e?.immunity) {
                erParts.push(`<li class="tag ${e.modified ? 'modified' : ''}">${e.name} ${game.i18n.localize("D35E.Immunity")}</li>`)
            } else if (e?.half) {
                erParts.push(`<li class="tag ${e.modified ? 'modified' : ''}">${e.name} ${game.i18n.localize("D35E.Half")}</li>`)
            } else if (e?.lethal) {
                erParts.push(`<li class="tag ${e.modified ? 'modified' : ''}">${game.i18n.localize("D35E.LethalDamageFrom")} ${e.name}</li>`)
            } else if (e.value > 0) {
                erParts.push(`<li class="tag ${e.modified ? 'modified' : ''}">${e.name} ${e.value}</li>`)
            }
        });
        erParts.push('</ul>')
        return erParts.join('')
    }

    /**
     * Damage Calculation
     */
    static calculateDamageToActor(actor,damage,material,alignment,enh,nonLethal,noPrecision,incorporeal,applyHalf) {
        let er = ActorDamageHelper.getERForActor(actor).filter(d => d.value > 0 || d.vulnerable || d.immunity || d.lethal);
        let dr = ActorDamageHelper.getDRForActor(actor).filter(d => d.value > 0 || d.lethal || d.immunity);
        let hasRegeneration = !!actor.system.traits.regen;
        let nonLethalDamage = 0;
        let bypassedDr = new Set()
        let materialData = material?.system || material?.data
        if (enh > 0)
            bypassedDr.add("magic");
        if (enh > 5)
            bypassedDr.add("epic");
        if (alignment?.good)
            bypassedDr.add("good");
        if (alignment?.evil)
            bypassedDr.add("evil");
        if (alignment?.lawful)
            bypassedDr.add("lawful");
        if (alignment?.chaotic)
            bypassedDr.add("chaotic");
        if (incorporeal)
            bypassedDr.add("incorporeal");
        if (materialData?.isAdamantineEquivalent)
            bypassedDr.add("adamantine");
        if (materialData?.isAlchemicalSilverEquivalent)
            bypassedDr.add("silver");
        if (materialData?.isColdIronEquivalent)
            bypassedDr.add("coldiron");
        let damageBeforeDr = 0;

        //Checks for slashing/piercing/bludgeonign damage and typeless damage
        let hasAnyTypeDamage = false;
        let baseIsNonLethal = nonLethal || false;
        // Sum the damage for each damageTypeUid in the damage array, and remove duplicates from the damage array
        damage = this.mergeDamageTypes(damage);
        damage.forEach(d => {
            if (d.damageTypeUid) {
                let _damage = CACHE.DamageTypes.get(d.damageTypeUid)
                if (_damage.system.damageType === "type") {
                    if (noPrecision && d.damageTypeUid === "damage-precision")
                        return; // We drop out if we do not apply precision damage
                    if (_damage.system.isPiercing)
                        bypassedDr.add("piercing");
                    if (_damage.system.isSlashing)
                        bypassedDr.add("slashing");
                    if (_damage.system.isBludgeoning)
                        bypassedDr.add("bludgeoning");
                    damageBeforeDr += d.roll.total;
                    hasAnyTypeDamage = true;
                    if (d.damageTypeUid === "damage-nonlethal"){
                        baseIsNonLethal = true;
                    }
                }
            } else {
                damageBeforeDr += d.roll.total;
                hasAnyTypeDamage = true;
            }
        })
        if (hasAnyTypeDamage)
            damageBeforeDr = Math.max(1,damageBeforeDr) // This makes base damage minimum 1
        let filteredDr = dr.filter(d => bypassedDr.has(d.uid))
        let lethalDr = dr.filter(d => d.lethal)
        let hasLethalDr = dr.some(d => bypassedDr.has(d.uid))
        if (hasRegeneration && !hasLethalDr)
            baseIsNonLethal = true;
        let hasOrInFiltered = filteredDr.some(d => d.or);
        let finalDr = dr.filter(d => !bypassedDr.has(d.uid))
        if (hasOrInFiltered) {
            finalDr = finalDr.filter(d => !d.or)
        }
        let highestDr = 0;
        let appliedDr = null
        finalDr.forEach(d => {if (d.immunity || d.value > highestDr) {
            highestDr = d.immunity ? 65536 : d.value ;
            appliedDr = d;
        }});
        let realDamage = (applyHalf ? Math.floor(damageBeforeDr/2.0) : damageBeforeDr);
        let damageAfterDr = Math.max(realDamage - highestDr,0);
        let damagePoolPossibleReductionsUpdate = []
        let damageDifference = realDamage - damageAfterDr;
        if (damageDifference && appliedDr.providedBy && appliedDr.isPool)
            damagePoolPossibleReductionsUpdate.push({id:appliedDr.providedBy,value:damageDifference})
        if (baseIsNonLethal) {
            nonLethalDamage += damageAfterDr;
            damageAfterDr = 0;
        }
        let energyDamageAfterEr = 0
        let energyDamageBeforeEr = 0
        let energyDamage = []
        

        damage.forEach(d => {
            if (d.damageTypeUid) {
                let _damage = CACHE.DamageTypes.get(d.damageTypeUid)
                if (_damage.system.damageType === "energy") {
                    let erValue = ActorDamageHelper.getDamageTypeForUID(er,d.damageTypeUid)
                    let realDamage = (applyHalf ? Math.floor(d.roll.total/2.0) : d.roll.total);
                    let damageAfterEr = Math.max(realDamage - (erValue?.value || 0),0)

                    if (d.damageTypeUid === 'damage-healing')
                        damageAfterEr =- damageAfterEr;
                    else if (actor.system.attributes?.creatureType === "undead" && d.damageTypeUid === "energy-negative")
                        damageAfterEr =- damageAfterEr;
                    else if (actor.system.attributes?.creatureType !== "undead" && d.damageTypeUid === "energy-positive")
                        damageAfterEr =- damageAfterEr;
                    
                    let value = erValue?.value
                    if (erValue?.immunity) {
                        damageAfterEr = 0;
                        value = game.i18n.localize("D35E.Immunity")
                    }
                    else if (hasRegeneration && !erValue?.lethal) {
                        if (damageAfterEr > 0) {
                            nonLethalDamage += damageAfterEr;
                            damageAfterEr = 0;
                            value = game.i18n.localize("D35E.WeaponPropNonLethal")
                        }
                    }
                    else if (erValue?.vulnerable) {
                        damageAfterEr = Math.ceil(realDamage * 1.5)
                        value = game.i18n.localize("D35E.Vulnerability")
                    } else if (erValue?.half) {
                        damageAfterEr = Math.ceil(damageAfterEr * 0.5)
                        value = game.i18n.localize("D35E.Half")
                    } else if (damageAfterEr === realDamage) {
                        value = game.i18n.localize("D35E.NoER")
                    }
                    let damageDifference = realDamage-damageAfterEr;
                    energyDamage.push({nonLethal: hasRegeneration && !erValue?.lethal,name:_damage.name,uid:_damage.system.uniqueId,before:d.roll.total,after:damageAfterEr,value:value || 0,lower:damageAfterEr<d.roll.total,higher:damageAfterEr>d.roll.total,equal:d.roll.total===damageAfterEr});
                    energyDamageAfterEr += damageAfterEr;
                    energyDamageBeforeEr += d.roll.total;
                    if (damageDifference && erValue?.providedBy && erValue?.isPool)
                        damagePoolPossibleReductionsUpdate.push({id:erValue.providedBy,value:damageDifference})

                    if (d.damageTypeUid === "energy-positive" || d.damageTypeUid === "energy-negative" || d.damageTypeUid === "energy-force") {
                        incorporeal = true; //These energy damages always are treated as incorporeal
                    }
                }
            }
        })



        let beforeDamage = damageBeforeDr + energyDamageBeforeEr;
        let afterDamage = energyDamageAfterEr + damageAfterDr;
        let incorporealMiss = false;
        let incorporealRoll = Math.random();
        let incorporealRolled = false;
        if (actor.system.traits.incorporeal && !incorporeal) {
            incorporealRolled = true;
            if (incorporealRoll < 0.5 || enh < 1){
                afterDamage = 0;
                energyDamageAfterEr = 0;
                damageAfterDr = 0;
                nonLethalDamage = 0;
                incorporealMiss = true;
            }
        }
        return {
            beforeDamage: beforeDamage,
            damage: afterDamage,
            baseIsNonLethal: baseIsNonLethal,
            nonLethalDamage: nonLethalDamage,
            displayDamage: Math.abs(afterDamage),
            isHealing: afterDamage < 0,
            baseBeforeDR: damageBeforeDr,
            baseAfterDR: damageAfterDr,
            energyDamageBeforeEr: energyDamageBeforeEr,
            energyDamageAfterEr: energyDamageAfterEr,
            lower:afterDamage<beforeDamage,
            higher:afterDamage>beforeDamage,
            equal:afterDamage===beforeDamage,
            appliedDR: appliedDr,
            energyDamage: energyDamage,
            incorporealRoll: Math.floor(incorporealRoll * 100),
            incorporealRolled: incorporealRolled,
            damagePoolPossibleReductionsUpdate: damagePoolPossibleReductionsUpdate,
            incorporealMiss: incorporealMiss};
    }

    static mergeDamageTypes(damage) {
        let damageMap = new Map();
        let finalDamageArray = [];
        damage.forEach(d => {
            if (d.damageTypeUid) {
                if (!damageMap.has(d.damageTypeUid)) {
                    damageMap.set(d.damageTypeUid, d);
                } else {
                    // Add the damage to existing damage roll total
                    damageMap.get(d.damageTypeUid).roll.total += d.roll.total;
                }
            } else {
                finalDamageArray.push(d);
            }
        });
        finalDamageArray.push(...damageMap.values());
        return finalDamageArray;
    }

    static mapDamageType(type) {
        for (let damageType of CACHE.DamageTypes.values()) {
            let identifiers = damageType.system.identifiers;
            if (identifiers.some(i => i[0].toLowerCase() === type.toLowerCase()))
                return damageType.system.uniqueId;
        }
        return type;
    }

    static isDamageType(type) {
        for (let damageType of CACHE.DamageTypes.values()) {
            let identifiers = damageType.system.identifiers;
            if (identifiers.some(i => i[0].toLowerCase() === type.toLowerCase()))
                return true;
        }
        return false;
    }

    static nameByType(type) {
        for (let damageType of CACHE.DamageTypes.values()) {
            let identifiers = damageType.system.identifiers;
            if (identifiers.some(i => i[0].toLowerCase() === type.toLowerCase()))
                return damageType.name;
        }
        return type;
    }

    static getDamageIcon(dmgName) {
        let dmgIconBase = dmgName?.toLowerCase() || "";
        let dmgIcon = "unknown";
        if (dmgIconBase.includes("energy-")) {
            dmgIconBase = dmgIconBase.replace("energy-", "");
        }
        switch (dmgIconBase) {
            case "fire":
            case "f":
                dmgIcon = "fire";
                break;
            case "cold":
            case "c":
                dmgIcon = "cold";
                break;
            case "electricity":
            case "electric":
            case "el":
            case "e":
                dmgIcon = "electricity";
                break;
            case "acid":
            case "a":
                dmgIcon = "acid";
                break;
            case "sonic":
                dmgIcon = "sonic";
                break;
            case "air":
                dmgIcon = "air";
                break;
            case "piercing":
            case "p":
                dmgIcon = "p";
                break;
            case "slashing":
            case "s":
                dmgIcon = "s";
                break;
            case "bludgeoning":
            case "b":
                dmgIcon = "b";
                break;
            case "unarmed":
                dmgIcon = "unarmed";
                break;
            case "positive energy":
                dmgIcon = "positive-energy";
                break;
            case "force":
                dmgIcon = "force";
                break;
            case "negative energy":
                dmgIcon = "negative-energy";
                break;
            default:
                return "unknown";
        }
        return dmgIcon;
    }
}
