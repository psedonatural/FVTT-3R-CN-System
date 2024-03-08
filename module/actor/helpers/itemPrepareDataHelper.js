import {ActorDamageHelper} from "./actorDamageHelper.js";
import {Roll35e} from "../../roll.js";
import {isEqual} from "../../lib.js";
import {ItemEnhancementHelper} from "../../item/helpers/itemEnhancementHelper.js";

export class ItemPrepareDataHelper {

    static prepareResistancesForItem(item, erDrRollData, actorPrepareData) {
        erDrRollData.item = item.getRollData();
        if (item.system.resistances) {
            (item.system?.resistances || []).forEach(resistance => {
                if (!resistance[1])
                    return;
                let _resistance = actorPrepareData.combinedResistances.find(res => res.uid === resistance[1]);
                if (!_resistance) {
                    _resistance = ActorDamageHelper.defaultER;
                    _resistance.uid = resistance[1];
                    actorPrepareData.combinedResistances.push(_resistance);
                }
                let _oldResistance = duplicate(_resistance);
                // Fix up existing objects so they work
                erDrRollData.level = item.system.levels || 0;
                erDrRollData.levels = item.system.levels || 0;

                _resistance.value = Math.max(_resistance.value, new Roll35e(resistance[0] || "0", erDrRollData).roll().total);
                _resistance.immunity = _resistance.immunity || resistance[2];
                _resistance.vulnerable = _resistance.vulnerable || resistance[3];
                _resistance.half = _resistance.half || resistance[4];
                if (!isEqual(_oldResistance,_resistance)) {
                    _resistance.providedBy = item.id;
                    _resistance.isPool = item.system?.damagePool?.enabled;
                    _resistance.modified = true;
                    if (!_resistance.items)
                        _resistance.items = [];
                    _resistance.items.push(item.name);
                }
            });
        }
        if (item.system.damageReduction) {
            (item.system?.damageReduction || []).forEach(dr => {
                if (!dr[1] || !dr[0])
                    return;
                if (dr[1] !== 'any') {
                    if (!actorPrepareData.combinedDR.types) {
                        actorPrepareData.combinedDR.types = [];
                    }
                    let _dr = actorPrepareData.combinedDR.types.find(res => res.uid === dr[1]);
                    if (!_dr) {
                        _dr = ActorDamageHelper.defaultDR;
                        _dr.uid = dr[1];
                        actorPrepareData.combinedDR.types.push(_dr);
                    }
                    let _oldDr = duplicate(dr);
                    erDrRollData.level = item.system.levels || 0;
                    erDrRollData.levels = item.system.levels || 0;
                    _dr.value = Math.max(_dr.value, Roll35e.safeRoll(dr[0] || "0", erDrRollData).total);
                    _dr.immunity = _dr.immunity || dr[2];
                    if (!isEqual(_oldDr,_dr)) {
                        _dr.providedBy = item.id;
                        _dr.isPool = item.system?.damagePool?.enabled;
                        _dr.modified = true;
                        if (!_dr.items)
                            _dr.items = [];
                        _dr.items.push(item.name);
                    }
                } else {
                    actorPrepareData.combinedDR.any = Math.max(actorPrepareData.combinedDR.any || 0, new Roll35e(dr[0] || "0", erDrRollData).roll().total);
                }
            });
        }
        if (item.type === "weapon" || item.type === "equipment") {
            if (item.system?.equipmentType === "shield")
                actorPrepareData.shieldType = item.system?.equipmentSubtype;
            if (item.system.enhancements !== undefined) {
                item.system.enhancements.items.forEach(enhancementItem => {
                    let enhancementItemData = ItemEnhancementHelper.getEnhancementData(enhancementItem)
                    erDrRollData.item = enhancementItemData;
                    (enhancementItemData?.resistances || []).forEach(resistance => {
                        if (!resistance[1])
                            return;
                        let _resistance = actorPrepareData.combinedResistances.find(res => res.uid === resistance[1]);
                        if (!_resistance) {
                            _resistance = ActorDamageHelper.defaultER;
                            _resistance.uid = resistance[1];
                            actorPrepareData.combinedResistances.push(_resistance);
                        }
                        let _oldResistance = duplicate(_resistance);
                        erDrRollData.level = enhancementItemData.levels || 0;
                        erDrRollData.levels = enhancementItemData.levels || 0;
                        erDrRollData.enh = enhancementItemData.enh || 0;
                        _resistance.value = Math.max(_resistance.value, new Roll35e(resistance[0] || "0", erDrRollData).roll().total);
                        _resistance.immunity = _resistance.immunity || resistance[2];
                        _resistance.vulnerable = _resistance.vulnerable || resistance[3];
                        _resistance.half = _resistance.half || resistance[4];
                        if (!isEqual(_oldResistance,_resistance)) {
                            _resistance.providedBy = item.id;
                            _resistance.modified = true;
                            if (!_resistance.items)
                                _resistance.items = [];
                            _resistance.items.push(item.name);
                        }
                    });
                    if (enhancementItemData.damageReduction) {
                        (enhancementItemData?.damageReduction || []).forEach(dr => {
                            if (!dr[1] || !dr[0])
                                return;
                            if (dr[1] !== 'any') {
                                if (!actorPrepareData.combinedDR.types) {
                                    actorPrepareData.combinedDR.types = [];
                                }
                                let _dr = actorPrepareData.combinedDR.types.find(res => res.uid === dr[1]);
                                if (!_dr) {
                                    _dr = ActorDamageHelper.defaultDR;
                                    _dr.uid = dr[1];
                                    actorPrepareData.combinedDR.types.push(_dr);
                                }
                                let _oldDr = duplicate(dr);
                                erDrRollData.level = enhancementItemData.levels || 0;
                                erDrRollData.levels = enhancementItemData.levels || 0;
                                erDrRollData.enh = enhancementItemData.enh || 0;
                                _dr.value = Math.max(_dr.value, new Roll35e(dr[0] || "0", erDrRollData).roll().total);
                                _dr.immunity = _dr.immunity || dr[2];
                                if (!isEqual(_oldDr,_dr)) {
                                    _dr.providedBy = item.id;
                                    _dr.modified = true;
                                    if (!_dr.items)
                                        _dr.items = [];
                                    _dr.items.push(item.name);
                                }
                            } else {
                                actorPrepareData.combinedDR.any = Math.max(actorPrepareData.combinedDR.any || 0, new Roll35e(dr[0] || "0", enhancementItemData).roll().total);
                            }
                        });
                    }
                });
            }
        }
    }

    static prepareCountersForItem(item, actorPreparedData) {
        if (item.system.counterName !== undefined && item.system.counterName !== null && item.system.counterName !== "") {
            item.system.counterName.split(";").forEach(counterName => {
                counterName = counterName.trim();
                if (counterName.indexOf(".") !== -1) {
                    let group = counterName.split(".")[0];
                    let name = counterName.split(".")[1];
                    if (actorPreparedData.counters[group] === undefined) {
                        actorPreparedData.counters[group] = {};
                    }
                    if (actorPreparedData.counters[group][name] === undefined) {
                        actorPreparedData.counters[group][name] = { value: 0, counted: 0 };
                    }
                    actorPreparedData.counters[group][name].value++;
                } else {
                    if (actorPreparedData.counters[counterName] === undefined) {
                        actorPreparedData.counters[counterName] = { value: 0, counted: 0 };
                    }
                    actorPreparedData.counters[counterName].value++;
                }
            });

        }
    }
}
