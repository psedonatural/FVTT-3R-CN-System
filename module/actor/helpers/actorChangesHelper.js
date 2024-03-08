export class ActorChangesHelper {

    static getChangeFlat(changeTarget, changeType, curData) {
        let result = [];

        switch (changeTarget) {
            case "mhp":
                if (changeType === "replace") return "system.attributes.hp.replace";
                return "system.attributes.hp.max";
            case "wounds":
                return "system.attributes.wounds.max";
            case "vigor":
                return "system.attributes.vigor.max";
            case "str":
                if (changeType === "penalty") return "system.abilities.str.penalty";
                if (changeType === "replace") return "system.abilities.str.replace";
                return "system.abilities.str.total";
            case "dex":
                if (changeType === "penalty") return "system.abilities.dex.penalty";
                if (changeType === "replace") return "system.abilities.dex.replace";
                return "system.abilities.dex.total";
            case "con":
                if (changeType === "penalty") return "system.abilities.con.penalty";
                if (changeType === "replace") return "system.abilities.con.replace";
                if (changeType === "total") return "system.abilities.con.total";
                return "system.abilities.con.total";
            case "int":
                if (changeType === "penalty") return "system.abilities.int.penalty";
                if (changeType === "replace") return "system.abilities.int.replace";
                return "system.abilities.int.total";
            case "wis":
                if (changeType === "penalty") return "system.abilities.wis.penalty";
                if (changeType === "replace") return "system.abilities.wis.replace";
                return "system.abilities.wis.total";
            case "cha":
                if (changeType === "penalty") return "system.abilities.cha.penalty";
                if (changeType === "replace") return "system.abilities.cha.replace";
                return "system.abilities.cha.total";
            case "ac":
                if (changeType === "dodge") return ["system.attributes.ac.normal.total", "system.attributes.ac.touch.total", "system.attributes.cmd.total"];
                else if (changeType === "deflection") {
                    return ["system.attributes.ac.normal.total", "system.attributes.ac.touch.total",
                        "system.attributes.ac.flatFooted.total", "system.attributes.cmd.total", "system.attributes.cmd.flatFootedTotal"];
                }
                return ["system.attributes.ac.normal.total", "system.attributes.ac.touch.total", "system.attributes.ac.flatFooted.total"];
            case "aac":
                return ["system.attributes.ac.normal.total", "system.attributes.ac.flatFooted.total"];
            case "sac":
                return ["system.attributes.ac.normal.total", "system.attributes.ac.flatFooted.total"];
            case "nac":
                return ["system.attributes.ac.normal.total", "system.attributes.ac.flatFooted.total", "system.attributes.naturalACTotal"];
            case "tch":
                if (changeType === "replace") return "system.attributes.ac.touch.replace";
                return ["system.attributes.ac.touch.total"];
            case "pac":
                if (changeType === "replace") return "system.attributes.ac.normal.replace";
                return ["system.attributes.ac.normal.total"];
            case "ffac":
                if (changeType === "replace") return "system.attributes.ac.flatFooted.replace";
                return ["system.attributes.ac.flatFooted.total"];
            case "attack":
                return "system.attributes.attack.general";
            case "mattack":
                return "system.attributes.attack.melee";
            case "rattack":
                return "system.attributes.attack.ranged";
            case "babattack":
                if (changeType === "replace") return "system.attributes.bab.replace";
                return ["system.attributes.bab.total", "system.attributes.cmb.total"];
            case "damage":
                return "system.attributes.damage.general";
            case "wdamage":
                return "system.attributes.damage.weapon";
            case "sdamage":
                return "system.attributes.damage.spell";
            case "allSavingThrows":
                return ["system.attributes.savingThrows.fort.total", "system.attributes.savingThrows.ref.total", "system.attributes.savingThrows.will.total"];
            case "fort":
                if (changeType === "replace") return "system.attributes.savingThrows.fort.replace";
                return "system.attributes.savingThrows.fort.total";
            case "ref":
                if (changeType === "replace") return "system.attributes.savingThrows.ref.replace";
                return "system.attributes.savingThrows.ref.total";
            case "will":
                if (changeType === "replace") return "system.attributes.savingThrows.will.replace";
                return "system.attributes.savingThrows.will.total";
            case "skills":
                for (let [a, skl] of Object.entries(curData.skills)) {
                    if (skl == null) continue;
                    result.push(`system.skills.${a}.changeBonus`);

                    if (skl.subSkills != null) {
                        for (let b of Object.keys(skl.subSkills)) {
                            result.push(`system.skills.${a}.subSkills.${b}.changeBonus`);
                        }
                    }
                }
                return result;
            case "strSkills":
                for (let [a, skl] of Object.entries(curData.skills)) {
                    if (skl == null) continue;
                    if (skl.ability === "str") result.push(`system.skills.${a}.changeBonus`);

                    if (skl.subSkills != null) {
                        for (let [b, subSkl] of Object.entries(skl.subSkills)) {
                            if (subSkl != null && subSkl.ability === "str") result.push(`system.skills.${a}.subSkills.${b}.changeBonus`);
                        }
                    }
                }
                return result;
            case "dexSkills":
                for (let [a, skl] of Object.entries(curData.skills)) {
                    if (skl == null) continue;
                    if (skl.ability === "dex") result.push(`system.skills.${a}.changeBonus`);

                    if (skl.subSkills != null) {
                        for (let [b, subSkl] of Object.entries(skl.subSkills)) {
                            if (subSkl != null && subSkl.ability === "dex") result.push(`system.skills.${a}.subSkills.${b}.changeBonus`);
                        }
                    }
                }
                return result;
            case "conSkills":
                for (let [a, skl] of Object.entries(curData.skills)) {
                    if (skl == null) continue;
                    if (skl.ability === "con") result.push(`system.skills.${a}.changeBonus`);

                    if (skl.subSkills != null) {
                        for (let [b, subSkl] of Object.entries(skl.subSkills)) {
                            if (subSkl != null && subSkl.ability === "con") result.push(`system.skills.${a}.subSkills.${b}.changeBonus`);
                        }
                    }
                }
                return result;
            case "intSkills":
                for (let [a, skl] of Object.entries(curData.skills)) {
                    if (skl == null) continue;
                    if (skl.ability === "int") result.push(`system.skills.${a}.changeBonus`);

                    if (skl.subSkills != null) {
                        for (let [b, subSkl] of Object.entries(skl.subSkills)) {
                            if (subSkl != null && subSkl.ability === "int") result.push(`system.skills.${a}.subSkills.${b}.changeBonus`);
                        }
                    }
                }
                return result;
            case "wisSkills":
                for (let [a, skl] of Object.entries(curData.skills)) {
                    if (skl == null) continue;
                    if (skl.ability === "wis") result.push(`system.skills.${a}.changeBonus`);

                    if (skl.subSkills != null) {
                        for (let [b, subSkl] of Object.entries(skl.subSkills)) {
                            if (subSkl != null && subSkl.ability === "wis") result.push(`system.skills.${a}.subSkills.${b}.changeBonus`);
                        }
                    }
                }
                return result;
            case "chaSkills":
                for (let [a, skl] of Object.entries(curData.skills)) {
                    if (skl == null) continue;
                    if (skl.ability === "cha") result.push(`system.skills.${a}.changeBonus`);

                    if (skl.subSkills != null) {
                        for (let [b, subSkl] of Object.entries(skl.subSkills)) {
                            if (subSkl != null && subSkl.ability === "cha") result.push(`system.skills.${a}.subSkills.${b}.changeBonus`);
                        }
                    }
                }
                return result;
            case "perfSkills": {
                let skl = curData.skills["prf"];
                if (skl != null) {
                    result.push(`system.skills.prf.changeBonus`);
                    if (skl.subSkills != null) {
                        for (let [b, subSkl] of Object.entries(skl.subSkills)) {
                            if (subSkl != null) result.push(`system.skills.prf.subSkills.${b}.changeBonus`);
                        }
                    }
                }
                return result;
            }
            case "profSkills": {
                let skl = curData.skills["pro"];
                if (skl != null) {
                    result.push(`system.skills.pro.changeBonus`);
                    if (skl.subSkills != null) {
                        for (let [b, subSkl] of Object.entries(skl.subSkills)) {
                            if (subSkl != null) result.push(`system.skills.pro.subSkills.${b}.changeBonus`);
                        }
                    }
                }
                return result;
            }
            case "craftSkills": {
                let skl = curData.skills["crf"];
                if (skl != null) {
                    result.push(`system.skills.crf.changeBonus`);
                    if (skl.subSkills != null) {
                        for (let [b, subSkl] of Object.entries(skl.subSkills)) {
                            if (subSkl != null) result.push(`system.skills.crf.subSkills.${b}.changeBonus`);
                        }
                    }
                }
                return result;
            }

            case "knowSkills": {
                let knowledgeSkills = new Set(['kna','kno','kpl','kre','klo','khi','kge','ken','kdu','kar','kps'])
                for (let [a, skl] of Object.entries(curData.skills)) {
                    if (skl == null) continue;
                    if (knowledgeSkills.has(a))
                        result.push(`system.skills.${a}.changeBonus`);
                }
                return result;
            }
            case "allChecks":
                return ["system.abilities.str.checkMod", "system.abilities.dex.checkMod", "system.abilities.con.checkMod",
                    "system.abilities.int.checkMod", "system.abilities.wis.checkMod", "system.abilities.cha.checkMod"];
            case "strChecks":
                return "system.abilities.str.checkMod";
            case "dexChecks":
                return "system.abilities.dex.checkMod";
            case "conChecks":
                return "system.abilities.con.checkMod";
            case "intChecks":
                return "system.abilities.int.checkMod";
            case "wisChecks":
                return "system.abilities.wis.checkMod";
            case "chaChecks":
                return "system.abilities.cha.checkMod";
            case "allSpeeds":
                for (let speedKey of Object.keys(curData.attributes.speed)) {
                    if (getProperty(curData, `attributes.speed.${speedKey}.base`)) result.push(`system.attributes.speed.${speedKey}.total`);
                }
                return result;
            case "landSpeed":
                if (changeType === "replace") return "system.attributes.speed.land.replace";
                return "system.attributes.speed.land.total";
            case "climbSpeed":
                if (changeType === "replace") return "system.attributes.speed.climb.replace";
                return "system.attributes.speed.climb.total";
            case "swimSpeed":
                if (changeType === "replace") return "system.attributes.speed.swim.replace";
                return "system.attributes.speed.swim.total";
            case "burrowSpeed":
                if (changeType === "replace") return "system.attributes.speed.burrow.replace";
                return "system.attributes.speed.burrow.total";
            case "flySpeed":
                if (changeType === "replace") return "system.attributes.speed.fly.replace";
                return "system.attributes.speed.fly.total";
            case "speedMult":
                return "system.attributes.speedMultiplier";
            case "cmb":
                return "system.attributes.cmb.total";
            case "sneakAttack":
                return "system.attributes.sneakAttackDiceTotal";
            case "runSpeedMultiplierModifier":
                return "system.attributes.runSpeedMultiplierModifier";
            case "powerPoints":
                return "system.attributes.powerPointsTotal";
            case "turnUndead":
                return "system.attributes.turnUndeadUsesTotal";
            case "turnUndeadDiceTotal":
                return "system.attributes.turnUndeadHdTotal";
            case "regen":
                return "system.traits.regenTotal";
            case "fastHeal":
                return "system.traits.fastHealingTotal";
            case "cmd":
                return ["system.attributes.cmd.total", "system.attributes.cmd.flatFootedTotal"];
            case "init":
                return "system.attributes.init.total";
            case "spellResistance":
                return "system.attributes.sr.total";
            case "hardness":
                return "system.attributes.hardness.total";
            case "breakDC":
                return "system.details.breakDC.total";
            case "powerResistance":
                return "system.attributes.pr.total";
            case "size":
                return "size";
            case "arcaneCl":
                return "system.attributes.prestigeCl.arcane.max";
            case "psionicCl":
                return "system.attributes.prestigeCl.psionic.max";
            case "divineCl":
                return "system.attributes.prestigeCl.divine.max";
            case "cardCl":
                return "system.attributes.prestigeCl.cards.max";
            case "cr":
                return "system.details.totalCr";
            case "fortification":
                return "system.attributes.fortification.total";
            case "concealment":
                return "system.attributes.concealment.total";
            case "asf":
                return "system.attributes.arcaneSpellFailure";
            case "scaPrimary":
                return "system.attributes.spells.spellbooks.primary.spellcastingAbilityBonus"
            case "scaSecondary":
                return "system.attributes.spells.spellbooks.secondary.spellcastingAbilityBonus"
            case "scaTetriary":
                return "system.attributes.spells.spellbooks.tetriary.spellcastingAbilityBonus"
            case "scaSpelllike":
                return "system.attributes.spells.spellbooks.spellike.spellcastingAbilityBonus"
        }

        if (changeTarget.match(/^skill\.([a-zA-Z0-9]+)$/)) {
            const sklKey = RegExp.$1;
            if (curData.skills[sklKey] != null) {
                return `system.skills.${sklKey}.changeBonus`;
            }
        } else if (changeTarget.match(/^skill\.([a-zA-Z0-9]+)\.subSkills\.([a-zA-Z0-9]+)$/)) {
            const sklKey = RegExp.$1;
            const subSklKey = RegExp.$2;
            if (curData.skills[sklKey] != null && curData.skills[sklKey].subSkills[subSklKey] != null) {
                return `system.skills.${sklKey}.subSkills.${subSklKey}.changeBonus`;
            }
        } else if (changeTarget.startsWith('spells')) {
            return `system.attributes.${changeTarget}`;
        } else if (changeTarget.match(/^resistance\.([a-zA-Z0-9\-]+)$/)) {
            const resistanceKey = RegExp.$1;
            return `system.resistances.${resistanceKey}.changeBonus`;
        }

        return null;
    }

}
