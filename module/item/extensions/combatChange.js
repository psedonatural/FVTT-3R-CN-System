/**
 * Class describing a combat change
 */
export class CombatChange {
  itemType;
  actionType;
  condition;
  field;
  formula;
  specialAction;
  itemId;
  itemName;
  itemImg;
  applyActionsOnlyOnce;
  sourceName;
  specialActionCondition;

  constructor(
    itemType,
    actionType,
    condition,
    field,
    formula,
    specialAction,
    itemId,
    itemName,
    itemImg,
    applyActionsOnlyOnce,
    sourceName,
    specialActionCondition
  ) {
    this.itemType = itemType;
    this.actionType = actionType;
    this.condition = condition;
    this.field = field;
    this.formula = formula;
    this.specialAction = specialAction;
    this.itemId = itemId;
    this.itemName = itemName;
    this.itemImg = itemImg;
    this.applyActionsOnlyOnce = applyActionsOnlyOnce;
    this.sourceName = sourceName;
    this.specialActionCondition = specialActionCondition;
  }

  static fromObject(array) {
    return new CombatChange(
      array["itemType"],
      array["actionType"],
      array["condition"],
      array["field"],
      array["formula"],
      array["specialAction"],
      array["itemId"],
      array["itemName"],
      array["itemImg"],
      array["applyActionsOnlyOnce"],
      array["sourceName"],
      array["specialActionCondition"]
    );
  }
}
