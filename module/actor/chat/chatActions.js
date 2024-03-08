import { Item35E } from "../../item/entity.js";
import { Roll35e } from "../../roll.js";
import { Propagator } from "../../misc/propagator.js";
import { ChatHelper } from "../../helpers/chatHelper.js";

export class ActorChatActions {
  static async _onTargetHover(event) {
    event.preventDefault();
    // Extract card data
    const image = event.currentTarget;
    const tokenId = image.dataset.target;
    canvas.tokens.get(tokenId)._onHoverIn();
  }

  static async _onTargetClick(event) {
    event.preventDefault();
    // Extract card data
    const image = event.currentTarget;
    const tokenId = image.dataset.target;
    canvas.tokens.get(tokenId).setTarget();
  }

  static async _onTargetLeave(event) {
    event.preventDefault();
    // Extract card data
    const image = event.currentTarget;
    const tokenId = image.dataset.target;
    canvas.tokens.get(tokenId)._onHoverOut();
  }

  static async _onChatCardButtonAction(event) {
    event.preventDefault();

    // Extract card data
    const button = event.currentTarget;
    const card = button.closest(".chat-card");
    const action = button.dataset.action;

    // Get the Actor
    const actor = ChatHelper.getChatCardActor(card);

    button.disabled = true;
    // Roll saving throw
    if (action === "save") {
      const saveId = button.dataset.save;
      if (actor) await actor.rollSavingThrow(saveId, null, null, { event: event });
    } else if (action === "save") {
      const saveId = button.dataset.save;
      if (actor) await actor.rollSavingThrow(saveId, null, null, { event: event });
    } else if (action === "summon") {
      const monsterId = button.dataset.id;
      const monsterPack = button.dataset.pack;
      const user = button.dataset.user;
      let x = button.dataset.measureX;
      let y = button.dataset.measureY;
      let template = canvas.templates.get(button.dataset.measureId);
      if (template) {
        x = template.data.x;
        y = template.data.y;
      }
      let monster = null;
      if (monsterPack) {
        monster = await game.actors.importFromCompendium(game.packs.get(monsterPack), monsterId);
      } else {
        monster = game.actors.get(monsterId);
      }
      let tokenData = await monster.getTokenDocument({
        actorData: {
          permission: { [user]: CONST.DOCUMENT_PERMISSION_LEVELS.OWNER },
          flags: {D35E: {allowPlayerMovement: true}}
        },
      });
      let totalMonster = new Roll35e(button.dataset.formula, actor.getRollData()).roll().total;
      for (let spawned = 0; spawned < totalMonster; spawned++) {
        let internalSpawnPoint = {
          x: x - canvas.scene.dimensions.size * (tokenData.width / 2),
          y: y - canvas.scene.dimensions.size * (tokenData.height / 2),
        };

        const openPosition = Propagator.getFreePosition(tokenData, internalSpawnPoint);
        if (!openPosition) {
          logger.info("No open location.");
        } else {
          internalSpawnPoint = openPosition;
        }

        tokenData.updateSource(internalSpawnPoint);
        tokenData.updateSource({
          ownership: { [user]: CONST.DOCUMENT_PERMISSION_LEVELS.OWNER },
        });
        tokenData.ownership = { [user]: CONST.DOCUMENT_PERMISSION_LEVELS.OWNER };
        await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
      }

      if (template) {
        await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [button.dataset.measureId]);
      }
    }

    button.disabled = false;
  }
}
