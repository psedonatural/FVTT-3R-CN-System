import { ActorPF } from "../actor/entity.js";
import { D35E } from "../config.js";
import { Roll35e } from "../roll.js";
import { ActorSheetPFNPCCombat } from "../actor/sheets/npc-combat.js";
import { TokenPF } from "../token/token.js";
import { TokenDocumentPF } from "../token/tokenDocument.js";
import { LogHelper } from "../helpers/LogHelper.js";
import { Sockets } from "../sockets/sockets.js";

export class CombatantD35E extends Combatant {
  constructor(...args) {
    super(...args);
  }

  resetPerRoundCounters() {
    if (this.actor) {
      this.setFlag("D35E", "aaoCount", 1);
      this.setFlag("D35E", "usedAaoCount", 0);
      this.setFlag("D35E", "usedAttackAction", false);
      this.setFlag("D35E", "usedMoveAction", false);
      this.setFlag("D35E", "usedSwiftAction", false);
    }
  }

  useAttackAction() {
    let isMyTurn = game.combats?.active?.current.combatantId === this.id;
    if (isMyTurn) {
      this.setFlag("D35E", "usedAttackAction", true);
    } else {
      const usedAao = this.getFlag("D35E", "usedAaoCount") ?? 0;
      this.setFlag("D35E", "usedAaoCount", usedAao + 1);
    }
  }

  useAction(activationCost) {
    if (activationCost.type === "attack" || activationCost.type === "standard") {
      this.useAttackAction();
    } else if (activationCost.type === "swift") {
      this.setFlag("D35E", "usedASwiftAction", true);
    }
  }

  useFullAttackAction() {
    this.setFlag("D35E", "usedAttackAction", true);
    this.setFlag("D35E", "usedMoveAction", true);
    this.update({});
  }

  get usedAttackAction() {
    /* our turn is over this round if we have ended item
     * or have been marked defeated */
    return this.getFlag("D35E", "usedAttackAction") ?? false;
  }

  get usedMoveAction() {
    /* our turn is over this round if we have ended item
     * or have been marked defeated */
    return this.getFlag("D35E", "usedMoveAction") ?? false;
  }

  get usedSwiftAction() {
    /* our turn is over this round if we have ended item
     * or have been marked defeated */
    return this.getFlag("D35E", "usedSwiftAction") ?? false;
  }

  get usedAllAao() {
    /* our turn is over this round if we have ended item
     * or have been marked defeated */
    return this.getFlag("D35E", "usedAaoCount") === this.getFlag("D35E", "aaoCount") ?? false;
  }

  get isNPC() {
    if (!this.actor) return false;
    return this.actor.type !== "character";
  }
}

export class CombatD35E extends Combat {
  constructor(...args) {
    super(...args);
    this.buffs = new Map();
    this.roundBuffUpdates = new Map();
    this.npcSheet = null;
  }

  /**
   * Override the default Initiative formula to customize special behaviors of the game system.
   * Apply advantage, proficiency, or bonuses where appropriate
   * Apply the dexterity score as a decimal tiebreaker if requested
   * See Combat._getInitiativeFormula for more detail.
   *
   * @param {ActorPF} actor
   */
  _getInitiativeFormula(actor) {
    const defaultParts = ["1d20", "@attributes.init.total", "@attributes.init.total / 100"];
    const parts = CONFIG.Combat.initiative.formula ? CONFIG.Combat.initiative.formula.split(/\s*\+\s*/) : defaultParts;
    if (!actor) return parts[0] ?? "0";
    return parts.filter((p) => p !== null).join(" + ");
  }

  /**
   * @override
   */
  async rollInitiative(ids, { formula = null, updateTurn = true, messageOptions = {} } = {}) {
    // Structure input data
    ids = typeof ids === "string" ? [ids] : ids;
    const currentId = this.combatant?.id;
    if (!formula) formula = this._getInitiativeFormula(this.combatant?.actor);

    let overrideRollMode = null,
      bonus = "",
      stop = false;
    if (game.D35E.showInitiativePrompt) {
      const dialogData = await Combat.implementation.showInitiativeDialog(formula);
      overrideRollMode = dialogData.rollMode;
      bonus = dialogData.bonus || "";
      stop = dialogData.stop || false;
    }

    if (stop) return this;
    let updates = [];
    let messages = [];
    // Iterate over Combatants, performing an initiative roll for each
    let i = 0;
    for (let id of ids) {
      // Get Combatant data
      const c = this.combatants.get(id);
      if (!c) return results;
      const actorData = c.actor ? c.actor.system : {};
      formula = this._getInitiativeFormula(c.actor ? c.actor : null) || formula;

      actorData.bonus = bonus;
      // Add bonus
      if (bonus.length > 0 && i === 0) {
        formula += " + @bonus";
      }

      // Roll initiative
      const rollMode =
        overrideRollMode != null
          ? overrideRollMode
          : messageOptions.rollMode || c.token.hidden || c.hidden
          ? "gmroll"
          : "roll";
      const roll = Roll35e.safeRoll(formula, actorData);
      if (roll.err) ui.notifications.warn(roll.err.message);
      updates.push({ _id: id, initiative: roll.total });

      const [notes, notesHTML] = c.actor.getInitiativeContextNotes();

      // Create roll template data
      const rollData = mergeObject(
        {
          user: game.user.id,
          formula: roll.formula,
          tooltip: await roll.getTooltip(),
          total: roll.total,
        },
        notes.length > 0 ? { hasExtraText: true, extraText: notesHTML } : {}
      );

      // Create chat data
      const chatData = mergeObject(
        {
          user: game.user.id,
          type: CONST.CHAT_MESSAGE_TYPES.CHAT,
          rollMode: rollMode,
          sound: CONFIG.sounds.dice,
          speaker: {
            scene: canvas.scene.id,
            actor: c.actor ? c.actor.id : null,
            token: c.token.id,
            alias: c.token.name,
          },

          flavor: game.i18n.localize("D35E.RollsForInitiative").format(c.token.name),
          roll: roll,
          content: await renderTemplate("systems/D35E/templates/chat/roll-ext.html", rollData),
        },
        messageOptions
      );
      setProperty(chatData, "flags.D35E.subject.core", "init");

      // Handle different roll modes
      ChatMessage.applyRollMode(chatData, chatData.rollMode);

      if (i > 0) chatData.sound = null; // Only play 1 sound for the whole set
      messages.push(chatData);
      i++;
    }
    if (!updates.length) return this;

    // Update multiple combatants
    await this.updateEmbeddedDocuments("Combatant", updates);

    // Add enabled, existing buffs to combat tracker
    let buffsToAdd = [];
    for (let id of ids) {
      const c = this.combatants.get(id);
      if (!c) continue;
      if (c.actor) {
        for (let buff of c.actor.trackedBuffs) {
          buffsToAdd.push({ actor: c.actor, buff: buff, initiative: c.initiative });
        }
      }
    }
    await this.addBuffsToCombat(buffsToAdd);

    // Ensure the turn order remains with the same combatant
    if (updateTurn) await this.update({ turn: this.turns.findIndex((t) => t.id === currentId) });

    // Create multiple chat messages
    await ChatMessage.create(messages);

    // Return the updated Combat
    return this;
  }

  async deleteEmbeddedDocuments(type, documents) {
    await super.deleteEmbeddedDocuments(type, documents);
    Hooks.callAll("updateCombat", this, this.combatant);
    this.updateCombatCharacterSheet();
  }

  static showInitiativeDialog = function (formula = null) {
    return new Promise((resolve) => {
      const template = "systems/D35E/templates/chat/roll-dialog.hbs";
      let rollMode = game.settings.get("core", "rollMode");
      const dialogData = {
        formula: formula ? formula : "",
        rollMode: rollMode,
        rollModes: CONFIG.Dice.rollModes,
      };
      // Create buttons object
      const buttons = {
        normal: {
          label: "Roll",
          callback: (html) => {
            rollMode = html.find('[name="rollMode"]').val();
            const bonus = html.find('[name="bonus"]').val();
            resolve({ rollMode: rollMode, bonus: bonus });
          },
        },
      };
      // Show dialog
      renderTemplate(template, dialogData).then((dlg) => {
        new Dialog(
          {
            title: game.i18n.localize("D35E.InitiativeBonus"),
            content: dlg,
            buttons: buttons,
            default: "normal",
            close: (html) => {
              resolve({ stop: true });
            },
          },
          {
            classes: ["dialog", "D35E", "roll-initiative"],
          }
        ).render(true);
      });
    });
  };

  /**
   * Process current combatant: expire active effects & buffs.
   */
  async _processCurrentCombatant() {
    try {
      const actor = this.combatant?.actor;
      const buffId = this.combatant?.flags?.D35E?.buffId;
      if (actor != null) {
        if (this.roundBuffUpdates.size) {
          LogHelper.debug(this.roundBuffUpdates);
          let promises = [];

          // Update actor embedded documents
          for (let [actorUuid, update] of this.roundBuffUpdates.entries()) {
            let _actor = await this.getActorFromTokenOrActorUuid(actorUuid);
            if (update.itemUpdateData.length > 0) {
              promises.push(_actor.updateEmbeddedDocuments("Item", update.itemUpdateData));
            }
          }
          await Promise.all(promises);

          // Update Actor resources
          promises = [];
          for (let [actorUuid, update] of this.roundBuffUpdates.entries()) {
            let _actor = await this.getActorFromTokenOrActorUuid(actorUuid);
            if (Object.keys(update.itemResourcesData).length > 0 || update.deletedOrChanged) {
              promises.push(_actor.update(update.itemResourcesData));
            }
            if (update.itemsEnding.length) _actor.renderBuffEndChatCard(update.itemsEnding);
            if (update.itemsOnRound.length) _actor.applyOnRoundBuffActions(update.itemsOnRound);
          }
          await Promise.all(promises);

          let buffsToDelete = new Set();

          for (let [actorUuid, update] of this.roundBuffUpdates.entries()) {
            let _actor = await this.getActorFromTokenOrActorUuid(actorUuid);
            if (update.itemsDeactivating.length) {
              promises.push(_actor.deactivateBuffs(update.itemsDeactivating));
              buffsToDelete.add(update.itemsDeactivating);
            }
          }

          for (let [actorUuid, update] of this.roundBuffUpdates.entries()) {
            let _actor = await this.getActorFromTokenOrActorUuid(actorUuid);
            if (update.itemsToDelete.length > 0) {
              let existingItems = update.itemsToDelete.filter((id) => actor.items.has(id));
              let missingItems = update.itemsToDelete.filter((id) => !actor.items.has(id));
              let missingCombatants = [];
              for (let missingBuff of missingItems) {
                let missingCombatantId = game.combat.combatants.find((c) => c.flags.D35E.buffId === missingBuff)?.id;
                if (missingCombatantId) missingCombatants.push(missingCombatantId);
              }
              promises.push(this.deleteEmbeddedDocuments("Combatant", missingCombatants));
              promises.push(_actor.deleteEmbeddedDocuments("Item", existingItems));
              buffsToDelete.add(update.itemsToDelete);
            }
          }
          await Promise.all(promises);

          if (buffsToDelete.size) {
            await this.removeBuffsFromCombat(Array.from(buffsToDelete));
          }
          // Clear round buff updates
          this.roundBuffUpdates.clear();

          LogHelper.getTime("D35E.processCurrentCombatant");
        }
        await actor.progressRound();
      } else if (buffId) {
        LogHelper.startTimer("D35E.processCurrentCombatant");
        let actor;
        if (!this.combatant?.flags?.D35E?.actorUuid) {
          if (this.combatant?.flags?.D35E?.isToken) {
            actor = canvas.scene.tokens.get(this.combatant?.flags?.D35E?.tokenId).actor;
          } else {
            actor = game.actors.get(this.combatant?.flags?.D35E?.actor);
          }
        } else {
          actor = await this.getActorFromTokenOrActorUuid(this.combatant?.flags?.D35E?.actorUuid);
        }
        if (this.combatant?.flags?.D35E?.isAura) {
          for (let combatant of this.combatants) {
            if (combatant?.flags?.D35E?.buffId) continue;
            let _actor = null;
            if (combatant.actor) {
              _actor = combatant.actor;
            }
            if (_actor) {
              const aura = _actor.getAura(buffId);
              if (aura) {
                await _actor.progressBuff(this.roundBuffUpdates, aura.id, 1);
              }
            }
          }
        } else {
          if (actor) {
            await actor.progressBuff(this.roundBuffUpdates, buffId, 1);
          } // We don't have an actor, so we can't progress the buff. we should delete it.
          else {
            await this.removeBuffsFromCombat([buffId])
            game.D35E.logger.log("Removing buff from combat because actor is null.")
          }

        }
        await this.nextTurn();
      }
    } catch (error) {
      ui.notifications.error("Error processing current combatant.")
      game.D35E.logger.error(error);
    }
  }

  async getActorFromTokenOrActorUuid(uuid) {
    let actorOrToken = await fromUuid(uuid);
    if (actorOrToken instanceof TokenDocumentPF) return actorOrToken.actor;
    else return actorOrToken;
  }

  /**
   * @override
   * @returns {Promise<Combat>}
   */
  async nextRound() {
    if (!game.user.isGM) {
      let gmId = game.users.find((u) => u.isGM).id;
      game.socket.emit(
        Sockets.ID,
        { type: Sockets.PROGRESS_COMBAT_ROUND, payload: { combatId: this.id, gmId: gmId } },
        (response) => {}
      );
      LogHelper.log("Skipping Round on non-GM Client");
      return combat;
    } else {
      const combat = await super.nextRound();
      await this._resetPerRoundCounter();
      // TODO: Process skipped turns.
      await this._processCurrentCombatant();
      return combat;
    }
  }

  updateCombatCharacterSheet() {
    if (game.settings.get("D35E", "useCombatCharacterSheet")) {
      if (this.combatant?.actor) {
        if (this.npcSheet == null) {
          this.npcSheet = new ActorSheetPFNPCCombat(this.combatant.actor);
        } else {
          this.npcSheet.object = this.combatant.actor;
        }
        this.npcSheet.render(true);
      }
    }
  }

  /**
   * @override
   * @returns {Promise<Combat>}
   */
  async nextTurn() {
    if (!game.user.isGM) {
      let gmId = game.users.find((u) => u.isGM).id;
      game.socket.emit(
        Sockets.ID,
        { type: Sockets.PROGRESS_COMBAT_TURN, payload: { combatId: this.id, gmId: gmId } },
        (response) => {}
      );
      LogHelper.log("Skipping Turn on non-GM Client");
      return combat;
    } else {
      const combat = await super.nextTurn();
      await this._processCurrentCombatant();
      return combat;
    }
  }

  async addBuffsToCombat(buffs) {
    let buffsToAdd = [];
    let buffsToUpdate = [];
    for (let buffActor of buffs) {
      let buff = buffActor.buff;
      let actor = buffActor.actor;
      let updateExisting = false;
      for (let combatant of this.combatants) {
        if (combatant?.flags?.D35E?.buffId === buff.id) {
          buffsToUpdate.push({
            _id: combatant.id,
            initiative: buffActor.initiative || this.combatant.initiaitve + 0.01 || 20,
          });
          updateExisting = true;
        }
      }
      if (!updateExisting) {
        let buffDelta = 0.01;
        if (buff.system.timeline.tickOnEnd) buffDelta = -0.01;
        buffsToAdd.push({
          name: buff.name,
          img: buff.img,
          initiative: buffActor.initiative || this.combatant.initiative || 20 + buffDelta,
          flags: {
            D35E: {
              isBuff: true,
              buffId: buff.id,
              isAura: buff.isAura,
              actor: actor.id,
              actorUuid: actor.uuid,
              isToken: actor.isToken,
              tokenId: actor?.token?.id,
              actorImg: actor.img,
              actorName: actor.name,
            },
          },
        });
      }
    }

    await this.updateEmbeddedDocuments("Combatant", buffsToUpdate);
    await this.createEmbeddedDocuments("Combatant", buffsToAdd);
  }

  /**
   *
   * @param {string[]} buffs
   * @returns {Promise<void>}
   */
  async removeBuffsFromCombat(buffs) {
    try {
      let combatantsToDelete = [];
      for (let combatant of this.combatants) {
        if (buffs.includes(combatant?.flags?.D35E?.buffId)) {
          combatantsToDelete.push(combatant.id);
        }
      }
      await this.deleteEmbeddedDocuments("Combatant", combatantsToDelete);
    } catch (error) {
      game.D35E.logger.error(error);
    }
  }

  async _resetPerRoundCounter() {
    for (let combatant of this.combatants) {
      combatant.resetPerRoundCounters();
    }
  }
}
