export const workshopImageStyle = '吸血鬼猎人D画风';

/** Drafting/review instructions, not an image-request wrapper. */
export const workshopArtDirection = `用户已选择V1短词直出。artBrief只写40至240字的一段短中文：实际人物的辨识特征、当前场景的地点与动作，最后接“${workshopImageStyle}”。直接使用这段文字，不另加画法说明、额外要求或负面段落，不写年份。图片请求使用0张参考图，旧人物图与画风示例都不作为输入；16:9和4K交给请求参数，不写进artBrief。人物必须属于当前故事，保持成熟且彼此可辨的成人面容、年龄、体型、服装和必要装备；原文明示颜色或关键衣物时以来源事实为准，不把示例角色的身份或环境套进新故事。人物说明、正文和场景短词须保持一致。只描绘本场实际出现的人与动作，电话里的说话者不因有台词就出现在房间中。审读人物或场景矛盾时提供具体原文位置，不把美术要求写进玩家对白。V1只获画风认可，低分辨率示例不是原生4K正片；每场仍须有独立真实文件、尺寸校验和人工审核。`;

export const workshopSceneArtBriefInstruction = `artBrief按V1约定写实际人物特征、此刻地点和一个具体动作，末尾接“${workshopImageStyle}”，一段短中文，不附技术说明；不生成文件或调用美术工具。`;
