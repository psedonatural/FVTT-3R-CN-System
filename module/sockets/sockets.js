import { LogHelper } from "../helpers/LogHelper.js";

export class Sockets {
  static PROGRESS_COMBAT_ROUND = "PROGRESS_COMBAT_ROUND";
  static PROGRESS_COMBAT_TURN = "PROGRESS_COMBAT_TURN";
  static ID = "system.D35E";
  handleSocketEvent({ type, payload }) {
    switch (type) {
      case Sockets.PROGRESS_COMBAT_ROUND: {
        if (game.user.id === payload.gmId && game.user.isGM) {
          LogHelper.log("Progress combat round", payload);
          game.combats.get(payload.combatId).nextRound();
        }
      }
      case Sockets.PROGRESS_COMBAT_TURN: {
        if (game.user.id === payload.gmId && game.user.isGM) {
          LogHelper.log("Progress combat turn", payload);
          game.combats.get(payload.combatId).nextTurn();
        }
      }
      default:
        throw new Error("unknown type");
    }
  }

  init() {
    game.socket.on(Sockets.ID, this.handleSocketEvent);
  }
}
