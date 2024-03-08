export class ActorWealthHelper {
    static calculateCoinWeight(actorData) {
        let baseWeight = Object.values(actorData.system.currency).reduce((cur, amount) => {
            return cur + amount;
        }, 0) / 50;

        const customCurrency = actorData.system.customCurrency;
        let currencyConfig = game.settings.get("D35E", "currencyConfig");
        for (let currency of currencyConfig.currency) {
            if (customCurrency)
                baseWeight += (customCurrency[currency[0]] || 0)*(currency[2] || 0)
        }

        return baseWeight;
    }
}
