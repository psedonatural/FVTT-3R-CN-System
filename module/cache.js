export const CACHE = {};

CACHE.ClassFeatures = new Map()
CACHE.AllClassFeatures = []
CACHE.RacialFeatures = new Map()
CACHE.AllRacialFeatures = []
CACHE.AllAbilities = new Map()
CACHE.Materials = new Map()
CACHE.DamageTypes = new Map()

export const addClassAbilitiesFromPackToCache = async function(itemPack) {
    const entities = await itemPack.getDocuments();
    for (let e of entities) {
        //e.pack = packName;
        if (e.system.associations !== undefined && e.system.associations.classes !== undefined) {
            e.system.associations.classes.forEach(cl => {
                if (!CACHE.ClassFeatures.has(cl[0]))
                    CACHE.ClassFeatures.set(cl[0], [])
                CACHE.ClassFeatures.get(cl[0]).push(e)
            })
        }
        if (e.system.uniqueId) {
            CACHE.AllAbilities.set(e.system.uniqueId, e)
            CACHE.AllClassFeatures.push(e);
        }
    }

}

export const addRacialAbilitiedFromPackToCache = async function (itemPack) {
    const entities = await itemPack.getDocuments();
    for (let e of entities) {
        //e.pack = packName;
        if (e.system.tags !== undefined) {
            e.system.tags.forEach(cl => {
                if (!CACHE.RacialFeatures.has(cl[0]))
                    CACHE.RacialFeatures.set(cl[0], [])
                CACHE.RacialFeatures.get(cl[0]).push(e)
            })
        }
        if (e.system.uniqueId) {
            CACHE.AllAbilities.set(e.system.uniqueId, e)
            CACHE.AllRacialFeatures.push(e);
        }
    }

}

export const rebuildCache = async function() {
    CACHE.ClassFeatures = new Map()
    CACHE.AllClassFeatures = []
    CACHE.RacialFeatures = new Map()
    CACHE.AllRacialFeatures = []
    CACHE.AllAbilities = new Map()
    CACHE.Materials = new Map()
    CACHE.DamageTypes = new Map()
    return buildCache();
}

const _CheckSettingsForPackName = (packName, settingData) => {
    if (!settingData) {
        return false;
    }

    const packs = settingData.split(',');
    for (let pack of packs) {
        if (packName.endsWith(pack)) {
            return true;
        }
    }

    return false;
}

export const buildCache = async function() {

    //game.D35E.logger.log("Building Caches for compendiums...")
    ui.notifications.info(`Building Caches for compendiums...`);

    const additionalCachedCompendiums_classAbilities = game.settings.get("D35E", "additionalCachedCompendiums_classAbilities");
    const additionalCachedCompendiums_racialAbilities = game.settings.get("D35E", "additionalCachedCompendiums_racialAbilities");
    const additionalCachedCompendiums_spellLikeAbilities = game.settings.get("D35E", "additionalCachedCompendiums_spellLikeAbilities");
    const additionalCachedCompendiums_materials = game.settings.get("D35E", "additionalCachedCompendiums_materials");
    const additionalCachedCompendiums_damageTypes = game.settings.get("D35E", "additionalCachedCompendiums_damageTypes");

    for (const entry of game.packs.entries()) {
        const packName = entry[0];
        const itemPack = entry[1];

        if (packName.endsWith('class-abilities') || _CheckSettingsForPackName(packName, additionalCachedCompendiums_classAbilities)) {
            addClassAbilitiesFromPackToCache(itemPack);
            continue;
        }

        else if (packName.endsWith('racial-abilities') || _CheckSettingsForPackName(packName, additionalCachedCompendiums_racialAbilities)) {
            addRacialAbilitiedFromPackToCache(itemPack);
            continue;
        }

        else if (packName.endsWith('spelllike-abilities')
            || packName.endsWith('spell-like-abilities')
            || packName.endsWith('spelllike')
            || _CheckSettingsForPackName(packName, additionalCachedCompendiums_spellLikeAbilities)
        ) {
            const entities = await itemPack.getDocuments();
            for (let e of entities) {
                //e.pack = packName;
                if (e.system.tags !== undefined) {
                    e.system.tags.forEach(cl => {
                        if (!CACHE.RacialFeatures.has(cl[0]))
                            CACHE.RacialFeatures.set(cl[0], [])
                        CACHE.RacialFeatures.get(cl[0]).push(e)
                    })
                }
                if (e.system.uniqueId) {
                    CACHE.AllAbilities.set(e.system.uniqueId, e)
                    CACHE.AllRacialFeatures.push(e);
                }
            }
            continue;
        }

        else if (packName.endsWith('materials') || _CheckSettingsForPackName(packName, additionalCachedCompendiums_materials)) {
            const entities = await itemPack.getDocuments();
            for (let e of entities) {
                //e.pack = packName;
                if (e.system.uniqueId) {
                    CACHE.Materials.set(e.system.uniqueId, e)
                }
            }
            continue;
        }

        else if (packName.endsWith('damage-types') || _CheckSettingsForPackName(packName, additionalCachedCompendiums_damageTypes)) {
            const entities = await itemPack.getDocuments();
            for (let e of entities) {
                //e.pack = packName;
                if (e.system.uniqueId) {
                    CACHE.DamageTypes.set(e.system.uniqueId, e)
                }
            }
            continue;
        }
    };

    ui.notifications.info(`Building Caches for compendiums finished!`);
    //game.D35E.logger.log("Building Caches for finished!")
}
