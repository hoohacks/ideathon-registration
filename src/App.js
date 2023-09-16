import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Registration from './components/Registration';
import SignUp from './components/SignUp';
import Participants from './components/Participants';

const App = () => {
  return (
    <Routes>
        <Route path="/" element={<Registration />} />
        <Route path="admin/sign-up" element={<SignUp />} />
        <Route path="admin/participants" element={<Participants />} />
    </Routes>
  )
}

export default App;
