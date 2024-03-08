import sinon from 'sinon';
import {
  ActorDamageHelper
} from '../../../module/actor/helpers/actorDamageHelper';
const Roll = {}
jest.mock('../../../module/actor/entity', () => {
  class Actor { /* Mocked methods and properties */ }
  class ActorPF extends Actor { /* Mocked methods and properties */ }
  return { ActorPF };
});

describe('ActorDamageHelper', function () {
  describe('mergeDamageTypes', function () {
    it('should correctly merge damage types', function () {
      let inputDamageArray = [
        {damageTypeUid: 'fire', roll: {total: 1}},
        {damageTypeUid: 'cold', roll: {total: 2}},
        {damageTypeUid: 'acid', roll: {total: 3}},
        {damageTypeUid: 'fire', roll: {total: 4}}
      ]
      let expectedDamage = [
          {damageTypeUid: 'fire', roll: {total: 5}},
          {damageTypeUid: 'cold', roll: {total: 2}},
          {damageTypeUid: 'acid', roll: {total: 3}}
      ]
      let damageArray = ActorDamageHelper.mergeDamageTypes(inputDamageArray);
      expect(damageArray).toEqual(expectedDamage);
    });
  });
});
