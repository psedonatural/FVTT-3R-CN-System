export class ItemCombatCalculationsHelper {


  static calculateAbilityModifier(item, damageMult, attackType, primaryAttack) {
    if (damageMult === -1 && attackType === 'natural') {
      damageMult = 1
      if (primaryAttack === false) damageMult = 0.5
      let naturalAttackCount = item.actor?.system.naturalAttackCount;
      if (primaryAttack && naturalAttackCount === 1) damageMult = 1.5
    } else if (damageMult === -1) {
      damageMult = 1
    }
    return damageMult || 0;
  }
}
