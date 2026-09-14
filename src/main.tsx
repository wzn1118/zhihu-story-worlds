import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './zhihu-theme.css';
import ProductIntro from './ProductIntro';

const intro = new URLSearchParams(window.location.search).has('intro') || window.location.pathname === '/介绍';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{intro ? <ProductIntro /> : <App />}</React.StrictMode>);
