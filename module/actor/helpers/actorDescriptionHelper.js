export class ActorDescriptionHelper {

    /**
     * @param {ActorPF} actor
     */
    constructor(actor) {
        this.actor = actor
    }


    describeHitDice() {
        return `${this.actor.racialHD.system.levels}d${this.actor.racialHD.system.hd}+${this.actor.system.attributes.hp.max-this.actor.racialHD.system.hp} (${this.actor.system.attributes.hp.max} hp)`;
    }

    describeType() {
        let type = this.actor.racialHD.name.replace('*','');
        if (this.actor.system.details.type) {
            type = type + ` (${this.actor.system.details.type})`;
        }
        return type;
    }

    describeSize() {
        return CONFIG.D35E.actorSizes[this.actor.system.traits.actualSize];
    }

    formatBonus(total) {
        if (total > 0) return "+" + total;
        else return "" + total;
    }

    describeSpeed() {
        let speedLabels = [];
        let speeds = this.actor.system.attributes.speed;
        let firstLabel = true;
        for (let speed of Object.keys(speeds)) {
            if (speeds[speed].total) {
                let label = ''
                if (speed === 'land') {
                    label = `${speeds[speed].total} ft.`
                }
                else {
                    label = `${speed} ${speeds[speed].total} ft.`
                }
                if (firstLabel) {
                    label = label + `(${speeds[speed].total / 5} squares)`
                    firstLabel = false;
                }
                speedLabels.push(label);
            }
        }
        return speedLabels.join('; ');
    }

    describeAC() {
        let acLabels = [];
        let acs = this.actor.system.attributes.ac;
        let sourceDetails =  expandObject(this.actor.sourceDetails)

        for (let [a, ac] of Object.entries(this.actor.system.attributes.ac)) {
            ac.label = CONFIG.D35E.ac[a];
            ac.labelShort = CONFIG.D35E.acShort[a];
            ac.valueLabel = CONFIG.D35E.acValueLabels[a];
            ac.sourceDetails = sourceDetails != null ? sourceDetails.system.attributes.ac[a].total : [];
        }

        let firstLabel = true;
        for (let ac of Object.keys(acs)) {
            if (acs[ac].total) {
                let label = `${acs[ac].label} ${acs[ac].total}`
                if (firstLabel) {
                    let sources = [];
                    for (let acSource of acs[ac].sourceDetails) {
                        sources.push(`${acSource.name} ${this.formatBonus(acSource.value)}`)
                    }
                    label = label + ` (${sources.join(', ')})`
                    firstLabel = false;
                }
                acLabels.push(label);
            }
        }
        return acLabels.join('; ');
    }
}
