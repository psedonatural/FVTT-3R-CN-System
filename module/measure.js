import { degtorad } from "./lib.js";
import { measureDistance } from "./canvas/canvas.js";

const withinAngle = (min, max, value) => {
  min = Math.normalizeDegrees(min);
  max = Math.normalizeDegrees(max);
  value = Math.normalizeDegrees(value);

  if (min < max) return value >= min && value <= max;
  return value >= min || value <= max;
};

const withinRect = (point, rect) => {
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
};

/**
 * Applies patches to core functions to integrate Pathfinder specific measurements.
 */
export class TemplateLayerPF extends TemplateLayer {
  // Foundry does not respect CONFIG.MeasuredTemplate.documentClass and CONFIG.MeasuredTemplate.objectClass
  async _onDragLeftStart(event) {
    if (!game.settings.get("D35E", "measureStyle")) return super._onDragLeftStart(event);

    // Call placeables layer super instead of templatelayer
    const origin = duplicate(event.interactionData.origin);
    await PlaceablesLayer.prototype._onDragLeftStart.call(this, event);

    // Create the new preview template
    const tool = game.activeTool;

    // Snap to grid
    if (!event.shiftKey) {
      const pos = canvas.grid.getSnappedPosition(origin.x, origin.y, this.gridPrecision);
      origin.x = pos.x;
      origin.y = pos.y;
    }

    // Create the template
    const data = {
      user: game.user.id,
      t: tool,
      x: origin.x,
      y: origin.y,
      distance: 1,
      direction: 0,
      fillColor: game.user.color || "#FF0000",
    };

    // Apply some type-specific defaults
    const defaults = MeasuredTemplatePF.defaults;
    if (tool === "cone") data["angle"] = defaults.angle;
    else if (tool === "ray") data["width"] = defaults.width * canvas.dimensions.distance;

    // Create a preview template
    const doc = new CONFIG.MeasuredTemplate.documentClass(data, { parent: canvas.scene });
    const template = new CONFIG.MeasuredTemplate.objectClass(doc);
    event.interactionData.preview = this.preview.addChild(template);
    return template.draw();
  }

  _onDragLeftMove(event) {
    if (!game.settings.get("D35E", "measureStyle")) return super._onDragLeftMove(event);

    const { destination, layerDragState, preview, origin } = event.interactionData;
    if (layerDragState === 0) return;

    // Snap the destination to the grid
    const snapToGrid = !event.shiftKey;
    if (snapToGrid) {
      event.interactionData.destination = canvas.grid.getSnappedPosition(destination.x, destination.y, 2);
    }

    // Compute the ray
    const ray = new Ray(origin, destination);
    const dist = canvas.dimensions.distance;
    const ratio = canvas.dimensions.size / dist;

    // Update the preview object
    const type = preview.document.t;
    const cellSize = canvas.dimensions.distance;
    // Set direction
    const baseDirection = Math.normalizeDegrees(Math.toDegrees(ray.angle));
    if (snapToGrid && ["cone", "circle"].includes(type)) {
      const halfAngle = MeasuredTemplatePF.defaults.angle / 2;
      preview.document.direction = Math.floor((baseDirection + halfAngle / 2) / halfAngle) * halfAngle;
    } else if (snapToGrid && type === "ray") {
      preview.document.direction = Math.floor((baseDirection + cellSize / 2) / cellSize) * cellSize;
    } else {
      preview.document.direction = baseDirection;
    }
    // Set distance
    const baseDistance = ray.distance / ratio;
    if (snapToGrid && ["cone", "circle", "ray"].includes(type)) {
      preview.document.distance = Math.floor(baseDistance / dist) * dist;
    } else {
      preview.document.distance = baseDistance;
    }
    preview.renderFlags.set({ refreshShape: true });

    // Confirm the creation state
    event.interactionData.layerDragState = 2;
  }
}

export class MeasuredTemplatePF extends MeasuredTemplate {
  static get defaults() {
        return {
          angle: 90.0,
          width: 1
        }
  };
  getHighlightedSquares() {
    if (!game.settings.get("D35E", "measureStyle") || !["circle", "cone", "ray"].includes(this.document.t)) return [];

    const grid = canvas.grid,
      gridSizePx = canvas.dimensions.size, // Size of each cell in pixels
      gridSizeUnits = canvas.dimensions.distance; // feet, meters, etc.

    if (!this.id || !this.shape) return [];

    const templateType = this.document.t,
      templateDirection = this.document.direction,
      templateAngle = this.document.angle;

    // Parse rays as per Bresenham's algorithm
    if (templateType === "ray") {
      const result = [];

      const line = (x0, y0, x1, y1) => {
        x0 = Math.floor(Math.floor(x0) / gridSizePx);
        x1 = Math.floor(Math.floor(x1) / gridSizePx);
        y0 = Math.floor(Math.floor(y0) / gridSizePx);
        y1 = Math.floor(Math.floor(y1) / gridSizePx);

        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (!(x0 === x1 && y0 === y1)) {
          result.push({ x: x0 * gridSizePx, y: y0 * gridSizePx });
          const e2 = err << 1;
          if (e2 > -dy) {
            err -= dy;
            x0 += sx;
          }
          if (e2 < dx) {
            err += dx;
            y0 += sy;
          }
        }
      };

      // Extend ray by half a square for better highlight calculation
      const ray = Ray.fromAngle(this.ray.A.x, this.ray.A.y, this.ray.angle, this.ray.distance + gridSizePx / 2);

      // Get resulting squares
      line(ray.A.x, ray.A.y, ray.B.x, ray.B.y);

      return result;
    }

    // Get number of rows and columns
    const nr = Math.ceil((this.document.distance * 1.5) / gridSizeUnits / (gridSizePx / grid.h)),
      nc = Math.ceil((this.document.distance * 1.5) / gridSizeUnits / (gridSizePx / grid.w));

    // Get the center of the grid position occupied by the template
    const { x, y } = this.document;

    const [cx, cy] = grid.getCenter(x, y),
      [col0, row0] = grid.grid.getGridPositionFromPixels(cx, cy),
      minAngle = Math.normalizeDegrees(templateDirection - templateAngle / 2),
      maxAngle = Math.normalizeDegrees(templateDirection + templateAngle / 2);

    const originOffset = { x: 0, y: 0 };
    // Offset measurement for cones
    // Offset is to ensure that cones only start measuring from cell borders, as in https://www.d20pfsrd.com/magic/#Aiming_a_Spell
    if (templateType === "cone") {
      // Degrees anticlockwise from pointing right. In 45-degree increments from 0 to 360
      const dir = (templateDirection >= 0 ? 360 - templateDirection : -templateDirection) % 360;
      // If we're not on a border for X, offset by 0.5 or -0.5 to the border of the cell in the direction we're looking on X axis
      const xOffset =
        this.document.x % gridSizePx != 0
          ? Math.sign((1 * Math.round(Math.cos(degtorad(dir)) * 100)) / 100) / 2 // /2 turns from 1/0/-1 to 0.5/0/-0.5
          : 0;
      // Same for Y, but cos Y goes down on screens, we invert
      const yOffset =
        this.document.y % gridSizePx != 0 ? -Math.sign((1 * Math.round(Math.sin(degtorad(dir)) * 100)) / 100) / 2 : 0;
      originOffset.x = xOffset;
      originOffset.y = yOffset;
    }

    const result = [];
    for (let a = -nc; a < nc; a++) {
      for (let b = -nr; b < nr; b++) {
        // Position of cell's top-left corner, in pixels
        const [gx, gy] = canvas.grid.grid.getPixelsFromGridPosition(col0 + a, row0 + b);
        // Position of cell's center, in pixels
        const [cellCenterX, cellCenterY] = [gx + gridSizePx * 0.5, gy + gridSizePx * 0.5];

        // Determine point of origin
        const origin = {
          x: this.document.x + originOffset.x * gridSizePx,
          y: this.document.y + originOffset.y * gridSizePx,
        };

        // Determine point we're measuring the distance to - always in the center of a grid square
        const destination = { x: cellCenterX, y: cellCenterY };

        if (templateType === "cone") {
          const ray = new Ray(origin, destination);
          const rayAngle = Math.normalizeDegrees(ray.angle / (Math.PI / 180));
          if (ray.distance > 0 && !withinAngle(minAngle, maxAngle, rayAngle)) {
            continue;
          }
        }

        const distance = measureDistance(destination, origin);
        if (distance <= this.document.distance) {
          result.push({ x: gx, y: gy });
        }
      }
    }

    return result;
  }

  /**
   * Determine tokens residing within the template bounds, based on either grid higlight logic or token center.
   *
   * @public
   * @returns {Token[]} Tokens sufficiently within the template.
   */
  getTokensWithin() {
    const shape = this.document.t,
      dimensions = this.scene.dimensions,
      gridSizePx = dimensions.size,
      gridSizeUnits = dimensions.distance;

    const result = [];
    // Special handling for gridless
    if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS && ["circle", "cone", "rect"].includes(shape)) {
      // TODO: Test against vision points and ensure ~third of them are inside the template instead.
      for (const t of canvas.tokens.placeables) {
        switch (shape) {
          case "circle": {
            const ray = new Ray(this.center, t.center);
            // Calculate ray length in relation to circle radius
            const raySceneLength = (ray.distance / gridSizePx) * gridSizeUnits;
            // Include this token if its center is within template radius
            if (raySceneLength <= this.document.distance) result.push(t);
            break;
          }
          case "cone": {
            const templateDirection = this.document.direction;
            const templateAngle = this.document.angle,
              minAngle = Math.normalizeDegrees(templateDirection - templateAngle / 2),
              maxAngle = Math.normalizeDegrees(templateDirection + templateAngle / 2);

            const ray = new Ray(this.center, t.center);
            const rayAngle = Math.normalizeDegrees(Math.toDegrees(ray.angle));

            const rayWithinAngle = withinAngle(minAngle, maxAngle, rayAngle);
            // Calculate ray length in relation to circle radius
            const raySceneLength = (ray.distance / gridSizePx) * gridSizeUnits;
            // Include token if its within template distance and within the cone's angle
            if (rayWithinAngle && raySceneLength <= this.document.distance) result.push(t);
            break;
          }
          case "rect": {
            const rect = {
              x: this.x,
              y: this.y,
              width: this.width,
              height: this.width,
            };
            if (withinRect(t.center, rect)) result.push(t);
            break;
          }
        }
      }
      return result;
    }

    const highlightSquares = this.getHighlightedSquares();

    for (const s of highlightSquares) {
      for (const t of canvas.tokens.placeables) {
        if (result.includes(t)) continue;

        const tokenData = {
          x: Math.round(t.document.x / gridSizePx),
          y: Math.round(t.document.y / gridSizePx),
          width: t.document.width,
          height: t.document.height,
        };
        const squareData = {
          x: Math.round(s.x / gridSizePx),
          y: Math.round(s.y / gridSizePx),
        };

        if (withinRect(squareData, tokenData)) result.push(t);
      }
    }

    return result;
  }

  // Highlight grid in PF1 style
  highlightGrid() {
    if (
      !game.settings.get("D35E", "measureStyle") ||
      !["circle", "cone", "ray"].includes(this.document.t) ||
      canvas.grid.type !== CONST.GRID_TYPES.SQUARE
    )
      return super.highlightGrid();

    const grid = canvas.grid,
      bc = this.borderColor,
      fc = this.fillColor;

    // Only highlight for objects which have a defined shape
    if (!this.id || !this.shape) return;

    // Clear existing highlight
    const hl = this.getHighlightLayer();
    hl.clear();
    if (!this.isVisible) return;

    // Get grid squares to highlight
    const highlightSquares = this.getHighlightedSquares();
    for (const s of highlightSquares) {
      grid.grid.highlightGridPosition(hl, { x: s.x, y: s.y, color: fc, border: bc });
    }
  }

  getHighlightLayer() {
    return canvas.grid.getHighlightLayer(this.highlightId);
  }
}

let newFun = MeasuredTemplatePF.prototype.refresh.toString();
newFun = newFun.replace(
  /this\.template\.beginTextureFill\(\{[\s\S]*\}\)\;/,
  `
			{
				let mat = PIXI.Matrix.IDENTITY;
				// rectangle
				if (this.shape.width && this.shape.height)
					mat.scale(this.shape.width / this.texture.width, this.shape.height / this.texture.height);
				else if (this.shape.radius) {
					mat.scale(this.shape.radius * 2 / this.texture.height, this.shape.radius * 2 / this.texture.width)
					// Circle center is texture start...
					mat.translate(-this.shape.radius, -this.shape.radius);
				} else if (this.t === "ray") {
					const d = canvas.dimensions,
								height = this.width * d.size / d.distance,
								width = this.distance * d.size / d.distance;
					mat.scale(width / this.texture.width, height / this.texture.height);
					mat.translate(0, -height * 0.5);
					mat.rotate(toRadians(this.direction));
				} else {// cone
					const d = canvas.dimensions;
			
					// Extract and prepare data
					let {direction, distance, angle} = this.;
					distance *= (d.size / d.distance);
					direction = toRadians(direction);
					const width = this.distance * d.size / d.distance;
					const angles = [(angle/-2), (angle/2)];
					distance = distance / Math.cos(toRadians(angle/2));
			
					// Get the cone shape as a polygon
					const rays = angles.map(a => Ray.fromAngle(0, 0, direction + toRadians(a), distance+1));
					const height = Math.sqrt((rays[0].B.x - rays[1].B.x) * (rays[0].B.x - rays[1].B.x)
													+ (rays[0].B.y - rays[1].B.y) * (rays[0].B.y - rays[1].B.y));
					mat.scale(width / this.texture.width, height / this.texture.height);
					mat.translate(0, -height/2)
					mat.rotate(toRadians(this.direction));
				}
				this.template.beginTextureFill({
					texture: this.texture,
					matrix: mat,
					alpha: 0.8
				});
				// move into draw or so
				const source = getProperty(this.texture, "baseTexture.resource.source")
				if ( source && (source.tagName === "VIDEO") && game.D35E.createdMeasureTemplates.has(this.id) ) {
					source.loop = false;
					source.muted = true;
					game.video.play(source);
					game.D35E.createdMeasureTemplates.delete(this.id)
				}
		}`
);

MeasuredTemplate.prototype.refresh = Function(`"use strict"; return ( function ${newFun} )`)();
