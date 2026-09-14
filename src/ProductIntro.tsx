import { useEffect, useState } from 'react';
import './ProductIntro.css';
import IntroGallery from './IntroGallery';

const modules = [
  { id: 'zhihu', kicker: '01 / 知乎来源', title: '从知乎回答开始', copy: '在原页面里挑中一段回答，拖到刘看山身边。标题、作者、原文地址和选中文本会一起留下。', image: '/assets/liukan/computer.png', screenshot: '/assets/intro/zhihu-source.png', tag: '网页选取 · 原文可追溯' },
  { id: 'liukan', kicker: '02 / 刘看山', title: '刘看山一直在场', copy: '打开陪伴面板，查看同行记录、阅读手记和动作图鉴。每次阅读都会沉淀成下一次创作的线索。', image: '/assets/liukan/greeting.png', screenshot: '/assets/intro/liukan-panel.png', tag: '同行记录 · 阅读手记 · 动作图鉴' },
  { id: 'game', kicker: '03 / 生成游戏', title: '把一篇回答变成可玩的故事', copy: '保留原文脉络，补上人物、场景、分支和结局。生成完成后即可进入关卡，选择会改变故事走向。', image: '/assets/liukan/ball.png', screenshot: '/assets/intro/game-generation.png', tag: '构思剧情 · 检查分支 · 立即游玩' },
  { id: 'archive', kicker: '04 / 故事档案', title: '每一次选择都有回声', copy: '书库保存原作与改编结果，结局档案记录走过的路线。下次回来，从上次停下的位置继续。', image: '/assets/liukan/sway.png', tag: '书库 · 存档 · 结局回忆' },
];

const detailGroups = [
  { label: '刘看山 · 读懂内容', title: '阅读手记，顺着原文继续想', desc: '从保存的回答里提炼摘要、人物、时间线、线索、动机和关系。每条判断都能回到对应原文。', items: ['总结回顾', '人物关系', '时间线梳理', '线索与伏笔', '动机分析', '不确定点', '多篇比较', '原文问答', '世界规则'], art: '/assets/liukan/idle.png', screenshot: '/assets/intro/reading-desk.png' },
  { label: '刘看山 · 写出新故事', title: '从阅读笔记，到另一种走法', desc: '把想法写成改编草稿，设计对白、选择、结局和分镜。原文出处一直跟在旁边，灵感有来处。', items: ['改编方案', '对白设计', '选择设计', '结局设计', '故事板', '风格提案', '玩法评审', '伏笔回收'], art: '/assets/liukan/computer.png', screenshot: '/assets/intro/liukan-live.png' },
  { label: '刘看山 · 找资料', title: '资料入口，集中放在面板里', desc: '搜索知乎回答、查看热榜、调用知乎直答，也能翻看个人创作、关注、收藏和知识库。', items: ['找知乎回答', '查外部资料', '看看热榜', '知乎直答', '我的创作', '我的关注', '近期收藏', '我的收藏夹', '知识库目录', '知识库检索', '查看 API 额度'], art: '/assets/liukan/greeting.png', screenshot: '/assets/intro/reader-live.png' },
  { label: '工作台 · 生成游戏', title: '从原文到可玩的完整制作线', desc: '选择灵感改编或沿原作扩展，决定纯文字、简单插图或精细配图，再选择快速冒险或长篇精修。', items: ['知乎网页选取', '粘贴或上传原文', '来源链接与作者', '创作中转站', '灵感 / 沿原作', '纯文字 / GPT6 / image2', '快速冒险 / 长篇精修', '生成路线与场景', '检查选择与结局'], art: '/assets/liukan/ball.png', screenshot: '/assets/intro/workshop.png' },
  { label: '工作台 · 制作记录', title: '文字、美术、发布状态各自清楚', desc: '项目列表保留每次制作。可以看到当前阶段、失败提示、场景路线结局统计、美术生成与审核覆盖。', items: ['我的改编项目', '制作日志', '中断任务续跑', '场景统计', '路线统计', '结局统计', '插图清单', '人工审核', '发布版本'], art: '/assets/liukan/computer.png', screenshot: '/assets/intro/library.png' },
  { label: '游戏内 · 真实游玩', title: '选择会改变你走过的故事', desc: '开场说明身份、目标和资源。行动点、线索、信任、决心与选择反馈，会一起影响后续路线。', items: ['故事开场', '场景阅读', '调查行动', '资源变化', '线索收集', '选择反馈', '剧情回看', '难度模式', '回溯选择'], art: '/assets/liukan/sway.png', screenshot: '/assets/intro/verified-play.png' },
  { label: '记录 · 带着进度回来', title: '存档与结局，替你记住走过的路', desc: '手动存档、自动存档、导入导出、结局档案和刘看山活动记录各自保存，下一次回来接着走。', items: ['自动存档', '手动存档', '导入 / 导出', '删除存档', '结局档案', '同行记录', '开工前检查', '游玩回忆'], art: '/assets/liukan/sleep.png', screenshot: '/assets/intro/drag-answer.png' },
  { label: '偏好 · 阅读体验', title: '把阅读调整成舒服的样子', desc: '调整文字大小、文字速度、交互音效和动态效果。深色主题也能随时切换。', items: ['文字大小', '文字速度', '交互音效', '减少动态效果', '赤页深色主题', '新手导览重播'], art: '/assets/liukan/greeting.png', screenshot: '/assets/intro/reading-desk.png' },
];

const detailShots = [
  ['/assets/intro/reading-desk.png', '/assets/intro/reader-live.png', '/assets/intro/liukan-panel.png'],
  ['/assets/intro/liukan-live.png', '/assets/intro/workshop.png', '/assets/intro/game-generation.png'],
  ['/assets/intro/reader-live.png', '/assets/intro/zhihu-source.png', '/assets/intro/reading-desk.png'],
  ['/assets/intro/workshop.png', '/assets/intro/game-generation.png', '/assets/intro/drag-answer.png'],
  ['/assets/intro/library.png', '/assets/intro/workshop.png', '/assets/intro/verified-play.png'],
  ['/assets/intro/verified-play.png', '/assets/intro/reader-live.png', '/assets/intro/liukan-live.png'],
  ['/assets/intro/drag-answer.png', '/assets/intro/library.png', '/assets/intro/verified-play.png'],
  ['/assets/intro/reading-desk.png', '/assets/intro/library.png', '/assets/intro/liukan-panel.png'],
];

export default function ProductIntro() {
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 80); return () => clearTimeout(t); }, []);
  const item = modules[active];
  return <main className={`product-intro ${ready ? 'is-ready' : ''}`}>
    <nav className="intro-nav"><span className="intro-brand"><i />赤页 <small>RED LEAF</small></span><span className="intro-nav-note">知乎故事 · 刘看山陪伴创作</span><a href="/" className="intro-enter">进入工作台 <span>↗</span></a></nav>
    <section className="intro-hero"><div className="hero-grid" /><div className="hero-copy"><p className="eyebrow">产品说明计划书 · ZHIHU STORIES</p><h1>赤页：把知乎回答<br /><em>变成可玩的故事。</em></h1><p className="hero-lead">赤页是一款面向知乎社区的内容再创作工具。用户从真实回答出发，在刘看山陪伴下完成阅读、改编、生成与游玩，让有价值的内容从“被看见”走向“被体验、被讨论、被继续创作”。</p><div className="hero-actions"><a className="intro-primary" href="#modules">查看完整方案 <span>↓</span></a><a className="intro-secondary" href="/#library">进入可玩样例 <span>↗</span></a></div></div><div className="hero-pet"><span className="pet-ring" /><img src="/assets/liukan/greeting.gif" alt="刘看山" /><span className="pet-caption">知乎内容陪伴创作</span></div><div className="hero-scroll">SCROLL TO EXPLORE <span>↓</span></div></section>
    <section className="intro-proof"><span><b>真实</b> 知乎来源</span><span><b>4</b> 个核心世界</span><span><b>71</b> 个剧情节点</span><span className="proof-line" /></section>
    <section className="plan-overview"><div><p className="eyebrow">01 · 项目定位</p><h2>让知乎内容拥有第二种生命</h2><p>知乎擅长沉淀经验、观点与故事，赤页负责把这些内容转译成可进入的情境。我们不替代原文，而是在保留作者、标题、来源链接和节选依据的前提下，增加人物关系、行动资源、线索与多结局，让用户以参与者身份理解内容。</p></div><dl><div><dt>目标用户</dt><dd>喜欢知乎故事、愿意参与表达和共创的读者</dd></div><div><dt>核心产出</dt><dd>可追溯的互动故事、阅读手记与改编项目</dd></div><div><dt>社区价值</dt><dd>提升优质内容的停留、复读、讨论与再创作率</dd></div></dl></section>
    <section id="modules" className="intro-modules"><div className="section-heading"><p className="eyebrow">THE FULL LOOP</p><h2>从阅读到游玩，<br />每一步都看得见。</h2><p>四个模块连成一条顺手的创作路线。先找到打动你的回答，再让刘看山陪你把它变成可以亲自走进去的故事。</p></div><div className="module-tabs">{modules.map((mod, i) => <button key={mod.id} className={i === active ? 'is-active' : ''} onClick={() => setActive(i)}><span>0{i + 1}</span>{mod.kicker.slice(5)}</button>)}</div><article className="module-stage"><div className="stage-copy"><p className="eyebrow">{item.kicker}</p><h3>{item.title}</h3><p>{item.copy}</p><span className="module-tag">{item.tag}</span><div className="stage-dots">{modules.map((_, i) => <i key={i} className={i === active ? 'is-active' : ''} />)}</div></div><div className="stage-visual"><div className="visual-window"><div className="window-bar"><i /><i /><i /><span>赤页 · {item.id === 'zhihu' ? '知乎网页' : item.id === 'liukan' ? '刘看山陪伴面板' : item.id === 'game' ? '生成游戏' : '故事档案'}</span></div><div className="visual-content"><div className="fake-lines"><i /><i /><i /><i /></div><img className={item.screenshot ? 'module-screenshot' : 'liukan-art'} src={item.screenshot || item.image} alt="刘看山功能演示" /><span className="visual-chip">{item.tag.split(' · ')[0]}</span></div></div></div></article></section>
    <section className="plan-architecture"><div className="section-heading"><p className="eyebrow">02 · 技术方案</p><h2>内容、智能与游戏状态<br />在同一条链路里闭环。</h2><p>采用前后端分层设计：前端负责阅读与游玩体验，服务端负责来源获取、内容校验、故事编译和存档；所有改编节点都保留来源映射，便于复核与后续编辑。</p></div><div className="architecture-flow"><div><b>知乎来源层</b><span>网页选取 · 故事 API · 作者与链接</span></div><i>→</i><div><b>理解与创作层</b><span>摘要 · 人物 · 时间线 · 分支设计</span></div><i>→</i><div><b>可玩体验层</b><span>Ink 剧情 · 资源状态 · 线索 · 多结局</span></div></div></section>
    <section className="intro-details"><div className="section-heading"><p className="eyebrow">03 · 产品流程与证据</p><h2>每一个入口，都服务于一次真实创作。</h2><p>下方截图来自当前工作台，用于展示从来源选择到生成、阅读和游玩的完整路径。</p></div><div className="detail-grid">{detailGroups.map((group, index) => <article className="detail-card" key={group.label}><IntroGallery shots={detailShots[index]} label={group.label} /><div className="detail-body"><p className="eyebrow">{String(index + 1).padStart(2, '0')} · {group.label}</p><h3>{group.title}</h3><p>{group.desc}</p><div className="detail-items">{group.items.map(entry => <span key={entry}>{entry}</span>)}</div></div></article>)}</div></section>
    <section className="plan-value"><div><p className="eyebrow">04 · 知乎社区适配价值</p><h2>把“回答”变成社区可参与的事件</h2></div><div className="value-grid"><article><strong>内容尊重</strong><p>原文节选、作者与链接始终可见，改编内容明确标注，不混淆事实与创作。</p></article><article><strong>讨论前置</strong><p>用户在关键节点做判断并看到后果，天然形成“你会怎么选”的讨论入口。</p></article><article><strong>知识迁移</strong><p>经验类回答可转为模拟决策，读者通过行动理解因果，而不只是快速划过。</p></article><article><strong>创作者共创</strong><p>读者可以从一篇回答继续写分支、对白和结局，形成可回看的二次创作档案。</p></article></div></section>
    <section className="plan-roadmap"><p className="eyebrow">05 · 实施计划</p><h2>从四个验证世界，扩展到知乎内容生态</h2><div className="roadmap"><div><b>已完成</b><span>真实来源接入、四个可玩世界、分支与存档、移动端适配</span></div><div><b>当前</b><span>补齐各世界角色与场景美术，完善来源复核和编辑工具</span></div><div><b>下一步</b><span>开放作者共创模板、作品发布与社区反馈指标</span></div></div></section>
    <section className="intro-cta"><div><p className="eyebrow">YOUR NEXT STORY</p><h2>准备好把一篇回答<br />走成一场冒险了吗？</h2></div><a className="intro-primary" href="/">进入赤页工作台 <span>↗</span></a></section><footer className="intro-footer"><span>赤页 RED LEAF</span><span>知乎 · 刘看山</span><span>故事从这里继续</span></footer>
  </main>;
}

