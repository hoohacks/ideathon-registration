import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Registration from './Registration';
import AdminRegistration from './AdminRegistration';
import reportWebVitals from './reportWebVitals';

const rootElement = document.getElementById('root');

ReactDOM.render(
    <React.StrictMode>
        <Router>
            <Routes>
                <Route path="/" element={<Registration />} />
                <Route path="/admin/register" element={<AdminRegistration />} />
            </Routes>
        </Router>
    </React.StrictMode>,
    rootElement
);

reportWebVitals();
