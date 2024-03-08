import {Item35E} from "./entity.js";

export class ItemBase35E extends Item {

    constructor(data, context = {}) {
        if (context.D35E?.subtyped) {
            super(data, context);
        } else if (data.type) {
            const subtyped = { D35E: { subtyped: true } };
            const cls = CONFIG.Item.documentClasses[data.type] ?? CONFIG.Item.documentClasses.default;
            if (!cls) game.D35E.logger.warn(data?.type, data.type);
            return new cls(data, { ...subtyped, ...context });
        }
    }

    /**
     * @returns {string} Item subtype.
     */
    get subType() {
        return null;
    }

    updateGetSubtype(updated) {
        return null;
    }


}
