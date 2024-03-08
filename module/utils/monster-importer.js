export class MonsterImporterDialog extends FormApplication {
    constructor(...args) {
        super(...args);

    }

    //Window option stuff
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "encounter-generator",
            title: "Encounter Generator",
            template: "systems/D35E/templates/apps/encounter-generator-dialog.html",
            width: "auto",
            height: "auto",
            closeOnSubmit: false,
            submitOnClose: false,
            classes: ["dialog auto-height-dialog encounter-roller"]
        });
    };

    diceFromText(str) {
        const regex = /(\d+d\d+)/gi;
        let foundDices = []
        while ((m = regex.exec(str)) !== null) {
            if (m.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            m.forEach((match, groupIndex) => {
                foundDices.push(match)
            });
        }
        return foundDices;
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }


    spellsFromText(str) {
        const regex = /<i>(.*?)<\/i>/gi;
        let spells = []
        while ((m = regex.exec(str)) !== null) {
            if (m.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            m.forEach((match, groupIndex) => {
                spells.push(match)
            });
        }
        return spells;
    }

    dcFromText(str) {
        const regex = /dc (\d+)/gi;
        let foundDC = []
        while ((m = regex.exec(str)) !== null) {
            if (m.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            m.forEach((match, groupIndex) => {
                foundDC.push(match)
            });
        }
        return foundDC;
    }

    distanceFromText(str) {
        const regex = /(\d+) ft./gi;
        let found = []
        while ((m = regex.exec(str)) !== null) {
            if (m.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            m.forEach((match, groupIndex) => {
                found.push(match)
            });
        }
        return found;
    }

    regenFromText(str) {
        const regex = /regeneration (\d+)/gi;
        let found = []
        while ((m = regex.exec(str)) !== null) {
            if (m.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            m.forEach((match, groupIndex) => {
                found.push(match)
            });
        }
        return found;
    }


    parseChallengeRating(cr) {
        return parseFloat(cr.replace("2 (", "2").replace("1/1", "1").replace("1/2", "0.5").replace("1/4", "0.25").replace("1/8", "0.125").replace("1/3", "0.33").replace("1/6", "0.166"))
    }

    parseTextMonster() {
        let val = document.getElementById('monsterImportBox').value;
        
    }

    async importMonster() {
        let all_missing_specials = new Set()

        let folder = await Folder.create({
            name: 'Bestiary',
            parent: null,
            type: "Actor"
        })

        pack = game.packs.get("D35E.racialhd")
        await pack.getContent()
        await pack.getIndex()
        pack = game.packs.get("D35E.feats")
        await pack.getContent()
        await pack.getIndex()
        pack = game.packs.get("world.monster-ability")
        await pack.getContent()
        await pack.getIndex()
        pack = game.packs.get("D35E.weapons-and-ammo")
        await pack.getContent()
        await pack.getIndex()
        pack = game.packs.get("world.monster-attack")
        await pack.getContent()
        await pack.getIndex()
        spellPack = game.packs.get("D35E.spells")
        await spellPack.getContent()
        await spellPack.getIndex()

        let naturalWeaponPack = pack = game.packs.get("world.monster-attack")
        await naturalWeaponPack.getContent()
        await naturalWeaponPack.getIndex()
        let weaponPack = game.packs.get("D35E.weapons-and-ammo")
        await weaponPack.getContent()
        await weaponPack.getIndex()

        let monsters = this.parseTextMonster();

        for (let monster of monsters) {

            game.D35E.logger.log("IMPORTER | INFO | Starting import of", monster.name, monster)
            if (monster.name.indexOf("-Level") !== -1) {
                console.info("IMPORTER | INFO | Skipping import of (has classes)", monster.name)
                continue;
            }
            let actor = await Actor.create({
                name: monster.name,
                type: 'npc',
                folder: folder.id
            })
            let updateData = []
            updateData["data.details.cr"] = parseChallengeRating(monster.challenge_rating)
            updateData["data.details.type"] = monster.descriptor
            updateData["data.details.alignment"] = monster.alignment
            updateData["data.traits.size"] = monster.mapped_size

            if (regenFromText(monster.special_qualities).length) {
                updateData["data.traits.regen"] = parseInt(regenFromText(monster.special_qualities)[1])
            }

            updateData["img"] = monster.image

            if (monster.basespeed) {
                updateData["data.attributes.speed.land.base"] = monster.basespeed
            }
            if (monster.flyspeed) {
                updateData["data.attributes.speed.fly.base"] = monster.flyspeed
            }
            if (monster.swimspeed) {
                updateData["data.attributes.speed.swim.base"] = monster.swimspeed
            }
            if (monster.climbspeed) {
                updateData["data.attributes.speed.climb.base"] = monster.climbspeed
            }

            updateData["token.vision"] = true;

            for (let ability of monster.abilities.split(", ")) {
                let abl = ability.split(' ')
                if (abl.length > 1)
                    updateData[`data.abilities.${abl[0].toLowerCase()}.value`] = !isNaN(parseInt(abl[1])) ? parseInt(abl[1]) : 0
            }
            // First round of updates - setting abilities
            await actor.update(updateData)
            updateData = []
            // Setting up racial HD
            pack = game.packs.get("D35E.racialhd")
            let racialHDIndex = pack.index.find(e => e.name.toLowerCase().indexOf(monster.type.toLowerCase()) !== -1)
            let racialHDItem = await actor.importItemFromCollection("D35E.racialhd", racialHDIndex._id)
            let racialChanges = duplicate(racialHDItem.data.changes);
            let resistances = duplicate(racialHDItem.data.resistances);
            let damageReduction = duplicate(racialHDItem.data.damageReduction);
            for (let change of monster.ac_changes) {
                racialChanges.push(change)
            }

            pack = game.packs.get("world.monster-ability")
            let unprocessed_specials = []
            let senses = []
            for (let missing_special of monster.missing_specials) {
                if (missing_special.startsWith("damage reduction")) {
                    if (missing_special.indexOf(" or ") !== -1) continue; // This is an "or" damage reduction,
                    // it must be dealt with in other place
                    let drData = missing_special.replace("damage reduction", "").trim().split("/")
                    drData[1].split(" and ").forEach(e => {
                        damageReduction.push([drData[0], e.toLowerCase().replace("-", "any").replace(" ", "").replace("alchemical", "")])
                    })
                } else if (missing_special.startsWith("dr")) {
                    if (missing_special.indexOf(" or ") !== -1) continue; // This is an "or" damage reduction,
                    // it must be dealt with in other place
                    let drData = missing_special.replace("damage reduction", "").trim().split("/")
                    drData[1].split(" and ").forEach(e => {
                        damageReduction.push([drData[0], e.toLowerCase().replace("-", "any")])
                    })
                } else if (missing_special.startsWith("spell resistance")) {
                    let sr = missing_special.replace("spell resistance", "").trim();
                    if (parseInt(sr) > 0 && `${parseInt(sr)}` === sr)
                        racialChanges.push([sr, "misc", "spellResistance", "untyped"])
                    else
                        unprocessed_specials.push(missing_special)
                } else if (missing_special.startsWith("cold resistance")) {
                    let er = missing_special.replace("cold resistance", "").trim();
                    if (parseInt(er) > 0 && `${parseInt(er)}` === er)
                        resistances.push([er, "energy-cold", false, false])
                    else
                        unprocessed_specials.push(missing_special)
                } else if (missing_special.startsWith("acid resistance")) {
                    let er = missing_special.replace("acid resistance", "").trim();
                    if (parseInt(er) > 0 && `${parseInt(er)}` === er)
                        resistances.push([er, "energy-acid", false, false])
                    else
                        unprocessed_specials.push(missing_special)
                } else if (missing_special.startsWith("fire resistance")) {
                    let er = missing_special.replace("fire resistance", "").trim();
                    if (parseInt(er) > 0 && `${parseInt(er)}` === er)
                        resistances.push([er, "energy-fire", false, false])
                    else
                        unprocessed_specials.push(missing_special)
                } else if (missing_special.startsWith("electricity resistance")) {
                    let er = missing_special.replace("electricity resistance", "").trim();
                    if (parseInt(er) > 0 && `${parseInt(er)}` === er)
                        resistances.push([er, "energy-electric", false, false])
                    else
                        unprocessed_specials.push(missing_special)
                } else if (missing_special.startsWith("sonic resistance")) {
                    let er = missing_special.replace("sonic resistance", "").trim();
                    if (parseInt(er) > 0 && `${parseInt(er)}` === er)
                        resistances.push([er, "energy-sonic", false, false])
                    else
                        unprocessed_specials.push(missing_special)
                } else if (missing_special.startsWith("resistance to cold")) {
                    let er = missing_special.replace("resistance to cold", "").trim();
                    if (parseInt(er) > 0 && `${parseInt(er)}` === er)
                        resistances.push([er, "energy-cold", false, false])
                    else
                        unprocessed_specials.push(missing_special)
                } else if (missing_special.startsWith("resistance to acid")) {
                    let er = missing_special.replace("resistance to acid", "").trim();
                    if (parseInt(er) > 0 && `${parseInt(er)}` === er)
                        resistances.push([er, "energy-acid", false, false])
                    else
                        unprocessed_specials.push(missing_special)
                } else if (missing_special.startsWith("resistance to fire")) {
                    let er = missing_special.replace("resistance to fire", "").trim();
                    if (parseInt(er) > 0 && `${parseInt(er)}` === er)
                        resistances.push([er, "energy-fire", false, false])
                    else
                        unprocessed_specials.push(missing_special)
                } else if (missing_special.startsWith("resistance to electricity")) {
                    let er = missing_special.replace("resistance to electricity", "").trim();
                    if (parseInt(er) > 0 && `${parseInt(er)}` === er)
                        resistances.push([er, "energy-electric", false, false])
                    else
                        unprocessed_specials.push(missing_special)
                } else if (missing_special.startsWith("resistance to sonic")) {
                    let er = missing_special.replace("resistance to sonic", "").trim();
                    if (parseInt(er) > 0 && `${parseInt(er)}` === er)
                        resistances.push([er, "energy-sonic", false, false])
                    else
                        unprocessed_specials.push(missing_special)
                } else if (missing_special === "cold immunity") {
                    resistances.push(["", "energy-cold", true, false])
                } else if (missing_special === "electricity immunity") {
                    resistances.push(["", "energy-electric", true, false])
                } else if (missing_special === "fire immunity") {
                    resistances.push(["", "energy-fire", true, false])
                } else if (missing_special === "sonic immunity") {
                    resistances.push(["", "energy-sonic", true, false])
                } else if (missing_special === "acid immunity") {
                    resistances.push(["", "energy-acid", true, false])
                } else if (missing_special === "immunity to cold") {
                    resistances.push(["", "energy-cold", true, false])
                } else if (missing_special === "immunity to electricity") {
                    resistances.push(["", "energy-electric", true, false])
                } else if (missing_special === "immunity to fire") {
                    resistances.push(["", "energy-fire", true, false])
                } else if (missing_special === "immunity to sonic") {
                    resistances.push(["", "energy-sonic", true, false])
                } else if (missing_special === "immunity to acid") {
                    resistances.push(["", "energy-acid", true, false])
                } else if (missing_special === "immunity to cold and fire") {
                    resistances.push(["", "energy-fire", true, false])
                    resistances.push(["", "energy-cold", true, false])
                } else if (missing_special === "immunity to fire and cold") {
                    resistances.push(["", "energy-fire", true, false])
                    resistances.push(["", "energy-cold", true, false])
                } else if (missing_special === "immunity to acid and cold") {
                    resistances.push(["", "energy-acid", true, false])
                    resistances.push(["", "energy-cold", true, false])
                } else if (missing_special === "immune to force") {
                    resistances.push(["", "energy-force", true, false])
                } else if (missing_special === "vulnerability to cold") {
                    resistances.push(["", "energy-cold", false, true])
                } else if (missing_special === "vulnerability to electricity") {
                    resistances.push(["", "energy-electric", false, true])
                } else if (missing_special === "vulnerability to fire") {
                    resistances.push(["", "energy-fire", false, true])
                } else if (missing_special === "vulnerability to sonic") {
                    resistances.push(["", "energy-sonic", false, true])
                } else if (missing_special === "vulnerability to acid") {
                    resistances.push(["", "energy-acid", false, true])
                } else if (missing_special === "cold vulnerability") {
                    resistances.push(["", "energy-cold", false, true])
                } else if (missing_special === "electricity vulnerability") {
                    resistances.push(["", "energy-electric", false, true])
                } else if (missing_special === "fire vulnerability") {
                    resistances.push(["", "energy-fire", false, true])
                } else if (missing_special === "sonic vulnerability") {
                    resistances.push(["", "energy-sonic", false, true])
                } else if (missing_special === "acid vulnerability") {
                    resistances.push(["", "energy-acid", false, true])
                } else if (missing_special.startsWith("fast healing")) {
                    let val = missing_special.replace("fast healing", "").trim();
                    if (parseInt(val) > 0)
                        updateData["data.traits.fastHealing"] = parseInt(val)
                    else
                        unprocessed_specials.push(missing_special)
                } else if (missing_special.startsWith("regeneration")) {
                    let val = missing_special.replace("regeneration", "").trim();
                    if (parseInt(val) > 0)
                        updateData["data.traits.regeneration"] = parseInt(val)
                    else
                        unprocessed_specials.push(missing_special)
                } else if (missing_special.startsWith("darkvision")) {
                    let val = missing_special.replace("darkvision", "").replace("ft.", "").trim();
                    senses.push(`Darkvision ${val} ft.`)
                    //updateData["trait.senses"] = (updateData["trait.senses"] || "") + "Darkvision"
                    // Must update token
                    if (parseInt(val) > 0)
                        updateData["token.brightSight"] = parseInt(val)
                } else if (missing_special === "low-light vision") {
                    senses.push(`Low Light Vision`)
                    updateData["token.flags.D35E.lowLightVision"] = true
                    // Must update token
                    // if (parseInt(val) > 0)
                    //     updateData["data.traits.fastHealing"] = parseInt(val)
                } else if (missing_special === "vermin traits") {
                    // Give darkvision
                    // if (parseInt(val) > 0)
                    //     updateData["data.traits.fastHealing"] = parseInt(val)
                } else if (missing_special === "elemental traits") {
                    // Give darkvision
                    // if (parseInt(val) > 0)
                    //     updateData["data.traits.fastHealing"] = parseInt(val)
                } else if (missing_special === "undead traits") {
                    // Skip, given by undead racial HD
                } else if (missing_special === "construct traits") {
                    // Skip, given by construct racial HD
                } else if (missing_special === "plant traits") {
                    // Skip, given by plan racial HD
                } else if (missing_special === "ooze traits") {
                    // Skip, given by plan racial HD
                    game.D35E.logger.warn(`IMPORTER | CHCK | Monster ${monster.name} is an ooze, fix acid`)
                } else if (missing_special.startsWith("breath weapon")) {
                    for (let breathWeapon of missing_special.split(' or ')) {
                        breathWeapon = breathWeapon.replace('breath weapon', '').replace('(', '').replace(')', '')
                        let abilityIndex = null
                        if (breathWeapon.indexOf('cone') !== -1) {
                            abilityIndex = pack.index.find(e => "Breath Weapon (Cone)".toLowerCase().startsWith(e.name.toLowerCase()))
                        } else {
                            abilityIndex = pack.index.find(e => "Breath Weapon (Ray)".toLowerCase().startsWith(e.name.toLowerCase()))
                        }
                        let abilityItem = await actor.importItemFromCollection("world.monster-ability", abilityIndex._id)

                        let abilityUpdateData = {}
                        abilityUpdateData['_id'] = abilityItem._id
                        let energy = 'fire'
                        if (breathWeapon.indexOf('cold') !== -1) {
                            energy = 'cold'
                        } else if (breathWeapon.indexOf('lightning') !== -1) {
                            energy = 'electric'
                        } else if (breathWeapon.indexOf('acid') !== -1) {
                            energy = 'acid'
                        } else if (breathWeapon.indexOf('force') !== -1) {
                            energy = 'force'
                        } else if (breathWeapon.indexOf('cold') !== -1) {
                            energy = 'cold'
                        } else if (breathWeapon.indexOf('cold') !== -1) {
                            energy = 'cold'
                        }
                        abilityUpdateData['name'] = "Breath Weapon (" + breathWeapon.split(' ').map(capitalize).join(' ').replace(' Dc', ', DC').replace('Ft.', 'ft.').replace(' Of ', ' of ').trim() + ")"
                        if (diceFromText(breathWeapon).length) {
                            abilityUpdateData['data.damage.parts'] = [
                                [diceFromText(breathWeapon)[0], null, `energy-${energy}`]
                            ]
                        }
                        if (dcFromText(breathWeapon).length) {
                            abilityUpdateData['data.save.dc'] = dcFromText(breathWeapon)[1]
                        }
                        if (distanceFromText(breathWeapon).length) {
                            abilityUpdateData['data.measureTemplate.size'] = parseInt(distanceFromText(breathWeapon)[1])
                            abilityUpdateData['data.range.value'] = distanceFromText(breathWeapon)[1]
                        }

                        await actor.updateOwnedItem(abilityUpdateData)
                    }
                } else {

                    let abilityIndex = pack.index.find(e => missing_special.toLowerCase().startsWith(e.name.toLowerCase()))
                    if (abilityIndex) {
                        let abilityItem = await actor.importItemFromCollection("world.monster-ability", abilityIndex._id)
                        if (missing_special.startsWith("rake")) {
                            if (diceFromText(missing_special).length) {
                                let abilityUpdateData = {}
                                abilityUpdateData['_id'] = abilityItem._id
                                abilityUpdateData['data.damage.parts'] = [
                                    [diceFromText(missing_special)[0], null, 'damage-piercing-or-slashing']
                                ]
                                await actor.updateOwnedItem(abilityUpdateData)
                            }
                        } else if (missing_special.startsWith("constrict")) {
                            if (diceFromText(missing_special).length) {
                                let abilityUpdateData = {}
                                abilityUpdateData['_id'] = abilityItem._id
                                abilityUpdateData['data.damage.parts'] = [
                                    [diceFromText(missing_special)[0], null, 'damage-bludg']
                                ]
                                await actor.updateOwnedItem(abilityUpdateData)
                            }
                        } else if (missing_special.startsWith("rend")) {
                            if (diceFromText(missing_special).length) {
                                let abilityUpdateData = {}
                                abilityUpdateData['_id'] = abilityItem._id
                                abilityUpdateData['data.damage.parts'] = [
                                    [diceFromText(missing_special)[0], null, 'damage-piercing-or-slashing']
                                ]
                                await actor.updateOwnedItem(abilityUpdateData)
                            }
                        } else if (missing_special.startsWith("trample")) {
                            if (diceFromText(missing_special).length) {
                                let abilityUpdateData = {}
                                abilityUpdateData['_id'] = abilityItem._id
                                abilityUpdateData['data.damage.parts'] = [
                                    [diceFromText(missing_special)[0], null, 'damage-bludg']
                                ]
                                await actor.updateOwnedItem(abilityUpdateData)
                            }
                        } else if (missing_special.startsWith("blindsight")) {
                            let val = missing_special.replace("blindsight", "").replace("ft.", "").trim();
                            if (val) {
                                let abilityUpdateData = {}
                                abilityUpdateData['_id'] = abilityItem._id
                                abilityUpdateData['name'] = abilityItem.name + " " + val + " ft."
                                await actor.updateOwnedItem(abilityUpdateData)
                            }
                        } else if (missing_special.startsWith("telepathy")) {
                            let val = missing_special.replace("telepathy", "").replace("ft.", "").trim();
                            if (val) {
                                let abilityUpdateData = {}
                                abilityUpdateData['_id'] = abilityItem._id
                                abilityUpdateData['name'] = abilityItem.name + " " + val + " ft."
                                await actor.updateOwnedItem(abilityUpdateData)
                            }
                        } else if (missing_special.startsWith("tremorsense")) {
                            let val = missing_special.replace("tremorsense", "").replace("ft.", "").trim();
                            if (val) {
                                let abilityUpdateData = {}
                                abilityUpdateData['_id'] = abilityItem._id
                                abilityUpdateData['name'] = abilityItem.name + " " + val + " ft."
                                await actor.updateOwnedItem(abilityUpdateData)
                            }
                        } else if (missing_special.startsWith("frightful presence")) {
                            if (dcFromText(missing_special).length) {
                                let abilityUpdateData = {}
                                abilityUpdateData['_id'] = abilityItem._id
                                abilityUpdateData['data.save.dc'] = dcFromText(missing_special)[1]
                                await actor.updateOwnedItem(abilityUpdateData)
                            }
                        } else if (missing_special.startsWith("tail sweep")) {
                            if (dcFromText(missing_special).length) {
                                let abilityUpdateData = {}
                                abilityUpdateData['_id'] = abilityItem._id
                                abilityUpdateData['data.save.dc'] = dcFromText(missing_special)[1]
                                await actor.updateOwnedItem(abilityUpdateData)
                            }
                        } else if (missing_special.startsWith("crush")) {
                            if (dcFromText(missing_special).length) {
                                let abilityUpdateData = {}
                                abilityUpdateData['_id'] = abilityItem._id
                                abilityUpdateData['data.save.dc'] = dcFromText(missing_special)[1]
                                await actor.updateOwnedItem(abilityUpdateData)
                            }
                        } else if (missing_special.startsWith("turn resistance")) {
                            let val = missing_special.replace("turn resistance ", "").trim();
                            if (val) {
                                let abilityUpdateData = {}
                                abilityUpdateData['_id'] = abilityItem._id
                                abilityUpdateData['name'] = abilityItem.name + " " + val
                                await actor.updateOwnedItem(abilityUpdateData)
                            }
                        } else if (missing_special.endsWith("turn resistance")) {
                            let val = missing_special.replace(" turn resistance", "").trim();
                            if (val) {
                                let abilityUpdateData = {}
                                abilityUpdateData['_id'] = abilityItem._id
                                abilityUpdateData['name'] = abilityItem.name + " " + val
                                await actor.updateOwnedItem(abilityUpdateData)
                            }
                        } else if (missing_special.startsWith("poison")) {
                            game.D35E.logger.warn(`IMPORTER | WARN | Monster ${monster.name} has poison, check its description`)
                        }
                    } else if (missing_special !== "-" || missing_special.startsWith("dc ")) {

                        // let abilityIndex = pack.index.find(e => "Custom Ability".toLowerCase().startsWith(e.name.toLowerCase()))
                        // let abilityItem = await actor.importItemFromCollection("world.monster-ability", abilityIndex._id)
                        // let abilityUpdateData = {}
                        // abilityUpdateData['_id'] = abilityItem._id
                        // abilityUpdateData['name'] = missing_special
                        // abilityUpdateData['data.description.value'] = "<em>This ability could not be automatically imported.</em>"
                        // await actor.updateOwnedItem(abilityUpdateData)
                        if (missing_special.startsWith('immunity to')) {
                            let possibleImmunities = [];
                            let immunityList = missing_special.replace('immunity to ', '').replace(/,/gi, ' and ').split(' and ')
                            let customImmunities = []
                            for (let imm of immunityList) {
                                if (imm.toLowerCase() === "energy drain") possibleImmunities.push('energyDrain')
                                else if (imm.toLowerCase() === "mind affecting") possibleImmunities.push('mindAffecting')
                                else if (imm.toLowerCase() === "mind-affecting") possibleImmunities.push('mindAffecting')
                                else if (imm.toLowerCase() === "mind-affecting attacks") possibleImmunities.push('mindAffecting')
                                else if (imm.toLowerCase() === "mind affecting attacks") possibleImmunities.push('mindAffecting')
                                else if (imm.toLowerCase() === "sleep") possibleImmunities.push('sleep')
                                else if (imm.toLowerCase() === "poison") possibleImmunities.push('poison')
                                else if (imm.toLowerCase() === "paralysis") possibleImmunities.push('paralyze')
                                else if (imm.toLowerCase() === "stun") possibleImmunities.push('stun"')
                                else if (imm.toLowerCase() === "fear") possibleImmunities.push('fear')
                                else if (imm.toLowerCase() === "disease") possibleImmunities.push('disease')
                                else if (imm.toLowerCase() === "confusion") possibleImmunities.push('confuse')
                                else customImmunities.push(imm)
                            }
                            if (possibleImmunities)
                                updateData["data.traits.ci.value"] = possibleImmunities
                            if (customImmunities)
                                updateData["data.traits.ci.custom"] = customImmunities.join(", ")

                        } else {
                            unprocessed_specials.push(missing_special);
                            all_missing_specials.add(missing_special)
                        }
                    }
                }
            }
            if (unprocessed_specials.length > 0) {
                game.D35E.logger.error(`IMPORTER | WARN | Monster ${monster.name} has unprocessed specials`, unprocessed_specials, monster)
            }

            for (let special_data of monster.special_data) {
                let abilityIndex = pack.index.find(e => "Custom Ability".toLowerCase().startsWith(e.name.toLowerCase()))
                let abilityItem = await actor.importItemFromCollection("world.monster-ability", abilityIndex._id)
                let abilityUpdateData = {}
                abilityUpdateData['_id'] = abilityItem._id
                abilityUpdateData['name'] = special_data.name
                abilityUpdateData['data.description.value'] = '<p><em>This ability was imported automatically does not have actions or changes.</em></p>' + special_data.text.replace(/<b>.*?<\/b>/gi, '')
                await actor.updateOwnedItem(abilityUpdateData)
                if (special_data.name.toLowerCase().indexOf("spells") !== -1) {
                    let spells = spellsFromText(special_data.text);
                    //game.D35E.logger.warn(`IMPORTER | WARN | Monster ${monster.name} has spells`, spells)
                    let spellsToAdd = []
                    for (let spell of spells) {
                        let spellIndex = spellPack.index.find(e => spell.toLowerCase() === e.name.toLowerCase())
                        if (spellIndex) {
                            let spellItem = await spellPack.getEntity(spellIndex._id)
                            spellItem.data.data.spellbook = "primary"
                            itemData = spellItem.data
                            if (itemData._id) delete itemData._id;
                            spellsToAdd.push(itemData)
                        }
                    }
                    if (spellsToAdd)
                        await actor.createEmbeddedEntity("OwnedItem", spellsToAdd, {
                            ignoreSpellbookAndLevel: true
                        })
                }
                if (special_data.name.toLowerCase().indexOf("spell-like") !== -1) {
                    for (let spelllikeblock of special_data.text.split(";")) {
                        let spells = spellsFromText(spelllikeblock);
                        let spellsToAdd = []
                        //game.D35E.logger.warn(`IMPORTER | WARN | Monster ${monster.name} has spell-like abilities group`, spelllikeblock)
                        for (let spell of spells) {
                            let spellIndex = spellPack.index.find(e => spell.toLowerCase() === e.name.toLowerCase())
                            if (spellIndex) {
                                let spellItem = await spellPack.getEntity(spellIndex._id)
                                spellItem.data.data.spellbook = "spelllike"
                                if (spelllikeblock.toLowerCase().indexOf("at will") !== -1) {
                                    spellItem.data.data.atWill = true
                                    spellItem.data.data.level = 0
                                } else if (spelllikeblock.toLowerCase().indexOf("1/day") !== -1) {
                                    spellItem.data.data.preparation.preparedAmount = 1
                                    spellItem.data.data.preparation.maxAmount = 1
                                } else if (spelllikeblock.toLowerCase().indexOf("2/day") !== -1) {
                                    spellItem.data.data.preparation.preparedAmount = 2
                                    spellItem.data.data.preparation.maxAmount = 2
                                } else if (spelllikeblock.toLowerCase().indexOf("3/day") !== -1) {
                                    spellItem.data.data.preparation.preparedAmount = 3
                                    spellItem.data.data.preparation.maxAmount = 3
                                } else if (spelllikeblock.toLowerCase().indexOf("4/day") !== -1) {
                                    spellItem.data.data.preparation.preparedAmount = 4
                                    spellItem.data.data.preparation.maxAmount = 4
                                } else if (spelllikeblock.toLowerCase().indexOf("5/day") !== -1) {
                                    spellItem.data.data.preparation.preparedAmount = 5
                                    spellItem.data.data.preparation.maxAmount = 5
                                }
                                itemData = spellItem.data
                                if (itemData._id) delete itemData._id;
                                spellsToAdd.push(itemData)
                            }
                        }
                        if (spellsToAdd)
                            await actor.createEmbeddedEntity("OwnedItem", spellsToAdd, {
                                ignoreSpellbookAndLevel: true
                            })
                    }

                }
            }

            let itemUpdateData = {
                '_id': racialHDItem._id,
                'data.levels': monster.hd || parseInt(monster.hit_dice.split('d')[0]),
                'data.changes': racialChanges,
                'data.damageReduction': damageReduction,
                'data.resistances': resistances
            }

            let featSkillMod = {}
            pack = game.packs.get("D35E.feats")
            for (let feat of monster.feat_list) {
                if (feat.endsWith(","))
                    feat = feat.replace(",", "")
                let featAdditionalData = null
                let featNumTimes = 1
                if (feat.startsWith("Weapon Focus")) {
                    featAdditionalData = feat.split('(')[1].split(')')[0]
                    feat = "Weapon Focus (No Weapon Set)"
                } else if (feat.startsWith("Greater Weapon Focus")) {
                    featAdditionalData = feat.split('(')[1].split(')')[0]
                    feat = "Greater Weapon Focus (No Weapon Set)"
                } else if (feat.startsWith("Epic Weapon Focus")) {
                    featAdditionalData = feat.split('(')[1].split(')')[0]
                    feat = "Epic Weapon Focus (No Weapon Set)"
                } else if (feat.startsWith("Improved Critical")) {
                    featAdditionalData = feat.split('(')[1].split(')')[0]
                    feat = "Improved Critical (No Weapon Set)"
                } else if (feat.startsWith("Tenacious Magic")) {
                    featAdditionalData = feat.split('(')[1].split(')')[0]
                    feat = "Tenacious Magic (No Spell Set)"
                } else if (feat.startsWith("Spell Stowaway")) {
                    featAdditionalData = feat.split('(')[1].split(')')[0]
                    feat = "Spell Stowaway (No Spell Set)"
                } else if (feat.startsWith("Improved Natural Attack")) {
                    featAdditionalData = feat.split('(')[1].split(')')[0]
                    feat = "Improved Natural Attack (No Weapon Set)"
                } else if (feat.startsWith("Skill Focus")) {
                    featAdditionalData = feat.split('(')[1].split(')')[0]
                    feat = "Skill Focus"
                } else if (feat.endsWith("(x2)")) {
                    featNumTimes = 2
                    feat = feat.replace("(x2)", "").trim();
                } else if (feat.endsWith("(x3)")) {
                    featNumTimes = 3
                    feat = feat.replace("(x3)", "").trim();
                } else if (feat.endsWith("(2)")) {
                    featNumTimes = 2
                    feat = feat.replace("(2)", "").trim();
                } else if (feat.endsWith("(3)")) {
                    featNumTimes = 3
                    feat = feat.replace("(3)", "").trim();
                } else if (feat.endsWith("(x4)")) {
                    featNumTimes = 4
                    feat = feat.replace("(x4)", "").trim();
                } else if (feat.endsWith("(4)")) {
                    featNumTimes = 4
                    feat = feat.replace("(4)", "").trim();
                } else if (feat.endsWith("(x5)")) {
                    featNumTimes = 5
                    feat = feat.replace("(x5)", "").trim();
                } else if (feat.endsWith("(x6)")) {
                    featNumTimes = 6
                    feat = feat.replace("(x6)", "").trim();
                }
                let featIndex = pack.index.find(e => e.name.toLowerCase() === feat.toLowerCase())
                if (featIndex) {
                    let featItem = await actor.importItemFromCollection("D35E.feats", featIndex._id)
                    if (featNumTimes > 1) {
                        for (let i = 1; i < featNumTimes; i++) {
                            await actor.importItemFromCollection("D35E.feats", featIndex._id)
                        }
                    }
                    if (feat.toLowerCase() === 'stealthy') {
                        featSkillMod['mos'] = -2
                        featSkillMod['hid'] = -2
                    }
                    if (feat.toLowerCase() === 'alertness') {
                        featSkillMod['lis'] = -2
                        featSkillMod['spt'] = -2
                    }
                    if (feat.toLowerCase() === 'persuasive') {
                        featSkillMod['int'] = -2
                        featSkillMod['blf'] = -2
                    }
                    if (feat.toLowerCase() === 'agile') {
                        featSkillMod['blc'] = -2
                        featSkillMod['esc'] = -2
                    }
                    if (feat.toLowerCase() === 'weapon focus (no weapon set)') {
                        if (featAdditionalData) {
                            let abilityUpdateData = {}
                            abilityUpdateData['_id'] = featItem._id
                            abilityUpdateData['name'] = `Weapon Focus (${featAdditionalData.split(' ').map(capitalize).join(' ')})`
                            abilityUpdateData['data.customAttributes._q9or7r27r.value'] = featAdditionalData.split(' ').map(capitalize).join(' ')
                            await actor.updateOwnedItem(abilityUpdateData)
                        }
                    } else if (feat.toLowerCase() === 'greater weapon focus (no weapon set)') {
                        if (featAdditionalData) {
                            let abilityUpdateData = {}
                            abilityUpdateData['_id'] = featItem._id
                            abilityUpdateData['name'] = `Greater Weapon Focus (${featAdditionalData.split(' ').map(capitalize).join(' ')})`
                            abilityUpdateData['data.customAttributes._kh4mdayuu.value'] = featAdditionalData.split(' ').map(capitalize).join(' ')
                            await actor.updateOwnedItem(abilityUpdateData)
                        }
                    } else if (feat.toLowerCase() === 'epic weapon focus (no weapon set)') {
                        if (featAdditionalData) {
                            let abilityUpdateData = {}
                            abilityUpdateData['_id'] = featItem._id
                            abilityUpdateData['name'] = `Epic Weapon Focus (${featAdditionalData.split(' ').map(capitalize).join(' ')})`
                            abilityUpdateData['data.customAttributes._kh4mdayuu.value'] = featAdditionalData.split(' ').map(capitalize).join(' ')
                            await actor.updateOwnedItem(abilityUpdateData)
                        }
                    } else if (feat.toLowerCase() === 'improved natural attack (no weapon set)') {
                        if (featAdditionalData) {
                            let abilityUpdateData = {}
                            abilityUpdateData['_id'] = featItem._id
                            abilityUpdateData['name'] = `Improved Natural Attack (${featAdditionalData.split(' ').map(capitalize).join(' ')})`
                            abilityUpdateData['data.customAttributes._kh4mdayuu.value'] = featAdditionalData.split(' ').map(capitalize).join(' ')
                            await actor.updateOwnedItem(abilityUpdateData)
                        }
                    } else if (feat.toLowerCase() === 'spell stowaway (no spell set)') {
                        if (featAdditionalData) {
                            let abilityUpdateData = {}
                            abilityUpdateData['_id'] = featItem._id
                            abilityUpdateData['name'] = `Spell Stowaway (${featAdditionalData.split(' ').map(capitalize).join(' ')})`
                            abilityUpdateData['data.customAttributes._kh4mdayuu.value'] = featAdditionalData.split(' ').map(capitalize).join(' ')
                            await actor.updateOwnedItem(abilityUpdateData)
                        }
                    } else if (feat.toLowerCase() === 'tenacious magic (no spell set)') {
                        if (featAdditionalData) {
                            let abilityUpdateData = {}
                            abilityUpdateData['_id'] = featItem._id
                            abilityUpdateData['name'] = `Tenacious Magic (${featAdditionalData.split(' ').map(capitalize).join(' ')})`
                            abilityUpdateData['data.customAttributes._kh4mdayuu.value'] = featAdditionalData.split(' ').map(capitalize).join(' ')
                            await actor.updateOwnedItem(abilityUpdateData)
                        }
                    } else if (feat.toLowerCase() === 'improved critical (no weapon set)') {
                        if (featAdditionalData) {
                            let abilityUpdateData = {}
                            abilityUpdateData['_id'] = featItem._id
                            abilityUpdateData['name'] = `Improved Critical (${featAdditionalData.split(' ').map(capitalize).join(' ')})`
                            abilityUpdateData['data.customAttributes._q876yak3y.value'] = featAdditionalData.split(' ').map(capitalize).join(' ')
                            await actor.updateOwnedItem(abilityUpdateData)
                        }
                    } else if (feat.toLowerCase() === 'skill focus') {
                        if (featAdditionalData) {
                            let abilityUpdateData = {}
                            abilityUpdateData['_id'] = featItem._id
                            abilityUpdateData['name'] = `Skill Focus (${featAdditionalData.split(' ').map(capitalize).join(' ')})`
                            abilityUpdateData['data.description.value'] = '<p><em>Bonus from this feat is included in skill ranks for this creature.</em></p><p>You get a +3 bonus on all checks involving that skill.</p>'

                            await actor.updateOwnedItem(abilityUpdateData)
                        }
                    }
                } else {
                    if (feat !== "None" && feat !== "-")
                        game.D35E.logger.error(`IMPORTER | WARN |  Monster ${monster.name} has missing feat`, feat)
                }
            }


            sizeSkillMod = {
                "hid": {
                    "fine": 16,
                    "dim": 12,
                    "tiny": 8,
                    "sm": 4,
                    "med": 0,
                    "lg": -4,
                    "huge": -8,
                    "grg": -12,
                    "col": -16
                }
            }

            // Setting up skills
            for (let skill of Object.values(monster.skill_list)) {
                itemUpdateData[`data.classSkills.${skill.code}`] = true
                if (skill.code) {
                    let abl = actor.data.data.skills[skill.code].ability;
                    let ablMod = actor.data.data.abilities[abl].mod;
                    updateData[`data.skills.${skill.code}.rank`] = skill.value - ablMod + (featSkillMod[skill.code] || 0) - (sizeSkillMod[skill.code] ? sizeSkillMod[skill.code][monster.mapped_size] : 0)
                }
            }

            await actor.updateOwnedItem(itemUpdateData)

            updateData["data.traits.senses"] = senses.join(', ')
            updateData['data.details.notes.value'] = monster.full_text.replace(/h5/g, 'h2')
            await actor.update(updateData)

            //Setting up attacks
            let unprocessed_attacks = []
            let firstAttack = true;
            let attackIdMap = new Map()
            for (let attack of monster.attack_list) {
                if (monster.name.toLowerCase().indexOf("swarm") !== -1) {
                    if (attack === "corrupted_item") {
                        attack = 'swarm'
                    }
                }
                let naturalWeaponIndex = naturalWeaponPack.index.find(e => attack.toLowerCase().startsWith(e.name.toLowerCase()))
                if (naturalWeaponIndex) {
                    let attackItem = await actor.importItemFromCollection("world.monster-attack", naturalWeaponIndex._id)

                    if (attack.toLowerCase().startsWith("swarm")) {
                        if (diceFromText(monster.attack).length) {
                            let abilityUpdateData = {}
                            abilityUpdateData['_id'] = attackItem._id
                            abilityUpdateData['data.damage.parts'] = [
                                [diceFromText(monster.attack)[0], 'Swarm', null]
                            ]
                            await actor.updateOwnedItem(abilityUpdateData)
                        }
                        game.D35E.logger.warn("IMPORTER | WARN | Monster is a Swarm!", monster)
                    } else if (attack.toLowerCase().startsWith("incorporeal touch")) {
                        if (diceFromText(monster.attack).length) {
                            let abilityUpdateData = {}
                            abilityUpdateData['_id'] = attackItem._id
                            // TODO: Fix this
                            abilityUpdateData['data.damage.parts'] = [
                                [diceFromText(monster.attack)[0], 'Touch', '']
                            ]
                            await actor.updateOwnedItem(abilityUpdateData)
                        }
                        game.D35E.logger.warn(`IMPORTER | WARN | Monster ${monster.name} has Incorporeal Touch!`, monster)
                    } else {
                        if (monster.text_attacks[attack.toLowerCase()]) {
                            if (diceFromText(monster.text_attacks[attack.toLowerCase()]).length) {
                                let dices = diceFromText(monster.text_attacks[attack.toLowerCase()])[0]
                                let abilityUpdateData = {}
                                abilityUpdateData['_id'] = attackItem._id
                                let damageParts = duplicate(attackItem.data.damage.parts)
                                damageParts[0][0] = dices;
                                abilityUpdateData['data.damage.parts'] = damageParts;
                                await actor.updateOwnedItem(abilityUpdateData)
                            }
                        }
                    }
                    if (firstAttack) {
                        let abilityUpdateData = {}
                        abilityUpdateData['_id'] = attackItem._id
                        abilityUpdateData['data.primaryAttack'] = true
                        await actor.updateOwnedItem(abilityUpdateData)
                        firstAttack = false
                        attackIdMap.set(attack.toLowerCase(), {
                            _id: 0,
                            count: 0,
                            id: attackItem._id,
                            name: attackItem.name,
                            img: attackItem.img,
                            isWeapon: false,
                            primary: true
                        })
                    } else {
                        attackIdMap.set(attack.toLowerCase(), {
                            _id: 0,
                            count: 0,
                            id: attackItem._id,
                            name: attackItem.name,
                            img: attackItem.img,
                            isWeapon: false,
                            primary: false
                        })
                    }

                } else {
                    let fixedAttackName = attack.toLowerCase().replace('short sword', 'shortsword')
                    weaponIndex = weaponPack.index.find(e => fixedAttackName.startsWith(e.name.toLowerCase()));
                    if (weaponIndex) {
                        let ai = await weaponPack.getEntity(weaponIndex._id)
                        let itemData = duplicate(ai.data)
                        if (itemData._id) delete itemData._id;
                        let attackItem = await actor.createEmbeddedEntity("OwnedItem", itemData)
                        //let attackItem = await actor.importItemFromCollection("D35E.weapons-and-ammo", weaponIndex._id)
                        game.D35E.logger.log('IMPORTER | INFO | ', itemData, actor)
                        let attack = await actor.createAttackFromWeapon(attackItem)
                        attackIdMap.set(fixedAttackName, {
                            _id: 0,
                            count: 0,
                            id: attack._id,
                            name: attack.name,
                            img: attack.img,
                            isWeapon: true,
                            primary: false
                        })
                    } else {
                        unprocessed_attacks.push(attack)
                    }
                }


            }
            if (unprocessed_attacks.length > 0) {
                game.D35E.logger.error(`IMPORTER | WARN | Monster ${monster.name} has unprocessed attacks`, unprocessed_attacks, monster)
            }
            if (monster.full_attack.indexOf('plus') !== -1) {
                game.D35E.logger.warn(`IMPORTER | WARN | Monster ${monster.name} has complex attack`, monster.full_attack)
            }

            for (let fullAttack of monster.full_attacks) {
                if (!fullAttack) continue;
                let naturalWeaponIndex = naturalWeaponPack.index.find(e => "full attack".toLowerCase().startsWith(e.name.toLowerCase()))
                if (naturalWeaponIndex) {
                    let attackItem = await actor.importItemFromCollection("world.monster-attack", naturalWeaponIndex._id)
                    let id = 1;
                    let abilityUpdateData = {}
                    abilityUpdateData['_id'] = attackItem._id
                    for (let _attack of fullAttack) {
                        if (attackIdMap.has(_attack[0])) {
                            let attackData = duplicate(attackIdMap.get(_attack[0]))
                            attackData.count = Math.max(1, _attack[1])
                            attackData._id = id
                            abilityUpdateData[`data.attacks.attack${id}`] = attackData
                        } else {
                            game.D35E.logger.error(`IMPORTER | WARN | Monster ${monster.name} has missing element in full attack`, _attack, attackIdMap)
                        }
                        id++;
                    }
                    await actor.updateOwnedItem(abilityUpdateData);
                }
            }

        }
    }

    activateListeners(html) { //This makes the button clickable ;D
        // Submit button
        html.find(".MonsterButton").click(this.getMonsters.bind(this));

    }

}
