import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './zhihu-theme.css';
import ProductIntro from './ProductIntro';
import { OpeningVideo } from './OpeningVideo';

const intro = new URLSearchParams(window.location.search).has('intro') || window.location.pathname === '/介绍';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><OpeningVideo>{intro ? <ProductIntro /> : <App />}</OpeningVideo></React.StrictMode>);
