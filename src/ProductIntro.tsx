import { useEffect, useState } from 'react';
import './ProductIntro.css';

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

export default function ProductIntro() {
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 80); return () => clearTimeout(t); }, []);
  const item = modules[active];
  return <main className={`product-intro ${ready ? 'is-ready' : ''}`}>
    <nav className="intro-nav"><span className="intro-brand"><i />赤页 <small>RED LEAF</small></span><span className="intro-nav-note">知乎故事 · 刘看山陪伴创作</span><a href="/" className="intro-enter">进入工作台 <span>↗</span></a></nav>
    <section className="intro-hero"><div className="hero-grid" /><div className="hero-copy"><p className="eyebrow">ZHIHU STORIES / RED LEAF EDITION</p><h1>看见好故事，<br /><em>交给刘看山。</em></h1><p className="hero-lead">从一段真实回答出发，读进去，聊起来，再亲手走出一条只属于你的故事路线。</p><div className="hero-actions"><a className="intro-primary" href="#modules">看看怎么发生 <span>↓</span></a><a className="intro-secondary" href="/#library">打开故事书库 <span>↗</span></a></div></div><div className="hero-pet"><span className="pet-ring" /><img src="/assets/liukan/greeting.gif" alt="刘看山" /><span className="pet-caption">把回答交给我</span></div><div className="hero-scroll">SCROLL TO EXPLORE <span>↓</span></div></section>
    <section className="intro-proof"><span><b>33</b> 篇知乎原作</span><span><b>04</b> 个核心模块</span><span><b>∞</b> 条分支路线</span><span className="proof-line" /></section>
    <section id="modules" className="intro-modules"><div className="section-heading"><p className="eyebrow">THE FULL LOOP</p><h2>从阅读到游玩，<br />每一步都看得见。</h2><p>四个模块连成一条顺手的创作路线。先找到打动你的回答，再让刘看山陪你把它变成可以亲自走进去的故事。</p></div><div className="module-tabs">{modules.map((mod, i) => <button key={mod.id} className={i === active ? 'is-active' : ''} onClick={() => setActive(i)}><span>0{i + 1}</span>{mod.kicker.slice(5)}</button>)}</div><article className="module-stage"><div className="stage-copy"><p className="eyebrow">{item.kicker}</p><h3>{item.title}</h3><p>{item.copy}</p><span className="module-tag">{item.tag}</span><div className="stage-dots">{modules.map((_, i) => <i key={i} className={i === active ? 'is-active' : ''} />)}</div></div><div className="stage-visual"><div className="visual-window"><div className="window-bar"><i /><i /><i /><span>赤页 · {item.id === 'zhihu' ? '知乎网页' : item.id === 'liukan' ? '刘看山陪伴面板' : item.id === 'game' ? '生成游戏' : '故事档案'}</span></div><div className="visual-content"><div className="fake-lines"><i /><i /><i /><i /></div><img className={item.screenshot ? 'module-screenshot' : 'liukan-art'} src={item.screenshot || item.image} alt="刘看山功能演示" /><span className="visual-chip">{item.tag.split(' · ')[0]}</span></div></div></div></article></section>
    <section className="intro-details"><div className="section-heading"><p className="eyebrow">EVERY DOOR, EXPLAINED</p><h2>每一个入口，都有自己的用处。</h2><p>按实际工作台结构展开，打开一张卡片，就能快速知道它解决什么问题、会留下什么结果。</p></div><div className="detail-grid">{detailGroups.map((group, index) => <article className="detail-card" key={group.label}><div className="detail-art"><img className={group.screenshot ? 'detail-screenshot' : ''} src={group.screenshot || group.art} alt="功能模块截图" /></div><div className="detail-body"><p className="eyebrow">{String(index + 1).padStart(2, '0')} · {group.label}</p><h3>{group.title}</h3><p>{group.desc}</p><div className="detail-items">{group.items.map(entry => <span key={entry}>{entry}</span>)}</div></div></article>)}</div></section>
    <section className="intro-cta"><div><p className="eyebrow">YOUR NEXT STORY</p><h2>准备好把一篇回答<br />走成一场冒险了吗？</h2></div><a className="intro-primary" href="/">进入赤页工作台 <span>↗</span></a></section><footer className="intro-footer"><span>赤页 RED LEAF</span><span>知乎 · 刘看山</span><span>故事从这里继续</span></footer>
  </main>;
}

