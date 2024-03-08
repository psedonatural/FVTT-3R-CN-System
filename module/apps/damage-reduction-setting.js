import {CACHE} from "../cache.js";
import {ActorDamageHelper} from "../actor/helpers/actorDamageHelper.js";

export class DamageReductionSetting extends FormApplication {

    constructor(...args) {
        super(...args);

        this.damageReduction = ActorDamageHelper.getDRForActor(this.object, true)
        this.energyResistance = ActorDamageHelper.getERForActor(this.object, true)
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "dr-setting",
            classes: ["D35E", "dr-setting"],
            title: "Damage Reduction and Energy Resistance",
            template: "systems/D35E/templates/apps/damage-reduction-setting.html",
            width: 640,
            height: "auto",
            closeOnSubmit: false,
            submitOnClose: false,
        });
    }

    get actor() {
        return this.object;
    }

    getData() {
        return {
            damageReduction: this.damageReduction,
            energyResistance: this.energyResistance
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('input.value').change(this._onEntryChange.bind(this));
        html.find('input[type="checkbox"]').change(this._onEntryChange.bind(this));
        html.find('input[type="checkbox"]').change(this._onChecboxChange.bind(this));


        $('input[name="computed-dr"]').val(ActorDamageHelper.computeDRString(this.damageReduction))
        $('input[name="computed-er"]').val(ActorDamageHelper.computeERString(this.energyResistance))
    }

    async _onEntryChange(event) {
        let key = $(event.target).attr('name')
        let value = $(event.target).val()
        this._updateDRERDataFromForm(key, value)
        $('input[name="computed-dr"]').val(ActorDamageHelper.computeDRString(this.damageReduction))
        $('input[name="computed-er"]').val(ActorDamageHelper.computeERString(this.energyResistance))
    }
    async _onChecboxChange(event) {
        let key = $(event.target).attr('name')
        let value = $(event.target).is(":checked")
        this._updateDRERDataFromForm(key, value)
        $('input[name="computed-dr"]').val(ActorDamageHelper.computeDRString(this.damageReduction))
        $('input[name="computed-er"]').val(ActorDamageHelper.computeERString(this.energyResistance))
    }

    _updateObject(event, formData) {
        Object.keys(formData).forEach(key => {
            let data = formData[key];
            this._updateDRERDataFromForm(key, data);
        })
        const updateData = {};
        updateData[`data.damageReduction`] = ActorDamageHelper.getActorMapForDR(this.damageReduction);
        updateData[`data.energyResistance`] = ActorDamageHelper.getActorMapForER(this.energyResistance);
        this.actor.update(updateData);

        this.close();
    }

    _updateDRERDataFromForm(key, data) {
        if (key.startsWith("dr-or-")) {
            let dr = key.replace("dr-or-", "")
            ActorDamageHelper.getDamageTypeForUID(this.damageReduction, dr).or = data;
        } else if (key.startsWith("dr-value-")) {
            let dr = key.replace("dr-value-", "")
            ActorDamageHelper.getDamageTypeForUID(this.damageReduction, dr).value = parseInt(data);
        } else if (key.startsWith("dr-lethal-")) {
            let dr = key.replace("dr-lethal-", "")
            ActorDamageHelper.getDamageTypeForUID(this.damageReduction, dr).lethal = data;
        } else if (key.startsWith("dr-immunity-")) {
            let dr = key.replace("dr-immunity-", "")
            ActorDamageHelper.getDamageTypeForUID(this.damageReduction, dr).immunity = data;
        } else if (key.startsWith("er-value-")) {
            let dr = key.replace("er-value-", "")
            ActorDamageHelper.getDamageTypeForUID(this.energyResistance, dr).value = parseInt(data);
        } else if (key.startsWith("er-immunity-")) {
            let dr = key.replace("er-immunity-", "")
            ActorDamageHelper.getDamageTypeForUID(this.energyResistance, dr).immunity = data;
        } else if (key.startsWith("er-vulnerable-")) {
            let dr = key.replace("er-vulnerable-", "")
            ActorDamageHelper.getDamageTypeForUID(this.energyResistance, dr).vulnerable = data;
        } else if (key.startsWith("er-lethal-")) {
            let dr = key.replace("er-lethal-", "")
            ActorDamageHelper.getDamageTypeForUID(this.energyResistance, dr).lethal = data;
        } else if (key.startsWith("er-half-")) {
            let dr = key.replace("er-half-", "")
            ActorDamageHelper.getDamageTypeForUID(this.energyResistance, dr).half = data;
        }
    }
}
