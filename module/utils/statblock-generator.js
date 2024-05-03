import {ActorPF} from "../actor/entity.js";
import {ActorDescriptionHelper} from "../actor/helpers/actorDescriptionHelper.js";

export class StatblockGenerator {
    /**
     * @param {ActorPF} actor
     */
    static generateStatblock(actor) {
        var content = ''
        var descriptionHelper = new ActorDescriptionHelper(actor);
        content = content + `<h2>${actor.name}</h2>`;
        content = content + `<strong>体型/生物类型:</strong> ${descriptionHelper.describeSize()} ${descriptionHelper.describeType()}<br>`;
        content = content + `<strong>生命骰:</strong> ${descriptionHelper.describeHitDice()}<br>`;
        content = content + `<strong>先攻:</strong> ${descriptionHelper.formatBonus(actor.system.attributes.init.total)}<br>`;
        content = content + `<strong>速度:</strong> ${descriptionHelper.describeSpeed()}<br>`;
        content = content + `<strong>防御等级:</strong> ${descriptionHelper.describeAC()}<br>`;
        var myWindow=window.open("...", "bookWindow", "width=1000,height=600");
        myWindow.onload=function(){this.document.write(content)}
    }
}
