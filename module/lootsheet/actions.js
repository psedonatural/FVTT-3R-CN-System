export class LootSheetActions {
  static QUANTITY_ALL = -1;

  static errorMessageToActor(source, message) {
    ui.notifications.error(message, { actor: source.name });
  }

  /**
   * Displays a message into the chat log
   */
  static chatMessage(speaker, owner, message, item) {
    if (game.settings.get("D35E", "buyChat")) {
      if (item) {
        message = `<div class="D35E chat-card item-card" data-actor-id="${owner._id}" data-item-id="${item._id}">
                    <header class="card-header flexrow">
                        <img src="${item.img}" title="${item.showName}" width="36" height="36">
                        <h3 class="item-name">${item.showName}</h3>
                    </header>
                    <div class="card-content"><p>${message}</p></div></div>`;
      } else {
        message = `<div class="D35E chat-card item-card" data-actor-id="${owner._id}">
                    <div class="card-content"><p>${message}</p></div></div>`;
      }
      ChatMessage.create({
        user: game.user._id,
        speaker: {
          actor: speaker,
          alias: speaker.name,
        },
        content: message,
      });
    }
  }
  /**
   * Moves an item from a source actor to a destination actor
   */
  static async moveItem(source, destination, itemId, quantity = 1) {
    //game.D35E.logger.log("Loot Sheet | moveItem")
    let item = source.items.get(itemId);

    if (!item) {
      ui.notifications.warn(game.i18n.format("ERROR.lsInvalidMove", { actor: source.name }));
      game.D35E.logger.log(source, destination, itemId);
      return null;
    }

    if (!quantity) {
      quantity = item.system.quantity;
    }

    // Move all items if we select more than the quantity.
    if (item.system.quantity < quantity) {
      quantity = item.system.quantity;
    }

    let newItem = item.toObject(false);
    const update = {
      _id: itemId,
      "system.quantity": item.system.quantity - quantity,
    };

    if (update["system.quantity"] === 0) {
      await source.deleteEmbeddedEntity("Item", itemId);
    } else {
      await source.updateEmbeddedEntity("Item", update);
    }

    newItem.system.quantity = quantity;
    await destination.createEmbeddedEntity("Item", newItem, { keepWeight: true });
    newItem.showName = LootSheetActions.getItemName(newItem);
    newItem.showCost = LootSheetActions.getItemCost(newItem);

    return {
      item: newItem,
      quantity: quantity,
    };
  }

  /**
   * Moves coins from a source actor to a destination actor
   */
  static async moveCoins(source, destination, itemId, quantity) {
    if (itemId.startsWith("wl_")) {
      itemId = itemId.substring(3);

      // Move all items if we select more than the quantity.
      let coins = source.system.altCurrency[itemId];
      if (coins < quantity) {
        quantity = coins;
      }

      if (quantity == 0) return null;

      const srcUpdate = { data: { altCurrency: {} } };
      srcUpdate.altCurrency[itemId] = source.system.altCurrency[itemId] - quantity;
      await source.update(srcUpdate);

      const dstUpdate = { data: { altCurrency: {} } };
      dstUpdate.altCurrency[itemId] = destination.system.altCurrency[itemId] + quantity;
      await destination.update(dstUpdate);
    } else {
      // Move all items if we select more than the quantity.
      let coins = source.system.currency[itemId];
      if (coins < quantity) {
        quantity = coins;
      }

      if (quantity == 0) return null;

      const srcUpdate = { data: { currency: {} } };
      srcUpdate.currency[itemId] = source.system.currency[itemId] - quantity;
      await source.update(srcUpdate);

      const dstUpdate = { data: { currency: {} } };
      dstUpdate.currency[itemId] = destination.system.currency[itemId] + quantity;
      await destination.update(dstUpdate);
    }

    return {
      quantity: quantity,
    };
  }

  /**
   * A looter (target actor) takes an item from a container (source actor)
   */
  static async lootItem(speaker, container, looter, itemId, quantity) {
    game.D35E.logger.log("Loot Sheet | LootSheetActions.lootItem");

    if (itemId.length == 2 || itemId.startsWith("wl_")) {
      let moved = await LootSheetActions.moveCoins(container, looter, itemId, quantity);

      if (moved) {
        LootSheetActions.chatMessage(
          speaker,
          looter,
          game.i18n.format("D35E.ls.chatLootCoins", {
            buyer: looter.name,
            quantity: moved.quantity,
            currency: game.i18n.localize("D35E.ls." + itemId),
          })
        );
      }
    } else {
      let moved = await LootSheetActions.moveItem(container, looter, itemId, quantity);
      if (!moved) return;

      LootSheetActions.chatMessage(
        speaker,
        looter,
        game.i18n.format("D35E.ls.chatLoot", {
          buyer: looter.name,
          quantity: moved.quantity,
          name: moved.item.showName,
        }),
        moved.item
      );
    }
  }

  /**
   * A giver (source actor) drops or sells a item to a merchant (target actor)
   */
  static async dropOrSellItem(speaker, merchant, giver, itemId) {
    //game.D35E.logger.log("Loot Sheet | Drop or sell item")
    let messageKey = "";
    if (merchant.getFlag("D35E", "lootsheettype") === "Merchant") {
      await this.transaction(giver, giver, merchant, itemId, LootSheetActions.QUANTITY_ALL, true, true);
    } else {
      let moved = await LootSheetActions.moveItem(giver, merchant, itemId);
      if (!moved) return;
      messageKey = "D35E.ls.chatDrop";
      LootSheetActions.chatMessage(
        speaker,
        giver,
        game.i18n.format(messageKey, {
          seller: giver.name,
          quantity: moved.quantity,
          price: cost * moved.quantity,
          item: moved.item.showName,
          container: merchant.name,
        }),
        moved.item
      );
    }
  }

  /**
   * Quick function to do a trasaction between a seller (source) and a buyer (target)
   */
  static async transaction(
    speaker,
    seller,
    buyer,
    itemId,
    quantity,
    buyerUnlimitedFunds = false,
    isPlayerSelling = false
  ) {
    game.D35E.logger.log("Loot Sheet | Transaction");

    let sellItem = seller.items.get(itemId);

    // If the buyer attempts to buy more then what's in stock, buy all the stock.
    if (sellItem.system.quantity < quantity || quantity === LootSheetActions.QUANTITY_ALL) {
      quantity = sellItem.system.quantity;
    }

    let sellerModifier = isPlayerSelling
      ? buyer.getFlag("D35E", "priceModifierBuy")
      : seller.getFlag("D35E", "priceModifier");
    if (!sellerModifier) sellerModifier = 1.0;

    let itemCost = LootSheetActions.getItemCost(sellItem);
    itemCost = Math.round(itemCost * sellerModifier * 100) / 100;
    itemCost *= quantity;
    let buyerFunds = duplicate(buyer.system.currency);
    let buyerFundsAlt = duplicate(buyer.system.altCurrency);
    const conversionRate = {
      pp: 10,
      gp: 1,
      sp: 0.1,
      cp: 0.01,
    };
    let buyerFundsAsGold = 0;
    let buyerAltFundsAsGold = 0;

    for (let currency in buyerFunds) {
      buyerFundsAsGold += (buyerFunds[currency] || 0) * conversionRate[currency];
    }

    for (let currency in buyerFundsAlt) {
      buyerAltFundsAsGold += (buyerFundsAlt[currency] || 0) * conversionRate[currency];
    }
    game.D35E.logger.log(buyerFunds, buyerFundsAlt);
    if (itemCost > buyerFundsAsGold + buyerAltFundsAsGold && !buyerUnlimitedFunds) {
      LootSheetActions.errorMessageToActor(buyer, game.i18n.localize("ERROR.lsNotEnougFunds"));
      return;
    }

    // Update buyer's gold

    // make sure that coins is a number (not a float)
    // highest amount is 2 iterations
    let i = 0;
    while (!Number.isInteger(itemCost) && i < 2) {
      itemCost *= 10;
      for (const key in conversionRate) {
        conversionRate[key] *= 10;
      }
      i++;
    }

    const originalCost = itemCost;
    if (!buyerUnlimitedFunds) {
      itemCost = Math.round(itemCost);
      for (const key in conversionRate) {
        conversionRate[key] = Math.round(conversionRate[key]);
      }
      const DEBUG = true;
      if (DEBUG) game.D35E.logger.log("Loot Sheet | Conversion rates: ");
      if (DEBUG) game.D35E.logger.log(conversionRate);

      // remove funds from lowest currency to highest
      let remainingFunds = 0;
      for (const currency of Object.keys(conversionRate).reverse()) {
        //game.D35E.logger.log("Rate: " + conversionRate[currency])
        if (conversionRate[currency] < 1) {
          const ratio = conversionRate[currency] ? 1 / conversionRate[currency] : 0;
          const value = conversionRate[currency] ? Math.min(itemCost, Math.floor(buyerFunds[currency] / ratio)) : 0;
          if (DEBUG) game.D35E.logger.log("Loot Sheet | BuyerFunds " + currency + ": " + buyerFunds[currency]);
          if (DEBUG) game.D35E.logger.log("Loot Sheet | Ratio: " + ratio);
          if (DEBUG) game.D35E.logger.log("Loot Sheet | Value: " + value);
          itemCost -= value;
          buyerFunds[currency] -= value * ratio;
        } else {
          const value = Math.min(itemCost, Math.floor(buyerFunds[currency] * conversionRate[currency]));
          itemCost -= value;
          const lost = Math.ceil(value / conversionRate[currency]);
          buyerFunds[currency] -= lost;
          remainingFunds += lost * conversionRate[currency] - value;
          if (DEBUG) game.D35E.logger.log("Loot Sheet | Value+: " + value);
          if (DEBUG) game.D35E.logger.log("Loot Sheet | Lost+: " + lost);
          if (DEBUG) game.D35E.logger.log("Loot Sheet | remainingFunds+: " + remainingFunds);
        }
      }

      for (const currency of Object.keys(conversionRate).reverse()) {
        //game.D35E.logger.log("Rate: " + conversionRate[currency])
        if (conversionRate[currency] < 1) {
          const ratio = conversionRate[currency] ? 1 / conversionRate[currency] : 0;
          const value = conversionRate[currency] ? Math.min(itemCost, Math.floor(buyerFunds[currency] / ratio)) : 0;
          if (DEBUG) game.D35E.logger.log("Loot Sheet | BuyerFunds " + currency + ": " + buyerFunds[currency]);
          if (DEBUG) game.D35E.logger.log("Loot Sheet | Ratio: " + ratio);
          if (DEBUG) game.D35E.logger.log("Loot Sheet | Value: " + value);
          itemCost -= value;
          buyerFundsAlt[currency] -= value * ratio;
        } else {
          const value = Math.min(itemCost, Math.floor(buyerFundsAlt[currency] * conversionRate[currency]));
          itemCost -= value;
          const lost = Math.ceil(value / conversionRate[currency]);
          buyerFundsAlt[currency] -= lost;
          remainingFunds += lost * conversionRate[currency] - value;
          if (DEBUG) game.D35E.logger.log("Loot Sheet | Value+: " + value);
          if (DEBUG) game.D35E.logger.log("Loot Sheet | Lost+: " + lost);
          if (DEBUG) game.D35E.logger.log("Loot Sheet | remainingFunds+: " + remainingFunds);
        }
      }

      if (itemCost > 0) {
        LootSheetActions.errorMessageToActor(buyer, game.i18n.localize("ERROR.lsCurrencyConversionFailed"));
        return ui.notifications.error(game.i18n.localize("ERROR.lsCurrencyConversionFailed"));
      }

      game.D35E.logger.log("remainingFunds: " + remainingFunds);

      if (remainingFunds > 0) {
        for (const currency of Object.keys(conversionRate)) {
          if (conversionRate[currency] <= remainingFunds) {
            buyerFunds[currency] += Math.floor(remainingFunds / conversionRate[currency]);
            remainingFunds = remainingFunds % conversionRate[currency];
            if (DEBUG) game.D35E.logger.log("Loot Sheet | buyerFunds " + currency + ": " + buyerFunds[currency]);
            if (DEBUG) game.D35E.logger.log("Loot Sheet | remainingFunds: " + remainingFunds);
          }
        }
      }

      if (remainingFunds > 0) {
        LootSheetActions.errorMessageToActor(buyer, game.i18n.localize("ERROR.lsCurrencyConversionFailed"));
        return ui.notifications.error(game.i18n.localize("ERROR.lsCurrencyConversionFailed"));
      }

      if (DEBUG) game.D35E.logger.log(buyerFunds);

      await buyer.update({
        "data.currency": buyerFunds,
        "data.altCurrency": buyerFundsAlt,
      });
    }

    let sellerFunds = duplicate(seller.system.currency);
    if (sellerFunds && originalCost > 0) {
      let currencyKey = "gp";
      for (const currency of Object.keys(conversionRate).reverse()) {
        if (conversionRate[currency] === 1) currencyKey = currency;
      }
      sellerFunds[currencyKey] += originalCost;
      await seller.update({ "data.currency": sellerFunds });
      await seller.update({ "data.currency": sellerFunds }); // 2x required or it will not be stored? WHY???
    }
    let moved = await LootSheetActions.moveItem(seller, buyer, itemId, quantity);

    if (moved) {
      let priceString = LootSheetActions.getPriceAsString(originalCost, conversionRate);
      LootSheetActions.chatMessage(
        speaker,
        buyer,
        game.i18n.format("D35E.ls.chatPurchase", {
          buyer: buyer.name,
          quantity: quantity,
          name: moved.item.showName,
          cost: priceString,
        }),
        moved.item
      );
    }
  }

  static getPriceAsString(originalCost, conversionRate) {
    let cost = originalCost;
    let priceString = [];
    let rateKeys = Object.keys(conversionRate).reverse().reverse();
    for (let rate of rateKeys) {
      let rateConversion = conversionRate[rate];
      if (rateConversion > 0) {
        let ratePart = Math.floor(cost / rateConversion);
        if (ratePart > 0) {
          cost -= ratePart * rateConversion;
          priceString.push(`${ratePart} ${game.i18n.localize("D35E.ls." + rate)}`);
        }
      } else {
        if (cost > 0) {
          priceString.push(`${cost} ${game.i18n.localize("D35E.ls." + rate)}`);
        }
      }
    }
    return priceString.join(" ");
  }
  /**
   * Actor gives something to another actor
   */
  static async giveItem(speaker, giverId, receiverId, itemId, quantity) {
    quantity = Number(quantity); // convert to number (just in case)

    let giver = game.actors.get(giverId);
    let receiver = game.actors.get(receiverId);

    let giverUser = null;
    game.users.forEach((u) => {
      if (u.character && u.character._id === giverId) {
        giverUser = u;
      }
    });

    if (quantity <= 0) {
      return;
    }

    if (giver && receiver) {
      let moved = await LootSheetActions.moveItem(giver, receiver, itemId, quantity);
      if (moved) {
        LootSheetActions.chatMessage(
          speaker,
          receiver,
          game.i18n.format("D35E.ls.chatGive", {
            giver: giver.name,
            receiver: receiver.name,
            quantity: quantity,
            item: moved.item.showName,
          }),
          moved.item
        );
      }
    } else {
      game.D35E.logger.log("Loot Sheet | Give operation failed because actors (giver or receiver) couldn't be found!");
    }
  }

  /**
   * Returns the unidentified name (if unidentified and specified) or the name
   */
  static getItemName(_item) {
    let item = _item;
    if (!item) return "";
    else
      return item.system.identified ||
        !item.system.unidentified ||
        !item.system.unidentified.name ||
        item.system.unidentified.name.length == 0
        ? item.name
        : item.system.unidentified.name;
  }

  /**
   * Returns the unidentified cost (if unidentified and specified) or the cost
   */
  static getItemCost(_item) {
    let item = _item;
    if (!item) return 0;
    else
      return Number(
        item.system.identified || item.system.unidentified == null ? item.system.price : item.system.unidentified.price
      );
  }
}
