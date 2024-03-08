import {ActorDamageHelper} from './actor/helpers/actorDamageHelper.js';
import {Roll35e} from './roll.js';
import {createCustomChatMessage} from './chat.js';

export class EnrichersHelper {
  static setupEnrichers() {
    CONFIG.TextEditor.enrichers = CONFIG.TextEditor.enrichers.concat([
      {
        pattern: /@LinkedDescription\[(.+?)\]/gm,
        enricher: async (match, options) => {
          console.log("D35E | Enriching Linked Description");
          let item = await fromUuid(match[1]);
          const a = document.createElement("div");
          a.innerHTML = await item.getDescription();
          return a;
        },
      },
    ]);
    CONFIG.TextEditor.enrichers = CONFIG.TextEditor.enrichers.concat([
      {
        pattern: /@LinkedFieldText\[(.+?)\]\{(.+?)}/gm,
        enricher: async (match, options) => {
          console.log("D35E | Enriching Linked Description");
          let item = await fromUuid(match[1]);
          const a = document.createElement("div");
          a.innerHTML = await TextEditor.enrichHTML(getProperty(item, match[2]), { async: true, rollData: item.getActorItemRollData() });
          return a;
        },
      },
    ]);

    CONFIG.TextEditor.enrichers = CONFIG.TextEditor.enrichers.concat([
      {
        pattern: /@DynamicField\[(.+?)\]/gm,
        enricher: async (match, options) => {
          console.log("D35E | Enriching Dynamic Field Description", match, options);
          // Roll the match and return the result
          let roll = new Roll35e(match[1], options.rollData);
          let rollResult = await roll.roll();
          const a = document.createElement("span");
          a.innerHTML = `<span class="tooltipcontent">${match[1]}</span>` + rollResult.total;
          a.setAttribute("style", "border-bottom: 1px dotted #999; cursor: help");
          a.setAttribute("class", "tooltip");
          return a;
        },
      },
    ]);
    CONFIG.TextEditor.enrichers = CONFIG.TextEditor.enrichers.concat([
      {
        pattern: /@SkillCheck\[(.+?),(.+?)\]/gm,
        enricher: async (match, options) => {
          console.log("D35E | Enriching Skill Check");
          // The data is in the format of @SkillCheck[DC,skillId] and we want rollName to be DC 15 Skill Name
          let rollName = `${CONFIG.D35E.skills[match[2]]} DC ${match[1]}`;
          let contentLink = `<a class="content-link d35e-skill-check" data-skill="${match[2]}" data-dc="${match[1]}"><i class="fas fa-chess-rook"></i>${rollName}</a>`

          var template = document.createElement('template');
          template.innerHTML = contentLink;
          return template.content.firstChild;

        },
      },
    ]);

    CONFIG.TextEditor.enrichers = CONFIG.TextEditor.enrichers.concat([
      {
        pattern: /@AbilityCheck\[(.+?),(.+?)\]/gm,
        enricher: async (match, options) => {
          console.log("D35E | Enriching Ability Check");
          // The data is in the format of @SkillCheck[DC,skillId] and we want rollName to be DC 15 Skill Name
          let rollName = `${CONFIG.D35E.abilities[match[2]]} DC ${match[1]}`;
          let contentLink = `<a class="content-link d35e-ability-check" data-ability="${match[2]}" data-dc="${match[1]}"><i class="fas fa-hand-rock"></i>${rollName}</a>`

          var template = document.createElement('template');
          template.innerHTML = contentLink;
          return template.content.firstChild;

        },
      },
    ]);
    CONFIG.TextEditor.enrichers = CONFIG.TextEditor.enrichers.concat([
      {
        pattern: /@SavingThrow\[(.+?),(.+?)\]/gm,
        enricher: async (match, options) => {
          console.log("D35E | Enriching Skill Check");
          // The data is in the format of @SkillCheck[DC,skillId] and we want rollName to be DC 15 Skill Name
          let rollName = `DC ${match[1]} ${CONFIG.D35E.savingThrows[match[2]]}`;
          let contentLink = `<a class="content-link d35e-saving-throw" data-save="${match[2]}" data-dc="${match[1]}"><i class="fas fa-shield-alt"></i>${rollName}</a>`

          var template = document.createElement('template');
          template.innerHTML = contentLink;
          return template.content.firstChild;

        },
      },
    ]);
//@DamageRoll[fire,1d6+22]
    CONFIG.TextEditor.enrichers = CONFIG.TextEditor.enrichers.concat([
      {
        pattern: /@DamageRoll\[(.+?),(.+?)\]/gm,
        enricher: async (match, options) => {
          console.log("D35E | Enriching Damage Roll");
          // The data is in the format of @DamageRoll[type,roll]
          // We should try to get readable damage name from the type, using items in damage type compendium
          let damageTypeName = ActorDamageHelper.nameByType(match[1])
          let damageTypeId = ActorDamageHelper.mapDamageType(match[1])

          let rollName = `${match[2]} ${damageTypeName}`;
          let contentLink = `<a class="content-link d35e-damage-roll" data-rawdamagetype="${match[1]}" data-damagetype="${damageTypeId}" data-damageroll="${match[2]}"><i class="fas fa-fire"></i>${rollName}</a>`

          var template = document.createElement('template');
          template.innerHTML = contentLink;
          return template.content.firstChild;

        },
      },
    ]);
    $("body").on("click", "a.d35e-skill-check", async (event) => {
      event.preventDefault();
      let skill = event.currentTarget.dataset.skill;
      let dc = event.currentTarget.dataset.dc;
      let rollMode = event.currentTarget.dataset.rollMode ?? game.settings.get("core", "rollMode")
      // request the roll
      game.D35E.requestRoll({
        rollType: "skill",
        rollTarget: skill,
        dcTarget: dc,
        rollMode: rollMode
      })
    });
    $("body").on("click", "a.d35e-damage-roll", async (event) => {
      event.preventDefault();
      let damageType = event.currentTarget.dataset.damagetype;
      let damageRoll = event.currentTarget.dataset.damageroll;
      let rawDamageType = event.currentTarget.dataset.rawdamagetype;
      let sourceName = event.currentTarget.dataset.sourceName || "Damage Roll";
      await this.#doDamageRoll(damageRoll, damageType, rawDamageType, sourceName);
    });
    $("body").on("click", "a.d35e-saving-throw", async (event) => {
      event.preventDefault();
      let save = event.currentTarget.dataset.save;
      let dc = event.currentTarget.dataset.dc;
      let rollMode = event.currentTarget.dataset.rollMode ??
          game.settings.get('core', 'rollMode');
      // request the roll
      game.D35E.requestRoll({
        rollType: 'save',
        rollTarget: save,
        dcTarget: dc,
        rollMode: rollMode,
      });
    });
    $("body").on("click", "a.d35e-ability-check", async (event) => {
      event.preventDefault();
      let ability = event.currentTarget.dataset.ability;
      let dc = event.currentTarget.dataset.dc;
      let rollMode = event.currentTarget.dataset.rollMode ??
          game.settings.get('core', 'rollMode');
      // request the roll
      game.D35E.requestRoll({
        rollType: 'ability',
        rollTarget: ability,
        dcTarget: dc,
        rollMode: rollMode,
      });
    });
  }
  static async #doDamageRoll(damageRoll, damageType, rawDamageType, sourceName) {
    let damage = new Roll35e(`${damageRoll}`).roll();
    damage.damageTypeUid = damageType;
    let damageName = ActorDamageHelper.nameByType(rawDamageType);
    let damageIcon = ActorDamageHelper.getDamageIcon(rawDamageType);
    let chatTemplateData = {
      name: sourceName,
      img: `systems/D35E/icons/actions/unknown.png`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      rollMode: 'public',
    };
    let tooltip = $(await damage.getTooltip()).
        prepend(
            `<div class="dice-formula">${damage.formula}</div>`);
    if (tooltip.length == 0) {
      tooltip = $('<div class="dice-tooltip dmg-tooltip"></div>')
    } else {
      tooltip[0].outerHTML
    }
    const templateData = mergeObject(
        chatTemplateData,
        {
          flavor: `<img src="systems/D35E/icons/damage-type/${damageIcon}.svg" title="${
              damageName
          }" class="dmg-type-icon" /> ${damageName}`,
          total: damage.total,
          action: `applyDamage`,
          json: JSON.stringify(
              [{roll: damage, damageTypeUid: damage.damageTypeUid}]),
          tooltip: tooltip[0].outerHTML,
        },
        {inplace: false},
    );
    // Create message
    await createCustomChatMessage(
        'systems/D35E/templates/chat/simple-attack-roll.html',
        templateData,
        {},
        damage,
    );
  }

  static setupHooks() {
    Hooks.on("chatMessage", (message, content, data) => {
        if (content.startsWith("/damage")) {
          // We expect something like /damage fire 1d6+22
          let args = content.split(" ");
          if (args.length < 3) {
            ui.notifications.error("Invalid damage roll command, use /damage <type> <roll>");
            return false;
          }
          if (!ActorDamageHelper.isDamageType(args[1])) {
            ui.notifications.error("Invalid damage roll command, use /damage <type> <roll>");
          }
          let rawDamageType =  args[1];
          let damageRoll = args[2];
          let damageType = ActorDamageHelper.mapDamageType(rawDamageType);
          let sourceName = "Damage Roll";
          this.#doDamageRoll(damageRoll, damageType, rawDamageType, sourceName);
          return false;
        }
        if (content.startsWith("/save")) {
          // We expect something like /save will <15>
          let args = content.split(" ");
          if (args.length < 3) {
            ui.notifications.error("Invalid Saving Throw command, use /save <type> <dc>");
            return false;
          }
          // check if the save is valid
          if (!CONFIG.D35E.savingThrows.hasOwnProperty(args[1])) {
            // Try to get the save from the save name
            let saveId = Object.keys(CONFIG.D35E.savingThrows).find(key => CONFIG.D35E.savingThrows[key] === args[1]);
            if (saveId) {
              args[1] = saveId;
            } else {
              ui.notifications.error(
                  "Invalid saving throw passed to Saving Throw command, use /save <type> <dc>");
              return false;
            }
          }
          game.D35E.requestRoll({
            rollType: 'save',
            rollTarget: args[1],
            dcTarget: args[2],
            rollMode: 'public',
          });
          return false;
        }
        if (content.startsWith("/skill")) {
          // We expect something like /skill apr 12
          let args = content.split(" ");
          if (args.length < 3) {
            ui.notifications.error("Invalid Skill Check command, use /skill <skill> <dc>");
            return false;
          }
          // check if the skill is valid
          if (!CONFIG.D35E.skills.hasOwnProperty(args[1])) {
            // Try to get the skill from the skill name
            let skillId = Object.keys(CONFIG.D35E.skills).find(key => CONFIG.D35E.skills[key] === args[1]);
            if (skillId) {
              args[1] = skillId;
            } else {
              ui.notifications.error(
                  "Invalid skill passed to Skill Check command, use /skill <skill> <dc>");
              return false;
            }
          }
          game.D35E.requestRoll({
            rollType: 'skill',
            rollTarget: args[1],
            dcTarget: args[2],
            rollMode: 'public',
          });
          return false;
        }
    });
  }
}
