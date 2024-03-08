export class QuantityDialog extends Dialog {
    constructor(callback, options) {
        if (typeof(options) !== "object") {
            options = {};
        }

        let applyChanges = false;
        const chooseQuantity = 'quantity' in options ? "" : '<input type=number min="1" id="quantity" name="quantity" value="1">'
        super({
            title: 'title' in options ? options['title'] : game.i18n.localize("D35E.ls.quantity"),
            content: `
            <form>
                <div class="form-group">
                    <label>${'label' in options ? options['label'] : game.i18n.localize("D35E.ls.quantity")}</label>
                    ${chooseQuantity}
                </div>
            </form>`,
            buttons: {
                yes: {
                    icon: "<i class='fas fa-check'></i>",
                    label: options.acceptLabel ? options.acceptLabel : game.i18n.localize("D35E.ls.accept"),
                    callback: () => applyChanges = true
                },
                no: {
                    icon: "<i class='fas fa-times'></i>",
                    label: game.i18n.localize("D35E.ls.cancel")
                },
            },
            default: "yes",
            close: () => {
                if (applyChanges) {
                    var quantity = Number('quantity' in options ? options['quantity'] : document.getElementById('quantity').value)

                    if (isNaN(quantity)) {
                        game.D35E.logger.log("Loot Sheet | Item quantity invalid");
                        return ui.notifications.error(game.i18n.localize("ERROR.lsItemInvalidQuantity"));
                    }

                    callback(quantity);

                }
            }
        });
    }
}

