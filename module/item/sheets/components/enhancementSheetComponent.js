import { ItemEnhancementHelper } from "../../helpers/itemEnhancementHelper.js";
import { ItemSheetComponent } from "./itemSheetComponent.js";
import { Item35E } from "../../entity.js";

export class EnhancementSheetComponent extends ItemSheetComponent {
  constructor(sheet) {
    super(sheet);
    this.sheet.ehnancementItemMap = new Map();
  }

  prepareSheetData(sheetData) {
    if (this.sheet.item.type === "equipment" || this.sheet.item.type === "weapon") {
      sheetData.enhancements = [];
      sheetData.enhancementsBase = [];
      sheetData.enhancementsFromSpell = [];
      sheetData.enhancementsFromBuff = [];
      let _enhancements = getProperty(this.sheet.item.system, `enhancements.items`) || [];
      _enhancements.forEach((e) => {
        let item = ItemEnhancementHelper.getEnhancementItemFromData(e, this.sheet.item.actor, this.sheet.item.isOwner);
        this.sheet.ehnancementItemMap.set(item.tag, item);
        e.data = ItemEnhancementHelper.getEnhancementData(e);
        e.hasAction = item.hasAction || item.isCharged;
        e.incorrect = !(
          (e.data.enhancementType === "weapon" && this.sheet.item.type === "weapon") ||
          (e.data.enhancementType === "armor" && this.sheet.item.type === "equipment") ||
          e.data.enhancementType === "misc"
        );
        e.hasUses = e.data.uses && e.data.uses.max > 0;
        e.calcPrice =
          e.data.enhIncrease !== undefined && e.data.enhIncrease !== null && e.data.enhIncrease > 0
            ? `+${e.data.enhIncrease}`
            : `${e.data.price}`;
        e.isCharged = ["day", "week", "charges", "encounter"].includes(getProperty(e, "data.uses.per"));
        e.tag = item.tag;
        sheetData.enhancements.push(e);
        if (e.data.isFromSpell) sheetData.enhancementsFromSpell.push(e);
        else if (e.data.isFromBuff) sheetData.enhancementsFromBuff.push(e);
        else sheetData.enhancementsBase.push(e);
      });
      sheetData.hasEnhancements = true;

      sheetData.lightMagical = (this.sheet.item.system.enh || 0) > 0 && (this.sheet.item.system.enh || 0) < 6;
      sheetData.veryMagical = (this.sheet.item.system.enh || 0) > 5;
    }
  }

  registerTab(sheetData) {
    sheetData.registeredTabs.push({
      id: "enhancements",
      name: "Enhancements",
      sheet: "systems/D35E/templates/items/parts/item-enhancement.html",
    });
  }

  activateListeners(html) {
    // Quick Item Action control
    html.find('div[data-tab="enhancements"] .item-actions a').mouseup((ev) => this.#quickItemActionControl(ev));
    html.find('div[data-tab="enhancements"]').on("drop", this.#onDrop.bind(this, "enh"));
    html.find('div[data-tab="enhancements"] .item-delete').click(this.#onEnhItemDelete.bind(this));
    html
      .find("div[data-tab='enhancements'] .item-detail.item-uses input.uses")
      .off("change")
      .change(this.#setEnhUses.bind(this));
    html
      .find("div[data-tab='enhancements'] .item-detail.item-uses input.maxuses")
      .off("change")
      .change(this.#setEnhMaxUses.bind(this));
    html
      .find("div[data-tab='enhancements'] .item-detail.item-per-use input[type='text']:not(:disabled)")
      .off("change")
      .change(this.#setEnhPerUse.bind(this));
    html
      .find("div[data-tab='enhancements'] .item-detail.item-enh input[type='text']:not(:disabled)")
      .off("change")
      .change(this.#setEnhValue.bind(this));
    html
      .find("div[data-tab='enhancements'] .item-detail.item-cl input[type='text']:not(:disabled)")
      .off("change")
      .change(this.#setEnhCLValue.bind(this));
    html.find('div[data-tab="enhancements"] .item-edit').click(this.#onEnhancementItemEdit.bind(this));
    html.find('div[data-tab="enhancements"] .item .item-image').click((event) => this.#onEnhRoll(event));
    html.find(".item .enh-item h4").click((event) => this.#onEnhItemSummary(event));
    html.find("button[name='update-item-name']").click((event) => this.#onEnhUpdateName(event));
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
    let dropType = droppedData.type;
    if (game?.release?.generation >= 10 && droppedData.uuid && droppedData.type === "Item") {
      return this.#importItem(await fromUuid(droppedData.uuid));
    }
    if (dropType === "Item") {
      let itemData = {};
      // Case 1 - Import from a Compendium pack
      if (droppedData.pack) {
        dataType = "compendium";
        const pack = game.packs.find((p) => p.metadata.id === droppedData.pack);
        const packItem = await pack.getDocument(droppedData._id);
        if (packItem != null) itemData = packItem; // itemData.type = "enhancement"
      } else if (droppedData.system) {
        itemData = await fromUuid(droppedData.uuid); // itemData.type = "Item"
      }
      return this.#importItem(itemData);
    }
  }
  async #importItem(itemData) {
    if (itemData.type === "enhancement") {
      await this.sheet.item.enhancements.addEnhancementFromData(itemData); // update(updateData);
    }
    if (itemData.type === "spell") {
      this.#createEnhancementSpellDialog(itemData);
    }
    if (itemData.type === "buff") {
      await this.sheet.item.enhancements.createEnhancementBuff(itemData);
    }
  }

  #createEnhancementSpellDialog(itemData) {
    new Dialog({
      title: game.i18n.localize("D35E.CreateEnhForSpell").format(itemData.name),
      content: game.i18n.localize("D35E.CreateEnhForSpellD").format(itemData.name),
      buttons: {
        potion: {
          icon: '<i class="fas fa-prescription-bottle"></i>',
          label: "50 Charges",
          callback: () => this.sheet.item.enhancements.createEnhancementSpell(itemData, "charges"),
        },
        scroll: {
          icon: '<i class="fas fa-scroll"></i>',
          label: "Per Day (Command Word)",
          callback: () => this.sheet.item.enhancements.createEnhancementSpell(itemData, "command"),
        },
        wand: {
          icon: '<i class="fas fa-magic"></i>',
          label: "Per Day (Use)",
          callback: () => this.sheet.item.enhancements.createEnhancementSpell(itemData, "use"),
        },
      },
      default: "command",
    }).render(true);
  }

  /**
   * Handle deleting an existing Enhancement item
   * @param {Event} event   The originating click event
   * @private
   */
  async #onEnhItemDelete(event) {
    event.preventDefault();

    const button = event.currentTarget;
    if (button.disabled) return;

    const li = event.currentTarget.closest(".item");
    if (game.keyboard.isModifierActive("Shift")) {
      await this.sheet.item.enhancements.deleteEnhancement(li.dataset.itemId);
    } else {
      button.disabled = true;

      const msg = `<p>${game.i18n.localize("D35E.DeleteItemConfirmation")}</p>`;
      Dialog.confirm({
        title: game.i18n.localize("D35E.DeleteItem"),
        content: msg,
        yes: async () => {
          await this.sheet.item.enhancements.deleteEnhancement(li.dataset.itemId);
          button.disabled = false;
        },
        no: () => (button.disabled = false),
      });
    }
  }

  async #setEnhUses(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const value = Number(event.currentTarget.value);
    await this.sheet.item.enhancements.updateEnhancement(itemId, { uses: { value: value } });
  }

  async #setEnhMaxUses(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const value = Number(event.currentTarget.value);
    await this.sheet.item.enhancements.updateEnhancement(itemId, { uses: { max: value, maxFormula: `${value}` } });
  }

  async #setEnhPerUse(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const value = Number(event.currentTarget.value);
    await this.sheet.item.enhancements.updateEnhancement(itemId, { uses: { chargesPerUse: value } });
  }

  async #setEnhCLValue(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const value = Number(event.currentTarget.value);
    await this.sheet.item.enhancements.updateEnhancement(itemId, { baseCl: value });
  }

  async #setEnhValue(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const value = Number(event.currentTarget.value);
    await this.sheet.item.enhancements.updateEnhancement(itemId, { enh: value });
  }

  #onEnhancementItemEdit(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const item = this.sheet.ehnancementItemMap.get(li.dataset.itemId);
    item.sheet.render(true);
  }

  /**
   * Handle rolling of an item from the Actor sheet, obtaining the Item instance and dispatching to it's roll method
   * @private
   */
  async #onEnhRoll(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    //const item = this.sheet.actor.getOwnedItem(itemId);
    let item = await this.sheet.item.enhancements.getEnhancementItem(itemId);
    return item.roll({}, this.sheet.item.actor);
  }

  async #onEnhUpdateName(event) {
    event.preventDefault();
    await this.sheet.item.enhancements.updateBaseItemName();
  }

  async #quickItemActionControl(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    //const item = this.sheet.actor.getOwnedItem(itemId);
    let item = await this.sheet.item.enhancements.getEnhancementItem(itemId);
    // Quick Attack
    if (a.classList.contains("item-attack")) {
      await this.sheet.item.enhancements.useEnhancementItem(item);
    }
  }

  async #onEnhItemSummary(event) {
    event.preventDefault();
    let li = $(event.currentTarget).parents(".item-box"),
      item = this.sheet.ehnancementItemMap.get(li.attr("data-item-id")),
      chatData = await item.getChatData({ secrets: this.sheet.actor ? this.sheet.actor.isOwner : false });

    // Toggle summary
    if (li.hasClass("expanded")) {
      let summary = li.children(".item-summary");
      summary.slideUp(200, () => summary.remove());
    } else {
      let div = $(`<div class="item-summary">${chatData.description.value}</div>`);
      let props = $(`<div class="item-properties"></div>`);
      chatData.properties.forEach((p) => props.append(`<span class="tag">${p}</span>`));
      div.append(props);
      li.append(div.hide());
      div.slideDown(200);
    }
    li.toggleClass("expanded");
  }
}
