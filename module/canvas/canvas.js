/**
 * Measure the distance between two pixel coordinates
 * See BaseGrid.measureDistance for more details
 */
export const measureDistances = function (segments, options = {}) {
  if (!options.gridSpaces) return BaseGrid.prototype.measureDistances.call(this, segments, options);

  // Track the total number of diagonals
  let nDiagonal = 0;
  const rule = this.parent.diagonalRule;
  const d = canvas.dimensions;

  // Iterate over measured segments
  return segments.map((s) => {
    let r = s.ray;

    // Determine the total distance traveled
    let nx = Math.abs(Math.ceil(r.dx / d.size));
    let ny = Math.abs(Math.ceil(r.dy / d.size));

    // Determine the number of straight and diagonal moves
    let nd = Math.min(nx, ny);
    let ns = Math.abs(ny - nx);
    nDiagonal += nd;

    // Alternative DMG Movement
    if (rule === "5105") {
      let nd10 = Math.floor(nDiagonal / 2) - Math.floor((nDiagonal - nd) / 2);
      let spaces = nd10 * 2 + (nd - nd10) + ns;
      return spaces * canvas.dimensions.distance;
    }

    // Standard PHB Movement
    else return (ns + nd) * canvas.scene.data.gridDistance;
  });
};

export const measureDistance = function (
  p0,
  p1,
  { ray = null, diagonalRule = "5105", state = { diagonals: 0, cells: 0 } } = {}
) {
  // TODO: Optionally adjust start and end point to closest grid
  ray ??= new Ray(p0, p1);
  const gs = canvas.dimensions.size,
    nx = Math.ceil(Math.abs(ray.dx / gs)),
    ny = Math.ceil(Math.abs(ray.dy / gs));

  // Get the number of straight and diagonal moves
  const nDiagonal = Math.min(nx, ny),
    nStraight = Math.abs(ny - nx);

  state.diagonals += nDiagonal;

  let cells = 0;
  // Standard Pathfinder diagonals: double distance for every odd.
  if (diagonalRule === "5105") {
    const nd10 = Math.floor(state.diagonals / 2) - Math.floor((state.diagonals - nDiagonal) / 2);
    cells = nd10 * 2 + (nDiagonal - nd10) + nStraight;
  }
  // Equal distance diagonals
  else cells = nStraight + nDiagonal;

  state.cells += cells;
  return cells * canvas.dimensions.distance;
};

/* -------------------------------------------- */

/**
 * Hijack Token health bar rendering to include temporary and temp-max health in the bar display
 * TODO: This should probably be replaced with a formal Token class extension
 */
const _TokenGetBarAttribute = Token.prototype.getBarAttribute;
Token.prototype.getBarAttribute = function (barName, { alternative = null } = {}) {
  let data;
  try {
    data = _TokenGetBarAttribute.call(this, barName, { alternative: alternative });
  } catch (e) {
    data = null;
  }
  if (data != null && data.attribute === "attributes.hp") {
    data.value += parseInt(data["temp"] || 0);
  }
  return data;
};

/**
 * Condition/ status effects section
 */
export const getConditions = function () {
  var core = CONFIG.statusEffects,
    sys = Object.keys(CONFIG.D35E.conditions)
      .filter((c) => c !== "wildshaped" && c !== "polymorphed")
      .map((c) => {
        return { id: c, label: CONFIG.D35E.conditions[c], icon: CONFIG.D35E.conditionTextures[c] };
      });
  if (game.settings.get("D35E", "coreEffects")) sys.push(...core);
  else sys = [core[0]].concat(sys);
  return sys;
};

const _TokenHUD_getStatusEffectChoices = TokenHUD.prototype._getStatusEffectChoices;
TokenHUD.prototype._getStatusEffectChoices = function () {
  let core = _TokenHUD_getStatusEffectChoices.call(this),
    buffs = {};
  Object.entries(this.object.actor.buffs.calcBuffTextures()).forEach((obj) => {
    let [idx, buff] = obj;
    if (buffs[buff.icon] && buff.label) buffs[buff.icon].title = buff.label;
    else {
      buffs[buff.icon] = {
        id: buff.id,
        title: buff.label,
        src: buff.icon,
        isActive: buff.active,
        isOverlay: false,
        cssClass: buff.active ? "active" : "",
      };
    }
  });
  return Object.assign({}, core, buffs);
};

//const TokenHUD__onToggleEffect = TokenHUD.prototype._onToggleEffect;
TokenHUD.prototype._onToggleEffect = function (event, { overlay = false } = {}) {
  event.preventDefault();
  let img = event.currentTarget;
  const effect =
    img.dataset.statusId && this.object.actor
      ? CONFIG.statusEffects.find((e) => e.id === img.dataset.statusId) ?? img.dataset.statusId
      : img.getAttribute("src");
  return this.object.toggleEffect(effect, { overlay });
};
