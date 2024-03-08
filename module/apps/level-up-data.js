export class LevelUpDataDialog extends FormApplication {
  constructor(...args) {
    super(...args);
    //game.D35E.logger.log('Level Up Windows data', this.object.data)
    this.actor = this.object;
    this.levelUpId = this.options.id;
    this.levelUpData = this.actor.system.details.levelUpData.find((a) => a.id === this.levelUpId);
    //game.D35E.logger.log('ludid',this.levelUpId,this.levelUpData, this.options.skillset)
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "level-up-data",
      classes: ["D35E", "entry", "level-up-data"],
      title: "详细升级页",
      template: "systems/D35E/templates/apps/level-up-data.html",
      width: 840,
      height: "auto",
      closeOnSubmit: false,
      submitOnClose: false,
    });
  }

  get attribute() {
    return this.options.name;
  }

  getData() {
    let skillset = {};
    Object.keys(this.options.skillset.all.skills).forEach((s) => {
      skillset[s] = {
        points: (this.levelUpData.skills[s] !== undefined ? this.levelUpData.skills[s].points : 0) || 0,
        name: this.options.skillset.all.skills[s].name,
        label: this.options.skillset.all.skills[s].label,
        arbitrary: this.options.skillset.all.skills[s].arbitrary,
        custom: this.options.skillset.all.skills[s].custom || this.options.skillset.all.skills[s].worldCustom,
        baseRank:
        (this.options.skillset.all.skills[s].points -
          (this.levelUpData.skills[s] !== undefined
            ? this.levelUpData.skills[s].cls
              ? this.levelUpData.skills[s].points
              : this.levelUpData.skills[s].points / 2
            : 0)) || 0,
        rt: this.options.skillset.all.skills[s].rt,
        cs: this.options.skillset.all.skills[s].cs,
        subSkills: {},
      };

      Object.keys(this.options.skillset.all.skills[s]?.subSkills || []).forEach((sb) => {
        skillset[s].subSkills[sb] = {
          points:
              (this.levelUpData.skills[s] !== undefined && this.levelUpData.skills[s].subskills[sb] !== undefined
              ? this.levelUpData.skills[s].subskills[sb].points
              : 0) || 0,
          name: this.options.skillset.all.skills[s].subSkills[sb].name,
          label: this.options.skillset.all.skills[s].subSkills[sb].label,
          arbitrary: this.options.skillset.all.skills[s].subSkills[sb].arbitrary,
          custom:
            this.options.skillset.all.skills[s].subSkills[sb].custom || this.options.skillset.all.skills[s].worldCustom,
          baseRank:
          (this.options.skillset.all.skills[s].subSkills[sb].points -
            (this.levelUpData.skills[s] !== undefined && this.levelUpData.skills[s].subskills[sb] !== undefined
              ? this.levelUpData.skills[s].subskills[sb].cls
                ? this.levelUpData.skills[s].subskills[sb].points
                : this.levelUpData.skills[s].subskills[sb].points / 2
              : 0)) || 0,
          rt: this.options.skillset.all.skills[s].rt,
          cs: this.options.skillset.all.skills[s].cs,
        };
      });
    });
    let classes = this.actor.items
      .filter((o) => o.type === "class" && getProperty(o.system, "classType") !== "racial")
      .sort((a, b) => {
        return a.sort - b.sort;
      });
    let data = {
      actor: this.actor,
      classes: classes,
      classesJson: JSON.stringify(
        classes.map((_c) => {
          return { id: _c._id, classSkills: _c.system.classSkills };
        })
      ),
      level: this.actor.system.details.levelUpData.findIndex((a) => a.id === this.levelUpId) + 1,
      totalLevel: this.actor.system.details.level.available,
      skillset: skillset,
      maxSkillRank: this.actor.system.details.level.available + 3,
      levelUpData: this.levelUpData,
      bonusSkillPoints: this.actor.system?.counters?.bonusSkillPoints?.value || 0,
      config: CONFIG.D35E,
    };
    return data;
  }

  activateListeners(html) {
    html.find('button[type="submit"]').click(this._submitAndClose.bind(this));

    html.find("textarea").change(this._onEntryChange.bind(this));
  }

  async _onEntryChange(event) {
    const a = event.currentTarget;
  }

  async _updateObject(event, formData) {
    const updateData = {};
    let classId = formData["class"];
    let hp = parseInt(formData["hp"] || 0);
    //game.D35E.logger.log('formData',formData)
    if (classId !== "") {
      let _class = this.actor.items.find((cls) => cls._id === classId);
      let levelUpData = duplicate(this.actor.system.details.levelUpData);
      levelUpData.forEach((a) => {
        if (a.id === this.levelUpId) {
          a.class = _class.name;
          a.classImage = _class.img;
          a.classId = _class._id;
          a.hp = hp;
          Object.keys(formData).forEach((s) => {
            let key = s.split(".");
            if (key[0] === "skills" && key.length === 3) {
              if (a.skills[key[1]] === undefined) {
                a.skills[key[1]] = { rank: 0, cls: _class.system.classSkills[key[1]] };
              }
              a.skills[key[1]].cls = _class.system.classSkills[key[1]];
              a.skills[key[1]].points = parseInt(formData[s]);
            }
            if (key[0] === "skills" && key.length === 5) {
              if (a.skills[key[1]] === undefined) {
                a.skills[key[1]] = { subskills: {} };
              }
              if (a.skills[key[1]].subskills[key[3]] === undefined) {
                a.skills[key[1]].subskills[key[3]] = { rank: 0, cls: _class.system.classSkills[key[1]] };
              }
              a.skills[key[1]].subskills[key[3]].cls = _class.system.classSkills[key[1]];
              a.skills[key[1]].subskills[key[3]].points = parseInt(formData[s]);
            }
          });
        }
      });
      //game.D35E.logger.log(`Updating Level Data | ${classId} | ${this.levelUpId}`)
      updateData[`system.details.levelUpData`] = levelUpData;

      const classes = this.actor.items
        .filter((o) => o.type === "class" && getProperty(o.system, "classType") !== "racial")
        .sort((a, b) => {
          return a.sort - b.sort;
        });

      let classLevels = new Map();
      let classHP = new Map();
      // Iterate over all levl ups
      levelUpData.forEach((lud) => {
        if (lud.classId === null || lud.classId === "") return;
        let _class = this.actor.items.find((cls) => cls._id === lud.classId);
        if (_class === undefined) return;
        if (!classLevels.has(_class._id)) classLevels.set(_class._id, 0);
        classLevels.set(_class._id, classLevels.get(_class._id) + 1);
        if (!classHP.has(_class._id)) classHP.set(_class._id, 0);
        classHP.set(_class._id, classHP.get(_class._id) + (lud.hp || 0));
        Object.keys(lud.skills).forEach((s) => {
          if (lud.skills[s])
            updateData[`system.skills.${s}.points`] =
              (lud.skills[s].points || 0) * (lud.skills[s].cls ? 1 : 0.5) +
              (updateData[`system.skills.${s}.points`] || 0);
          if (lud.skills[s].subskills) {
            Object.keys(lud.skills[s].subskills).forEach((sb) => {
              if (lud.skills[s].subskills && lud.skills[s].subskills[sb])
                updateData[`system.skills.${s}.subSkills.${sb}.points`] =
                  lud.skills[s].subskills[sb].points * (lud.skills[s].subskills[sb].cls ? 1 : 0.5) +
                  (updateData[`system.skills.${s}.subSkills.${sb}.points`] || 0);
            });
          }
        });
      });
      Object.keys(levelUpData[0].skills).forEach((s) => {
        if (this.object.system.skills[s])
          updateData[`system.skills.${s}.points`] = Math.floor(updateData[`system.skills.${s}.points`] || 0);
        if (levelUpData[0].skills[s].subskills) {
          Object.keys(levelUpData[0].skills[s].subskills).forEach((sb) => {
            if (this.object.system.skills[s].subskills && this.object.system.skills[s].subskills[sb])
              updateData[`system.skills.${s}.subSkills.${sb}.points`] = Math.floor(
                updateData[`system.skills.${s}.subSkills.${sb}.points`] || 0
              );
          });
        }
      });
      for (var __class of classes) {
        if (__class.data.classType === "racial") continue;
        let itemUpdateData = {};
        itemUpdateData["_id"] = __class._id;
        itemUpdateData["system.levels"] = classLevels.get(__class._id) || 0;
        itemUpdateData["system.hp"] = classHP.get(__class._id) || 0;
        await this.object.updateOwnedItem(itemUpdateData, { stopUpdates: true });
      }
    }
    return this.object.update(updateData);
  }

  async _submitAndClose(event) {
    event.preventDefault();
    await this._onSubmit(event);
    this.close();
  }
}
