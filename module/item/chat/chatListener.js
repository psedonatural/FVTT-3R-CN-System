import {ItemChatAction} from "./chatAction.js";

export class ItemChatListener {
    static chatListeners(html) {
        html.on('click', '.card-buttons button', ItemChatAction._onChatCardAction.bind(this));
        html.on('click', '.item-name', ItemChatAction._onChatCardToggleContent.bind(this));
    }
}
