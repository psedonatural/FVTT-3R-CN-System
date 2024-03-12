
## FVTTD35E-CN
这是基于FVTT上由Rughalt所制作的srd-d35e系统创建的汉化版系统。
此系统致力于尽可能完整的中文化，并在现有系统上修复bug、完善系统内容。
目前系统为全覆盖式安装，未来计划改为模组以提高适用性。
 当前适配的FVTT版本为Version 11 Stable（也就是V11）
 而35E系统基底为2.4.3
 

## 安装系统
目前系统考虑到版权问题没有集成到FVTT中，因此需要手动安装。
1. 点击右侧的Releases版本版本，下载Source code(zip)文件，到本地右键解压到当前文件夹，然后将解压出来的文件夹改名为“D35E”
2. 打开fvtt的系统目录，通常是：C:\Users\你的用户名\AppData\Local\FoundryVTT\Data\systems。
3. 将解压后的文件夹复制到此目录中，如果你已经有安装D35E系统，那么建议将原本的删除，然后再复制进去便安装完成。
#### 注意！如果你曾自己在系统合集中加入过内容，此过程会导致内容丢失！若要避免此类情况请看下方说明。

你曾经写过自己的内容并且放入了合集包：
如果内容不多，通常建议你直接将做好的内容拖动到世界包内备份，然后替换更新
但如果内容太多，那么在覆盖汉化前你需要先打开系统根目录下的pack文件夹，这其中是你此系统的合集文件，将对应类别拷贝出来
然后删除你原有的d35E文件夹并将汉化系统放入文件夹，
再打开汉化后系统的pack文件夹，将你覆盖类型的合集文件夹删除，然后再将你拷贝出来的带有你自己资源的文件夹复制进此目录便可安全替换完成。

## 常见问题
**问**：会改动我世界包里的东西吗？
**答**：不会改动合集以外的内容，但部分专长，例如猛力攻击和双武器攻击等可能失效，改为汉化后的版本即可正常生效。

**问**：目前系统能自动化吗？
**答**：有一定的自动化，大部分静态数据可以做到自行计算，攻击检定在设置好后能够补全所有加值，类似护盾术等自身效果也是全自动启用，计算出的伤害部分需要DM手动应用，关于这一点系统也不会进一步提高自动化。

**问**：目前系统内置有哪些内容？
**答**：srd3.5e的大部分内容，请注意，srd并不是纯核心，它是包含了核心、扩展灵能、传奇、神与半神，以及部分完美战力内容的合集。

**问**：与mod兼容性如何，扩展性大吗？有推荐吗
**答**：与不改变数据的mod以及规模较大的Mod都有兼容，少部分会修改UI的美化会冲突。

**问**：我不会用这个系统，我该去哪里学？
**答**：系统初次打开会带有一个可视化的教程，此教程已经汉化，能满足最初的学习，在那之后你可以在文件根目录找到译者非瑞克西亚发布一份教程文档，它会提到更多细节。你可以加入fvtt3r的qq群：808945118
如果你并不碍于使用英语，你还可以直接前往原作者的discord提问与学习，那里有很热情的人。


## 已汉化内容：

- 内置基础系统：99%（存在目前技术无法实现的汉化）
- 专长100%
- 武器和防具100%
- 附魔效果100%（待修缮润色）
- 职业和职业能力100%（待修缮润色）
- 种族和种族能力100%（待修缮润色）
- 类法术能力、特殊材料100%（待修缮润色）

剩余待汉化计划（从上至下）：
- 法术0%...
- 召唤表0%
- 魔法物品0%...
- 非魔法商品0%...
- 学派与领域0%...
- 怪物0%...
- 灵能0%...（系统半成品因此优先度较低）

暂未列入计划的汉化：
- 内置规则书
- 随机战利品表
