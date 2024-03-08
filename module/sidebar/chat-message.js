import { isMinimumCoreVersion } from "../lib.js";

export class ChatMessagePF extends ChatMessage {
  async update(data, context) {
    return super.update(data, context);
  }

  async getHTML() {
    if (this.getFlag("D35E", "template")) {
      let chatTemplateData = this.getFlag("D35E", "chatTemplateData");
      chatTemplateData.revealed = this.getFlag("D35E", "revealed") || false;
      chatTemplateData.shouldDisplayTarget = chatTemplateData.revealed || game.user.isGM;
      chatTemplateData.isGM = game.user.isGM;
      chatTemplateData.ownerOrGM = game.actors.get(chatTemplateData?.actor?._id)?.isOwner || game.user.isGM;
      chatTemplateData.ownerOrGMAndNotBlind = chatTemplateData.ownerOrGM && (!this.blind || game.user.isGM);
      chatTemplateData.blind = this.blind;
      this.content = await renderTemplate(this.getFlag("D35E", "template"), chatTemplateData);
    }
    return super.getHTML();
  }
}
