
import { LogHelper } from "../../../helpers/LogHelper.js";
import {CompendiumBrowser} from '../../../apps/compendium-browser.js';

export class ItemDrawerHelper {
  constructor(sheet) {
    this.sheet = sheet;
  }

  #filterIndexedItems(indexedItem, entityType, type, subtype) {
    //if (item.system.uniqueId) return false
    if (entityType === "spells" && indexedItem.type !== type) return false;
    if (
      entityType === "items" &&
      type.split(",").indexOf(indexedItem.type) !== -1 &&
      (indexedItem?.system?.index?.subType === subtype || subtype === "-")
    )
      return true;
    if (entityType === "feats")
      if (indexedItem.type === type && indexedItem?.system?.index?.subType === subtype && !indexedItem?.system?.index?.uniqueId)
      return true;
    if (entityType === "buffs" && indexedItem.type !== type) return false;
    if (entityType === "enhancements" && indexedItem.type !== "enhancement") return false;
    return false;
  }
  async loadDrawerData(label, entityType, type, subtype, filter) {
    if ($(`.item-add-${this.sheet.randomUuid}-overlay`).css("display") !== "none") {
      return;
    }

    $(`#items-add-${this.sheet.randomUuid}-label`).text(`${game.i18n.localize("D35E.Add")} ${label}`);

    $(`.item-add-${this.sheet.randomUuid}-overlay`).show();
    $(`.items-add-${this.sheet.randomUuid}-working-item`).show();
    $(`.items-add-${this.sheet.randomUuid}-list`).hide();
    sessionStorage.setItem(`D35E-last-ent-type-${this.sheet.id}`, entityType);
    sessionStorage.setItem(`D35E-last-type-${this.sheet.id}`, type);
    sessionStorage.setItem(`D35E-last-subtype-${this.sheet.id}`, subtype);
    sessionStorage.setItem(`D35E-opened-${this.sheet.id}`, true);
    sessionStorage.setItem(`D35E-label-${this.sheet.id}`, label);
    $(`#${this.sheet.randomUuid}-itemList`).empty();
    for (let p of game.packs.values()) {
      if (p.private && !game.user.isGM) continue;
      if ((p.entity || p.documentName) !== "Item") continue;

      for (let indexElement of (await p.getIndex()).values()) {
        if (!this.#filterIndexedItems(indexElement, entityType, type, subtype)) continue;
        let li = $(
          `<li class="item-list-item item" data-item-id="${indexElement._id}">
                             <div class="item-name non-rollable flexrow">
                             <div class="item-image non-rollable" style="background-image: url('${indexElement.img}')"></div>
                              <span class="display-item-info" data-item-id="${indexElement._id}">${indexElement.name}</span>
                              <a class="item-control"  style="flex: 0; margin: 0 4px;" title="Remove Quantity" onclick="modifyInputValue('amount-add-${indexElement._id}',-1)">
                                  <i class="fas fa-minus remove-skill"></i>
                              </a>
                              <input type="text"  class="skill-value" name='amount-add-${indexElement._id}' value="1" readonly style="border: none; flex: 0 25px; text-align: center;" placeholder="0"/>
                              <a class="item-control" title="Add Quantity" style="flex: 0 20px; margin: 0 4px;" onclick="modifyInputValue('amount-add-${indexElement._id}',1)">
                                  <i class="fas fa-plus add-skill"></i>
                              </a>
                              <a class="add-from-compendium blue-button" style="flex: 0 40px; text-align: center">Add</a> </div>
                              <div class="item-description-box" style="display: none;     border: 1px solid rgba(255,255,255,0.5);
                                border-radius: 4px;
                                padding: 4px;">
                              <div class="item-description">[empty]</div>
                              </div>
                      </li>`
        );
        li.find(".add-from-compendium").mouseup((ev) => {
          sessionStorage.setItem(`D35E-position-${this.sheet.id}`, $(`#${this.sheet.randomUuid}-itemList`).scrollTop());
          this.sheet._addItemFromBrowser(p.metadata.id, indexElement._id, ev);
        });
        li.find(".display-item-info").mouseup(async (ev) => {
          if (li.find(".item-description").text() === "[empty]") {
            li.find(".item-description").html(await (await p.getDocument(indexElement._id)).getDescription());
          }
          li.toggleClass("slideout-bordered-item");
          li.find(".item-description-box").toggle();
        });
        if (!$(`#${this.sheet.randomUuid}-itemList li[data-item-id='${indexElement._id}']`).length) {
          $(`#${this.sheet.randomUuid}-itemList`).append(li);
        }
      }
    }

    $(`.items-add-${this.sheet.randomUuid}-openCompendium`).unbind("mouseup");
    $(`.items-add-${this.sheet.randomUuid}-openCompendium`).mouseup((ev) => {
      sessionStorage.setItem(`D35E-opened-${this.sheet.id}`, false);
      $(`.item-add-${this.sheet.randomUuid}-overlay`).hide();
      CompendiumBrowser.browseCompendium(entityType, "Item");
    });
    $(`.items-add-${this.sheet.randomUuid}-working-item`).hide();
    $(`.items-add-${this.sheet.randomUuid}-list`).show();
    if (filter) {
      $(`#${this.sheet.randomUuid}-itemList-filter`).val(filter);
      $(`#${this.sheet.randomUuid}-itemList li`).filter(function () {
        $(this).toggle($(this).text().toLowerCase().indexOf(filter) > -1);
      });
    }
  }
}
