export class D35ECombatTracker extends CombatTracker {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['D35E'],
            id: "combat",
            template: "systems/D35E/templates/sidebar/combat-tracker.html",
            title: "D35E Combat Tracker",
            scrollY: [".directory-list"]
        });
    }

    async getData() {
        let context = await super.getData();


        /* which turn state are we in? */
        context.playerTurn =  false;
        context.playerStyle = context.playerTurn ? 'active-turn' : 'inactive-turn';
        context.gmStyle = !context.playerTurn ? 'active-turn' : 'inactive-turn';

        /* add in the ended turn flag
         * and other combatant specific
         * info
         */
        let previousActorTurn = "final"
        let activeActorTurnId = ""
        let finalActorTurnId = ""
        let hasActorSheet = context?.combat?.current?.tokenId;

        context.hasActorSheet = hasActorSheet;
        context.turns = context.turns.reduce( (acc, turn) => {
            const combatant = context.combat.combatants.get(turn.id);

            /* super does not look at unlinked effects, do that here */
            turn.effects = new Set();
            if ( combatant.token ) {
                if (combatant.token.actor)
                    combatant.token.actor.effects.forEach(e => turn.effects.add(e));
                if ( combatant.token.overlayEffect ) turn.effects.add(combatant.token.overlayEffect);
            }

            turn.ended = combatant?.turnEnded ?? true;
            let isActor = !!combatant.actor;
            turn.isActor = isActor;
            if (isActor) {
                previousActorTurn = turn.id;
                finalActorTurnId = turn.id;
                turn.usedMoveAction = combatant.usedMoveAction;
                turn.usedAttackAction = combatant.usedAttackAction;
                turn.usedSwiftAction = combatant.usedSwiftAction;
                turn.usedAllAao = combatant.usedAllAao;
                if (turn.active)
                    activeActorTurnId = turn.id;
                turn.zeroHp = combatant.actor.system.attributes.hp.value === 0 ? true : false;
                acc["actor"].push(turn);
            }
            else {
                turn.previousActorTurn = previousActorTurn
                turn.actorImage = combatant?.flags?.D35E?.actorImg
                turn.actorName = combatant?.flags?.D35E?.actorName
                if (combatant?.flags?.D35E?.actor) {
                    if (game.actors.get(combatant?.flags?.D35E?.actor) && game.actors.get(combatant?.flags?.D35E?.actor).testUserPermission(game.user, "OWNER"))
                        acc["buff"].push(turn);
                }
            }

            return acc;
        },{actor: [], buff: []});

        context.nextTurnBuffs = []
        for (let buff of context.turns.buff) {
            if (buff.previousActorTurn === activeActorTurnId
                || (finalActorTurnId === activeActorTurnId && buff.previousActorTurn === "final"))
                context.nextTurnBuffs.push(buff)
        }
        context.useCharSheet = game.settings.get("D35E", "useCombatCharacterSheet");
        return context;
    }




}
