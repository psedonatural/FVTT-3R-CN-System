/**
 * This registers very simple layer that is used to properly render
 * left menu buttons.
 */
export default class D35ELayer extends InteractionLayer {
    constructor() {
        super();
    }

    static get layerOptions() {
        return mergeObject(super.layerOptions, {
          name: "d35e",
          sortActiveTop: true,
          zIndex: 999,
        });
    }

    selectObjectsFromTokenLayer({x, y, width, height, releaseOptions={}, controlOptions={}}={}) {
        const oldSet = canvas.tokens.controlled;
        // Identify controllable objects
        const controllable = canvas.tokens.placeables.filter(obj => obj.visible && (obj.control instanceof Function));
        const newSet = controllable.filter(obj => {
          let c = obj.center;
          return Number.between(c.x, x, x+width) && Number.between(c.y, y, y+height);
        });
        // Release objects no longer controlled
        //game.D35E.logger.log(oldSet)
        //game.D35E.logger.log(newSet)
        const toRelease = oldSet.filter(obj => !newSet.includes(obj));
        //game.D35E.logger.log(toRelease)
        toRelease.forEach(obj => obj.release(releaseOptions));
        // Control new objects
        if ( isEmpty(controlOptions) ) controlOptions.releaseOthers = false;
        const toControl = newSet.filter(obj => !oldSet.includes(obj));
        toControl.forEach(obj => obj.control(controlOptions));
        // Return a boolean for whether the control set was changed
        return (toRelease.length > 0) || (toControl.length > 0);
      }

    /** @override */
    selectObjects({x, y, width, height, releaseOptions={}, controlOptions={}}={}) {
        //game.D35E.logger.log('selectObjects')
        releaseOptions = { updateSight: false };
        controlOptions = { releaseOthers: false, updateSight: false };
        const changed = this.selectObjectsFromTokenLayer({x, y, width, height, releaseOptions, controlOptions});
        if ( changed ) canvas.initializeSources();
        return changed;
      }

      /** @override */
      _onClickLeft(event) {
        //canvas.tokens.controlled.forEach(token => token.release())
      }

      activate() {
          super.activate()
          //canvas.tokens.interactiveChildren = true;
      }

      deactivate() {
          super.deactivate()
          //canvas.tokens.interactiveChildren = false;
      }




}

