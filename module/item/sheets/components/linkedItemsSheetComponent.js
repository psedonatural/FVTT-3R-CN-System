import { ItemSheetComponent } from "./itemSheetComponent.js";

export class LinkedItemsSheetComponent extends ItemSheetComponent {
  prepareSheetData(sheetData) {
    if ((getProperty(this.sheet.item.system, `linkedItems`) || []) !== []) {
      sheetData.linkedItems = [];
      let _likedItems = getProperty(this.sheet.item.system, `linkedItems`) || [];
      _likedItems.forEach((e) => {
        //e.incorrect ===
        sheetData.linkedItems.push(e);
      });
    }
  }

  registerTab(sheetData) {
    sheetData.registeredTabs.push({
      id: "links",
      name: "Links",
      sheet: "systems/D35E/templates/items/parts/item-links.html",
    });
  }

  activateListeners(html) {
    html.find('div[data-tab="links"]').on("drop", this.#onDrop.bind(this, "link"));
    html.find('div[data-tab="links"] .item-delete').click(this.#onLinkedItemDelete.bind(this));
  }

  /**
   * Handle deleting an existing Enhancement item
   * @param {Event} event   The originating click event
   * @private
   */
  async #onLinkedItemDelete(event) {
    event.preventDefault();

    const button = event.currentTarget;
    if (button.disabled) return;

    const li = event.currentTarget.closest(".item");
    if (game.keyboard.isModifierActive("Shift")) {
      const updateData = {};
      let _linkedItems = duplicate(getProperty(this.sheet.item.system, `linkedItems`) || []);
      _linkedItems = _linkedItems.filter(function (obj) {
        return obj.itemId !== li.dataset.itemId || obj.packId !== li.dataset.packId;
      });
      updateData[`system.linkedItems`] = _linkedItems;
      this.sheet.item.update(updateData);
    } else {
      button.disabled = true;

      const msg = `<p>${game.i18n.localize("D35E.DeleteItemConfirmation")}</p>`;
      Dialog.confirm({
        title: game.i18n.localize("D35E.DeleteItem"),
        content: msg,
        yes: () => {
          const updateData = {};
          let _linkedItems = duplicate(getProperty(this.sheet.item.system, `linkedItems`) || []);
          _linkedItems = _linkedItems.filter(function (obj) {
            return obj.itemId !== li.dataset.itemId || obj.packId !== li.dataset.packId;
          });
          updateData[`system.linkedItems`] = _linkedItems;
          this.sheet.item.update(updateData);
          button.disabled = false;
        },
        no: () => (button.disabled = false),
      });
    }
  }

  async #importItem(itemData, itemType, importType) {
    if (itemType !== "compendium") {
      return ui.notifications.warn(game.i18n.localize("D35E.ResourceNeedDropFromCompendium"));
    }
    await this.sheet.item.addLinkedItemFromData(itemData);
  }

  async #onDrop(importType, event) {
    event.preventDefault();
    let droppedData;
    try {
      droppedData = JSON.parse(event.originalEvent.dataTransfer.getData("text/plain"));
      if (droppedData.type !== "Item") return;
    } catch (err) {
      return false;
    }

    let dataType = "";

    if (game?.release?.generation >= 10 && droppedData.uuid && droppedData.type === "Item") {
      droppedData = fromUuidSync(droppedData.uuid);
      droppedData.type = "Item";
    }
    if (droppedData.type === "Item") {
      let itemData = {};
      // Case 1 - Import from a Compendium pack
      if (droppedData.pack) {
        dataType = "compendium";
        const pack = game.packs.find((p) => p.metadata.id === droppedData.pack);
        const packItem = await pack.getDocument(droppedData._id);
        if (packItem != null) itemData = packItem.data;
      }

      // Case 2 - Data explicitly provided
      else if (droppedData.data) {
        dataType = "data";
        itemData = droppedData.data;
      }

      // Case 3 - Import from World entity
      else {
        dataType = "world";
        itemData = fromUuidSync(data.uuid);
      }
      return this.#importItem(itemData, dataType, importType);
    }
  }
}
