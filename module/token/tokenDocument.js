export class TokenDocumentPF extends TokenDocument {
  // Todo: Declare this in TokenDocumentPF when/ if TokenDocument.getData calls the constructor's method
  static getTrackedAttributes(data, path = []) {
    const attr = super.getTrackedAttributes(data, path);
    if (path.length === 0) {
      if (!attr.value.find(a => a[0] === "attributes" && a[1] === "hp" && a[2] === "temp")) {
        attr.value.push(["attributes", "hp", "temp"]);
      }
      if (!attr.value.find(a => a[0] === "attributes" && a[1] === "hp" && a[2] === "nonlethal")) {
        attr.value.push(["attributes", "hp", "nonlethal"]);
      }
      if (!attr.bar.find(a => a[0] === "damage" && a[1] === "nonlethal")) {
        attr.bar.push(["damage", "nonlethal"]);
      }
    }
    return attr;
  }

  /**
   * Hijack Token health bar rendering to include temporary and temp-max health in the bar display
   *
   * @param barName
   * @param root0
   * @param root0.alternative
   */
  getBarAttribute(barName, { alternative = null } = {}) {
    let data;
    try {
      data = super.getBarAttribute(barName, { alternative: alternative });
    } catch (e) {
      data = null;
    }

    if (data != null) {
      // Add temp HP to current current health value for HP and Vigor
      if (data.attribute === "attributes.hp") {
        data.value += parseInt(getProperty(this.actor, "system.attributes.hp.temp") || 0);
      } else if (data.attribute === "attributes.vigor") {
        data.value += parseInt(getProperty(this.actor, "system.attributes.vigor.temp") || 0);
      }

      // Make resources editable
      if (data.attribute.startsWith("resources.")) data.editable = true;
    }

    return data;
  }

  /**
   * Refresh sight and detection modes according to the actor's senses associated with this token.
   */
  refreshDetectionModes() {
    if (!this.actor) return;
    if (!["character", "npc"].includes(this.actor.type)) return;
    if (this.actor?.system?.noVisionOverride) return;

    // Reset sight properties
    this.sight.color = null;
    this.sight.attenuation = 0;
    this.sight.brightness = 0;
    this.sight.contrast = 0;
    this.sight.saturation = 0;
    this.sight.enabled = true;
    this.sight.visionMode = "basic";
    this.sight.range = 0;

    // Prepare sight
    const darkvisionRange = this.actor?.system?.senses?.darkvision ?? 0;
    if (darkvisionRange > 0) {
      this.sight.range = this.actor?.system?.senses?.darkvision;
      this.sight.visionMode = "darkvision";
    }

    // Set basic detection mode
    const basicId = DetectionMode.BASIC_MODE_ID;
    const basicMode = this.detectionModes.find((m) => m.id === basicId);
    if (!basicMode) this.detectionModes.push({ id: basicId, enabled: true, range: this.sight.range });
    else basicMode.range = this.sight.range;

    // Set see invisibility detection mode
    const seeInvId = "seeInvisibility";
    const seeInvMode = this.detectionModes.find((m) => m.id === seeInvId);
    if (!seeInvMode && (this.actor?.system?.senses?.seeInvisible || this.actor?.system?.senses?.truesight)) {
      this.detectionModes.push({
        id: seeInvId,
        enabled: true,
        range: this.actor?.system?.senses?.seeInvisible || this.actor?.system?.senses?.truesight,
      });
    } else if (seeInvMode != null) {
      if (!(this.actor?.system?.senses?.seeInvisible || this.actor?.system?.senses?.truesight)) {
        this.detectionModes.splice(this.detectionModes.indexOf(seeInvMode, 1));
      } else {
        seeInvMode.range = this.actor?.system?.senses?.seeInvisible || this.actor?.system?.senses?.truesight;
      }
    }

    // Set blind sight detection mode
    const blindSightId = "blindSight";
    const blindSightMode = this.detectionModes.find((m) => m.id === blindSightId);
    if (!blindSightMode && this.actor?.system?.senses?.blindsight) {
      this.detectionModes.push({
        id: blindSightId,
        enabled: true,
        range: this.actor.system.attributes.senses.blindsight,
      });
    } else if (blindSightMode != null) {
      if (!this.actor?.system?.senses?.blindsight) {
        this.detectionModes.splice(this.detectionModes.indexOf(blindSightMode, 1));
      } else {
        blindSightMode.range = this.actor.system.attributes.senses.blindsight;
      }
    }

    // Set tremor sense detection mode
    const tremorSenseId = "feelTremor";
    const tremorSenseMode = this.detectionModes.find((m) => m.id === tremorSenseId);
    if (!blindSightMode && this.actor?.system?.senses?.tremorsense) {
      this.detectionModes.push({
        id: tremorSenseId,
        enabled: true,
        range: this.actor.system.attributes.senses.tremorsense,
      });
    } else if (tremorSenseMode != null) {
      if (!this.actor?.system?.senses?.tremorsense) {
        this.detectionModes.splice(this.detectionModes.indexOf(tremorSenseMode, 1));
      } else {
        tremorSenseMode.range = this.actor.system.attributes.senses.tremorsense;
      }
    }

    // Sort detection modes
    this.detectionModes.sort(this._sortDetectionModes.bind(this));

    const visionDefaults = CONFIG.Canvas.visionModes[this.sight.visionMode]?.vision?.defaults || {};
    for (const fieldName of ["attenuation", "brightness", "saturation", "contrast"]) {
      if (fieldName in visionDefaults) {
        this.sight[fieldName] = visionDefaults[fieldName];
      }
    }

  }

  _sortDetectionModes(a, b) {
    if (a.id === DetectionMode.BASIC_MODE_ID) return -1;
    if (b.id === DetectionMode.BASIC_MODE_ID) return 1;

    const src = { a: CONFIG.Canvas.detectionModes[a.id], b: CONFIG.Canvas.detectionModes[b.id] };
    return (src.a.constructor.PRIORITY ?? 0) - (src.b.constructor.PRIORITY ?? 0);
  }
}
