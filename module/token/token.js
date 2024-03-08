import { hasTokenVision } from "../apps/vision-permission.js";

export class TokenPF extends Token {
  async toggleEffect(effect, { active, overlay = false, midUpdate } = {}) {
    let call;
    if (typeof effect == "string") {
      const buffItem = this.actor.items.get(effect);
      if (buffItem) {
        call = await buffItem.update({ "system.active": !buffItem.system.active });
      } else call = await super.toggleEffect(effect, { active, overlay });
    } else if (effect && !midUpdate && Object.keys(CONFIG.D35E.conditions).includes(effect.id)) {
      const updates = {};
      updates["system.attributes.conditions." + effect.id] = !this.actor.system.attributes.conditions[effect.id];
      call = await this.actor.update(updates);
      effect.label = CONFIG.D35E.conditions[effect.id];
    } else if (effect) {
      call = await super.toggleEffect(effect, { active, overlay });
    }
    if (this.hasActiveHUD) canvas.tokens.hud.refreshStatusIcons();
    return call;
  }

  get actorVision() {
    return {
      lowLight: getProperty(this.actor, "system.senses.lowLight"),
      lowLightMultiplier: getProperty(this.actor, "system.senses.lowLightMultiplier"),
      lowLightMultiplierBright: getProperty(this.actor, "system.senses.lowLightMultiplier"),
    };
  }

  get disableLowLight() {
    return getProperty(this.data, "flags.D35E.disableLowLight") === true;
  }

  // Token#observer patch to make use of vision permission settings
  get observer() {
    return game.user.isGM || hasTokenVision(this);
  }

  _onUpdate(data, options, user) {
    if (options.render === false) return;

    if (hasProperty(data, "flags.D35E.customVisionRules")) {
      // Make sure this token's perception changes
      data.sight ||= {};
    }
    return super._onUpdate(data, options, user);
  }

  updateVisionSource(...args) {
    this.document.refreshDetectionModes();
    super.updateVisionSource(...args);
  }
}
