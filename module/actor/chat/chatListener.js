import {ActorChatActions} from "./chatActions.js"

export class ActorChatListener {
    static chatListeners(html) {
        html.on('click', 'button[data-action]', ActorChatActions._onChatCardButtonAction.bind(this));
        html.on('mouseenter', 'img[data-target]', ActorChatActions._onTargetHover.bind(this));
        html.on('mouseleave', 'img[data-target]', ActorChatActions._onTargetLeave.bind(this));
        html.on('click', 'img[data-target]', ActorChatActions._onTargetClick.bind(this));
    }
}
