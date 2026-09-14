import type { WorkshopGenerationOptions } from './workshop-input';

export function WorkshopGenerationSettings({ value, onChange, disabled }: { value: WorkshopGenerationOptions; onChange: (value: WorkshopGenerationOptions) => void; disabled: boolean }) {
  return <div className="workshop-generation-settings" aria-label="游戏生成选项">
    <div className="workshop-speed-summary"><b>一篇回答，一场分支冒险</b><span>{value.mode === 'fast' ? '目标 5 分钟内可玩' : '长篇精修 · 用时更长'}</span></div>
    <fieldset disabled={disabled}><legend>如何使用这篇回答</legend><div className="workshop-option-grid">
      {([{ id: 'inspiration', title: '作为灵感', description: '提取问题与关键设定，创造新的角色和分支剧情' }, { id: 'faithful', title: '沿原作扩展', description: '保留人物、事实与世界规则，写出新的选择和结局' }] as const).map(option => <label className="workshop-option" key={option.id} data-selected={value.adaptation === option.id}><input type="radio" name="workshop-adaptation" value={option.id} checked={value.adaptation === option.id} onChange={() => onChange({ ...value, adaptation: option.id })} /><span><b>{option.title}</b><small>{option.description}</small></span></label>)}
    </div></fieldset>
    <fieldset disabled={disabled}><legend>配图 · 不影响先开始游戏</legend><div className="workshop-option-grid workshop-image-options">
      {([{ id: 'none', title: '纯文字', description: '默认 · 无需生图' }, { id: 'gpt6', title: 'GPT6 简单插图', description: '文字中转生成 SVG' }, { id: 'image2', title: 'image2 精细配图', description: '第三方生图 · 额外耗时与费用' }] as const).map(option => <label className="workshop-option" key={option.id} data-selected={value.images === option.id}><input type="radio" name="workshop-images" value={option.id} checked={value.images === option.id} onChange={() => onChange({ ...value, images: option.id })} /><span><b>{option.title}</b><small>{option.description}</small></span></label>)}
    </div></fieldset>
    <label className="workshop-generation-mode">创作篇幅<select disabled={disabled} value={value.mode} onChange={event => onChange({ ...value, mode: event.target.value as WorkshopGenerationOptions['mode'] })}><option value="fast">快速冒险 · 5 分钟目标</option><option value="full">长篇精修 · 完整创作与多轮审校</option></select></label>
  </div>;
}
