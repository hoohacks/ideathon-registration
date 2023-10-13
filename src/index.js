import React from 'react';
import ReactDOM from 'react-dom/client';
import Registration from './Registration';
import reportWebVitals from './reportWebVitals';
import Search from './Search';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Registration route />
  </React.StrictMode>
  
);

root.render(
  <React.StrictMode>
    <Search route />
  </React.StrictMode>
  
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
