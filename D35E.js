/**
 * The D35E edition game system for Foundry Virtual Tabletop
 * Author: LoopeeDK, Rughalt
 * Software License: GNU GPLv3
 */

// Import Modules
import {D35E} from './module/config.js';
import {registerSystemSettings} from './module/settings.js';
import {preloadHandlebarsTemplates} from './module/templates.js';
import {
  getConditions,
  measureDistance,
  measureDistances,
} from './module/canvas/canvas.js';
import {ActorPF} from './module/actor/entity.js';
import {ActorSheetPFCharacter} from './module/actor/sheets/character.js';
import {ActorSheetPFNPC} from './module/actor/sheets/npc.js';
import {ActorSheetPFNPCLite} from './module/actor/sheets/npc-lite.js';
import {ActorSheetPFNPCLoot} from './module/actor/sheets/npc-loot.js';
import {ActorSheetPFNPCMonster} from './module/actor/sheets/npc-monster.js';
import {Item35E} from './module/item/entity.js';
import {ItemSheetPF} from './module/item/sheets/base.js';
import {TokenPF} from './module/token/token.js';
import {
  addLowLightVisionToLightConfig,
} from './module/canvas/low-light-vision.js';
import {PatchCore} from './module/patch-core.js';
import {DicePF} from './module/dice.js';
import {CombatantD35E, CombatD35E} from './module/combat/combat.js';
import * as chat from './module/chat.js';
import {createCustomChatMessage} from './module/chat.js';
import {MeasuredTemplatePF, TemplateLayerPF} from './module/measure.js';
import {PatreonIntegrationFactory} from './module/patreon-integration.js';

import {
  getActorFromId,
  getItemOwner,
  isMinimumCoreVersion,
  sizeDie,
  sizeInt,
  sizeMonkDamageDie,
  sizeNaturalDie,
} from './module/lib.js';
import {ChatMessagePF} from './module/sidebar/chat-message.js';
import {TokenQuickActions} from './module/token-quick-actions.js';
import {TopPortraitBar} from './module/top-portrait-bar.js';
import * as migrations from './module/migration.js';
import {SemanticVersion} from './semver.js';
import * as cache from './module/cache.js';
import {CACHE} from './module/cache.js';
import D35ELayer from './module/layer.js';
import {
  EncounterGeneratorDialog,
} from './module/apps/encounter-generator-dialog.js';
import {
  TreasureGeneratorDialog,
} from './module/apps/treasure-generator-dialog.js';
import {
  MonsterImporterDialog,
} from './module/utils/monster-importer.js';
import {ActorSheetTrap} from './module/actor/sheets/trap.js';
import {applyConfigModifications} from './module/config-tools.js';
import {genTreasureFromToken} from './module/treasure/treasure.js';
import {ActiveEffectD35E} from './module/ae/entity.js';
import {CollateAuras} from './module/auras/aura-helpers.js';
import {ActorSheetObject} from './module/actor/sheets/object.js';
import {ActorChatListener} from './module/actor/chat/chatListener.js';
import {ItemChatListener} from './module/item/chat/chatListener.js';
import {D35ECombatTracker} from './module/combat/combat-tracker.js';
import {TokenDocumentPF} from './module/token/tokenDocument.js';
import {
  darkvision,
  DetectionModeBlindSightD35E,
  DetectionModeInvisibilityD35E,
  DetectionModeTremorD35E,
} from './module/canvas/detection-modes.js';
import {EquipmentSheet35E} from './module/item/sheets/equipment.js';
import {WeaponSheet35E} from './module/item/sheets/weapon.js';
import {FeatSheet35E} from './module/item/sheets/feat.js';
import {Weapon35E} from './module/item/weapon.js';
import {Equipment35E} from './module/item/equipment.js';
import {ItemBase35E} from './module/item/base.js';
import {Spell35E} from './module/item/spell.js';
import {Card35E} from './module/item/card.js';
import {Feat35E} from './module/item/feat.js';
import {Sockets} from './module/sockets/sockets.js';
import {CompendiumBrowser} from './module/apps/compendium-browser.js';
import {Logger} from './module/utils/logger.js';
import {EnrichersHelper} from './module/enrichers.js';

// Add String.format
if (!String.prototype.format) {
  String.prototype.format = function (...args) {
    return this.replace(/{(\d+)}/g, function (match, number) {
      return args[number] != null ? args[number] : match;
    });
  };
}

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", async function () {
  console.log(`D35E | Initializing D35E System`);

  // Clean local storage
  var toRemove = [];

  // Create a D35E namespace within the game global
  game.D35E = {
    ActorPF,
    DicePF,
    Item35E,
    migrations,
    rollItemMacro,
    rollDefenses,
    requestRoll,
    rollTurnUndead,
    rollPreProcess: {
      sizeRoll: sizeDie,
      sizeNaturalRoll: sizeNaturalDie,
      sizeMonkDamageRoll: sizeMonkDamageDie,
      sizeVal: sizeInt,
    },
    migrateWorld: migrations.migrateWorld,
    migrateCompendium: migrations.migrateCompendium,
    createdMeasureTemplates: new Set(),
    sockets: new Sockets(),
    logger: new Logger(),
  };

  if (!isMinimumCoreVersion("10.0")) {
    Object.defineProperty(ActorPF.prototype, "_id", {
      get: function _id() {
        console.warn("Using old mapper for _id.");
        return this.id;
      },
    });
    Object.defineProperty(Item35E.prototype, "_id", {
      get: function _id() {
        console.warn("Using old mapper for _id.");
        return this.id;
      },
    });
  }

  // Record Configuration Values
  CONFIG.D35E = D35E;
  CONFIG.debug.hooks = true;
  CONFIG.Actor.documentClass = ActorPF;
  CONFIG.Item.documentClass = ItemBase35E;
  CONFIG.Item.documentClasses = {
    default: Item35E,
    weapon: Weapon35E,
    equipment: Equipment35E,
    spell: Spell35E,
    card: Card35E,
    feat: Feat35E,
  };
  CONFIG.Item.compendiumIndexFields.push("system.index.subType");
  CONFIG.Item.compendiumIndexFields.push("system.index.uniqueId");
  CONFIG.ActiveEffect.documentClass = ActiveEffectD35E;
  CONFIG.MeasuredTemplate.objectClass = MeasuredTemplatePF;
  CONFIG.ChatMessage.documentClass = ChatMessagePF;
  CONFIG.Combat.documentClass = CombatD35E;
  CONFIG.Combatant.documentClass = CombatantD35E;
  CONFIG.Token.objectClass = TokenPF;
  CONFIG.Token.documentClass = TokenDocumentPF;
  CONFIG.Canvas.visionModes.darkvision = darkvision;
  CONFIG.Canvas.detectionModes[DetectionModeInvisibilityD35E.ID] = new DetectionModeInvisibilityD35E({
    id: DetectionModeInvisibilityD35E.ID,
    label: DetectionModeInvisibilityD35E.LABEL,
    type: DetectionModeInvisibilityD35E.DETECTION_TYPE || DetectionMode.DETECTION_TYPES.SIGHT,
  });
  CONFIG.Canvas.detectionModes[DetectionModeTremorD35E.ID] = new DetectionModeTremorD35E({
    id: DetectionModeTremorD35E.ID,
    label: DetectionModeTremorD35E.LABEL,
    type: DetectionModeTremorD35E.DETECTION_TYPE || DetectionMode.DETECTION_TYPES.SIGHT,
  });
  CONFIG.Canvas.detectionModes[DetectionModeBlindSightD35E.ID] = new DetectionModeBlindSightD35E({
    id: DetectionModeBlindSightD35E.ID,
    label: DetectionModeBlindSightD35E.LABEL,
    type: DetectionModeBlindSightD35E.DETECTION_TYPE || DetectionMode.DETECTION_TYPES.SIGHT,
  });

  CONFIG.ui.combat = D35ECombatTracker;

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("D35E", ActorSheetPFCharacter, {
    types: ["character"],
    makeDefault: true,
    label: game.i18n.localize("D35E.ActorSheetPFCharacter"),
  });
  Actors.registerSheet("D35E", ActorSheetPFNPC, {
    types: ["npc"],
    makeDefault: true,
    label: game.i18n.localize("D35E.ActorSheetPFNPC"),
  });
  Actors.registerSheet("D35E", ActorSheetPFNPCLite, {
    types: ["npc"],
    makeDefault: false,
    label: game.i18n.localize("D35E.ActorSheetPFNPCLite"),
  });
  Actors.registerSheet("D35E", ActorSheetPFNPCLoot, {
    types: ["npc", "character"],
    makeDefault: false,
    label: game.i18n.localize("D35E.ActorSheetPFNPCLoot"),
  });
  Actors.registerSheet("D35E", ActorSheetPFNPCMonster, {
    types: ["npc", "character"],
    makeDefault: false,
    label: game.i18n.localize("D35E.ActorSheetPFNPCMonster"),
  });
  Actors.registerSheet("D35E", ActorSheetTrap, {
    types: ["trap"],
    makeDefault: true,
    label: game.i18n.localize("D35E.ActorSheetPFNPCTrap"),
  });
  Actors.registerSheet("D35E", ActorSheetObject, {
    types: ["object"],
    makeDefault: true,
    label: game.i18n.localize("D35E.ActorSheetPFNPCObject"),
  });
  Items.unregisterSheet("core", ItemSheet);
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("D35E", ItemSheetPF, {
    types: [
      "class",
      "spell",
      "consumable",
      "enhancement",
      "loot",
      "buff",
      "aura",
      "attack",
      "race",
      "damage-type",
      "material",
      "full-attack",
      "card",
      "valuable",
    ],
    makeDefault: true,
  });
  Items.registerSheet("D35E", EquipmentSheet35E, { types: ["equipment"], makeDefault: true });
  Items.registerSheet("D35E", WeaponSheet35E, { types: ["weapon"], makeDefault: true });
  Items.registerSheet("D35E", FeatSheet35E, { types: ["feat"], makeDefault: true });

  // Register System Settings
  registerSystemSettings();

  if (isMinimumCoreVersion("10.0")) {
    CONFIG.statusEffects = getConditions();
    const layers = {
      d35e: {
        layerClass: D35ELayer,
        group: "primary",
      },
    };
    CONFIG.Canvas.layers = foundry.utils.mergeObject(Canvas.layers, layers);
  } else {
    CONFIG.statusEffects = getConditions();
    const layers = {
      d35e: {
        layerClass: D35ELayer,
        group: "primary",
      },
    };
    CONFIG.Canvas.layers = foundry.utils.mergeObject(Canvas.layers, layers);
  }
  if (isMinimumCoreVersion("10")) {
    CONFIG.Canvas.layers.templates.layerClass = TemplateLayerPF;
  } else if (isMinimumCoreVersion("9")) {
    CONFIG.Canvas.layers.templates.layerClass = TemplateLayerPF;
    CONFIG.Canvas.layers.sight.layerClass = SightLayerPF;
  } else {
    CONFIG.Canvas.layers.templates = TemplateLayerPF;
    CONFIG.Canvas.layers.sight = SightLayerPF;
  }

  Handlebars.registerHelper("ifeq", function (a, b, options) {
    if (a == b) {
      return options.fn(this);
    }
    return options.inverse(this);
  });

  // CONFIG.Canvas.layers.d35e = {
  //   layerClass: D35ELayer,
  //   group: "interface",
  // };

  // Patch Core Functions
  PatchCore();
  // Preload Handlebars Templates
  await preloadHandlebarsTemplates();
  applyConfigModifications();
  // Register sheet application classes
  game.D35E.sockets.init();

  game.D35E.compendiumBrowser = new CompendiumBrowser({ type: "spells", entityType: "Item" });
  // Enable skin
  $("body").toggleClass("d35ecustom", game.settings.get("D35E", "customSkin"));
  $("body").toggleClass("color-blind", game.settings.get("D35E", "colorblindColors"));
  $("body").toggleClass("no-players-list", game.settings.get("D35E", "hidePlayersList"));
  EnrichersHelper.setupEnrichers();
});

/* -------------------------------------------- */
/*  Foundry VTT Setup                           */
/* -------------------------------------------- */

/**
 * This function runs after game data has been requested and loaded from the servers, so entities exist
 */
Hooks.once("setup", function () {
  // Localize CONFIG objects once up-front
  const toLocalize = [
    "abilities",
    "abilitiesShort",
    "alignments",
    "currencies",
    "distanceUnits",
    "distanceUnitsShort",
    "itemActionTypes",
    "senses",
    "skills",
    "targetTypes",
    "timePeriods",
    "timePeriodsSpells",
    "savingThrows",
    "ac",
    "acValueLabels",
    "featTypes",
    "conditions",
    "lootTypes",
    "flyManeuverabilities",
    "spellPreparationModes",
    "weaponTypes",
    "weaponProperties",
    "spellComponents",
    "spellSchools",
    "spellLevels",
    "conditionTypes",
    "favouredClassBonuses",
    "armorProficiencies",
    "weaponProficiencies",
    "actorSizes",
    "actorTokenSizes",
    "abilityActivationTypes",
    "abilityActivationTypesPlurals",
    "limitedUsePeriods",
    "equipmentTypes",
    "equipmentSlots",
    "consumableTypes",
    "attackTypes",
    "attackTypesShort",
    "buffTypes",
    "buffTargets",
    "contextNoteTargets",
    "healingTypes",
    "divineFocus",
    "classSavingThrows",
    "classBAB",
    "classTypes",
    "measureTemplateTypes",
    "creatureTypes",
    "race",
    "damageTypes",
    "conditionalTargets",
    "savingThrowTypes",
    "requirements",
    "savingThrowCalculationTypes",
    "attackTypesIcon",
    "abilityTypes",
    "auraTarget",
  ];

  const doLocalize = function (obj) {
    return Object.entries(obj).reduce((obj, e) => {
      if (typeof e[1] === "string") obj[e[0]] = game.i18n.localize(e[1]);
      else if (typeof e[1] === "object") obj[e[0]] = doLocalize(e[1]);
      return obj;
    }, {});
  };
  for (let o of toLocalize) {
    try {
      CONFIG.D35E[o] = doLocalize(CONFIG.D35E[o]);
    } catch (e) {
      //ignore
    }
  }
});

/* -------------------------------------------- */

/**
 * Once the entire VTT framework is initialized, check to see if we should perform a data migration
 */
Hooks.once("ready", async function () {
  $("body").toggleClass("d35gm", game.user.isGM);
  $("body").toggleClass("hide-special-action", !game.settings.get("D35E", "allowPlayersApplyActions"));
  $("body").toggleClass("transparent-sidebar", game.settings.get("D35E", "transparentSidebarWhenUsingTheme"));

  await cache.buildCache();

  const NEEDS_MIGRATION_VERSION = "2.0.0";
  let PREVIOUS_MIGRATION_VERSION = game.settings.get("D35E", "systemMigrationVersion");
  if (typeof PREVIOUS_MIGRATION_VERSION === "number") {
    PREVIOUS_MIGRATION_VERSION = PREVIOUS_MIGRATION_VERSION.toString() + ".0";
  } else if (
    typeof PREVIOUS_MIGRATION_VERSION === "string" &&
    PREVIOUS_MIGRATION_VERSION.match(/^([0-9]+)\.([0-9]+)$/)
  ) {
    PREVIOUS_MIGRATION_VERSION = `${PREVIOUS_MIGRATION_VERSION}.0`;
  }
  console.log(PREVIOUS_MIGRATION_VERSION);
  // Previous migration version is unparseable
  let needMigration =
    SemanticVersion.fromString(PREVIOUS_MIGRATION_VERSION) == null
      ? true
      : SemanticVersion.fromString(NEEDS_MIGRATION_VERSION).isHigherThan(
          SemanticVersion.fromString(PREVIOUS_MIGRATION_VERSION)
        );
  if (needMigration && game.user.isGM) {
    new Dialog(
      {
        title: `${game.i18n.localize("D35E.MigrationTitle")}`,
        content: `<p>${game.i18n.localize("D35E.MigrationText")}</p>`,
        buttons: {
          confirm: {
            label: game.i18n.localize("D35E.MigrationIMadeBackup"),
            callback: async (html) => {
              await migrations.migrateWorld();
            },
          },
          cancel: {
            label: game.i18n.localize("D35E.MigrationShutDown"),
            callback: async (html) => {
              game.shutDown();
            },
          },
        },
        default: "confirm",
      },
      {
        classes: ["dialog", "D35E", "duplicate-initiative"],
      }
    ).render(true);
  } else if (needMigration) {
    new Dialog(
      {
        title: `${game.i18n.localize("D35E.MigrationTitle")}`,
        content: `<p>${game.i18n.localize("D35E.MigrationTextUser")}</p>`,
        buttons: {
          cancel: {
            label: game.i18n.localize("D35E.MigrationLogOut"),
            callback: async (html) => {
              game.logOut();
            },
          },
        },
        default: "cancel",
      },
      {
        classes: ["dialog", "D35E", "duplicate-initiative"],
      }
    ).render(true);
  }
  let isDemo = game.settings.get("D35E", "demoWorld");
  if (isDemo) {
    $("#chat-message").val("Chat is disabled in Demo Mode. This world resets every 2 hours!");
    $("#chat-message").prop("disabled", true);
    if (game.paused) game.togglePause();
  }

  console.log("D35E | Cache is ", CACHE);
  //game.actors.contents.forEach(obj => { obj._updateChanges({sourceOnly: true}, {skipToken: true}); });

  console.log("D35E | Checking Patreon information");
  PatreonIntegrationFactory.getInstance().doPatreonCheck();

  Hooks.on("renderTokenHUD", (app, html, data) => {
    TokenQuickActions.addTop3Attacks(app, html, data);
  });
  Hooks.on("renderTokenHUD", (app, html, data) => {
    TokenQuickActions.addTop3Buffs(app, html, data);
  });

  for (let key of game.actors.keys()) {
    TopPortraitBar.render(game.actors.get(key));
  }

  let updateRequestArray = [];

  if (!game.user.isGM) {
    let isDemo = game.settings.get("D35E", "demoWorld");
    if (isDemo) {
      (
        await import(
          /* webpackChunkName: "welcome-screen" */
          "./module/demo-screen.js"
        )
      ).default();
    } else {
      (
        await import(
          /* webpackChunkName: "welcome-screen" */
          "./module/onboarding.js"
        )
      ).default();
    }
    return;
  }

  Hooks.on("renderCombatTracker", (bar, data, slot) => {
    if (game.combat) {
      game.combat.updateCombatCharacterSheet();
    }
  });
  Hooks.on("changeSidebarTab", (tab) => {
    if (tab instanceof D35ECombatTracker) {
      if (game.combat) {
        game.combat.updateCombatCharacterSheet();
      }
    }
  });

  // Edit next line to match module.
  const system = game.system;
  const title = system.data.title;
  const moduleVersion = system.data.version;
  game.settings.register(title, "version", {
    name: `${title} Version`,
    default: "0.0.0",
    type: String,
    scope: "world",
  });
  const oldVersion = game.settings.get(title, "version");

  (
    await import(
      /* webpackChunkName: "welcome-screen" */
      "./module/onboarding.js"
    )
  ).default();
  if (!isNewerVersion(moduleVersion, oldVersion)) return;
  (
    await import(
      /* webpackChunkName: "welcome-screen" */
      "./module/welcome-screen.js"
    )
  ).default();
});

Hooks.on("renderSettings", (app, html) => {
  let lotdSection = $(`<h2 id="d35e-help-section" data-action="d35e-help">3.5e SRD Help</h2>`);
  html.find("#settings-game").after(lotdSection);
  let lotdDiv = $(`<div id="d352-help"></div>`);
  lotdSection.after(lotdDiv);
  let helpButton = $(
    `<button id="d35e-help-btn" data-action="d35e-help"><i class="fas fa-question-circle"></i> Documentation</button>`
  );
  lotdDiv.append(helpButton);
  helpButton.on("click", (ev) => {
    ev.preventDefault();
    window.open("https://docs.legaciesofthedragon.com", "lotdHelp", "width=1032,height=900");
  });

  let dicordButton = $(
    `<button id="d35e-discord" data-action="d35e-discord"><i class="fab fa-discord"></i> Community Discord</button>`
  );
  lotdDiv.append(dicordButton);
  dicordButton.on("click", (ev) => {
    ev.preventDefault();
    window.open("https://discord.gg/wDyUaZH", "_blank");
  });

  let patreonButton = $(
    `<button id="d35e-discord" data-action="d35e-discord"><i class="fab fa-patreon"></i> Support on Patreon</button>`
  );
  lotdDiv.append(patreonButton);
  patreonButton.on("click", (ev) => {
    ev.preventDefault();
    window.open("https://patreon.com/rughalt", "_blank");
  });
});

Hooks.on("renderSidebarTab", async (app, html) => {
  if (game.user.isGM) {
    if (app?.options?.id == "compendium" || app instanceof CompendiumDirectory) {
      let style = "";
      if (game.release.generation >= 11) {
      }
      html.find(".drgh-encounter-browser").remove();
      let button = $(
          `<button class='drgh-encounter-browser' style="${style}">Compendium Browser</button>`
      );
      button.on("click", () => {
        game.D35E.compendiumBrowser.render(true);
      });
      html.find(".header-actions").append(button);
    }
  }
});


Hooks.on("renderActorSheet", function (sheet, window, data) {
  //sheet.object.refresh({render: false})
});

/* -------------------------------------------- */
/*  Canvas Initialization                       */
/* -------------------------------------------- */

Hooks.on("canvasInit", function () {
  // Extend Diagonal Measurement
  canvas.grid.diagonalRule = game.settings.get("D35E", "diagonalMovement");
  if (isMinimumCoreVersion("0.5.6")) SquareGrid.prototype.measureDistances = measureDistances;
  else SquareGrid.prototype.measureDistance = measureDistance;
});

Hooks.on("renderSceneNavigation", function () {
  for (let key of game.actors.keys()) {
    TopPortraitBar.render(game.actors.get(key));
  }
});

Hooks.on("dropActorSheetData", function (actor, sheet, dropData, userId) {
  if (actor && actor.sheet && dropData.id) {
    //We only handle the weird drops that do not have UUID
    actor.sheet.addItemFromDropData(dropData);
  }
});

Hooks.on("deleteActor", function () {
  TopPortraitBar.clear();
  for (let key of game.actors.keys()) {
    TopPortraitBar.render(game.actors.get(key));
  }
});

Hooks.on("createActor", (actor, data, options) => {
  if (actor.data.type === "character") {
    let updateData = {};
    if (
      actor.data.data.details?.levelUpProgression === undefined ||
      actor.data.data.details?.levelUpProgression === null
    ) {
      updateData["data.details.levelUpProgression"] = true;
    }
    updateData["token.vision"] = true;
    updateData["token.actorLink"] = true;
    if (updateData) actor.update(updateData);
  } else if (actor.data.type === "npc") {
    let updateData = {};
    updateData["token.bar1"] = { attribute: "attributes.hp" };
    updateData["token.displayName"] = 20;
    updateData["token.displayBars"] = 40;
    if (updateData) actor.update(updateData);
  }
});
/* -------------------------------------------- */
/*  Other Hooks                                 */
/* -------------------------------------------- */

Hooks.on("renderChatMessage", (chatMessage, html, data) => {
  // Display action buttons
  chat.displayChatActionButtons(chatMessage, html, data);

  // Hide roll info
  chat.hideRollInfo(chatMessage, html, data);

  // Hide GM sensitive info
  chat.hideGMSensitiveInfo(chatMessage, html, data);

  chat.enableToggles(chatMessage, html, data);

  chat.bindShowReveal(chatMessage, html, data);

  // Optionally collapse the content
  if (game.settings.get("D35E", "autoCollapseItemCards")) html.find(".card-content.item").hide();
});

// Hooks.on("getChatLogEntryContext", addChatMessageContextOptions);
Hooks.on("renderChatLog", (_, html) => ItemChatListener.chatListeners(html));
Hooks.on("renderChatLog", (_, html) => ActorChatListener.chatListeners(html));
Hooks.on("renderChatPopout", (_, html) => ItemChatListener.chatListeners(html));
Hooks.on("renderChatPopout", (_, html) => ActorChatListener.chatListeners(html));

const debouncedCollate = debounce((a, b, c, d) => CollateAuras(a, b, c, d), 500);
Hooks.on("updateItem", (item, changedData, options, user) => {
  console.log("D35E | Updated Item", item, changedData, options, user, game.userId);
  let actor = item.parent;
  if (actor) {
    TopPortraitBar.render(actor);
    if (!(actor instanceof Actor)) return;

    if (user !== game.userId) {
      console.log("Not updating actor as action was started by other user");
      return;
    }
    //actor.refresh(options)
  }
});

Hooks.on("renderTokenConfig", async (app, html) => {
  // Disable vision elements if custom vision is disabled
  const noVisionOverride = getProperty(app.object.actor, "system.noVisionOverride") === true;
  if (!noVisionOverride) {
    html
      .find(`.tab[data-tab="vision"]`)
      .prepend(
        `<div style='width: 100%; padding: 4px; border-bottom: 1px solid var(--color-border-light-primary); margin-bottom: 4px;'><i class="fa-solid fa-circle-info"></i> ${game.i18n.localize(
          "D35E.VisionControlledByActor"
        )}</div>`
      );
    const tabElem = html.find(`.tab[data-tab="vision"]`);
    tabElem.find(`input, select`).prop("disabled", true);
    tabElem.find("a").unbind();
  } else {
    html
      .find(`.tab[data-tab="vision"]`)
      .prepend(
        `<div style='width: 100%; padding: 4px; border-bottom: 1px solid var(--color-border-light-primary); margin-bottom: 4px;'><i class="fa-solid fa-circle-info"></i> ${game.i18n.localize(
          "D35E.VisionNoAutomation"
        )}</div>`
      );
  }
  // let token = app.object.data.token || app.object.data;
  // let newHTML = await renderTemplate("systems/D35E/templates/internal/token-light-info.html", {
  //   object: duplicate(token.actorLink ? token.document.data.toObject(false) : token.flags ? token.toObject(false) : app.object.data.toObject(false)),
  //   globalDisable: game.settings.get("D35E", "globalDisableTokenLight")
  // });
  // html.find('.tab[data-tab="vision"] > *:nth-child(5)').after(newHTML);
  // let newHTML2 = await renderTemplate("systems/D35E/templates/internal/token-config.html", {
  //   object: duplicate(token.actorLink ? token.toObject(false) : token.flags ? token.toObject(false) : app.object.data.toObject(false))
  // });
  // html.find('.tab[data-tab="vision"] > *:nth-child(2)').after(newHTML2);
});

Hooks.on("renderAmbientLightConfig", (app, html) => {
  addLowLightVisionToLightConfig(app, html);
});

Hooks.on("createToken", async (token, options, userId) => {
  if (userId !== game.user.id) return;

  const actor = game.actors.tokens[token.id] ?? game.actors.get(token.data.actorId);
  actor.conditions.toggleConditionStatusIcons();

  // Update changes and generate sourceDetails to ensure valid actor data
  if (actor != null) await actor.refresh();

  if (game.settings.get("D35E", "randomizeHp") && token.actor.type === "npc" && !token.actor.hasPlayerOwner) {
    function getRandomInt(min, max) {
      min = Math.ceil(min);
      max = Math.floor(max);
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    let itemUpdates = [];
    token.actor.data.items
      .filter((obj) => {
        return obj.type === "class";
      })
      .forEach((item) => {
        if (item.data.data.classType === "template") return;
        if (item.data.data.classType === "minion") return;
        let hd = item.data.data.hd;
        let hp = 0;
        let levels = item.data.data.levels;
        for (let i = 0; i < levels; i++) {
          hp += getRandomInt(1, hd);
        }
        itemUpdates.push({ _id: item._id, "data.hp": hp });
      });
    await token.actor.updateEmbeddedEntity("Item", itemUpdates, { stopUpdates: false, ignoreSpellbookAndLevel: true });
  }

  debouncedCollate(canvas.scene.id, true, true, "updateToken");
});

Hooks.on("canvasReady", async (canvas, options, userId) => {
  TopPortraitBar.clear();
  for (let key of game.actors.keys()) {
    TopPortraitBar.render(game.actors.get(key));
  }
  if (options?.stopAuraUpdate) return;
  debouncedCollate(canvas.scene.id, true, true, "canvasReady");
});

Hooks.on("updateToken", async (token, data, options, userId) => {
  if (userId !== game.user.id) return false;
  if (options?.stopAuraUpdate) return;
  if (options.tokenOnly) return;
  debouncedCollate(canvas.scene.id, true, true, "updateToken");
});

Hooks.on("preUpdateToken", (token, data, options, userId) => {
  if (userId !== game.user.id) return false;
  if (token.actor.getFlag("D35E", "lootsheettype")) {
    if (data?.x || data?.y) {
      if (!game.user.isGM && !token.actor.getFlag("D35E", "allowPlayerMovement")) {
        return false;
      }
    }
  }
});

Hooks.on("deleteToken", async (token, options, userId) => {
  if (options?.stopAuraUpdate) return;
  if (options.tokenOnly) return;
  debouncedCollate(canvas.scene.id, true, true, "updateToken");
});

Hooks.on("createCombatant", (combat, combatant, info, data) => {
  if (!game.user.isGM) return;
  const actor = game.actors.tokens[combatant.tokenId];
  if (actor != null) {
    let itemResourcesData = {};
    for (let i of actor.items || []) {
      actor.getItemResourcesUpdate(i, itemResourcesData);
    }
    actor.refreshWithData(itemResourcesData, {});
  }
});

Hooks.on("updateCombat", async (combat, combatant, info, data) => {
  if (!game.user.isGM) return;
  if (
    (combat.current.turn <= combat.previous.turn && combat.current.round === combat.previous.round) ||
    combat.current.round < combat.previous.round
  )
    return; // We moved back in time
  debouncedCollate(canvas.scene.id, true, true, "updateToken");
  // const actor = combat.combatant.actor;
  // const buffId = combat.combatant.data?.flags?.D35E?.buffId;
  // if (actor != null) {
  //     await actor.progressRound();
  // } else if (buffId) {
  //     let actor;
  //     if (combat.combatant.data?.flags?.D35E?.isToken) {
  //         actor = canvas.scene.tokens.get(combat.combatant.data?.flags?.D35E?.tokenId).actor;
  //     } else {
  //         actor = game.actors.get(combat.combatant.data?.flags?.D35E?.actor);
  //     }
  //
  //     await actor.progressBuff(buffId,1);
  //     debouncedCollate(canvas.scene.id, true, true, "updateToken")
  // }
});

Hooks.on("createMeasuredTemplate", (template, _template, data, user) => {
  game.D35E.createdMeasureTemplates.add(template.data._id);
});

// Create race on actor
Hooks.on("preCreateOwnedItem", (actor, item) => {
  if (!(actor instanceof Actor)) return;
  if (actor.race == null) return;

  if (item.type === "race") {
    actor.race.update(item);
    return false;
  }
});

Hooks.on("preCreateItem", (data, d, options, user) => {
  if (!(data.parent instanceof Actor)) return;

  if (user !== game.userId) {
    console.log("Not updating actor as action was started by other user");
    return;
  }
  //data.parent.refresh(options);
});

Hooks.on("createItem", (data, options, user) => {
  if (!(data.parent instanceof Actor)) return;

  if (user !== game.userId) {
    console.log("Not updating actor as action was started by other user");
    return;
  }
  //data.parent.refresh(options);
});
Hooks.on("deleteItem", (data, options, user) => {
  if (!(data.parent instanceof Actor)) return;

  if (user !== game.userId) {
    console.log("Not updating actor as action was started by other user");
    return;
  }
  //data.parent.refresh(options);
});

Hooks.on("getChatLogEntryContext", chat.addChatMessageContextOptions);

Hooks.on("updateActor", (actor, data, options, user) => {
  TopPortraitBar.render(actor);
  if (!(actor instanceof Actor)) return;
  if (user !== game.userId) {
    console.log("Not updating actor as action was started by other user");
    return;
  } else {
    if (canvas.scene) {
      debouncedCollate(canvas.scene.id, true, true, "updateToken");
    }
    if (actor.data.data.companionAutosync) {
      actor.syncToCompendium();
    }
  }
});

Hooks.on("controlToken", (token, selected) => {
  // Refresh canvas sight
  canvas.perception.update({
    initializeLighting: true,
    refreshLighting: true,
    refreshVision: true,
    refreshSounds: true,
    refreshTiles: true,
  });
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

Hooks.on("hotbarDrop", (bar, data, slot) => {
  if (data.type === "skill") {
    createSkillMacro(data.uuid, data.skill, slot)
    return false;
  }
  if (data.type === "Item") {
    createItemMacro(data.uuid, slot);
    return false;
  }
});

Hooks.on("updateWorldTime", async (date, delta, other) => {
  let roundsDelta = Math.floor(delta / 6);
  if (roundsDelta === 0) return;
  if (!game.user.isGM) return;
  let alreadyChecked = new Set();
  let updatePromises = [];
  for (const source of canvas.tokens.placeables) {
    if (!source.actor) continue;
    let actor = ActorPF.getActorFromTokenPlaceable(source);

    let trueId = actor.id;
    if (actor.isToken) trueId = source.id;
    if (alreadyChecked.has(trueId)) continue;
    alreadyChecked.add(trueId);

    if (actor) {
      updatePromises.push(actor.progressTime(roundsDelta));
    }
  }
  Promise.all(updatePromises).then(() => {
    debouncedCollate(canvas.scene.id, true, true, "updateToken");
  });
});

Hooks.on("diceSoNiceReady", (dice3d) => {
  dice3d.addColorset(
    {
      name: "Legacies of the Dragon",
      description: "Legacies of the Dragon",
      category: "Standard",
      foreground: "#fff4eb",
      background: "#340403",
      texture: "dragon",
      edge: "#340403",
    },
    "default"
  );
});

Hooks.on("aipSetup", (packageConfig) => {
  const api = game.modules.get("autocomplete-inline-properties").API;
  const DATA_MODE = api.CONST.DATA_MODE;

  // Define the config for our package
  const config = {
    packageName: "D35E",
    sheetClasses: [
      {
        name: "ItemSheetPF", // this _must_ be the class name of the `Application` you want it to apply to
        fieldConfigs: [
          {
            selector: `.tab[data-tab="details"] input[type="text"]`, // this targets all text input fields on the "details" tab. Any css selector should work here.
            showButton: true,
            allowHotkey: true,
            dataMode: DATA_MODE.CUSTOM,
            inlinePrefix: "@",
            customDataGetter: (sheet) => {
              return sheet.item.getActorItemRollData();
            },
          },
          // Add more field configs if necessary
        ],
      },
      // Add more sheet classes if necessary
    ],
  };

  // Add our config
  packageConfig.push(config);
});

/**
 * Create a Macro from an Skill drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} actorId  The actor id
 * @param {string} skill    The skill name
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createSkillMacro(actorId, skill, slot) {
  const actor = fromUuidSync(actorId);
  let skillName = CONFIG.D35E.skills[skill] ? CONFIG.D35E.skills[skill] : skill;
  const command =
    `fromUuidSync("${actorId}").rollSkill("${skill}");`;
  let macro = game.macros.contents.find((m) => m.name === skillName && m.command === command);
  if (!macro) {
    macro = await Macro.create(
      {
        name: skillName,
        type: "script",
        img: CONFIG.D35E.skills[skill] ? `/systems/D35E/icons/skills/${skill}.png` : `/systems/D35E/icons/actions/unknown.png`,
        command: command,
        flags: { "D35E.skillMacro": true },
      },
      { displaySheet: false }
    );
  }
  game.user.assignHotbarMacro(macro, slot);
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} item     The item data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createItemMacro(itemUuid, slot) {
  const item = await fromUuid(itemUuid);
  const actor = getItemOwner(item);
  const command =
      `fromUuidSync("${itemUuid}").use({})`;
  let macro = game.macros.contents.find((m) => m.name === item.name && m.command === command);
  if (!macro) {
    macro = await Macro.create(
        {
          name: item.name,
          type: "script",
          img: item.img,
          command: command,
          flags: { "D35E.itemMacro": true },
        },
        { displaySheet: false }
    );
  }
  game.user.assignHotbarMacro(macro, slot);
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemName
 * @param {object} [options={}]
 * @return {Promise}
 */
function rollItemMacro(itemName, { itemId = null, itemType = null, actorId = null } = {}) {
  let actor = getActorFromId(actorId);
  if (actor && !actor.testUserPermission(game.user, "OWNER"))
    return ui.notifications.warn(game.i18n.localize("D35E.ErrorNoActorPermission"));
  const item = actor
    ? actor.items.find((i) => {
        if (itemId != null && i._id !== itemId) return false;
        if (itemType != null && i.type !== itemType) return false;
        return i.name === itemName;
      })
    : null;
  if (!item) return ui.notifications.warn(`Your controlled Actor does not have an item named ${itemName}`);

  // Trigger the item roll
  if (!game.keyboard.isModifierActive("Control")) {
    return item.use({ skipDialog: game.keyboard.isModifierActive("Shift") });
  }
  return item.roll();
}

/**
 * Show an actor's defenses.
 */
function rollDefenses({ actorName = null, actorId = null } = {}) {
  const speaker = ChatMessage.getSpeaker();
  let actor = game.actors.contents.filter((o) => {
    if (!actorName && !actorId) return false;
    if (actorName && o.name !== actorName) return false;
    if (actorId && o._id !== actorId) return false;
    return true;
  })[0];
  if (speaker.token && !actor) actor = game.actors.tokens[speaker.token];
  if (!actor) actor = game.actors.get(speaker.actor);
  if (!actor) return ui.notifications.warn("No applicable actor found");

  return actor.displayDefenses();
}

/**
 * Roll Turn Undead
 * @param actorName
 * @param actorId
 * @returns {*|void}
 */
function rollTurnUndead({ actorName = null, actorId = null } = {}) {
  const speaker = ChatMessage.getSpeaker();
  let actor = game.actors.contents.filter((o) => {
    if (!actorName && !actorId) return false;
    if (actorName && o.name !== actorName) return false;
    if (actorId && o._id !== actorId) return false;
    return true;
  })[0];
  if (speaker.token && !actor) actor = game.actors.tokens[speaker.token];
  if (!actor) actor = game.actors.get(speaker.actor);
  if (!actor) return ui.notifications.warn("No applicable actor found");

  return actor.rollTurnUndead();
}

function requestRoll({rollType = "skill", rollTarget = "apr", dcTarget = 0, rollMode = "public"}) {
  // Create a chat message with a button depending on the selected roll type
  if (rollType === "save") {
    let buttonCode = `<div class="flexcol card-buttons"><button class="everyone no-actor" data-action="rollSave" data-value="${rollTarget}" data-ability="${dcTarget}" data-targetrollmode="${rollMode}" data-target="${dcTarget}">
${game.i18n.localize("D35E.RollSavingThrow")}
            </button></div>`;
    let chatTemplateData = {
      name: game.i18n.localize("D35E.RollSavingThrow") + ` (${CONFIG.D35E.savingThrows[rollTarget]})`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      rollMode: rollMode,
      text: buttonCode,
      targetText: `
      <div class="dice-result box">
          <h4 class="box-title">
          DC
          </h4>
          <h4 class="dice-total rolled-roll">
          ${dcTarget}
          </h4>
      </div>`,
    };
    createCustomChatMessage("systems/D35E/templates/chat/request-roll.html", chatTemplateData, {}, {});
  }
  else if (rollType === "skill") {
    let buttonCode = `<div class="flexcol card-buttons"><button class="everyone no-actor" data-action="rollSkill" data-value="${rollTarget}" data-ability="${dcTarget}" data-targetrollmode="${rollMode}" data-target="${dcTarget}">
${game.i18n.localize("D35E.RollSkillCheck")}
            </button></div>`;
    let skillName = CONFIG.D35E.skills[rollTarget];
    let chatTemplateData = {
      name: `${game.i18n.localize("D35E.RollSkillCheck")} (${skillName})`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      rollMode: rollMode,
      text: buttonCode,
      // DC target text
      targetText: `
      <div class="dice-result box">
          <h4 class="box-title">
          DC
          </h4>
          <h4 class="dice-total rolled-roll">
          ${dcTarget}
          </h4>
      </div>`,
    };
    createCustomChatMessage("systems/D35E/templates/chat/request-roll.html", chatTemplateData, {}, {});
  } else if (rollType === "ability") {
    let buttonCode = `<div class="flexcol card-buttons"><button class="everyone no-actor" data-action="rollAbility" data-value="${rollTarget}" data-ability="${dcTarget}" data-targetrollmode="${rollMode}" data-target="${dcTarget}">
${game.i18n.localize("D35E.RollSkillCheck")}
            </button></div>`;
    let abilityName = CONFIG.D35E.abilities[rollTarget];
    let chatTemplateData = {
      name: `${game.i18n.localize("D35E.RollAbilityCheck")} (${abilityName})`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      rollMode: rollMode,
      text: buttonCode,
      // DC target text
      targetText: `
      <div class="dice-result box">
          <h4 class="box-title">
          DC
          </h4>
          <h4 class="dice-total rolled-roll">
          ${dcTarget}
          </h4>
      </div>`,
    };
    createCustomChatMessage("systems/D35E/templates/chat/request-roll.html", chatTemplateData, {}, {});
  }

}

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;
  game.D35E.logger.log("Adding D35E GM Tools and scene controls");
  controls.find((control) => control.name === "token").tools.push(
      {
        name: "d35e-gm-tools-convert-to-loot",
        title: "D35E.ConvertToLoot",
        icon: "fa-regular fa-treasure-chest",
        onClick: async () => {
          let selectedTokens = canvas.tokens.controlled.filter(
              (t) =>
                  game.actors.get(t.data.actorId).type === "npc" || game.actors.get(t.data.actorId).type === "character"
          );
          if (selectedTokens.length === 0) {
            ui.notifications.error(`Please select at least one token`);
            return;
          }
          for (let token of selectedTokens) {
            await token.document.update({
              actorLink: false,
              actorData: { flags: { core: { sheetClass: "D35E.ActorSheetPFNPCLoot" } } },
            });
            await canvas.scene.updateEmbeddedDocuments("Token", [{ _id: token.id }]);
          }
          ui.notifications.info(`Converted to Loot`);
        },
        button: true,
      },
      {
        name: "d35e-gm-tools-treasure-generator",
        title: "D35E.TreasureGenerator",
        icon: "fas fa-gem",
        onClick: async () => {
          let selectedNpcTokens = canvas.tokens.controlled.filter(
              (t) => game.actors.get(t.data.actorId).data.type === "npc"
          );
          if (selectedNpcTokens.length === 0) {
            ui.notifications.error(`Please select at least a token`);
            return;
          }
          for (let token of canvas.tokens.controlled.filter(
              (t) => game.actors.get(t.data.actorId).data.type === "npc"
          )) {
            await genTreasureFromToken(token);
          }
          ui.notifications.info(`Treasure generation finished`);
        },
        button: true,
      }
  )
  controls.push({
    name: "d35e-gm-tools",
    title: "D35E.GMTools",
    icon: "fas fa-dungeon",
    layer: "d35e",
    tools: [
      {
        name: "select",
        title: "CONTROLS.BasicSelect",
        icon: "fas fa-expand",
      },
      // {
      //   name: "d35e-gm-tools-roll-requestor",
      //   title: "D35E.RequestRoll",
      //   icon: "fas fa-dice",
      //   onClick: () => {
      //     new RollRequestorDialog().render(true);
      //   },
      //   button: true,
      // },
      {
        name: "d35e-gm-tools-encounter-generator",
        title: "D35E.EncounterGenerator",
        icon: "fas fa-dragon",
        onClick: () => {
          new EncounterGeneratorDialog().render(true);
        },
        button: true,
      },
      {
        name: "d35e-gm-tools-custom-treasure-generator",
        title: "D35E.CustomTreasureGenerator",
        icon: "fas fa-store",
        onClick: () => {
          new TreasureGeneratorDialog().render(true);
        },
        button: true,
      },
      {
        name: "d35e-gm-tools-rest-party",
        title: "D35E.RestParty",
        icon: "fas fa-bed",
        onClick: () => {
          if (typeof SimpleCalendar !== "undefined") {
            SimpleCalendar.api.changeDate({ hour: 8 });
          }
          let restingPromises = [];
          for (let actor of game.actors.filter((a) => a.data.data.isPartyMember)) {
            restingPromises.push(actor.rest(true, true, false));
          }
          Promise.all(restingPromises).then(() => {
            let chatTemplateData = {
              name: game.i18n.localize("D35E.PartyRestedHeader"),
              type: CONST.CHAT_MESSAGE_TYPES.OTHER,
              rollMode: "public",
              text: game.i18n.localize("D35E.PartyRested"),
            };
            createCustomChatMessage("systems/D35E/templates/chat/gm-message.html", chatTemplateData, {}, {});
          });
        },
        button: true,
      },
    ],
    activeTool: "select",
  });
});

Hooks.on("renderItemSheet", (app, html) => {
  if (!app?.object?.system.uniqueId) return;
  const copyUidButton = $(
    `<a class="document-uid-link" alt="Copy document UID" data-tooltip="Item UID: ${app?.object?.system.uniqueId}" data-tooltip-direction="UP"><i class="fa-solid fa-anchor"></i></a>`
  );
  copyUidButton.on("click", async () => {
    navigator.clipboard.writeText(app?.object?.system.uniqueId);
  });
  const div = html.find("h4.window-title");
  div.append(copyUidButton);
});

EnrichersHelper.setupHooks();
