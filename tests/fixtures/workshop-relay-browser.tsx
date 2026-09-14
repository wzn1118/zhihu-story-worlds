import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkshopRelaySettings, type WorkshopRelayInput } from '../../src/WorkshopRelaySettings';

const savedRelay = { configured: true, endpoint: 'https://saved.example/v1', model: 'saved-model', protocol: 'responses' };
const saves: WorkshopRelayInput[] = [];
let clearCalls = 0, environmentCalls = 0;
function Fixture() {
  const [relay, setRelay] = useState(savedRelay);
  const [message, setMessage] = useState('');
  return <details className="relay-config" open><summary>配置创作中转站</summary><WorkshopRelaySettings
    busy={false} relay={relay} environmentRelay={{ ...savedRelay, images: { configured: false } }} message={message}
    onSave={async config => { saves.push(config); setRelay({ configured: true, endpoint: config.endpoint, model: config.model, protocol: config.protocol }); setMessage('中转站配置已保存，新的生成会使用它。'); return true; }}
    onClear={async () => { clearCalls++; setRelay({ configured: false, endpoint: '', model: '', protocol: '' }); setMessage('已清除中转站配置。'); }}
    onUseEnvironment={async () => { environmentCalls++; setRelay(savedRelay); setMessage('已接入当前配置。'); }}
  /></details>;
}
const root = createRoot(document.getElementById('root')!);
Object.assign(window, { relayTest: { saves, get clearCalls() { return clearCalls; }, get environmentCalls() { return environmentCalls; }, unmount: () => root.unmount() } });
root.render(<StrictMode><Fixture /></StrictMode>);
