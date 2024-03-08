import { ActorSheetPFNPC } from "./npc.js";
import { createTabs } from "../../lib.js";
import {LootSheetActions} from "../../lootsheet/actions.js";
import {QuantityDialog} from "../../lootsheet/quantityDialog.js";
import {PatreonIntegrationFactory} from "../../patreon-integration.js";

export class ActorSheetPFNPCLoot extends ActorSheetPFNPC {
  get template() {
    // adding the #equals and #unequals handlebars helper
    Handlebars.registerHelper('equals', function(arg1, arg2, options) {
      return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('unequals', function(arg1, arg2, options) {
      return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('lootsheetprice', function(basePrice, modifier) {
      const conversionRate = {
        "pp": 10,
        "gp": 1,
        "sp": 0.1,
        "cp": 0.01
      };
      return LootSheetActions.getPriceAsString(Math.round(basePrice * modifier * 100) / 100, conversionRate);
    });

    Handlebars.registerHelper('lootsheetweight', function(baseWeight, count) {
      let weightConversion = game.settings.get("D35E", "units") === "metric" ? 0.5 : 1;
      return Math.round(baseWeight * count * weightConversion * 100) / 100;
    });

    Handlebars.registerHelper('lootsheetname', function(name, quantity) {
      return quantity > 1 ? `(${quantity}) ${name}` : name;
    });

    const path = "systems/D35E/templates/actors/";
    return "systems/D35E/templates/actors/npc-sheet-loot.html";
  }

  static get defaultOptions() {
    const options = super.defaultOptions;

    mergeObject(options, {
      classes: ["D35E sheet actor npc npc-sheet loot-sheet-npc"],
      width: 850,
      height: 750
    });
    return options;
  }

  /**
   * Returns the loot price that the player is aware of
   */
  getLootPrice(item) {
    if(game.user.isGM || item.system.identified) {
      return item.system.price;
    }
    return LootSheetActions.getItemCost(item);
  }

  /**
   * Returns the loot name that the player knows
   */
  getLootName(item) {
    if(game.user.isGM || item.system.identified) {
      return item.name;
    }
    return LootSheetActions.getItemName(item);
  }

  async getData() {
    const sheetData = await super.getData();

    // Prepare GM Settings
    this._prepareGMSettings(sheetData.actor);
    //game.D35E.logger.log(sheetData)

    // Prepare isGM attribute in sheet Data

    //game.D35E.logger.log("game.user: ", game.user);
    if (game.user.isGM) sheetData.isGM = true;
    else sheetData.isGM = false;
    //game.D35E.logger.log("sheetData.isGM: ", sheetData.isGM);
    //game.D35E.logger.log(this.actor);

    let lootsheettype = await this.actor.getFlag("D35E", "lootsheettype");
    if (!lootsheettype) {
      lootsheettype = "Loot"
      await this.actor.setFlag("D35E", "lootsheettype", lootsheettype);
    }
    game.D35E.logger.log(`Loot Sheet | Loot sheet type = ${lootsheettype}`);

    let rolltable = await this.actor.getFlag("D35E", "rolltable");
    game.D35E.logger.log(`Loot Sheet | Rolltable = ${rolltable}`);


    let priceModifier = 1.0;
    let priceModifierBuy = 1.0;
    game.D35E.logger.log("D35E LootSheet | ", lootsheettype)
    if (lootsheettype === "Merchant") {
      priceModifier = await this.actor.getFlag("D35E", "priceModifier");
      if (!priceModifier) await this.actor.setFlag("D35E", "priceModifier", 1.0);
      priceModifier = await this.actor.getFlag("D35E", "priceModifier");
      priceModifierBuy = await this.actor.getFlag("D35E", "priceModifierBuy");
      if (!priceModifierBuy) await this.actor.setFlag("D35E", "priceModifierBuy", 1.0);
      priceModifierBuy = await this.actor.getFlag("D35E", "priceModifierBuy");
    }

    let totalItems = 0
    let totalWeight = 0
    let totalPrice = 0
    let maxCapacity = await this.actor.getFlag("D35E", "maxCapacity") || 0;
    let maxLoad = await this.actor.getFlag("D35E", "maxLoad") || 0;


    Object.keys(sheetData.actor.itemGroups).forEach( f => sheetData.actor.itemGroups[f].items.forEach( _i => {
      // specify if empty
      let i = _i;
      const itemQuantity = getProperty(i, "system.quantity") != null ? getProperty(i, "system.quantity") : 1;
      const itemCharges = getProperty(i, "system.uses.value") != null ? getProperty(i, "system.uses.value") : 1;
      i.empty = itemQuantity <= 0 || (i.isCharged && itemCharges <= 0);

      totalItems += itemQuantity
      totalWeight += itemQuantity * i.system.weight || 0;
      totalPrice += itemQuantity * LootSheetActions.getItemCost(i)
    }));

    sheetData.lootsheettype = lootsheettype;
    sheetData.rolltable = rolltable;
    sheetData.priceModifier = priceModifier;
    sheetData.priceModifierBuy = priceModifierBuy;
    sheetData.rolltables = game.tables.contents;
    sheetData.canAct = game.user.playerId in sheetData.actor.ownership && sheetData.actor.ownership[game.user.playerId] == 3;
    sheetData.totalItems = totalItems
    sheetData.maxItems = maxCapacity > 0 ? " / " + maxCapacity : ""
    sheetData.itemsWarning = maxCapacity <= 0 || maxCapacity >= totalItems ? "" : "warn"
    sheetData.totalWeight = Math.ceil(totalWeight)
    sheetData.maxWeight = maxLoad > 0 ? " / " + maxLoad : ""
    sheetData.weightWarning = maxLoad <= 0 || maxLoad >= totalWeight ? "" : "warn"
    sheetData.totalPrice = totalPrice
    sheetData.weightUnit = game.settings.get("D35E", "units") == "metric" ? game.i18n.localize("D35E.Kgs") : game.i18n.localize("D35E.Lbs")
    sheetData.isPatreonEnabled = PatreonIntegrationFactory.getInstance().isPatreonActive();
    sheetData.hasPlayerCharacter = false;
    if (game.user.character) {
      sheetData.hasPlayerCharacter = true;
      let playerActorData = game.user.character.toObject();
      sheetData.playerItems = this.#splitItemsToGroups(playerActorData);
    }
    // Return data for rendering
    return sheetData;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers
  /* -------------------------------------------- */

  /**
   * Activate event listeners using the prepared sheet HTML
   * @param html {HTML}   The prepared HTML object ready to be rendered into the DOM
   */
  async activateListeners(html) {
    //game.D35E.logger.log("Loot Sheet | activateListeners")
    super.activateListeners(html);

    const dragEnabled = this.actor.getFlag("D35E", "dragEnabled") && this.actor.getFlag("D35E", "lootsheettype") === "Loot";
    if(!dragEnabled) {
      // Remove dragging capability
      let handler = ev => this._onDragItemStart(ev);
      html.find('li.item').each((i, li) => {
        if ( li.classList.contains("inventory-header") ) return;
        li.setAttribute("draggable", false);
        li.removeEventListener("dragstart", handler);
      });
    }

    if (this.options.editable) {
      // Toggle Permissions
      html.find('.permission-proficiency').click(ev => this._onCyclePermissionProficiency(ev));

      // Toggle Permissions (batch)
      html.find('.permission-batch').click(ev => this._onBatchPermissionChange(ev));

      // Split Coins
      html.find('.split-coins').click(ev => this._distributeCoins(ev));

      // Price Modifier
      html.find('.price-modifier').click(ev => this._priceModifier(ev));


      // Split Coins
      html.find('.identify-all').click(ev => this._identifyAll(ev));

      // Group Items
      html.find('.group-items').click(ev => this._groupItems(ev));

      // Price Modifier
      html.find('.unidentify-all').click(ev => this._unidentifyAll(ev));

      // Price Modifier
      html.find('.convert-loot').click(ev => this._convertLoot(ev));

      //html.find('.merchant-settings').change(ev => this._merchantSettingChange(ev));
      html.find('.update-inventory').click(ev => this._merchantInventoryUpdate(ev));
    }

    // Buy Item
    html.find('.item-buy').click(ev => this._buyItem(ev));

    // Sell Item
    html.find('.item-sell').click(ev => this._sellItem(ev));


    // Loot Item
    html.find('.item-loot').click(ev => this._lootItem(ev));

    // Toggle Visibility
    html.find('.item-visibility').click(ev => this._toggleVisibility(ev));
  }

  /* -------------------------------------------- */

  /**
   * Handle merchant settings change
   * @private
   */
  async _merchantSettingChange(event, html) {
    event.preventDefault();
    game.D35E.logger.log("Loot Sheet | Merchant settings changed", event);

    if(!game.user.isGM) {
      return;
    }

    const expectedKeys = ["rolltable", "shopQty", "itemQty"];
    let targetKey = event.target.name.split('.')[3];

    if (expectedKeys.indexOf(targetKey) === -1) {
      game.D35E.logger.log(`Loot Sheet | Error changing stettings for "${targetKey}".`);
      return ui.notifications.error(game.i18n.format("ERROR.lsChangingSettingsFor", {name: targetKey}));
    }

    if (event.target.value) {
      await this.actor.setFlag("D35E", targetKey, event.target.value);
    } else {
      await this.actor.unsetFlag("D35E", targetKey, event.target.value);
    }
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */
  /* -------------------------------------------- */

  async _updateObject(event, formData) {
    let flags = Object.entries(formData).filter(e => e[0].startsWith("flags."));
    for(let i=0; i<flags.length; i++) {
      const name = flags[i][0].split(".")
      const value = flags[i][1]
      if( name.length === 3 ) { // Ex : data.flags.lootsheetnpcpf1.dragEnabled
        // check if has changed
        if(this.actor.getFlag(name[1], name[2]) != value) {
          game.D35E.logger.log(`Setting flag ${name[1]}.${name[2]} to ${value}`)
          await this.actor.setFlag(name[1], name[2], value)
        }
      }
    }

    return super._updateObject(event, formData);
  }


  /* -------------------------------------------- */

  /**
   * Handle merchant inventory update
   * @private
   */
  async _merchantInventoryUpdate(event, html) {
    event.preventDefault();
    //game.D35E.logger.log("Loot Sheet | _merchantInventoryUpdate")

    if(!game.user.isGM) {
      return;
    }

    const rolltableUUID = await this.actor.getFlag("D35E", "rolltable");
    const shopQtyFormula = await this.actor.getFlag("D35E", "shopQty") || "1";
    const itemQtyFormula = await this.actor.getFlag("D35E", "itemQty") || "1";
    const itemStack = await this.actor.getFlag("D35E", "stopStack") || "1";

    if (!rolltableUUID || rolltableUUID.length == 0) {
      return ui.notifications.error(game.i18n.format("ERROR.lsChooseTable"));
    }

    let rolltable = await fromUuid(rolltableUUID)
    if (!rolltable) {
      game.D35E.logger.log(`Loot Sheet | No Rollable Table found with UUID "${rolltableUUID}".`);
      return ui.notifications.error(game.i18n.format("ERROR.lsNoRollableTableFound", {name: rolltableUUID}));
    }

    let clearInventory = game.settings.get("D35E", "clearInventory");

    if (clearInventory) {

      let currentItems = this.actor.items.map(i => i._id);
      await this.actor.deleteEmbeddedEntity("Item", currentItems);
      game.D35E.logger.log(currentItems);
    }
    //return;
    let shopQtyRoll = new Roll(shopQtyFormula);

    shopQtyRoll.roll();
    game.D35E.logger.log(`Loot Sheet | Adding ${shopQtyRoll.result} new items`);
    let itemsToAdd = []
    for (let i = 0; i < shopQtyRoll.result; i++) {
      const rollResult = await rolltable.roll();
      game.D35E.logger.log(rollResult);
      let uuid = null;
      if (rollResult.results[0].documentCollection === "Item") uuid = `${rollResult.results[0].documentCollection}.${rollResult.results[0].documentId}`
      else uuid = `Compendium.${rollResult.results[0].documentCollection}.${rollResult.results[0].documentId}`
      let newItem = await fromUuid(uuid);

      let itemQtyRoll = new Roll(itemQtyFormula);
      itemQtyRoll.roll();
      game.D35E.logger.log(`Loot Sheet | Adding ${itemQtyRoll.result} x ${newItem.name}`)
      let newItemData = newItem.toObject(false)
      if (itemStack) {
        let existingItem = this.actor.items.find(i => i.name === newItem.name);
        if (existingItem) {
          await existingItem.update({'system.quantity':(existingItem.system.quantity || 1) + Number(itemQtyRoll.result)})
        } else {
          newItemData.quantity = Number(itemQtyRoll.result);
          itemsToAdd.push(newItemData)
        }
      } else {
        newItemData.quantity = Number(itemQtyRoll.result);
        itemsToAdd.push(newItemData)
      }

    }

    await this.actor.createEmbeddedEntity("Item", itemsToAdd);
  }

  _createRollTable() {
    //game.D35E.logger.log("Loot Sheet | _createRollTable")

    let type = "weapon";

    game.packs.map(p => p.collection);

    const pack = game.packs.find(p => p.collection === "D35E.items");

    let i = 0;

    let output = [];

    pack.getIndex().then(index => index.forEach(function(arrayItem) {
      var x = arrayItem._id;
      //game.D35E.logger.log(arrayItem);
      i++;
      pack.getDocument(arrayItem._id).then(packItem => {

        if (packItem.type === type) {

          //game.D35E.logger.log(packItem);

          let newItem = {
            "_id": packItem._id,
            "flags": {},
            "type": 1,
            "text": packItem.name,
            "img": packItem.img,
            "collection": "Item",
            "resultId": packItem._id,
            "weight": 1,
            "range": [
              i,
              i
            ],
            "drawn": false
          };

          output.push(newItem);

        }
      });
    }));

    return;
  }

  /* -------------------------------------------- */

  /**
   * Handle buy item
   * @private
   */
  _buyItem(event) {
    event.preventDefault();

    if (this.token === null) {
      return ui.notifications.error(game.i18n.localize("ERROR.lsPurchaseFromToken"));
    }
    if (game.user.actorId) {
      let itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
      let quantity = Number($(event.currentTarget).parents(".item").attr("data-item-quantity"));
      let itemName = $(event.currentTarget).parents(".item").find("h4").text()

      let options = { acceptLabel: game.i18n.localize("D35E.ls.purchase") }
      if(quantity === 1) {
        options['title'] = game.i18n.localize("D35E.ls.purchase")
        options['label'] = game.i18n.format("D35E.ls.buyContent", { item: itemName })
        options['quantity'] = 1
      } else {
        options['title'] = game.i18n.format("D35E.ls.buyTitle", { item: itemName })
      }

      let d = new QuantityDialog(async (quantity) => {
        await LootSheetActions.transaction(game.user.character, this.actor, game.user.character, itemId, quantity)
        this.render(true)
      }, options);
      d.render(true);
    } else {
      game.D35E.logger.log("Loot Sheet | No active character for user");
      return ui.notifications.error(game.i18n.localize("ERROR.lsNoActiveCharacter"));
    }
  }

  _sellItem(event) {
    event.preventDefault();
    if (this.token === null) {
      return ui.notifications.error(game.i18n.localize("ERROR.lsPurchaseFromToken"));
    }

    if (game.user.actorId) {
      let itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
      let maxQuantity = Number($(event.currentTarget).parents(".item").attr("data-item-quantity"));
      let itemName = $(event.currentTarget).parents(".item").find("h4").text()

      let options = { acceptLabel: game.i18n.localize("D35E.ls.purchase") }
      if(maxQuantity === 1) {
        options['title'] = game.i18n.localize("D35E.ls.purchase")
        options['label'] = game.i18n.format("D35E.ls.buyContent", { item: itemName })
        options['quantity'] = 1
      } else {
        options['title'] = game.i18n.format("D35E.ls.buyTitle", { item: itemName })
      }

      let d = new QuantityDialog(async (quantity) => {
        await LootSheetActions.transaction(game.user.character, game.user.character, this.actor, itemId, Math.min(maxQuantity,quantity), true, true)
        this.render(true);
      }, options);
      d.render(true);
    } else {
      game.D35E.logger.log("Loot Sheet | No active character for user");
      return ui.notifications.error(game.i18n.localize("ERROR.lsNoActiveCharacter"));
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle Loot item
   * @private
   */
  _lootItem(event) {
    event.preventDefault();
    //game.D35E.logger.log("Loot Sheet | _lootItem")

    let targetGm = null;
    game.users.forEach((u) => {
      if (u.isGM && u.active && u.viewedScene === game.user.viewedScene) {
        targetGm = u;
      }
    });

    if (!targetGm) {
      return ui.notifications.error(game.i18n.localize("ERROR.lsNoActiveGM"));
    }

    if (game.user.actorId) {
      let itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
      let quantity = Number($(event.currentTarget).parents(".item").attr("data-item-quantity"));
      let itemName = $(event.currentTarget).parents(".item").find("h4").text()

      let options = { acceptLabel: game.i18n.localize("D35E.ls.loot") }
      if(quantity == 1) {
        options['title'] = game.i18n.localize("D35E.ls.loot")
        options['label'] = game.i18n.format("D35E.ls.lootContent", { item: itemName })
        options['quantity'] = 1
      } else {
        options['title'] = game.i18n.format("D35E.ls.lootTitle", { item: itemName })
      }

      let d = new QuantityDialog((quantity) => {
        const packet = {
          type: "loot",
          userId: game.user._id,
          actorId: game.user.actorId,
          tokenId: this.token ? this.token.id : undefined,
          targetActorId: this.token ? undefined : this.actor.id,
          itemId: itemId,
          quantity: quantity,
          processorId: targetGm.id
        };
        game.D35E.logger.log("LootSheetPf1", "Sending loot request to " + targetGm.name, packet);
        LootSheetActions.moveItem(this.actor, game.user.character, itemId, quantity)
      }, options);
      d.render(true);
    } else {
      game.D35E.logger.log("Loot Sheet | No active character for user");
      return ui.notifications.error(game.i18n.localize("ERROR.lsNoActiveCharacter"));
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle mass identify
   * @private
   */
  async _identifyAll(event) {
    event.preventDefault();
    let updateList = []
    this.actor.items.forEach( item  => {
          if (["weapon", "equipment", "consumable", "tool", "loot"].indexOf(item.type) >= 0) {
            updateList.push({'_id':item._id, 'system.identified': true})
          }
        }
    );
    await this.actor.updateEmbeddedEntity("Item",updateList)
  }


  async _groupItems(event) {
    event.preventDefault();
    await this.actor.groupItems()
  }


  /**
   * Handle mass unidentify
   * @private
   */
  async _unidentifyAll(event) {
    event.preventDefault();
    let updateList = []
    this.actor.items.forEach( item  => {
          if (["weapon", "equipment", "consumable", "tool", "loot"].indexOf(item.type) >= 0) {
            updateList.push({'_id':item._id, 'system.identified': false})
          }
        }
    );
    await this.actor.updateEmbeddedEntity("Item",updateList)
  }


  /**
   * Handle price modifier.
   * @private
   */
  async _priceModifier(event) {
    event.preventDefault();
    //game.D35E.logger.log("Loot Sheet | _priceModifier")

    let priceModifier = await this.actor.getFlag("D35E", "priceModifier");
    if (!priceModifier) priceModifier = 1.0;

    priceModifier = Math.round(priceModifier * 100);


    let priceModifierBuy = await this.actor.getFlag("D35E", "priceModifierBuy");
    if (!priceModifierBuy) priceModifierBuy = 1.0;

    priceModifierBuy = Math.round(priceModifierBuy * 100);

    renderTemplate("systems/D35E/templates/lootsheet/dialog-price-modifier.html", {'priceModifier': priceModifier, 'priceModifierBuy': priceModifierBuy}).then(html => {
      new Dialog({
        title: game.i18n.localize("D35E.ls.priceModifierTitle"),
        content: html,
        buttons: {
          one: {
            icon: '<i class="fas fa-check"></i>',
            label: game.i18n.localize("D35E.ls.update"),
            callback: () =>  {
              this.actor.setFlag("D35E", "priceModifier", document.getElementById("price-modifier-percent").value / 100)
              this.actor.setFlag("D35E", "priceModifierBuy", document.getElementById("price-modifier-percent-buy").value / 100)
            }
          },
          two: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("D35E.ls.cancel"),
            callback: () => game.D35E.logger.log("Loot Sheet | Price Modifier Cancelled")
          }
        },
        default: "two",
        close: () => game.D35E.logger.log("Loot Sheet | Price Modifier Closed")
      }).render(true);
    });

  }

  /* -------------------------------------------- */

  /**
   * Handle buy item
   * @private
   */
  _toggleVisibility(event) {
    event.preventDefault();
    let itemId = $(event.currentTarget).parents(".item").attr("data-item-id");
    let item = this.actor.items.get(itemId);
    if(item) {
      game.D35E.logger.log(item)
      if(!item.getFlag("D35E", "secret")) {
        item.setFlag("D35E", "secret", true);
      } else {
        item.unsetFlag("D35E", "secret");
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle conversion to loot. This function converts (and removes) all items
   * on the Loot Sheet into coins. Items are sold according to the normal rule
   * (50% or 100% for trade goods). Price is rounded. Unidentified items are
   * sold according to their unidentified price.
   *
   * @private
   */
  async _convertLoot(event) {
    event.preventDefault();
    //game.D35E.logger.log("Loot Sheet | _convertLoot")

    Dialog.confirm({
      title: game.i18n.localize("D35E.ls.convertLootTitle"),
      content: game.i18n.localize("D35E.ls.convertLootMessage"),
      yes: () => (async () => {
        let total = 0
        let deleteList = []
        this.actor.items.forEach( item  => {
              if (["weapon", "equipment", "consumable", "tool", "loot"].indexOf(item.type) >= 0) {
                let itemCost = LootSheetActions.getItemCost(item)
                if( item.system.subType !== "tradeGoods" ) {
                  itemCost = Math.round(itemCost / 2)
                }
                total += itemCost * item.system.quantity
                deleteList.push(item._id)
              }
            }
        );

        let funds = duplicate(this.actor.system.currency)
        funds.gp = Number(funds.gp)
        funds.gp += Math.round(total)

        await this.actor.update({ "system.currency": funds });
        await this.actor.deleteEmbeddedEntity("Item", deleteList)
      })(),
      no: () => {}
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle distribution of coins. This function splits all coins
   * into all characters/players that have "act" permissions.
   *
   * @private
   */
  async _distributeCoins(event) {
    event.preventDefault();
    //game.D35E.logger.log("Loot Sheet | Split Coins clicked");

    let actorData = this.actor.data
    let owners = [];
    //game.D35E.logger.log("Loot Sheet | actorData", actorData);
    // Calculate owners
    for (let u in actorData.permission) {
      if (u != "default" && actorData.permission[u] == 2) {
        //game.D35E.logger.log("Loot Sheet | u in actorData.permission", u);
        let player = game.users.get(u);
        if(player) {
          //game.D35E.logger.log("Loot Sheet | player", player);
          let actor = game.actors.get(player.character);
          //game.D35E.logger.log("Loot Sheet | actor", actor);
          if (actor !== null && (player.role === 1 || player.role === 2)) owners.push(actor);
        }
      }
    }

    //game.D35E.logger.log("Loot Sheet | owners", owners);
    if (owners.length === 0) return;

    // Calculate split of currency
    let currencySplit = duplicate(actorData.data.currency);
    let altCurrencySplit = duplicate(actorData.data.altCurrency);
    let currencyRemains = duplicate(actorData.data.currency);
    let altCurrencyRemains = duplicate(actorData.data.altCurrency);
    //game.D35E.logger.log("Loot Sheet | Currency data", currencySplit);
    for (let c in currencySplit) {
      if (owners.length) {
        currencySplit[c] = Math.floor(currencySplit[c] / owners.length);
        altCurrencySplit[c] = Math.floor(altCurrencySplit[c] / owners.length);
      } else {
        currencySplit[c] = 0
        altCurrencySplit[c] = 0
      }

      currencyRemains[c] -= currencySplit[c] * owners.length
      altCurrencyRemains[c] -= altCurrencySplit[c] * owners.length
    }

    let msg = [];
    for (let u of owners) {
      //game.D35E.logger.log("Loot Sheet | u of owners", u);
      if (u === null) continue;

      msg = [];
      let currency = u.system.currency;
      let altCurrency = u.system.altCurrency;
      let newCurrency = duplicate(u.system.currency);
      let newAltCurrency = duplicate(u.system.altCurrency);

      //game.D35E.logger.log("Loot Sheet | Current Currency", currency);
      for (let c in currency) {
        if (currencySplit[c]) {
          msg.push(game.i18n.format("D35E.ls.splitcoins", {quantity: currencySplit[c], currency: game.i18n.localize("D35E.ls." + c)}));
          newCurrency[c] = currency[c] + currencySplit[c];
        }
        if (altCurrencySplit[c]) {
          msg.push(game.i18n.format("D35E.ls.splitcoins", {quantity: altCurrencySplit[c], currency: game.i18n.localize("D35E.ls.wl_" + c)}));
          newAltCurrency[c] = altCurrency[c] + altCurrencySplit[c];
        }
      }

      // Increase currency for players
      await u.update({ 'system.currency': newCurrency, 'system.altCurrency': newAltCurrency });
      // Remove currency from loot actor.
      await this.actor.update({ "system.currency": currencyRemains, "system.altCurrency": altCurrencyRemains });

      // Create chat message for coins received
      if (msg.length != 0) {
        let message = game.i18n.format("D35E.ls.receives", {actor: u.data.name});
        message += msg.join(",");
        ChatMessage.create({
          user: game.user._id,
          speaker: {
            actor: this.actor,
            alias: this.actor.name
          },
          content: message
        });
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle cycling permissions
   * @private
   */
  async _onCyclePermissionProficiency(event) {
    event.preventDefault();
    //game.D35E.logger.log("Loot Sheet | this.actor.data.permission", this.actor.data.permission);

    let actorData = this.actor.data;

    let field = $(event.currentTarget).siblings('input[type="hidden"]');

    let level = parseFloat(field.val());
    if (typeof level === undefined) level = 0;

    const levels = [
      CONST.DOCUMENT_PERMISSION_LEVELS.NONE,
      CONST.DOCUMENT_PERMISSION_LEVELS.LIMITED,
      CONST.DOCUMENT_PERMISSION_LEVELS.OWNER
    ];

    let idx = levels.indexOf(level),
        newLevel = levels[(idx === levels.length - 1) ? 0 : idx + 1];


    let playerId = field[0].name;

    let permissions = duplicate(this.actor.ownership)
    permissions[playerId] = newLevel;
    await this.actor.update( { ownership: permissions }, {diff: false});
    this._onSubmit(event);
  }


  async _onBatchPermissionChange(event) {
    event.preventDefault();
    let newLevel = Number($(event.currentTarget).attr("data-perm"))
    let permissions = duplicate(this.actor.data.permission)
    game.users.forEach((u) => {
      if (!u.isGM) { permissions[u.id] = newLevel }
    });
    await this.actor.update( { ownership: permissions }, {diff: false});
    this._onSubmit(event);
  }

  /* -------------------------------------------- */

  /**
   * Organize and classify Items for Loot NPC sheets
   * @private
   */
  _prepareItems(actorData) {
    game.D35E.logger.log("Loot Sheet | _prepareItems")
    // Actions
    const itemGroups = {
      weapons: {
        label: game.i18n.localize("D35E.ls.weapons"),
        items: [],
        type: "weapon"
      },
      equipment: {
        label: game.i18n.localize("D35E.ls.equipment"),
        items: [],
        type: "equipment"
      },
      consumables: {
        label: game.i18n.localize("D35E.ls.consumables"),
        items: [],
        type: "consumable"
      },
      loot: {
        label: game.i18n.localize("D35E.ls.lootType"),
        items: [],
        type: "loot"
      },

    };

    actorData.actor.visible = this.actor.visible

    if (!this.actor.visible) {
      actorData.actor.itemGroups = itemGroups;
      return;
    }

    //game.D35E.logger.log("Loot Sheet | Prepare Items");

    // Iterate through items, allocating to containers
    this.#splitItemsToGroups(actorData, itemGroups);

    // Assign and return
    actorData.actor.itemGroups = itemGroups;
  }


  #splitItemsToGroups(actorData, itemGroups = null) {
    if (itemGroups == null) {
      itemGroups = {
        weapons: {
          label: game.i18n.localize("D35E.ls.weapons"),
          items: [],
          type: "weapon"
        },
        equipment: {
          label: game.i18n.localize("D35E.ls.equipment"),
          items: [],
          type: "equipment"
        },
        consumables: {
          label: game.i18n.localize("D35E.ls.consumables"),
          items: [],
          type: "consumable"
        },
        loot: {
          label: game.i18n.localize("D35E.ls.lootType"),
          items: [],
          type: "loot"
        },
      };
    }
    for (let i of actorData.items) {
      i.img = i.img || DEFAULT_TOKEN;
      i.showPrice = this.getLootPrice(i)
      i.showName = this.getLootName(i)

      if (!game.user.isGM && i.flags.d35elootsheetnpc && i.flags.d35elootsheetnpc.secret) {
        continue;
      }

      // Features
      if (i.type === "weapon") itemGroups.weapons.items.push(i);
      else if (i.type === "equipment") itemGroups.equipment.items.push(i);
      else if (i.type === "consumable") itemGroups.consumables.items.push(i);
      else if (i.type === "tool") itemGroups.tools.items.push(i);
      else if (["container", "backpack"].includes(i.type)) itemGroups.containers.items.push(i);
      else if (i.type === "loot") itemGroups.loot.items.push(i);
      else {
        continue
      }
    }
    return itemGroups;
  }

  /* -------------------------------------------- */


  /**
   * Get the font-awesome icon used to display the permission level.
   * @private
   */
  _getPermissionIcon(level) {
    const icons = {
      0: '<i class="far fa-circle"></i>',
      1: '<i class="fas fa-eye"></i>',
      3: '<i class="fas fa-check"></i>'
    };
    return icons[level];
  }

  /* -------------------------------------------- */

  /**
   * Get the font-awesome icon used to display the permission level.
   * @private
   */
  _getPermissionDescription(level) {
    //game.D35E.logger.log("Loot Sheet | _getPermissionDescription")
    const description = {
      0: game.i18n.localize("D35E.ls.permissionNoaccess"),
      1: game.i18n.localize("D35E.ls.permissionLimited"),
      3: game.i18n.localize("D35E.ls.permissionObserver"),
    };
    return description[level];
  }

  /* -------------------------------------------- */

  /**
   * Prepares GM settings to be rendered by the loot sheet.
   * @private
   */
  _prepareGMSettings(actorData) {
    //game.D35E.logger.log("Loot Sheet | _prepareGMSettings")

    const players = [],
        owners = [];
    let users = game.users.values();

    //game.D35E.logger.log("Loot Sheet _prepareGMSettings | actorData.permission", actorData.permission);

    for (let u of users) {
      game.D35E.logger.log("Loot Sheet | Checking user " + u?.name, u);

      //check if the user is a player
      if (u.role === 1 || u.role === 2) {

        // get the name of the primary actor for a player
        const actor = u.character;
        game.D35E.logger.log("Loot Sheet | Checking actor", actor);

        if (actor) {

          u.actor = actor.name;
          u.actorId = actor._id;
          u.playerId = u._id;

          //Check if there are default permissions to the actor
          if (typeof actorData.permission.default !== "undefined") {

            game.D35E.logger.log("Loot Sheet | default permissions", actorData.permission.default);

            u.lootPermission = actorData.permission.default;

            if (actorData.permission.default === 2 && !owners.includes(actor.data._id)) {

              owners.push(actor._id);
            }

          } else {

            u.lootPermission = 0;
            game.D35E.logger.log("Loot Sheet | assigning 0 permission to hidden field");
          }

          //if the player has some form of permission to the object update the actorData
          if (u.data._id in actorData.permission && !owners.includes(actor._id)) {
            game.D35E.logger.log("Loot Sheet | Found individual actor permission");

            u.lootPermission = actorData.permission[u._id];
            game.D35E.logger.log("Loot Sheet | assigning " + actorData.permission[u._id] + " permission to hidden field");

            if (actorData.permission[u._id] === 3) {
              owners.push(actor._id);
            }
          }

          //Set icons and permission texts for html
          game.D35E.logger.log("Loot Sheet | lootPermission", u.lootPermission);
          u.icon = this._getPermissionIcon(u.lootPermission);
          u.lootPermissionDescription = this._getPermissionDescription(u.lootPermission);
          players.push(u);
        }
      }
    }

    // calculate the split of coins between all owners of the sheet.
    let currencySplit = duplicate(actorData.system.currency);
    let altCurrencySplit = duplicate(actorData.system.altCurrency);
    for (let c in currencySplit) {
      if (owners.length) {
        currencySplit[c] = Math.floor(currencySplit[c] / owners.length) + " / " + Math.floor(altCurrencySplit[c] / owners.length)
      } else {
        currencySplit[c] = "0"
      }
    }

    let loot = {}
    loot.warning = actorData.permission.default != 0
    loot.players = players;
    loot.ownerCount = owners.length;
    loot.currency = currencySplit;
    loot.altCurrency = altCurrencySplit;
    actorData.flags.loot = loot;
  }

  async _onDropActor(event) {
    ui.notifications.error(game.i18n.localize("ERROR.lsInvalidDrop"));
  }

  async _onDropItem(event) {
    event.preventDefault();

    // Try to extract the data
    let data;
    let extraData = {};
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
      if (data.type !== "Item") return;
    } catch (err) {
      return false;
    }
    game.D35E.logger.log(data)
    let item = await fromUuid(data.uuid)
    // Item is from compendium
    if(data.uuid.indexOf("Actor.") === -1) {
      if (game.user.isGM) {
        return super._onDropItem(event, data);
      }
      else {
        ui.notifications.error(game.i18n.localize("ERROR.lsInvalidDrop"));
      }
    }
    // Item from an actor
    let targetActor = this.token ? canvas.tokens.get(this.token.id).actor : this.actor;
    if (item.actor)
      LootSheetActions.dropOrSellItem(item.actor, targetActor, item.actor, item._id)

  }

}
