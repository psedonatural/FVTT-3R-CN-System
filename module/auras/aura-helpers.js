import { AuraMeasureDistance } from "./aura-measure-distance.js";

const AuraDebug = false;

export const AURAS = {};

function getAuraShape(source, radius) {
  const gs = canvas.dimensions.size;
  const gd = gs / canvas.dimensions.distance;
  return new PIXI.Circle(source.center.x, source.center.y, radius * gd + (source.width / 2) * gs);
}

function getActor(source) {
  if (source.document.actorLink) {
    return game.actors.get(source.document.actorId) || { auras: [] };
  } else {
    return source.actor || { auras: [] };
  }
}

function isCorrectAlliance(source, target, auraTarget) {
  switch (auraTarget) {
    case "enemy":
      return source.document.disposition !== target.document.disposition;
    case "ally":
      return source.document.disposition === target.document.disposition;
    default:
      return true;
  }
}

export async function CollateAuras(sceneID, checkAuras, removeAuras, source) {
  if (AURAS.runningUpdate) {
    AURAS.queued = true;
    return;
  }
  if (!AURAS.runningUpdate) AURAS.runningUpdate = true;
  if (!game.user.isGM) return;
  if (sceneID !== canvas.id)
    return ui.notifications.warn(
      "Collate Auras called on a non viewed scene, auras will be updated when you return to that scene"
    );

  let perfStart;
  let perfEnd;
  if (AuraDebug) perfStart = performance.now();

  let actorsAurasToAdd = new Map();
  let actorsAurasToRemove = new Map();
  let actorsAurasAlreadyPresent = new Map();
  let actorsAurasAlreadyPresentIds = new Map();
  let actorModifiedAuras = new Map();
  let actorAlreadyChecked = new Set();

  // This gets

  for (const source of canvas.tokens.placeables) {
    if (!actorsAurasAlreadyPresent.has(source.id)) {
      actorsAurasAlreadyPresent.set(source.id, new Set());
      actorsAurasAlreadyPresentIds.set(source.id, new Set());
    }
    for (let aura of getActor(source).auras) {
      actorsAurasAlreadyPresent.get(source.id).add(aura.system.sourceAuraId);
      actorsAurasAlreadyPresentIds.get(source.id).add(aura.id);
    }
    actorModifiedAuras.set(source.id, new Set());
  }

  for (const source of canvas.tokens.placeables) {
    if (!source.actor) continue;
    for (let aura of getActor(source).auras) {
      if (aura.system.sourceTokenId && !canvas.tokens.get(aura.system.sourceTokenId)) {
        if (!actorsAurasToRemove.has(source.id)) actorsAurasToRemove.set(source.id, []);
        actorsAurasToRemove.get(source.id).push(aura.id);
        actorModifiedAuras.get(source.id).add(aura.id);
      }
      for (const target of canvas.tokens.placeables) {
        if (!target.actor || !source.actor) continue;
        let targetName = target.actor.name;
        let sourceName = source.actor.name;
        if (aura.system.sourceTokenId) {
          if (target.id === source.id) continue;
          if (target.actor.id === source.actor.id) continue;
          if (target.id === aura.system.sourceTokenId) {
            let inAura = await AuraMeasureDistance.inAura(
              source,
              target,
              true,
              0,
              aura.system.range || 5,
              getAuraShape(target, aura.system.range || 5)
            );
            if (
              !inAura ||
              !isCorrectAlliance(source, target, aura.system.auraTarget) ||
              !actorsAurasAlreadyPresentIds.get(target.id).has(aura.system.sourceAuraId)
            ) {
              if (!actorsAurasToRemove.has(source.id)) actorsAurasToRemove.set(source.id, []);
              actorsAurasToRemove.get(source.id).push(aura.id);
              actorModifiedAuras.get(source.id).add(aura.id);
            }
          }
        } else {
          if (target.id === source.id) continue;
          if (target.actor.id === source.actor.id) continue;
          let inAura = await AuraMeasureDistance.inAura(
            target,
            source,
            true,
            0,
            aura.system.range || 5,
            getAuraShape(source, aura.system.range || 5)
          );
          if (inAura) {
            if (
              !actorsAurasAlreadyPresent.get(target.id).has(aura.id) &&
              !actorModifiedAuras.get(target.id).has(aura.id) &&
              isCorrectAlliance(source, target, aura.system.auraTarget)
            ) {
              if (!actorsAurasToAdd.has(target.id)) actorsAurasToAdd.set(target.id, []);

              let auraToAdd = aura.toObject(false);
              auraToAdd.system.sourceTokenId = source.id;
              auraToAdd.system.sourceActorId = source.actor.id;
              auraToAdd.system.sourceAuraId = aura.id;
              auraToAdd.system.sourceActorName = source.actor.name;
              delete auraToAdd.id;

              actorsAurasToAdd.get(target.id).push(auraToAdd);
            }
            actorModifiedAuras.get(target.id).add(aura.id);
          }
        }
      }
    }
  }
  let updatePromises = [];
  for (const source of canvas.tokens.placeables) {
    if (actorsAurasToAdd.get(source.id)?.length > 0) {
      updatePromises.push(
        getActor(source).createEmbeddedDocuments("Item", actorsAurasToAdd.get(source.id), { stopAuraUpdate: false })
      );
    }
    if (actorsAurasToRemove.get(source.id)?.length > 0) {
      try {
        updatePromises.push(
          getActor(source).deleteEmbeddedDocuments("Item", actorsAurasToRemove.get(source.id), {
            stopAuraUpdate: false,
          })
        );
      } catch (e) {}
    }
  }
  await Promise.all(updatePromises);

  if (AuraDebug) {
    perfEnd = performance.now();
    game.D35E.logger.log(`Active Auras Main Function took ${perfEnd - perfStart} ms, FPS:${Math.round(canvas.app.ticker.FPS)}`);
  }

  AURAS.runningUpdate = false;
  // We have a queued run from other source, that did go pas debounce
  if (AURAS.queued) {
    ui.notifications.warn("Running queued Aura update, last aura update pass took too long.");
    AURAS.queued = false;
    CollateAuras(sceneID, checkAuras, removeAuras, source);
  }
}
