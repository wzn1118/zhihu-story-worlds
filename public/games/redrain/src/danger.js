const PREPARATIONS = [
  { id: "recon", index: 18, choice: 2, bit: 1, name: "楼绎守住塔顶",
    detail: "楼绎把返航画面停在塔顶，答应接下来替你盯住发号施令的那只。你们约好，你负责取景，他负责在尸群靠近窗台前结束观察。" },
  { id: "warmth", index: 29, choice: 2, bit: 2, name: "客厅留有保温余量",
    detail: "燕思静把保温垫和备用电池一起搬到客厅，试过暖风机才拔掉插头。楼绎在电池上贴了红胶布，叮嘱这组留给后半夜。" },
  { id: "cover", index: 35, choice: 1, bit: 4, name: "门外已有接应约定",
    detail: "楼绎陪你把走廊这段又走了一遍，约好由他回应以后再离开门边。练完收拾椅子时，他特意让你复述了一遍，直到两个人都能接上。" },
  { id: "close", index: 35, choice: 0, bit: 8, name: "练过近身突发情况",
    detail: "俞深陪你反复练习有人突然逼近时的反应，直到你能先护住自己，再找机会脱身。最后一遍结束，他把水递给你，提醒你实战里只有很短的一次机会。" }
];

export const BAD_ENDINGS = [
  {
    id: "BE01", index: 13, rootId: "registration", choice: 0, title: "门外还有十九层",
    labels: ["答应陪崔语心下楼，先去车库找阮子扬", "带上备用钥匙，陪崔语心去楼下找人", "趁楼道暂时安静，独自下楼查看车库"],
    warning: "楼绎把楼道监控转向你，电梯口已经挤满晃动的人影，楼梯间的防火门也在一下下震动。崔语心仍攥着你的袖口，求你只陪她下去看一眼。",
    transition: "防火门在身后合上，你摸遍衣兜才想起电梯卡还放在玄关。手机里的呼叫尚未接通，下一层的平台上已经响起了杂乱的脚步。",
    paragraphs: ["你朝门里喊了两遍名字，手掌拍得发疼，楼道却把每个字送得更远。崔语心方才抓住你的那只手松开了，她贴着墙往上退，眼睛一直望着下一层楼梯。", "俞深终于从听筒里问你在哪儿，你把十九层说成了十八层，又慌忙纠正。电话那边传来拖动家具的声音，他似乎正在给你清出一条路。", "手机跌下去的时候，你仍记得玄关鞋柜上那张卡。晚饭前才有人叮嘱过你，出门记得带着，你当时还笑那人操心得太多。"],
    reason: "楼道监控已经显示感染者聚集，你仍离开了安全屋；封闭的楼梯间切断了回程。",
    hint: "这场争执里仍有留在屋内核实消息的走法，先守住能够回去的地方。"
  },
  {
    id: "BE02", index: 19, rootId: "zombie-tower", choice: 2, preparation: "recon", title: "取景框里的最后一秒",
    labels: ["延长拍摄，等尸塔再靠近些再结束观察", "保住完整录像，暂缓对塔顶的处置", "继续记录塔顶指挥者，等它再发一次信号"],
    warning: "塔顶已经碰到下一层的窗沿，摄像头里的灰色面孔越来越大。你想录完整那次变阵，楼绎却问了一声，观察期间到底由谁盯着最上面那只。",
    transition: "你等到了那声尖啸，也等到了镜头外扑来的黑影。玻璃与内侧护网一起震向房间，摄像机跌出手心，仍亮着录像的红灯。",
    paragraphs: ["画面最后留下你的半张脸，眼睛还在看屏幕，肩膀已经被俞深拽向后方。你听见他喊楼绎，后半句被窗框变形的声音吞了进去。", "护网卡在桌沿，堵住了去客厅的路，抽屉里的铅笔一支支滚到脚边。你伸手去够近处那支，仿佛手里抓住一点熟悉的东西，就还能想出办法。", "摄像机一直拍到电池耗尽，片尾只有斜着的天花板。你盼着带去研究所的第一份完整记录，最终留在了这间屋里。"],
    reason: "尸塔接近窗口时，拍摄继续占用了你的注意力，塔顶也缺少专人看守。",
    hint: "前一段处理无人机时，可以让楼绎持续观察塔顶；当前也可以及时结束记录。",
    success: "你刚把镜头转回塔顶，楼绎已经按约处理了最上面那只。护网被撞得发颤，尸群却开始往下滑落；你把那段完整录像存进电脑，直到文件读完才肯松开鼠标。"
  },
  {
    id: "BE03", index: 30, rootId: "city-blackout", choice: 1, preparation: "warmth", title: "天亮前的空插座",
    labels: ["继续给设备供电，等后半夜再处理取暖", "把剩余电量留给设备，保温延到天亮", "先维持设备运转，沿用白天的供暖安排"],
    warning: "暖风机停下以后，客厅的温度仍在往下掉，窗沿已经结出一层白霜。燕思静摸过每个人的手，提醒你白天定下的用电安排已经撑过了预计的时间。",
    transition: "后半夜，你伸手去按暖风机，插座却早已随着备用电池一起停了。燕思静叫你把手缩回被子，你嘴上应着，手指已经失去了收拢的力气。",
    paragraphs: ["俞深把自己的被子也压到你身上，又把你的手夹在掌心里。他问你还记得机场那天谁坐在旁边，你慢慢想了一遍，觉得那个位置挤得让人难受，如今却很想再坐一次。", "窗外开始泛白，楼绎抱着最后一组电池回来，红胶布在他手里翘起一角。设备整夜都在运行，电池握在掌心已经冷透了。", "你听见燕思静叫自己的名字，隔了很久才想起应该答应。那张画到一半的素描就在茶几上，纸角压着一杯早已结冰的水。"],
    reason: "你沿用原供电安排，却没有为延长的寒夜留下独立保暖余量。",
    hint: "提前在客厅留出备用电池与保温用品，或在停电后立刻重新分配用电。",
    success: "楼绎从沙发底下拖出贴红胶布的备用电池，燕思静也记得保温垫放在哪儿。你们挤在同一床被子下面等到天亮，设备的指示灯和暖风机最终都留住了最后一点亮光。"
  },
  {
    id: "BE04", index: 36, rootId: "west-gate-warning", choice: 1, title: "提前抵达的接应",
    labels: ["站到窗口挥亮手机，让提前到来的队伍看见", "打开窗边照明，向直升机报出房间位置", "拉开遮光帘，用手机向来援方向示意"],
    warning: "小灵通再次亮起，来客说西门上空始终没有国旗。约好的频道仍然安静，直升机上的扩音器却已经在催楼里的人靠近窗口。",
    transition: "手机举过窗沿，探照灯立刻停在你的脸上。扩音器里的救援广播戛然而止，你身后的货架、药箱和同伴一起暴露在白光里。",
    paragraphs: ["你先听见楼绎叫你蹲下，才意识到玻璃上多出来的裂纹正沿着你的影子延伸。燕思静把药箱拖进走廊，箱扣撞开，包扎用品散得满地都是。", "对讲机终于传来尹灏泽的声音，他说真正接应的车队还在路上。你把嘴唇贴近话筒，想叫他们再快一点，窗外的灯光却追着每一处移动的影子。", "后来那盏灯又扫向别处，二十楼重新暗下来。留在窗台的手机已经摔裂，画面里还存着你们出发前发给彼此的航班号。"],
    reason: "来援时间、国旗和通讯确认都未对上，主动亮灯暴露了安全屋与同伴的位置。",
    hint: "先核对尹灏泽的频道，再决定怎样回应窗外的人，旧经历只能提醒你保持警惕。"
  },
  {
    id: "BE05", index: 38, rootId: "bedroom-breach", choice: 2, preparation: "cover", title: "门把落下以后",
    labels: ["顶开松动的门，抢在下一阵烟雾前冲向客厅", "推开房门，立刻去客厅接应受伤的同伴", "借门锁松动的空隙，直接穿过外面的走廊"],
    warning: "门锁被撞得松了半截，走廊里刚好安静下来。烟雾后偶尔传来拖动的声音，你听得见楼绎，却看见门缝外有一道完全陌生的影子。",
    transition: "门把终于落下，你朝楼绎的声音跑去，走廊另一头却比他更早有了回应。伸向你的手还隔着半扇门，你已经失去了继续往前的力气。",
    paragraphs: ["你靠在门边，才发现一直攥着的钥匙把掌心压出了很深的印子。方才你还在生俞深的气，觉得他把自己锁进卧室，便是又一次替你做完了决定。", "楼绎叫燕思静把药箱推过来，声音比平时低了很多。你想告诉他箱子已经散在走廊上，也想说自己看见了谁，开口时却只顾得上喘气。", "俞深终于够到你的手，钥匙从两个人的指缝间掉了下去。那扇你急着打开的门直到天亮都敞着，门后的床上还放着他给你留下的外套。"],
    reason: "你冲入尚未确认的走廊，门外又缺少事先约好的接应，烟雾遮住了威胁。",
    hint: "先前的训练可以约定走廊接应；眼下也可以留在门侧，等同伴给出回应。",
    success: "门刚打开，楼绎就按练习时的约定给出了回应。你穿过那段短短的走廊，才发现掌心全是汗；他把药箱推给你，仍记得压低声音，叫你先扶住燕思静。"
  },
  {
    id: "BE06", index: 39, rootId: "cui-turns", choice: 0, preparation: "close", title: "她先松开的手",
    labels: ["向崔语心伸手，趁她犹豫时试着近身制止", "放下说到一半的话，伸手去拦崔语心", "迎着崔语心往前一步，试图当面制止她"],
    warning: "崔语心的手在发抖，枪口却始终跟着你移动。你想起她曾在高速上探身来抱自己，可这一次，她一直在催你先把手里的东西放下。",
    transition: "你喊着她的名字往前，伸出的手刚碰到衣袖，耳边便只剩下一声闷响。她比你更早松开了手，退回那块碎玻璃旁边。",
    paragraphs: ["她望着你，像等着你照常发火，骂她莽撞，叫她赶紧过来帮忙。你却贴着柜子慢慢坐下，想了好一会儿，才认出她身上的外套还是开学那天一起挑的。", "你们从前总说等放假回家，要再去一次学校后门的小店。她记得老板多放葱，你记得替她留靠窗的位置，那些琐碎的约定这时忽然一件件变得清楚。", "走廊里有人喊你的名字，她转过头，往后退了半步。你留在两个人中间的那只手终于垂了下来，指尖离她的衣角还差一点。"],
    reason: "带着旧日的信任贸然靠近持枪者，身体的反应又未经过相应训练，犹豫耗尽了机会。",
    hint: "近身突发情况可以提前练习；眼前的其他走法也允许你先保持距离，再争取时间。",
    success: "她的肩膀刚动，你就想起训练里吃过的那次亏，先护住自己才重新站稳。俞深终于赶到你身边，你退开时还攥着她外套上扯下来的一小段线头，掌心抖得厉害。"
  },
  {
    id: "BE07", index: 48, rootId: "coffee-blackout", choice: 2, title: "凉在手边的咖啡",
    labels: ["喝完手边的咖啡，再去查看包语希的情况", "先用咖啡提神，随后整理断电时的记录", "端起杯子喝下咖啡，再接通走廊里的呼叫"],
    warning: "包语希碰过杯子以后忽然倒下，尹灏泽已经扶住了她。你面前那杯仍然温热，屋里的灯却毫无征兆地熄灭了，对讲机里有人催你先把杯子放下。",
    transition: "杯子刚离开嘴唇，你就听见尹灏泽在叫你，声音仿佛绕了很远才传到耳边。你伸手去拿对讲机，指尖擦过机身，它落在地上响了一声。",
    paragraphs: ["屏幕上还有半行记录，你盯着那些字，想把它们补完再站起来。杯沿碰倒了桌边的笔，咖啡顺着手腕流进袖口，你却迟迟没有想起该把手移开。", "尹灏泽扶着包语希，腾出一只手来够你，叫你至少应他一声。你听得懂，也记得他刚才催你放下杯子，所有念头却像被困在同一小段距离里。", "走廊上的脚步停在门前，有人先取走桌面的记录，再把灯关严。俞深带来的晚饭搁在楼下值班室，热了两遍，直到天亮也没有等到你。"],
    reason: "同伴饮用后突然倒下，现场同时断电；你仍喝下了同一来源的咖啡，错过了求援机会。",
    hint: "先保留杯子并照顾倒下的人，继续核对断电与人员出入，桌上的异常已经足够明显。"
  },
  {
    id: "BE08", index: 49, rootId: "eighth-floor", choice: 0, title: "八楼的门再也没有开",
    labels: ["相信贾钟愿意保护你，把家书和记录都交给他", "按贾钟的要求交出材料，等他安排离开八楼", "走到贾钟身边，把证据交给他换取平安"],
    warning: "贾钟催你走过去，手里的枪却始终没有放低。总闸就在他身后，门口的读卡器已经亮起红灯，你保存的那份记录恰好写着此前的断电时间。",
    transition: "贾钟收走了家书，也拿走了你正在通话的对讲机。读卡器短暂亮过一次绿灯，门打开的空隙只够他侧身出去，随即又在你面前合拢。",
    paragraphs: ["你隔着玻璃问他什么时候回来，他仍用了平日查房时那种和气的口吻，叫你先休息。脚步声沿着走廊远去，最后连电梯停在哪层都听得很清楚。", "桌上的记录本少了几页，你把留下的订书针掰直，反复描着记忆里的日期。父亲信上的字你读过很多遍，到了真正需要复述的时候，却只记得那句叫你好好过日子。", "楼下的值班表每天照常更换，送进来的饭也从未迟到。八楼的门始终由外面打开，你终于等到一个人进来，却只等到他伸手收走写满字的纸。"],
    reason: "掌握总闸、出口和枪械的人索要关键材料，你交出了仅剩的证据与对外联络。",
    hint: "把手中的记录留给可以核对的人，并保住对外通话；教授的身份无法代替现场证据。"
  }
].map(ending => Object.freeze({ ...ending, grade: "BAD END / 失败", epilogue: ending.paragraphs.join("\n\n"),
  art: `./public/assets/v7/bad-ends/${ending.id.toLowerCase()}.png` }));

export function getPreparation(id) { return PREPARATIONS.find(item => item.id === id); }
export function preparationsAt(index) { return PREPARATIONS.filter(item => item.index === index); }
export function getDanger(index) { return BAD_ENDINGS.find(item => item.index === index) || null; }
export function hasPreparation(route, id) {
  const preparation = getPreparation(id);
  return Boolean(preparation && route[preparation.index] === preparation.choice);
}

export function resolveDanger(index, choice, route) {
  const danger = getDanger(index);
  if (!danger || danger.choice !== choice) return null;
  return danger.preparation && hasPreparation(route, danger.preparation) ? null : danger;
}

export function decorateDangerScene(scene, index, route) {
  if (!scene) return null;
  const danger = getDanger(index);
  const preparations = preparationsAt(index);
  if (!danger && !preparations.length) return scene;
  const ready = danger?.preparation && hasPreparation(route, danger.preparation);
  const preparation = getPreparation(danger?.preparation);
  const readiness = preparation ? ready
    ? `你记得先前已经安排过这件事：${preparation.name}。`
    : `你翻过先前的安排，${preparation.name}这一项仍然空着。` : "";
  return {
    ...scene,
    body: [scene.body, danger?.warning, readiness].filter(Boolean).join("\n\n"),
    danger: danger ? { id: danger.id, prepared: Boolean(ready), preparation: preparation?.name || null } : null,
    choices: scene.choices.map((choice, position) => {
      const prepared = preparations.find(item => item.choice === position);
      if (danger?.choice === position) return { ...choice,
        label: danger.labels[route[index - 1] || 0], tag: `${choice.tag}-risk-${danger.id}`,
        risk: true, prepared: Boolean(ready), response: ready ? danger.success : danger.transition };
      if (prepared) return { ...choice, preparation: prepared.name,
        response: `${choice.response} ${prepared.detail}` };
      return choice;
    })
  };
}

// This finite-state count includes terminal failures, not hypothetical choices after death.
export function countDangerRoutes() {
  let live = new Map([[0, 1n]]);
  const failures = Object.fromEntries(BAD_ENDINGS.map(ending => [ending.id, 0n]));
  let sequences = 0n;
  for (let index = 0; index < 50; index++) {
    if (index === 49) sequences = [...live.values()].reduce((sum, count) => sum + count, 0n);
    const next = new Map();
    const danger = getDanger(index);
    for (const [mask, count] of live) for (let choice = 0; choice < 3; choice++) {
      const requirement = getPreparation(danger?.preparation);
      if (danger?.choice === choice && (!requirement || !(mask & requirement.bit))) {
        failures[danger.id] += count;
      } else {
        const preparation = preparationsAt(index).find(item => item.choice === choice);
        const nextMask = mask | (preparation?.bit || 0);
        next.set(nextMask, (next.get(nextMask) || 0n) + count);
      }
    }
    live = next;
  }
  return { survivors: [...live.values()].reduce((sum, count) => sum + count, 0n), sequences, failures,
    failedHistories: Object.values(failures).reduce((sum, count) => sum + count, 0n) };
}

export const DANGER_ROUTE_COUNTS = countDangerRoutes();
